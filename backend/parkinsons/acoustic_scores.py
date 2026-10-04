"""Jitter, shimmer, and HNR with the site's color bands and display ranges.

Higher jitter and shimmer are worse. Lower HNR is worse.
Bands (inclusive edges belong to the worse side):

  jitter   green < 0.62%   yellow 0.62–1.12%   red >= 1.12%
  shimmer  green < 6.67%   yellow 6.67–8.52%   red >= 8.52%
  HNR      green >= 14.89 dB   yellow 12.85–14.89 dB   red <= 12.85 dB

The range bar runs from the healthiest anchor on the left to the severe anchor
on the right, so a marker further right is more Parkinsonian.
"""

from __future__ import annotations

import math

import numpy as np

from voice_features import praat_features

# left = healthiest, right = most severe, used only to place the marker.
SCALES = {
    "jitter": {
        "name": "Jitter",
        "unit": "%",
        "higher_is_worse": True,
        "best": 0.20,
        "worst": 2.50,
        "green_below": 0.62,
        "red_at": 1.12,
        "healthy_range": "0.4–0.7%",
        "pd_range": "0.8–1.5%+",
        "means": "Pitch wobble from one vocal-fold cycle to the next. Higher is less steady.",
    },
    "shimmer": {
        "name": "Shimmer",
        "unit": "%",
        "higher_is_worse": True,
        "best": 2.00,
        "worst": 15.00,
        "green_below": 6.67,
        "red_at": 8.52,
        "healthy_range": "5–7%",
        "pd_range": "8–12%+",
        "means": "Loudness wobble from one vocal-fold cycle to the next. Higher is less even.",
    },
    "hnr": {
        "name": "HNR",
        "unit": "dB",
        "higher_is_worse": False,
        "best": 30.0,
        "worst": 5.0,
        "green_at": 14.89,
        "red_at": 12.85,
        "healthy_range": "15–21 dB",
        "pd_range": "11–14 dB",
        "means": "Clear tone versus breathy noise. Lower means more noise.",
    },
}


def _band_higher_worse(value: float, green_below: float, red_at: float) -> str:
    if value < green_below:
        return "good"
    if value < red_at:
        return "warn"
    return "bad"


def _band_higher_better(value: float, green_at: float, red_at: float) -> str:
    if value >= green_at:
        return "good"
    if value > red_at:
        return "warn"
    return "bad"


def _label(band: str) -> str:
    return {"good": "Healthy", "warn": "Borderline", "bad": "PD range"}.get(band, "Unmeasurable")


def _position(value: float, best: float, worst: float, higher_is_worse: bool) -> float:
    """0 at the healthy end of the bar, 1 at the severe end."""
    if higher_is_worse:
        raw = (value - best) / (worst - best)
    else:
        raw = (best - value) / (best - worst)
    return float(min(1.0, max(0.0, raw)))


def _zones(spec: dict) -> dict:
    """Widths of the green, yellow, and red segments, left (healthy) to right (severe)."""
    span = abs(spec["best"] - spec["worst"])
    if spec["higher_is_worse"]:
        green = (spec["green_below"] - spec["best"]) / span
        yellow = (spec["red_at"] - spec["green_below"]) / span
    else:
        green = (spec["best"] - spec["green_at"]) / span
        yellow = (spec["green_at"] - spec["red_at"]) / span
    green = float(min(1.0, max(0.0, green)))
    yellow = float(min(1.0 - green, max(0.0, yellow)))
    return {"green": round(green, 4), "yellow": round(yellow, 4), "red": round(1.0 - green - yellow, 4)}


def _metric(key: str, value: float | None) -> dict:
    spec = SCALES[key]
    if spec["unit"] == "%":
        scale_left, scale_right = f"{spec['best']:.2f}%", f"{spec['worst']:.2f}%+"
    else:
        scale_left, scale_right = f"{spec['best']:.1f} dB", f"{spec['worst']:.1f} dB"
    base = {
        "id": key,
        "name": spec["name"],
        "unit": spec["unit"],
        "means": spec["means"],
        "healthyRange": spec["healthy_range"],
        "pdRange": spec["pd_range"],
        "scaleLeft": scale_left,
        "scaleRight": scale_right,
        "zones": _zones(spec),
    }

    if value is None or not math.isfinite(value):
        return {
            **base,
            "value": None,
            "display": "—",
            "label": "Unmeasurable",
            "band": "na",
            "position": None,
        }

    if spec["higher_is_worse"]:
        band = _band_higher_worse(value, spec["green_below"], spec["red_at"])
        display = f"{value:.2f}%"
    else:
        band = _band_higher_better(value, spec["green_at"], spec["red_at"])
        display = f"{value:.1f} dB"

    return {
        **base,
        "value": round(value, 2 if spec["unit"] == "%" else 1),
        "display": display,
        "label": _label(band),
        "band": band,
        "position": round(_position(value, spec["best"], spec["worst"], spec["higher_is_worse"]), 4),
    }


def score_acoustics(audio: np.ndarray, sample_rate: int, task: str = "speech") -> dict:
    try:
        raw = praat_features(audio, sample_rate)
    except Exception:
        raw = {}

    jitter_frac = raw.get("MDVP:Jitter(%)")
    shimmer_frac = raw.get("MDVP:Shimmer")
    hnr = raw.get("HNR")
    jitter = float(jitter_frac) * 100.0 if jitter_frac is not None and math.isfinite(jitter_frac) else None
    shimmer = float(shimmer_frac) * 100.0 if shimmer_frac is not None and math.isfinite(shimmer_frac) else None
    hnr_db = float(hnr) if hnr is not None and math.isfinite(hnr) else None

    metrics = [_metric("jitter", jitter), _metric("shimmer", shimmer), _metric("hnr", hnr_db)]
    bands = [m["band"] for m in metrics if m["band"] != "na"]
    red = sum(b == "bad" for b in bands)
    yellow = sum(b == "warn" for b in bands)
    reliable = task == "vowel" and bool(bands)

    if not bands:
        summary, band, detail = "Unmeasurable", "na", "Need a longer, steadier voiced sound — hold an “aah”."
    elif red:
        summary, band = "PD range", "bad"
        detail = f"{red} of {len(bands)} measures sit in the Parkinson’s range."
    elif yellow:
        summary, band = "Borderline", "warn"
        detail = f"{yellow} of {len(bands)} measures sit between the healthy and Parkinson’s ranges."
    else:
        summary, band = "Healthy", "good"
        detail = "Jitter, shimmer, and HNR all sit in the healthy range."
    if bands and not reliable:
        detail += " These measures are most trustworthy on a held “aah”."

    return {
        "overall": {"label": summary, "band": band, "detail": detail, "reliable": reliable},
        "metrics": metrics,
    }
