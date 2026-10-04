"""Prints sensitivity/specificity at several thresholds, from out-of-fold speaker scores."""

import json
from collections import defaultdict

import numpy as np

from kcl_train import KCL_CV_DIR, subject_means

rows = []
for path in sorted(KCL_CV_DIR.glob("s*_f*.json")):
    run = json.loads(path.read_text())
    rows += [(label, prob) for _, label, prob in subject_means(run["test_rows"])]

y = np.array([r[0] for r in rows])
p = np.array([r[1] for r in rows])
print(f"out-of-fold speaker decisions: {len(y)}  (PD {int((y == 1).sum())}, HC {int((y == 0).sum())})")
print(f"healthy mean score {p[y == 0].mean():.3f} | Parkinson's mean score {p[y == 1].mean():.3f}\n")
print(f"{'threshold':>9} {'sens':>6} {'spec':>6} {'acc':>6}")
for t in (0.20, 0.25, 0.289, 0.35, 0.40, 0.45, 0.50, 0.60):
    sens = np.sum((p >= t) & (y == 1)) / np.sum(y == 1)
    spec = np.sum((p < t) & (y == 0)) / np.sum(y == 0)
    acc = np.mean((p >= t) == (y == 1))
    print(f"{t:9.3f} {sens:6.2f} {spec:6.2f} {acc:6.2f}")
