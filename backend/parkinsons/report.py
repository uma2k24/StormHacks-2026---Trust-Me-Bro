"""Aggregates out-of-fold predictions into metrics and picks the decision threshold.

Also scores the held-out-dataset run (if present) and a classical MFCC +
logistic-regression baseline on the same folds for reference.
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
from data import SOURCES, get_audio, load_cache
from train import CV_DIR, N_FOLDS, subject_folds


def binary_metrics(y, p, threshold):
    y, p = np.asarray(y), np.asarray(p)
    pred = p >= threshold
    tp, tn = np.sum(pred & (y == 1)), np.sum(~pred & (y == 0))
    out = {"n": int(len(y)), "accuracy": float(np.mean(pred == y))}
    if len(set(y)) > 1:
        out["auc"] = float(roc_auc_score(y, p))
    if np.any(y == 1):
        out["sensitivity"] = float(tp / np.sum(y == 1))
    if np.any(y == 0):
        out["specificity"] = float(tn / np.sum(y == 0))
        out["healthy_median_prob"] = float(np.median(p[y == 0]))
    return out


def with_recording_probs(recs):
    for r in recs:
        r["prob"] = float(np.mean(r["window_probs"]))
    return recs


def subject_scores(recs):
    by_subject = defaultdict(list)
    for r in recs:
        by_subject[r["subject"]].append(r)
    return [
        {"subject": s, "group": rs[0]["group"], "source": rs[0]["source"], "label": rs[0]["label"], "prob": float(np.mean([r["prob"] for r in rs]))}
        for s, rs in by_subject.items()
    ]


def metrics_for(rows, threshold):
    return binary_metrics([r["label"] for r in rows], [r["prob"] for r in rows], threshold)


def source_balanced_threshold(subjects):
    """Youden-J cut where every source counts equally, placed midway between neighbouring scores.

    Pooling all subjects would let the large Italian clinic set dominate; healthy
    voices from unfamiliar microphones (LibriSpeech, MDVR-KCL controls) must weigh
    as much, since that is what the app hears.
    """
    scores = np.unique([s["prob"] for s in subjects])
    cuts = (scores[1:] + scores[:-1]) / 2
    by_source = defaultdict(list)
    for s in subjects:
        by_source[s["source"]].append(s)
    best_t, best_j = 0.5, -1
    for t in cuts:
        sens, spec = [], []
        for rows in by_source.values():
            m = metrics_for(rows, t)
            if "sensitivity" in m:
                sens.append(m["sensitivity"])
            if "specificity" in m:
                spec.append(m["specificity"])
        j = np.mean(sens) + np.mean(spec) - 1
        if j > best_j or (j == best_j and abs(t - 0.5) < abs(best_t - 0.5)):
            best_t, best_j = float(t), j
    return best_t


def mfcc_baseline(recordings, buffers, folds):
    feats = []
    for r in recordings:
        audio = get_audio(buffers, r)
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
    return [{"subject": r.subject, "group": r.group, "source": r.source, "label": r.label, "prob": float(p)} for r, p in zip(recordings, probs)]


def main():
    recs = with_recording_probs([r for k in range(N_FOLDS) for r in json.loads((CV_DIR / f"fold{k}.json").read_text())])
    subjects = subject_scores(recs)
    threshold = source_balanced_threshold(subjects)

    report = {"threshold": threshold, "subject_level": {}, "recording_level": {}}
    report["subject_level"]["all"] = metrics_for(subjects, threshold)
    for source in SOURCES:
        report["subject_level"][source] = metrics_for([s for s in subjects if s["source"] == source], threshold)
    report["subject_level"]["italian_elderly_hc_vs_pd"] = metrics_for(
        [s for s in subjects if s["source"] == "italian" and s["group"] != "YHC"], threshold
    )

    report["recording_level"]["all"] = metrics_for(recs, threshold)
    for source in SOURCES:
        for task in sorted({r["task"] if source == "mdvr" else r["task_group"] for r in recs if r["source"] == source}):
            rows = [r for r in recs if r["source"] == source and (r["task"] if source == "mdvr" else r["task_group"]) == task]
            report["recording_level"][f"{source}_{task}"] = metrics_for(rows, threshold)

    w_y = [r["label"] for r in recs for _ in r["window_probs"]]
    w_p = [p for r in recs for p in r["window_probs"]]
    report["single_4s_window"] = binary_metrics(w_y, w_p, threshold)

    for sr in sorted({r["orig_sr"] for r in recs if r["label"] == 1 and r["source"] == "italian"}):
        rows = [r for r in recs if r["label"] == 1 and r["source"] == "italian" and r["orig_sr"] == sr]
        report["recording_level"][f"italian_pd_recall_orig_{sr}hz"] = float(np.mean([r["prob"] >= threshold for r in rows]))

    holdout_path = ARTIFACTS_DIR / "holdout_mdvr.json"
    if holdout_path.exists():
        hold = with_recording_probs(json.loads(holdout_path.read_text()))
        report["unseen_dataset_mdvr"] = {
            "note": "model trained without any MDVR-KCL data, tested on all of it",
            "subject_level": metrics_for(subject_scores(hold), threshold),
            "recording_level": {t: metrics_for([r for r in hold if r["task"] == t], threshold) for t in ("READ", "DIALOGUE")},
        }

    recordings, buffers = load_cache()
    base = mfcc_baseline(recordings, buffers, subject_folds(recordings))
    report["baseline_mfcc_logreg_subject_auc"] = {
        source: binary_metrics(
            [s["label"] for s in subject_scores(base) if s["source"] == source],
            [s["prob"] for s in subject_scores(base) if s["source"] == source],
            0.5,
        ).get("auc")
        for source in ("italian", "mdvr")
    }
    report["baseline_mfcc_logreg_subject_auc"]["all"] = binary_metrics(
        [s["label"] for s in subject_scores(base)], [s["prob"] for s in subject_scores(base)], 0.5
    )["auc"]

    report["misclassified_subjects"] = [
        {"subject": s["subject"], "prob": round(s["prob"], 3)} for s in subjects if (s["prob"] >= threshold) != bool(s["label"])
    ]
    (ARTIFACTS_DIR / "cv_report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
