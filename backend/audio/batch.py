"""Manifest-to-features batch extraction, preserving unknown ages and failed rows."""

from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

from backend.classifier.data import DEFAULT_FEATURES
from .extractor import AudioExtractor, AudioInputError


def parse_review(value) -> bool:
    if pd.isna(value) or value == "":
        return False
    if isinstance(value, (bool, np.bool_)):
        return bool(value)
    if str(value).strip().lower() in {"true", "1"}:
        return True
    if str(value).strip().lower() in {"false", "0"}:
        return False
    raise ValueError("speaker_verified must be true/false or 1/0; leave blank until reviewed.")


def extract_manifest(
    manifest: pd.DataFrame, *, audio_root: str | Path = ".",
    extractor: AudioExtractor | None = None, progress: Callable[[int, int, str], None] | None = None,
) -> tuple[pd.DataFrame, dict]:
    required = {"file_path", "speaker_id", "label", "age", "task"}
    if not manifest.columns.is_unique or required - set(manifest.columns) or manifest.empty:
        raise ValueError("A nonempty manifest needs unique file_path, speaker_id, label, age, and task columns.")
    manifest = manifest.copy()
    extractor = extractor or AudioExtractor()
    if set(manifest.columns).intersection(extractor.feature_names):
        raise ValueError("The input must be a raw manifest, not an existing feature CSV.")
    for name in ("file_path", "speaker_id", "task"):
        if manifest[name].isna().any() or manifest[name].astype(str).str.strip().eq("").any():
            raise ValueError(f"Every recording needs a nonempty {name}.")
        manifest[name] = manifest[name].astype(str).str.strip()
    try:
        manifest["label"] = pd.to_numeric(manifest["label"], errors="raise")
        manifest["age"] = pd.to_numeric(manifest["age"], errors="raise")
    except (TypeError, ValueError) as exc:
        raise ValueError("Labels must be 0=control/1=PD; ages must be numeric or blank.") from exc
    if not manifest["label"].isin([0, 1]).all():
        raise ValueError("Labels must be 0=control or 1=PD.")
    known_ages = manifest["age"].dropna()
    if not np.isfinite(known_ages).all() or not known_ages.between(0, 120).all():
        raise ValueError("Known ages must be finite and between 0 and 120.")
    if manifest.groupby("speaker_id")["label"].nunique().gt(1).any():
        raise ValueError("A speaker cannot have conflicting labels in the extraction manifest.")
    rows, recordings = [], []
    root = Path(audio_root).resolve()
    # Validate all review flags before starting expensive extraction.
    reviews = [parse_review(value) for value in manifest.get("speaker_verified", pd.Series(False, index=manifest.index))]
    for count, ((_, row), verified) in enumerate(zip(manifest.iterrows(), reviews), start=1):
        source = Path(str(row["file_path"]))
        path = source if source.is_absolute() else root / source
        start = row.get("start_s", 0.0)
        stop = row.get("end_s", None)
        start = 0.0 if pd.isna(start) else float(start)
        stop = None if pd.isna(stop) else float(stop)
        try:
            result = extractor.extract(path, speaker_verified=verified, start_s=start, end_s=stop)
            quality = result["quality"]
            record = {
                "file_path": str(row["file_path"]), "speaker_id": str(row["speaker_id"]),
                "task": str(row["task"]), "status": result["status"], "quality": quality,
            }
            features = result["features"]
        except (AudioInputError, OSError) as exc:
            quality = {"quality_passed": False, "signal_quality_passed": False,
                       "speaker_verified": verified, "failures": ["invalid_audio"]}
            result = {"status": "invalid_audio"}
            features = dict.fromkeys(extractor.feature_names)
            record = {"file_path": str(row["file_path"]), "speaker_id": str(row["speaker_id"]),
                      "task": str(row["task"]), "status": "invalid_audio", "quality": quality,
                      "error": str(exc)}
        output = row.to_dict()
        output.update(features)
        output.update({
            "speaker_verified": verified, "signal_quality_passed": quality["signal_quality_passed"],
            "quality_passed": quality["quality_passed"], "extraction_status": result["status"],
            "extractor_signature": extractor.signature, "start_s": start,
            "end_s": quality.get("end_s", stop),
        })
        rows.append(output)
        recordings.append(record)
        if progress:
            progress(count, len(manifest), record["status"])
    frame = pd.DataFrame(rows)
    report = {
        "created_at": datetime.now(timezone.utc).isoformat(), "recording_count": len(frame),
        "speaker_count": int(frame["speaker_id"].nunique()),
        "status_counts": dict(Counter(record["status"] for record in recordings)),
        "quality_passed_count": int(frame["quality_passed"].sum()),
        "signal_quality_passed_count": int(frame["signal_quality_passed"].sum()),
        "rows_missing_age": int(frame["age"].isna().sum()),
        "extractor_signature": extractor.signature, "extractor": extractor.provenance,
        "feature_sets": {"acoustic": list(DEFAULT_FEATURES), "combined": extractor.feature_names},
        "recordings": recordings,
        "notes": [
            "Missing ages are preserved; this output does not establish a 50+ cohort.",
            "Signal thresholds are engineering checks, not clinical thresholds.",
            "speaker_verified is a human review flag, not automatic diarization.",
            "Training and evaluation reject rows whose quality_passed flag is false.",
        ],
    }
    return frame, report
