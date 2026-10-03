"""Validate the feature/manifest contract before any fitting or evaluation."""

from dataclasses import dataclass
from typing import Sequence

import numpy as np
import pandas as pd

DEFAULT_FEATURES = (
    "jitter_local", "shimmer_local", "hnr_db", "f0_mean_hz", "f0_std_hz",
    "f1_mean_hz", "f2_mean_hz", "f3_mean_hz", "mean_period_s",
)
METADATA = frozenset({
    "speaker_id", "label", "age", "sex", "task", "file_path", "recording_id",
    "dataset", "diagnosis", "quality_passed",
    "source_speaker_id", "sample_rate_hz", "channels", "sample_width_bits",
    "duration_s",
    "speaker_verified", "signal_quality_passed", "extraction_status",
    "extractor_signature", "start_s", "end_s",
})
MIN_AGE = 50


@dataclass
class Cohort:
    rows: pd.DataFrame
    features: pd.DataFrame
    exclusions: dict[str, int]


def validate_feature_names(names: Sequence[str]) -> tuple[str, ...]:
    if isinstance(names, str):
        raise ValueError("Provide feature names as a list, not a single string.")
    names = tuple(names)
    if not names or len(names) != len(set(names)):
        raise ValueError("Feature names must be nonempty and unique.")
    if any(not isinstance(name, str) or not name.strip() for name in names):
        raise ValueError("Each feature name must be a nonempty string.")
    if METADATA.intersection(names):
        raise ValueError("Manifest metadata cannot be used as voice features.")
    return names


def numeric_features(rows: pd.DataFrame, names: Sequence[str]) -> pd.DataFrame:
    missing = set(names) - set(rows.columns)
    if missing:
        raise ValueError(f"Missing feature columns: {', '.join(sorted(missing))}.")
    try:
        features = rows.loc[:, list(names)].apply(pd.to_numeric, errors="raise").astype(float)
    except (ValueError, TypeError) as exc:
        raise ValueError("Features must be numbers or missing values.") from exc
    if np.isinf(features.to_numpy()).any():
        raise ValueError("Features cannot contain infinity.")
    if features.isna().all(axis=1).any():
        raise ValueError("Each recording must contain at least one measured feature.")
    return features


def prepare_cohort(
    frame: pd.DataFrame, names: Sequence[str], task: str,
) -> Cohort:
    names = validate_feature_names(names)
    if not isinstance(task, str) or not task.strip():
        raise ValueError("Specify the recording task, e.g. sustained_a or reading.")
    if not frame.columns.is_unique:
        raise ValueError("CSV columns must be unique.")
    required = {"speaker_id", "label", "age", "task", *names}
    if required - set(frame.columns):
        raise ValueError(f"Missing columns: {', '.join(sorted(required - set(frame.columns)))}.")
    if frame.empty:
        raise ValueError("Feature dataset is empty.")
    rows = frame.copy()
    for name in ("speaker_id", "task"):
        if rows[name].isna().any():
            raise ValueError(f"{name} is required for every recording.")
        rows[name] = rows[name].astype(str).str.strip()
        if rows[name].eq("").any():
            raise ValueError(f"{name} cannot be blank.")
    try:
        rows["label"] = pd.to_numeric(rows["label"], errors="raise")
        rows["age"] = pd.to_numeric(rows["age"], errors="raise")
    except (ValueError, TypeError) as exc:
        raise ValueError("Labels and ages must be numeric; label 0=control, 1=PD.") from exc
    if not rows["label"].isin([0, 1]).all():
        raise ValueError("Labels must be 0 (control) or 1 (PD).")
    rows["label"] = rows["label"].astype(int)
    if not np.isfinite(rows["age"]).all() or not rows["age"].between(0, 120).all():
        raise ValueError("Every speaker needs a finite age between 0 and 120.")
    if rows.groupby("speaker_id")["label"].nunique().gt(1).any():
        raise ValueError("A speaker cannot have conflicting diagnosis labels.")
    # Check the gate across all tasks/segments, before selecting the cohort.
    if rows.groupby("speaker_id")["age"].agg(lambda ages: ages.ge(MIN_AGE).nunique()).gt(1).any():
        raise ValueError("A speaker's ages cannot straddle the age-50 coverage boundary.")
    matching_task = rows["task"].eq(task)
    eligible_age = rows["age"].ge(MIN_AGE)
    exclusions = {
        "other_task_recordings": int((~matching_task).sum()),
        "under_50_recordings": int((matching_task & ~eligible_age).sum()),
    }
    rows = rows.loc[matching_task & eligible_age].reset_index(drop=True)
    if rows.empty:
        raise ValueError("No recordings match the task and age >= 50 cohort.")
    if rows["label"].nunique() != 2:
        raise ValueError("The eligible cohort must contain both control and PD speakers.")
    if "quality_passed" in rows:
        flags = rows["quality_passed"].astype(str).str.lower()
        if not flags.isin(["true", "1"]).all():
            raise ValueError("Eligible rows failed quality checks or need speaker review. Use only quality_passed=true rows.")
    features = numeric_features(rows, names)
    return Cohort(rows, features, exclusions)


def read_feature_csv(path: str) -> pd.DataFrame:
    # Keep string speaker IDs intact, including leading zeros; never infer features.
    import csv

    with open(path, encoding="utf-8-sig", newline="") as handle:
        header = next(csv.reader(handle), [])
    if len(header) != len(set(header)):
        raise ValueError("CSV contains duplicate column names.")
    return pd.read_csv(path, dtype={"speaker_id": str, "task": str})
