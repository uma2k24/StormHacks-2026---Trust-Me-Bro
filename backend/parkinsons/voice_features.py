"""Computes UCI-style acoustic features from raw audio using Praat (parselmouth).

The UCI columns were produced by MDVP (Kay Pentax). Praat's jitter and shimmer use
slightly different definitions, so values are close but not identical; NHR especially
is a different band-limited measure and is approximated from HNR here.

Designed for a sustained vowel. On running speech the periodicity measures are much
noisier, so callers should pass a held "aah".
"""

import numpy as np
import parselmouth
from parselmouth.praat import call

from uci_data import PRAAT_FEATURES

PITCH_FLOOR = 75.0
PITCH_CEILING = 600.0
# Praat's standard period/amplitude guards for jitter and shimmer.
MAX_PERIOD_FACTOR = 1.3
MAX_AMPLITUDE_FACTOR = 1.6
SHORTEST_PERIOD = 0.0001
LONGEST_PERIOD = 0.02


def praat_features(audio: np.ndarray, sample_rate: int) -> dict[str, float]:
    """Returns the 16 Praat-reproducible UCI features; values are NaN when unmeasurable."""
    audio = np.asarray(audio, dtype=np.float64)
    audio = audio - audio.mean()
    peak = np.abs(audio).max()
    if peak > 0:
        audio = audio / peak * 0.95

    sound = parselmouth.Sound(audio, sampling_frequency=sample_rate)
    pitch = sound.to_pitch(time_step=0.01, pitch_floor=PITCH_FLOOR, pitch_ceiling=PITCH_CEILING)
    f0 = pitch.selected_array["frequency"]
    voiced = f0[f0 > 0]
    if voiced.size < 10:
        return {name: float("nan") for name in PRAAT_FEATURES}

    point_process = call(sound, "To PointProcess (periodic, cc)", PITCH_FLOOR, PITCH_CEILING)
    jitter_args = (0.0, 0.0, SHORTEST_PERIOD, LONGEST_PERIOD, MAX_PERIOD_FACTOR)
    shimmer_args = (*jitter_args, MAX_AMPLITUDE_FACTOR)

    def jitter(kind: str) -> float:
        return call(point_process, f"Get jitter ({kind})", *jitter_args)

    def shimmer(kind: str) -> float:
        return call([sound, point_process], f"Get shimmer ({kind})", *shimmer_args)

    harmonicity = sound.to_harmonicity_cc(minimum_pitch=PITCH_FLOOR)
    values = harmonicity.values[harmonicity.values > -200]
    hnr = float(np.mean(values)) if values.size else float("nan")

    features = {
        "MDVP:Fo(Hz)": float(np.mean(voiced)),
        "MDVP:Fhi(Hz)": float(np.max(voiced)),
        "MDVP:Flo(Hz)": float(np.min(voiced)),
        "MDVP:Jitter(%)": jitter("local"),
        "MDVP:Jitter(Abs)": jitter("local, absolute"),
        "MDVP:RAP": jitter("rap"),
        "MDVP:PPQ": jitter("ppq5"),
        "Jitter:DDP": jitter("ddp"),
        "MDVP:Shimmer": shimmer("local"),
        "MDVP:Shimmer(dB)": shimmer("local_dB"),
        "Shimmer:APQ3": shimmer("apq3"),
        "Shimmer:APQ5": shimmer("apq5"),
        "MDVP:APQ": shimmer("apq11"),
        "Shimmer:DDA": shimmer("dda"),
        # MDVP's NHR is band-limited and has no Praat equivalent; invert HNR instead.
        "NHR": float(10 ** (-hnr / 10)) if np.isfinite(hnr) else float("nan"),
        "HNR": hnr,
    }
    return {name: float(features[name]) for name in PRAAT_FEATURES}


def feature_vector(audio: np.ndarray, sample_rate: int) -> np.ndarray:
    f = praat_features(audio, sample_rate)
    return np.array([f[name] for name in PRAAT_FEATURES], dtype=float)


if __name__ == "__main__":
    import sys

    import librosa

    from config import SAMPLE_RATE

    for path in sys.argv[1:]:
        audio, _ = librosa.load(path, sr=SAMPLE_RATE, mono=True)
        print(f"\n{path}")
        for name, value in praat_features(audio, SAMPLE_RATE).items():
            print(f"  {name:20s} {value:.5f}")
