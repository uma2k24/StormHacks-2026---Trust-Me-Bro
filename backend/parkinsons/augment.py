"""Waveform augmentations that simulate phone microphones, rooms, and background noise."""

import math

import torch

from config import SAMPLE_RATE


def _rand(b: int, lo: float, hi: float) -> torch.Tensor:
    return torch.rand(b) * (hi - lo) + lo


def random_eq(wav: torch.Tensor) -> torch.Tensor:
    """Random spectral tilt, high-pass, optional low-pass, and a couple of resonant bumps."""
    b, t = wav.shape
    spec = torch.fft.rfft(wav)
    freqs = torch.fft.rfftfreq(t, 1 / SAMPLE_RATE)[None].clamp(min=1.0)
    octaves = torch.log2(freqs / 1000.0)
    gain_db = _rand(b, -4, 4)[:, None] * octaves

    hp = _rand(b, 40, 300)[:, None]
    gain_db = gain_db - 12 * torch.relu(torch.log2(hp / freqs))

    use_lp = (torch.rand(b) < 0.5)[:, None]
    lp = _rand(b, 3400, 7500)[:, None]
    gain_db = gain_db - use_lp * 24 * torch.relu(torch.log2(freqs / lp))

    for _ in range(2):
        center = torch.exp(_rand(b, math.log(300), math.log(6000)))[:, None]
        width = _rand(b, 0.3, 1.2)[:, None]
        depth = _rand(b, -6, 6)[:, None]
        gain_db = gain_db + depth * torch.exp(-0.5 * (torch.log2(freqs / center) / width) ** 2)

    return torch.fft.irfft(spec * 10 ** (gain_db / 20), n=t)


def random_reverb(wav: torch.Tensor) -> torch.Tensor:
    b, t = wav.shape
    ir_len = int(0.6 * SAMPLE_RATE)
    rt60 = _rand(b, 0.15, 0.7)[:, None]
    time = torch.arange(ir_len)[None] / SAMPLE_RATE
    ir = torch.randn(b, ir_len) * torch.exp(-6.9 * time / rt60)
    ir[:, 0] = 0
    ir = ir / ir.norm(dim=1, keepdim=True) * _rand(b, 0.1, 0.6)[:, None]
    ir[:, 0] = 1.0
    n = t + ir_len
    out = torch.fft.irfft(torch.fft.rfft(wav, n=n) * torch.fft.rfft(ir, n=n), n=n)[:, :t]
    return out


def colored_noise(b: int, t: int) -> torch.Tensor:
    beta = _rand(b, 0.0, 2.0)[:, None]  # 0 white, 1 pink, 2 brown
    freqs = torch.fft.rfftfreq(t, 1 / SAMPLE_RATE)[None].clamp(min=20.0)
    spec = torch.fft.rfft(torch.randn(b, t)) / freqs ** (beta / 2)
    noise = torch.fft.irfft(spec, n=t)
    return noise / (noise.std(dim=1, keepdim=True) + 1e-8)


def augment(wav: torch.Tensor) -> torch.Tensor:
    b, t = wav.shape
    out = wav

    m = torch.rand(b) < 0.8
    if m.any():
        out = torch.where(m[:, None], random_eq(out), out)

    m = torch.rand(b) < 0.3
    if m.any():
        out = torch.where(m[:, None], random_reverb(out), out)

    m = torch.rand(b) < 0.7
    if m.any():
        snr_db = _rand(b, 8, 40)[:, None]
        sig_rms = out.pow(2).mean(dim=1, keepdim=True).sqrt()
        noise = colored_noise(b, t) * sig_rms / 10 ** (snr_db / 20)
        out = torch.where(m[:, None], out + noise, out)

    out = out * 10 ** (_rand(b, -20, 6)[:, None] / 20)
    peak = out.abs().amax(dim=1, keepdim=True)
    return torch.where(peak > 1.0, out / peak, out)
