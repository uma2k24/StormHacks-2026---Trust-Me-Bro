"""Aggregates the MDVR-KCL cross-validation runs into an honest performance report.

Primary numbers are speaker-level and come from folds whose speakers were never
trained on, with thresholds chosen on inner validation speakers only. The Italian
dataset and LibriSpeech are pure external tests: no KCL model ever saw them.
"""

import json
from collections import defaultdict

import numpy as np
import torch
from sklearn.metrics import roc_auc_score

from config import ARTIFACTS_DIR, EVAL_HOP_SECONDS, SAMPLE_RATE, WINDOW_SAMPLES
from kcl_train import KCL_CV_DIR, subject_means
from model import LogMelFrontend, PDNet


def rates(y, p, threshold):
    y, p = np.asarray(y), np.asarray(p)
    pred = p >= threshold
    return {
        "n": int(len(y)),
        "accuracy": float(np.mean(pred == y)),
        "sensitivity": float(np.sum(pred & (y == 1)) / max(np.sum(y == 1), 1)),
        "specificity": float(np.sum(~pred & (y == 0)) / max(np.sum(y == 0), 1)),
    }


def load_runs():
    runs = [json.loads(p.read_text()) for p in sorted(KCL_CV_DIR.glob("s*_f*.json"))]
    return [r for r in runs if r["test_rows"]]


def summarize(runs):
    report = {"n_runs": len(runs)}

    fold_aucs, flagged, correct = [], [], []
    per_seed = defaultdict(list)
    for run in runs:
        subjects = subject_means(run["test_rows"])
        y = [s[1] for s in subjects]
        p = [s[2] for s in subjects]
        if len(set(y)) > 1:
            fold_aucs.append(roc_auc_score(y, p))
        per_seed[run["seed"]] += [(s[0], s[1], s[2]) for s in subjects]
        for subject, label, prob in subjects:
            flagged.append((label, prob >= run["threshold"]))
            correct.append((prob >= run["threshold"]) == bool(label))

    report["fold_subject_auc"] = {
        "mean": float(np.mean(fold_aucs)),
        "std": float(np.std(fold_aucs)),
        "min": float(np.min(fold_aucs)),
        "max": float(np.max(fold_aucs)),
        "n_folds": len(fold_aucs),
    }

    pooled = []
    for seed, subjects in sorted(per_seed.items()):
        y = [s[1] for s in subjects]
        p = [s[2] for s in subjects]
        pooled.append(roc_auc_score(y, p))
    report["pooled_oof_auc_per_seed"] = {
        "values": [round(v, 4) for v in pooled],
        "mean": float(np.mean(pooled)),
        "std": float(np.std(pooled)),
    }

    y = [l for l, _ in flagged]
    pred = np.array([f for _, f in flagged])
    report["at_nested_thresholds"] = {
        "n_decisions": len(y),
        "accuracy": float(np.mean(correct)),
        "sensitivity": float(np.sum(pred & (np.array(y) == 1)) / max(np.sum(np.array(y) == 1), 1)),
        "specificity": float(np.sum(~pred & (np.array(y) == 0)) / max(np.sum(np.array(y) == 0), 1)),
    }
    report["mean_nested_threshold"] = float(np.mean([r["threshold"] for r in runs]))

    for task in ("ReadText", "SpontaneousDialogue"):
        rows = [row for run in runs for row in run["test_rows"] if row["task"] == task]
        if rows:
            report[f"recording_level_{task}"] = {
                "auc": float(roc_auc_score([r["label"] for r in rows], [r["prob"] for r in rows])),
                **rates([r["label"] for r in rows], [r["prob"] for r in rows], report["mean_nested_threshold"]),
            }

    # Does detection track reported severity? First digit of the filename code.
    by_stage = defaultdict(list)
    for run in runs:
        for row in run["test_rows"]:
            if row["label"] == 1 and row["severity"]:
                by_stage[row["severity"].split("-")[0]].append(row["prob"])
    report["pd_mean_prob_by_severity_code"] = {
        k: {"n": len(v), "mean_prob": round(float(np.mean(v)), 3)} for k, v in sorted(by_stage.items())
    }

    # Speakers the ensemble gets wrong most often, averaged across seeds.
    per_subject = defaultdict(list)
    for run in runs:
        for subject, label, prob in subject_means(run["test_rows"]):
            per_subject[subject].append((label, prob, run["threshold"]))
    report["hardest_speakers"] = sorted(
        [
            {
                "subject": s,
                "label": v[0][0],
                "mean_prob": round(float(np.mean([p for _, p, _ in v])), 3),
                "flag_rate": round(float(np.mean([p >= t for _, p, t in v])), 2),
            }
            for s, v in per_subject.items()
        ],
        key=lambda r: abs(r["label"] - r["flag_rate"]),
        reverse=True,
    )[:8]
    return report


def build_ensemble(runs, width: float, dropout: float):
    members = []
    for run in runs:
        path = KCL_CV_DIR / f"s{run['seed']}_f{run['fold']}.pt"
        net = PDNet(dropout=dropout, width=width)
        net.load_state_dict(torch.load(path, map_location="cpu"))
        members.append(net.eval())
    return members


@torch.no_grad()
def ensemble_probs(frontend, members, audio: np.ndarray) -> float:
    from kcl_data import window_starts
    from train import window_at

    starts = window_starts(audio, WINDOW_SAMPLES, int(EVAL_HOP_SECONDS * SAMPLE_RATE))
    windows = torch.from_numpy(np.stack([window_at(audio, int(s)) for s in starts]))
    scores = []
    for chunk in windows.split(32):
        feats = frontend(chunk)
        scores.append(torch.stack([torch.sigmoid(m(feats)) for m in members]).mean(0))
    return float(torch.cat(scores).mean())


def external_tests(members, threshold):
    import librosa

    from config import LIBRISPEECH_DIR
    from data import get_audio as italian_audio
    from data import load_cache

    frontend = LogMelFrontend()
    out = {}

    # load_cache now returns a dict of per-source buffers; keep only the Italian set.
    recordings, buffers = load_cache(["italian"])
    rows = []
    for r in recordings:
        if getattr(r, "source", "italian") != "italian":
            continue
        if r.task_group == "speech":  # closest match to KCL's read / spontaneous speech
            rows.append((r.subject, r.label, ensemble_probs(frontend, members, italian_audio(buffers, r))))
    by_subject = defaultdict(list)
    for subject, label, prob in rows:
        by_subject[subject].append((label, prob))
    subjects = [(v[0][0], float(np.mean([p for _, p in v]))) for v in by_subject.values()]
    out["italian_speech_subject_level"] = {
        "auc": float(roc_auc_score([y for y, _ in subjects], [p for _, p in subjects])),
        **rates([y for y, _ in subjects], [p for _, p in subjects], threshold),
    }

    probs = []
    for speaker_dir in sorted(LIBRISPEECH_DIR.iterdir())[:26]:
        clips, total = [], 0.0
        for flac in sorted(speaker_dir.rglob("*.flac")):
            audio, _ = librosa.load(flac, sr=SAMPLE_RATE, mono=True)
            clips.append(audio)
            total += len(audio) / SAMPLE_RATE
            if total >= 60:
                break
        probs.append(ensemble_probs(frontend, members, np.concatenate(clips)))
    out["librispeech_healthy"] = {
        "n_speakers": len(probs),
        "false_positive_rate": float(np.mean([p >= threshold for p in probs])),
        "mean_prob": float(np.mean(probs)),
        "max_prob": float(np.max(probs)),
    }
    return out


def main():
    runs = load_runs()
    report = summarize(runs)
    members = build_ensemble(runs, width=0.5, dropout=0.4)
    report["external"] = external_tests(members, report["mean_nested_threshold"])
    (ARTIFACTS_DIR / "kcl_report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
