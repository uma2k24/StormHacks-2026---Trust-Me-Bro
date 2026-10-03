"""Import the MDVR-KCL directory layout without inferring demographics or features."""

from pathlib import Path
import re
import wave

import numpy as np
import pandas as pd

TASKS = {"ReadText": "reading", "SpontaneousDialogue": "spontaneous"}
LABELS = {"HC": 0, "PD": 1}
FILENAME = re.compile(r"^(ID\d{2})_?(hc|pd)_\d+_\d+_\d+\.wav$", re.IGNORECASE)
DATASET = "mdvr_kcl"


def prepare_mdvr(
    root: str | Path, metadata: pd.DataFrame | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    """Return recording manifest, demographic template, and an audio-header audit.

    Missing ages remain missing. Reading and spontaneous speech from the same
    person share a speaker ID. The trailing filename scores are never features.
    """
    root = Path(root).resolve()
    if not root.is_dir():
        raise ValueError(f"Dataset root is not a directory: {root}.")
    paths = sorted(path for path in root.rglob("*") if path.is_file() and path.suffix.lower() == ".wav")
    if not paths:
        raise ValueError("No WAV recordings were found under the dataset root.")
    records, anomalies = [], []
    for path in paths:
        relative = path.relative_to(root)
        if len(relative.parts) != 3 or relative.parts[0] not in TASKS or relative.parts[1] not in LABELS:
            raise ValueError(f"Expected <ReadText|SpontaneousDialogue>/<HC|PD>/<file>.wav: {relative}.")
        match = FILENAME.fullmatch(path.name)
        if match is None:
            raise ValueError(f"Unrecognized MDVR-KCL filename: {relative}.")
        source_id, diagnosis = match.groups()
        source_id, diagnosis = source_id.upper(), diagnosis.upper()
        if diagnosis != relative.parts[1]:
            raise ValueError(f"Filename label disagrees with the diagnosis directory: {relative}.")
        if not path.name.upper().startswith(source_id + "_"):
            anomalies.append(relative.as_posix())
        try:
            with wave.open(str(path), "rb") as audio:
                frames, rate = audio.getnframes(), audio.getframerate()
                if frames <= 0 or rate <= 0:
                    raise ValueError(f"Empty or invalid audio: {relative}.")
                channels, bits = audio.getnchannels(), audio.getsampwidth() * 8
                duration = frames / rate
        except (wave.Error, EOFError) as exc:
            raise ValueError(f"Cannot read the WAV header for {relative}: {exc}.") from exc
        try:
            file_path = path.relative_to(Path.cwd().resolve()).as_posix()
        except ValueError:
            file_path = path.as_posix()
        task = TASKS[relative.parts[0]]
        records.append({
            "file_path": file_path, "speaker_id": f"{DATASET}:{source_id}",
            "source_speaker_id": source_id, "label": LABELS[diagnosis],
            "age": np.nan, "sex": "", "task": task,
            "recording_id": f"{DATASET}:{source_id}:{task}", "dataset": DATASET,
            "speaker_verified": False, "start_s": 0.0, "end_s": duration,
            "sample_rate_hz": rate, "channels": channels,
            "sample_width_bits": bits, "duration_s": duration,
        })
    manifest = pd.DataFrame(records)
    if manifest.duplicated(["speaker_id", "task"]).any():
        raise ValueError("A speaker has multiple recordings for one task; verify the imported release.")
    if manifest.groupby("speaker_id")["label"].nunique().gt(1).any():
        raise ValueError("A speaker has conflicting HC/PD labels across tasks.")
    if metadata is not None:
        manifest = merge_demographics(manifest, metadata)
    speakers = manifest.drop_duplicates("speaker_id").loc[
        :, ["speaker_id", "source_speaker_id", "label", "age", "sex"]
    ].sort_values("speaker_id").reset_index(drop=True)
    missing_ages = speakers.loc[speakers["age"].isna(), "speaker_id"].tolist()
    missing_tasks = {
        speaker: sorted(set(TASKS.values()) - set(rows["task"]))
        for speaker, rows in manifest.groupby("speaker_id") if rows["task"].nunique() < len(TASKS)
    }
    by_task = {}
    for task, rows in manifest.groupby("task"):
        by_task[task] = {"recordings": len(rows), "HC": int(rows["label"].eq(0).sum()),
                         "PD": int(rows["label"].eq(1).sum())}
    audit = {
        "dataset": DATASET, "source_url": "https://zenodo.org/records/2867216",
        "doi": "10.5281/zenodo.2867216", "intended_role": "external_evaluation",
        "recording_count": len(manifest), "speaker_count": len(speakers),
        "speakers_by_label": {"HC": int(speakers["label"].eq(0).sum()),
                              "PD": int(speakers["label"].eq(1).sum())},
        "tasks": by_task, "missing_tasks": missing_tasks,
        "audio_formats": manifest.loc[:, ["sample_rate_hz", "channels", "sample_width_bits"]]
            .drop_duplicates().to_dict(orient="records"),
        "duration_range_s": [float(manifest["duration_s"].min()), float(manifest["duration_s"].max())],
        "duration_total_s": float(manifest["duration_s"].sum()),
        "missing_age_speaker_ids": missing_ages,
        "missing_sex_speaker_count": int(speakers["sex"].eq("").sum()),
        "age_metadata_complete": not missing_ages,
        "known_age_under_50_speaker_count": int(speakers["age"].lt(50).sum()),
        "filename_separator_anomalies": anomalies,
        "audio_headers_readable": True, "quality_checks_completed": False,
        "features_extracted": False,
        "notes": [
            "Header inspection does not assess silence, clipping, speech content, or speaker isolation.",
            "Missing ages must come from source metadata; they are never inferred from audio or filenames.",
            "Reading and spontaneous recordings are not sustained vowels; use a task-matched model.",
            "Keep this dataset out of model selection if it remains the independent external test.",
        ],
    }
    return manifest, speakers, audit


def merge_demographics(manifest: pd.DataFrame, metadata: pd.DataFrame) -> pd.DataFrame:
    """Join verified, one-row-per-person ages/sex by namespaced or source IDs."""
    if not metadata.columns.is_unique or not {"speaker_id", "age"}.issubset(metadata.columns):
        raise ValueError("Speaker metadata needs unique columns including speaker_id and age.")
    demographics = metadata.copy()
    if demographics["speaker_id"].isna().any():
        raise ValueError("Speaker metadata cannot contain missing speaker IDs.")
    ids = demographics["speaker_id"].astype(str).str.strip()
    ids = ids.map(lambda value: value if value.startswith(DATASET + ":") else DATASET + ":" + value.upper())
    demographics["speaker_id"] = ids
    if not ids.str.fullmatch(DATASET + r":ID\d{2}").all() or ids.duplicated().any():
        raise ValueError("Metadata speaker IDs must be unique IDNN or mdvr_kcl:IDNN values.")
    if set(ids) - set(manifest["speaker_id"]):
        raise ValueError("Speaker metadata includes IDs absent from this dataset.")
    try:
        demographics["age"] = pd.to_numeric(demographics["age"].replace("", np.nan), errors="raise").astype(float)
    except (ValueError, TypeError) as exc:
        raise ValueError("Metadata ages must be numeric or blank when unknown.") from exc
    known = demographics["age"].dropna()
    if not np.isfinite(known).all() or not known.between(0, 120).all():
        raise ValueError("Known ages must be finite and between 0 and 120.")
    if "label" in demographics:
        expected = manifest.drop_duplicates("speaker_id").set_index("speaker_id")["label"]
        try:
            labels = pd.to_numeric(demographics["label"], errors="raise")
        except (ValueError, TypeError) as exc:
            raise ValueError("Metadata labels must be 0=HC or 1=PD.") from exc
        if not np.array_equal(labels.to_numpy(), ids.map(expected).to_numpy()):
            raise ValueError("Metadata labels disagree with the recording labels.")
    demographics["sex"] = demographics.get("sex", pd.Series("", index=demographics.index)).fillna("").astype(str).str.strip()
    return manifest.drop(columns=["age", "sex"]).merge(
        demographics.loc[:, ["speaker_id", "age", "sex"]], on="speaker_id", how="left", validate="many_to_one",
    ).assign(sex=lambda rows: rows["sex"].fillna(""))
