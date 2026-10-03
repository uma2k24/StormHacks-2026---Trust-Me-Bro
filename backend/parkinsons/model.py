"""Parkinson's voice classifier: raw 16 kHz waveform in, PD probability out.

The log-mel front end is built from fixed-weight convolutions so the whole
pipeline exports to Core ML and the iOS app only has to pass audio samples.
"""

import librosa
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from config import F_MAX, F_MIN, HOP_LENGTH, N_FFT, N_MELS, SAMPLE_RATE


class LogMelFrontend(nn.Module):
    def __init__(self):
        super().__init__()
        n_bins = N_FFT // 2 + 1
        window = np.hanning(N_FFT + 1)[:-1]
        k = np.arange(n_bins)[:, None]
        n = np.arange(N_FFT)[None, :]
        real = np.cos(2 * np.pi * k * n / N_FFT) * window
        imag = -np.sin(2 * np.pi * k * n / N_FFT) * window
        dft = np.concatenate([real, imag]).astype(np.float32)[:, None, :]
        mel = librosa.filters.mel(sr=SAMPLE_RATE, n_fft=N_FFT, n_mels=N_MELS, fmin=F_MIN, fmax=F_MAX)
        self.register_buffer("dft", torch.from_numpy(dft))
        self.register_buffer("mel", torch.from_numpy(mel.astype(np.float32))[:, :, None])
        self.n_bins = n_bins

    def forward(self, wav: torch.Tensor) -> torch.Tensor:
        # wav: (B, T) -> normalized log-mel (B, 1, N_MELS, frames)
        rms = torch.sqrt(torch.mean(wav * wav, dim=1, keepdim=True) + 1e-10)
        wav = wav / (rms + 1e-4) * 0.1
        spec = F.conv1d(wav.unsqueeze(1), self.dft, stride=HOP_LENGTH)
        real, imag = spec[:, : self.n_bins], spec[:, self.n_bins :]
        power = real * real + imag * imag
        logmel = torch.log(F.conv1d(power, self.mel) + 1e-4)
        # Per-band mean removal acts like cepstral mean normalization: it strips
        # stationary microphone/room coloring, which differs between phones and the clinic.
        logmel = logmel - torch.mean(logmel, dim=2, keepdim=True)
        scale = torch.sqrt(torch.mean(logmel * logmel, dim=(1, 2), keepdim=True) + 1e-6)
        return (logmel / scale).unsqueeze(1)


def conv_bn(c_in: int, c_out: int) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(c_in, c_out, 3, padding=1, bias=False),
        nn.BatchNorm2d(c_out),
        nn.ReLU(inplace=True),
    )


class PDNet(nn.Module):
    def __init__(self, dropout: float = 0.3):
        super().__init__()
        self.features = nn.Sequential(
            conv_bn(1, 16),
            nn.AvgPool2d(2),
            conv_bn(16, 32),
            conv_bn(32, 32),
            nn.AvgPool2d(2),
            conv_bn(32, 64),
            conv_bn(64, 64),
            nn.AvgPool2d(2),
            conv_bn(64, 128),
            conv_bn(128, 128),
        )
        self.head = nn.Sequential(
            nn.Dropout(dropout),
            nn.Linear(256, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(64, 1),
        )

    def forward(self, logmel: torch.Tensor) -> torch.Tensor:
        x = self.features(logmel).mean(dim=2)  # (B, C, T)
        mean = x.mean(dim=2)
        std = torch.sqrt(torch.clamp((x * x).mean(dim=2) - mean * mean, min=1e-6))
        return self.head(torch.cat([mean, std], dim=1)).squeeze(1)


def spec_augment(x: torch.Tensor, freq_masks: int = 2, max_f: int = 8, time_masks: int = 2, max_t: int = 40) -> torch.Tensor:
    b, _, n_mels, n_frames = x.shape
    x = x.clone()
    for _ in range(freq_masks):
        w = torch.randint(0, max_f + 1, (b,))
        s = (torch.rand(b) * (n_mels - w)).long()
        idx = torch.arange(n_mels)[None]
        m = (idx >= s[:, None]) & (idx < (s + w)[:, None])
        x = x.masked_fill(m[:, None, :, None], 0.0)
    for _ in range(time_masks):
        w = torch.randint(0, max_t + 1, (b,))
        s = (torch.rand(b) * (n_frames - w)).long()
        idx = torch.arange(n_frames)[None]
        m = (idx >= s[:, None]) & (idx < (s + w)[:, None])
        x = x.masked_fill(m[:, None, None, :], 0.0)
    return x


class VoiceClassifier(nn.Module):
    """Front end + one or more PDNet members; outputs the mean member probability."""

    def __init__(self, members: list[PDNet]):
        super().__init__()
        self.frontend = LogMelFrontend()
        self.members = nn.ModuleList(members)

    def forward(self, wav: torch.Tensor) -> torch.Tensor:
        feats = self.frontend(wav)
        probs = [torch.sigmoid(m(feats)) for m in self.members]
        return torch.stack(probs, dim=1).mean(dim=1)
