"""Tests the UCI-trained vowel model on the Italian sustained-vowel recordings.

    python vowel_eval.py

The UCI model was fitted on MDVP measurements from one lab. This checks whether it
survives a different lab, language, and microphone when the same features are
recomputed with Praat. Also reports how well a model trained directly on Italian
Praat features does, which separates "these features are weak" from
"the UCI model does not transfer".
"""

import json
import warnings

import joblib
import librosa
import numpy as np
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold

from config import ARTIFACTS_DIR, SAMPLE_RATE
from data import index_italian
from uci_data import PRAAT_FEATURES, load_uci
from voice_features import feature_vector

warnings.filterwarnings("ignore")
CACHE = ARTIFACTS_DIR / "italian_vowel_features.npz"


def build_italian_features() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if CACHE.exists():
        d = np.load(CACHE, allow_pickle=True)
        return d["X"], d["y"], d["subjects"]

    recordings = [r for r in index_italian() if r.task_group == "vowel"]
    rows, labels, subjects = [], [], []
    for i, rec in enumerate(recordings, 1):
        audio, _ = librosa.load(rec.path, sr=SAMPLE_RATE, mono=True)
        if audio.size < SAMPLE_RATE:
            continue
        vector = feature_vector(audio, SAMPLE_RATE)
        if not np.isfinite(vector).all():
            continue
        rows.append(vector)
        labels.append(rec.label)
        subjects.append(rec.subject)
        if i % 25 == 0:
            print(f"  {i}/{len(recordings)} vowel recordings", flush=True)

    X, y, s = np.array(rows), np.array(labels), np.array(subjects)
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    np.savez(CACHE, X=X, y=y, subjects=s)
    return X, y, s


def by_subject(subjects, y, p):
    order = sorted(set(subjects))
    sy = np.array([y[subjects == s][0] for s in order])
    sp = np.array([p[subjects == s].mean() for s in order])
    return sy, sp


def main() -> None:
    print("Extracting Praat features from Italian vowel recordings...")
    X, y, subjects = build_italian_features()
    print(f"{len(X)} recordings, {len(set(subjects))} subjects, {int(y.sum())} from PD speakers\n")

    # 1. Does the UCI model transfer to a new lab/language/microphone?
    bundle = joblib.load(ARTIFACTS_DIR / "uci_vowel_model.joblib")
    probs = bundle["model"].predict_proba(X)[:, 1]
    sy, sp = by_subject(subjects, y, probs)
    transfer_auc = roc_auc_score(sy, sp)
    print(f"UCI-trained model on Italian vowels:  subject AUC {transfer_auc:.3f}")
    print(f"  median probability: PD {np.median(sp[sy == 1]):.3f}  healthy {np.median(sp[sy == 0]):.3f}")

    # 2. How much signal do these features carry when trained in-domain?
    aucs = []
    for seed in range(5):
        oof = np.zeros(len(y))
        for train_idx, test_idx in StratifiedGroupKFold(5, shuffle=True, random_state=seed).split(X, y, subjects):
            model = ExtraTreesClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced", random_state=0)
            model.fit(X[train_idx], y[train_idx])
            oof[test_idx] = model.predict_proba(X[test_idx])[:, 1]
        aucs.append(roc_auc_score(*by_subject(subjects, y, oof)))
    print(f"\nPraat features trained on Italian itself: subject AUC {np.mean(aucs):.3f} +- {np.std(aucs):.3f}")

    # 3. Reverse direction: Italian-trained features applied to UCI speakers.
    uci = load_uci()
    model = ExtraTreesClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced", random_state=0)
    model.fit(X, y)
    uci_probs = model.predict_proba(uci[PRAAT_FEATURES].to_numpy(dtype=float))[:, 1]
    uy, up = by_subject(uci["subject"].to_numpy(), uci["status"].to_numpy(), uci_probs)
    print(f"Italian-trained model on UCI speakers:    subject AUC {roc_auc_score(uy, up):.3f}")

    (ARTIFACTS_DIR / "vowel_transfer_report.json").write_text(
        json.dumps(
            {
                "uci_model_on_italian_subject_auc": float(transfer_auc),
                "praat_features_in_domain_italian_auc": float(np.mean(aucs)),
                "italian_model_on_uci_subject_auc": float(roc_auc_score(uy, up)),
                "n_italian_recordings": int(len(X)),
                "n_italian_subjects": int(len(set(subjects))),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
