"""Aggregates out-of-fold predictions into metrics and picks the decision threshold.

Also scores a classical MFCC + logistic-regression baseline on the same folds for reference.
"""

import json
from collections import defaultdict

import librosa
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from config import ARTIFACTS_DIR, SAMPLE_RATE
from data import get_audio, load_cache
from train import CV_DIR, N_FOLDS, subject_folds


def binary_metrics(y, p, threshold):
    y, p = np.asarray(y), np.asarray(p)
    pred = p >= threshold
    tp, tn = np.sum(pred & (y == 1)), np.sum(~pred & (y == 0))
    return {
        "n": int(len(y)),
        "auc": float(roc_auc_score(y, p)) if len(set(y)) > 1 else None,
        "accuracy": float(np.mean(pred == y)),
        "sensitivity": float(tp / max(np.sum(y == 1), 1)),
        "specificity": float(tn / max(np.sum(y == 0), 1)),
    }


def subject_scores(recs):
    by_subject = defaultdict(list)
    for r in recs:
        by_subject[r["subject"]].append(r)
    rows = []
    for subject, rs in by_subject.items():
        rows.append((subject, rs[0]["group"], rs[0]["label"], float(np.mean([r["prob"] for r in rs]))))
    return rows


def youden_threshold(y, p):
    """Best Youden-J cut, placed midway between neighbouring scores rather than on a training point."""
    scores = np.unique(p)
    cuts = (scores[1:] + scores[:-1]) / 2
    best_t, best_j = 0.5, -1
    for t in cuts:
        m = binary_metrics(y, p, t)
        j = m["sensitivity"] + m["specificity"] - 1
        if j > best_j or (j == best_j and abs(t - 0.5) < abs(best_t - 0.5)):
            best_t, best_j = float(t), j
    return best_t


def mfcc_baseline(recordings, buffer, folds):
    feats = []
    for r in recordings:
        audio = get_audio(buffer, r)
        m = librosa.feature.mfcc(y=audio, sr=SAMPLE_RATE, n_mfcc=20, n_fft=512, hop_length=160, fmax=7000)
        d = librosa.feature.delta(m)
        feats.append(np.concatenate([m.mean(1), m.std(1), d.std(1)]))
    feats = np.array(feats)
    y = np.array([r.label for r in recordings])
    probs = np.zeros(len(recordings))
    for test_subjects in folds:
        test = np.array([r.subject in test_subjects for r in recordings])
        clf = make_pipeline(StandardScaler(), LogisticRegression(C=0.1, max_iter=2000, class_weight="balanced"))
        clf.fit(feats[~test], y[~test])
        probs[test] = clf.predict_proba(feats[test])[:, 1]
    return [{"subject": r.subject, "group": r.group, "label": r.label, "prob": float(p)} for r, p in zip(recordings, probs)]


def main():
    recs = []
    for k in range(N_FOLDS):
        for r in json.loads((CV_DIR / f"fold{k}.json").read_text()):
            r["prob"] = float(np.mean(r["window_probs"]))
            recs.append(r)

    subjects = subject_scores(recs)
    y_s = [s[2] for s in subjects]
    p_s = [s[3] for s in subjects]
    threshold = youden_threshold(y_s, p_s)

    report = {"threshold": threshold, "subject_level": {}, "recording_level": {}, "window_level": {}}
    for t_name, t in (("at_0.5", 0.5), ("at_chosen_threshold", threshold)):
        report["subject_level"][t_name] = binary_metrics(y_s, p_s, t)
    elderly = [s for s in subjects if s[1] != "YHC"]
    report["subject_level"]["elderly_hc_vs_pd"] = binary_metrics([s[2] for s in elderly], [s[3] for s in elderly], threshold)

    report["recording_level"]["all"] = binary_metrics([r["label"] for r in recs], [r["prob"] for r in recs], threshold)
    for tg in ("vowel", "ddk", "speech"):
        sub = [r for r in recs if r["task_group"] == tg]
        report["recording_level"][tg] = binary_metrics([r["label"] for r in sub], [r["prob"] for r in sub], threshold)
    sub = [r for r in recs if r["task_group"] == "speech" and r["group"] != "YHC"]
    report["recording_level"]["speech_elderly_hc_vs_pd"] = binary_metrics([r["label"] for r in sub], [r["prob"] for r in sub], threshold)

    w_y = [r["label"] for r in recs for _ in r["window_probs"]]
    w_p = [p for r in recs for p in r["window_probs"]]
    report["window_level"]["single_4s_window"] = binary_metrics(w_y, w_p, threshold)

    # Confound check: PD recall should not depend on the original recorder sample rate.
    for sr in sorted({r["orig_sr"] for r in recs if r["label"] == 1}):
        sub = [r for r in recs if r["label"] == 1 and r["orig_sr"] == sr]
        report["recording_level"][f"pd_recall_orig_{sr}hz"] = float(np.mean([r["prob"] >= threshold for r in sub]))

    recordings, buffer = load_cache()
    base = mfcc_baseline(recordings, buffer, subject_folds(recordings))
    bs = subject_scores(base)
    report["baseline_mfcc_logreg"] = {
        "subject_level_auc": float(roc_auc_score([s[2] for s in bs], [s[3] for s in bs])),
        "recording_level_auc": float(roc_auc_score([r["label"] for r in base], [r["prob"] for r in base])),
    }

    report["misclassified_subjects"] = [
        {"subject": s[0], "group": s[1], "prob": round(s[3], 3)} for s in subjects if (s[3] >= threshold) != bool(s[2])
    ]
    (ARTIFACTS_DIR / "cv_report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
