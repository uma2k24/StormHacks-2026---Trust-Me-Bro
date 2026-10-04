"""Scores whole corpora with the exported model and reports subject-level accuracy.

    python benchmark.py                  # every corpus found on disk
    python benchmark.py --source mdvr    # English smartphone recordings only

mdvr and libri are honest external tests: the shipped model never saw them.
italian is optimistic, because four of the five ensemble members trained on each
Italian speaker; use artifacts/cv_report.json for the held-out Italian numbers.
"""

import argparse
import json

import librosa
import numpy as np
import onnxruntime as ort
from sklearn.metrics import roc_auc_score

from config import ARTIFACTS_DIR, SAMPLE_RATE
from data import INDEXERS
from predict import screen

OPTIMISTIC = {"italian"}


def subject_scores(session, source: str, limit: int | None) -> dict[str, tuple[int, float]]:
    recordings = INDEXERS[source]()
    subjects = sorted({r.subject for r in recordings})
    if limit:
        subjects = subjects[:limit]
    recordings = [r for r in recordings if r.subject in subjects]

    per_subject: dict[str, list[float]] = {}
    labels: dict[str, int] = {}
    for i, rec in enumerate(recordings, 1):
        audio, _ = librosa.load(rec.path, sr=SAMPLE_RATE, mono=True)
        if audio.size < SAMPLE_RATE:
            continue
        per_subject.setdefault(rec.subject, []).append(float(np.mean(screen(session, audio))))
        labels[rec.subject] = rec.label
        print(f"\r{source}: {i}/{len(recordings)} recordings", end="", flush=True)
    print()
    return {s: (labels[s], float(np.mean(p))) for s, p in per_subject.items()}


def report(source: str, scores: dict[str, tuple[int, float]], threshold: float) -> None:
    y = np.array([label for label, _ in scores.values()])
    p = np.array([prob for _, prob in scores.values()])
    flagged = p >= threshold

    print(f"\n{source}  ({len(y)} subjects, {int(y.sum())} with Parkinson's)")
    if source in OPTIMISTIC:
        print("  note: ensemble members trained on these speakers, so this is optimistic")
    if y.sum() and (y == 0).sum():
        sens = float(flagged[y == 1].mean())
        spec = float((~flagged[y == 0]).mean())
        print(f"  AUC {roc_auc_score(y, p):.3f}")
        print(f"  sensitivity {sens:.2f} ({int(flagged[y == 1].sum())}/{int(y.sum())} PD flagged)")
        print(f"  specificity {spec:.2f} ({int((~flagged[y == 0]).sum())}/{int((y == 0).sum())} controls cleared)")
        print(f"  accuracy    {float((flagged == (y == 1)).mean()):.2f}")
    else:
        print(f"  all controls: {int(flagged.sum())}/{len(y)} false positives")
    print(f"  median probability: PD {np.median(p[y == 1]) if y.sum() else float('nan'):.3f}"
          f"  control {np.median(p[y == 0]) if (y == 0).sum() else float('nan'):.3f}")

    worst = sorted(scores.items(), key=lambda kv: -abs(kv[1][1] - threshold))
    missed = [(s, prob) for s, (label, prob) in worst if (prob >= threshold) != bool(label)]
    if missed:
        print("  misclassified:", ", ".join(f"{s} {prob:.2f}" for s, prob in missed[:12]))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", choices=sorted(INDEXERS), action="append")
    parser.add_argument("--limit", type=int, help="first N subjects per corpus")
    args = parser.parse_args()

    session = ort.InferenceSession(str(ARTIFACTS_DIR / "parkinson_voice_classifier.onnx"))
    threshold = json.loads((ARTIFACTS_DIR / "cv_report.json").read_text())["threshold"]
    print(f"threshold {threshold:.3f}")

    for source in args.source or sorted(INDEXERS):
        try:
            scores = subject_scores(session, source, args.limit)
        except (FileNotFoundError, KeyError, IndexError) as exc:
            print(f"\n{source}: skipped ({exc})")
            continue
        if scores:
            report(source, scores, threshold)


if __name__ == "__main__":
    main()
