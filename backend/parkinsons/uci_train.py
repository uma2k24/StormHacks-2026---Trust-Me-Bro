"""Trains a Parkinson's classifier on the UCI sustained-vowel features.

    python uci_train.py

Nested, subject-grouped, repeated cross-validation:
  * outer folds split people, never recordings, so no voice appears in train and test
  * an inner split of the training people picks the decision threshold, so the test
    fold never influences any choice
  * repeated over several seeds, because with 8 healthy subjects a single split is noise

Two feature sets are compared: all 22 published columns, and the 16 Praat reproduces.
Only the Praat subset can be computed from a live microphone, so that is what ships.
"""

import json

import joblib
import numpy as np
from sklearn.ensemble import ExtraTreesClassifier, GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from config import ARTIFACTS_DIR
from uci_data import ALL_FEATURES, PRAAT_FEATURES, load_uci

N_SEEDS = 10
OUTER_FOLDS = 5
INNER_FOLDS = 4


def build(name: str):
    if name == "logreg":
        return make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=5000, class_weight="balanced"))
    if name == "svm":
        return make_pipeline(StandardScaler(), SVC(C=2.0, gamma="scale", probability=True, class_weight="balanced", random_state=0))
    if name == "rf":
        return RandomForestClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced_subsample", random_state=0)
    if name == "et":
        return ExtraTreesClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced", random_state=0)
    if name == "gb":
        return GradientBoostingClassifier(n_estimators=200, learning_rate=0.05, max_depth=2, random_state=0)
    raise ValueError(name)


MODELS = ["logreg", "svm", "rf", "et", "gb"]


def youden_threshold(y: np.ndarray, p: np.ndarray) -> float:
    cuts = np.unique(p)
    if len(cuts) < 2:
        return 0.5
    best_t, best_j = 0.5, -1.0
    for t in (cuts[1:] + cuts[:-1]) / 2:
        pred = p >= t
        sens = pred[y == 1].mean() if (y == 1).any() else 0.0
        spec = (~pred[y == 0]).mean() if (y == 0).any() else 0.0
        if sens + spec - 1 > best_j:
            best_t, best_j = float(t), sens + spec - 1
    return best_t


def subject_level(subjects: np.ndarray, y: np.ndarray, p: np.ndarray):
    """Averages recording probabilities per person; a screening call is made per person."""
    order = sorted(set(subjects))
    sy = np.array([y[subjects == s][0] for s in order])
    sp = np.array([p[subjects == s].mean() for s in order])
    return sy, sp


def evaluate(name: str, features: list[str], df) -> dict:
    X = df[features].to_numpy(dtype=float)
    y = df["status"].to_numpy(dtype=int)
    groups = df["subject"].to_numpy()

    aucs, accs, senss, specs, thresholds = [], [], [], [], []
    for seed in range(N_SEEDS):
        oof = np.zeros(len(y))
        oof_threshold = np.zeros(len(y))
        outer = StratifiedGroupKFold(n_splits=OUTER_FOLDS, shuffle=True, random_state=seed)
        for train_idx, test_idx in outer.split(X, y, groups):
            model = build(name)
            model.fit(X[train_idx], y[train_idx])
            oof[test_idx] = model.predict_proba(X[test_idx])[:, 1]

            # Inner split of the training people only, to choose the threshold.
            inner_p = np.zeros(len(train_idx))
            inner = StratifiedGroupKFold(n_splits=INNER_FOLDS, shuffle=True, random_state=seed)
            for a, b in inner.split(X[train_idx], y[train_idx], groups[train_idx]):
                m = build(name)
                m.fit(X[train_idx][a], y[train_idx][a])
                inner_p[b] = m.predict_proba(X[train_idx][b])[:, 1]
            iy, ip = subject_level(groups[train_idx], y[train_idx], inner_p)
            oof_threshold[test_idx] = youden_threshold(iy, ip)

        sy, sp = subject_level(groups, y, oof)
        st = np.array([oof_threshold[groups == s][0] for s in sorted(set(groups))])
        pred = sp >= st
        aucs.append(roc_auc_score(sy, sp))
        accs.append(float((pred == (sy == 1)).mean()))
        senss.append(float(pred[sy == 1].mean()))
        specs.append(float((~pred[sy == 0]).mean()))
        thresholds.append(float(np.median(st)))

    return {
        "model": name,
        "features": len(features),
        "subject_auc": float(np.mean(aucs)),
        "subject_auc_sd": float(np.std(aucs)),
        "accuracy": float(np.mean(accs)),
        "sensitivity": float(np.mean(senss)),
        "specificity": float(np.mean(specs)),
        "threshold": float(np.median(thresholds)),
    }


def main() -> None:
    df = load_uci()
    results = {}
    for label, features in (("all22", ALL_FEATURES), ("praat16", PRAAT_FEATURES)):
        print(f"\n=== {label} ({len(features)} features) ===")
        print(f"{'model':8s} {'AUC':>12s} {'acc':>6s} {'sens':>6s} {'spec':>6s} {'thr':>6s}")
        results[label] = []
        for name in MODELS:
            r = evaluate(name, features, df)
            results[label].append(r)
            print(f"{name:8s} {r['subject_auc']:.3f}+-{r['subject_auc_sd']:.3f} "
                  f"{r['accuracy']:6.3f} {r['sensitivity']:6.3f} {r['specificity']:6.3f} {r['threshold']:6.3f}")

    # Ship the best Praat-only model: it is the only one a microphone can feed.
    best = max(results["praat16"], key=lambda r: r["subject_auc"])
    print(f"\nshipping {best['model']} on the Praat subset (AUC {best['subject_auc']:.3f})")

    model = build(best["model"])
    model.fit(df[PRAAT_FEATURES].to_numpy(dtype=float), df["status"].to_numpy(dtype=int))

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "features": PRAAT_FEATURES, "threshold": best["threshold"]},
                ARTIFACTS_DIR / "uci_vowel_model.joblib")
    (ARTIFACTS_DIR / "uci_report.json").write_text(json.dumps({"selected": best, "comparison": results}, indent=2))
    print(f"saved {ARTIFACTS_DIR / 'uci_vowel_model.joblib'}")


if __name__ == "__main__":
    main()
