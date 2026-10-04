"""Builds reference distributions for jitter, shimmer and HNR from labelled recordings.

    python voice_reference.py        # writes artifacts/voice_reference.json

Scoring a live recording against fixed textbook cutoffs is fragile, because jitter and
shimmer shift with the microphone. Instead each measurement is placed as a percentile
of the healthy speakers in the Italian corpus, with the Parkinson's distribution kept
alongside so the gap between the two groups is visible.

Reads the feature cache written by vowel_eval.py.
"""

import json

import numpy as np

from config import ARTIFACTS_DIR
from uci_data import PRAAT_FEATURES

CACHE = ARTIFACTS_DIR / "italian_vowel_features.npz"
OUT = ARTIFACTS_DIR / "voice_reference.json"

# The three measures the report shows, with the direction that indicates more disordered
# voice. Jitter and shimmer go up with instability; HNR goes down as noise increases.
MEASURES = {
    "jitter": {
        "feature": "MDVP:Jitter(%)",
        "label": "Jitter",
        "unit": "%",
        "scale": 100.0,  # Praat returns a fraction; show it as a percentage
        "higher_is_worse": True,
        "describes": "Cycle-to-cycle variation in pitch. Rises when vocal folds vibrate irregularly.",
    },
    "shimmer": {
        "feature": "MDVP:Shimmer",
        "label": "Shimmer",
        "unit": "%",
        "scale": 100.0,
        "higher_is_worse": True,
        "describes": "Cycle-to-cycle variation in loudness. Rises when vocal fold closure is uneven.",
    },
    "hnr": {
        "feature": "HNR",
        "label": "Harmonics-to-noise ratio",
        "unit": "dB",
        "scale": 1.0,
        "higher_is_worse": False,
        "describes": "How much of the voice is clear tone versus breathy noise. Falls as the voice gets hoarse.",
    },
}

PERCENTILES = [5, 10, 25, 50, 75, 90, 95]


def main() -> None:
    if not CACHE.exists():
        raise SystemExit(f"{CACHE} not found - run `python vowel_eval.py` first")
    data = np.load(CACHE, allow_pickle=True)
    X, y = data["X"], data["y"]

    reference = {"source": "Italian Parkinson's Voice and Speech, sustained vowel recordings",
                 "n_healthy": int((y == 0).sum()), "n_parkinsons": int((y == 1).sum()), "measures": {}}

    for key, meta in MEASURES.items():
        column = PRAAT_FEATURES.index(meta["feature"])
        values = X[:, column] * meta["scale"]
        healthy, parkinsons = values[y == 0], values[y == 1]
        reference["measures"][key] = {
            **{k: v for k, v in meta.items() if k != "feature"},
            "healthy": {f"p{p}": float(np.percentile(healthy, p)) for p in PERCENTILES},
            "parkinsons_median": float(np.median(parkinsons)),
            "healthy_values": sorted(float(v) for v in healthy),
        }
        print(f"{meta['label']:28s} healthy median {np.median(healthy):7.3f}  "
              f"PD median {np.median(parkinsons):7.3f} {meta['unit']}")

    OUT.write_text(json.dumps(reference, indent=2))
    print(f"\nsaved {OUT}  ({reference['n_healthy']} healthy, {reference['n_parkinsons']} PD recordings)")


if __name__ == "__main__":
    main()
