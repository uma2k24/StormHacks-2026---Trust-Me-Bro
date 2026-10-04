"""Scores the exported model on datasets it never saw during training.

MDVR-KCL      English PD/HC speakers, different clinic, 44.1 kHz phone recordings.
Mini LibriSpeech  Healthy English audiobook readers; used as a false-positive check.

Nothing here is used to pick the threshold or tune the model; it is a held-out test.
"""

import json
from collections import defaultdict
from pathlib import Path

import librosa
import numpy as np
import onnxruntime as ort
from sklearn.metrics import roc_auc_score

from config import ARTIFACTS_DIR, ROOT, SAMPLE_RATE
from predict import screen

EXTERNAL = ROOT / "data" / "external"
KCL = EXTERNAL / "mdvr_kcl" / "26-29_09_2017_KCL"
LIBRI = EXTERNAL / "LibriSpeech" / "dev-clean-2"


def metrics(y, p, threshold):
    y, p = np.asarray(y), np.asarray(p)
    pred = p >= threshold
    return {
        "n": int(len(y)),
        "auc": float(roc_auc_score(y, p)) if len(set(y)) > 1 else None,
        "accuracy": float(np.mean(pred == y)),
        "sensitivity": float(np.sum(pred & (y == 1)) / max(np.sum(y == 1), 1)),
        "specificity": float(np.sum(~pred & (y == 0)) / max(np.sum(y == 0), 1)),
    }


def score_kcl(session):
    rows = []
    for task in ("ReadText", "SpontaneousDialogue"):
        for group, label in (("HC", 0), ("PD", 1)):
            for wav in sorted((KCL / task / group).glob("*.wav")):
                audio, _ = librosa.load(wav, sr=SAMPLE_RATE, mono=True)
                probs = screen(session, audio)
                rows.append(
                    {
                        "subject": wav.name.split("_")[0],
                        "task": task,
                        "label": label,
                        "prob": float(np.mean(probs)),
                        "seconds": len(audio) / SAMPLE_RATE,
                    }
                )
                print(f"  {task:20s} {group} {wav.name:28s} {rows[-1]['prob']:.3f}", flush=True)
    return rows


def score_librispeech(session, max_speakers=26, seconds_per_speaker=60.0):
    rows = []
    for speaker_dir in sorted(LIBRI.iterdir())[:max_speakers]:
        clips, total = [], 0.0
        for flac in sorted(speaker_dir.rglob("*.flac")):
            audio, _ = librosa.load(flac, sr=SAMPLE_RATE, mono=True)
            clips.append(audio)
            total += len(audio) / SAMPLE_RATE
            if total >= seconds_per_speaker:
                break
        audio = np.concatenate(clips)
        probs = screen(session, audio)
        rows.append(
            {
                "subject": f"libri-{speaker_dir.name}",
                "task": "Audiobook",
                "label": 0,
                "prob": float(np.mean(probs)),
                "seconds": len(audio) / SAMPLE_RATE,
            }
        )
        print(f"  librispeech {speaker_dir.name:8s} {rows[-1]['prob']:.3f}", flush=True)
    return rows


def by_subject(rows):
    grouped = defaultdict(list)
    for r in rows:
        grouped[r["subject"]].append(r)
    return [(s, rs[0]["label"], float(np.mean([r["prob"] for r in rs]))) for s, rs in grouped.items()]


def main():
    threshold = json.loads((ARTIFACTS_DIR / "cv_report.json").read_text())["threshold"]
    session = ort.InferenceSession(str(ARTIFACTS_DIR / "parkinson_voice_classifier.onnx"))

    print("MDVR-KCL (English, independent clinic)")
    kcl = score_kcl(session)
    print("\nMini LibriSpeech (healthy audiobook readers)")
    libri = score_librispeech(session)

    report = {"threshold": threshold, "mdvr_kcl": {}, "librispeech": {}}

    subjects = by_subject(kcl)
    report["mdvr_kcl"]["subject_level"] = metrics([s[1] for s in subjects], [s[2] for s in subjects], threshold)
    for task in ("ReadText", "SpontaneousDialogue"):
        sub = [r for r in kcl if r["task"] == task]
        report["mdvr_kcl"][task] = metrics([r["label"] for r in sub], [r["prob"] for r in sub], threshold)

    libri_subjects = by_subject(libri)
    probs = [s[2] for s in libri_subjects]
    report["librispeech"] = {
        "n_speakers": len(libri_subjects),
        "false_positive_rate": float(np.mean([p >= threshold for p in probs])),
        "mean_prob": float(np.mean(probs)),
        "median_prob": float(np.median(probs)),
        "max_prob": float(np.max(probs)),
    }

    # Pooled: KCL Parkinson's speakers vs every healthy English speaker from both sets.
    pooled = [(s[1], s[2]) for s in subjects] + [(0, p) for p in probs]
    report["pooled_english"] = metrics([y for y, _ in pooled], [p for _, p in pooled], threshold)

    report["subject_scores"] = sorted(
        [{"subject": s, "label": y, "prob": round(p, 3)} for s, y, p in subjects + libri_subjects],
        key=lambda r: -r["prob"],
    )

    (ARTIFACTS_DIR / "external_report.json").write_text(json.dumps(report, indent=2))
    print("\n" + json.dumps({k: v for k, v in report.items() if k != "subject_scores"}, indent=2))


if __name__ == "__main__":
    main()
