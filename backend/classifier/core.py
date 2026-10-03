"""Fixed baselines with fold-local preprocessing and speaker-level evaluation."""

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence
import warnings

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.ensemble import RandomForestClassifier
from sklearn.exceptions import ConvergenceWarning, InconsistentVersionWarning
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, roc_auc_score
from sklearn.model_selection import GroupKFold, LeaveOneGroupOut
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.utils.validation import check_is_fitted

from .data import DEFAULT_FEATURES, MIN_AGE, prepare_cohort, numeric_features, validate_feature_names

LIMITATIONS = [
    "Research prototype; this result is not a diagnosis or a clinical screening test.",
    "The classifier score is uncalibrated and is not a personal probability of Parkinson's disease.",
    "Results depend on the recording task, equipment, language, and training population.",
]
MODEL_NAMES = ("logistic_regression", "random_forest")
SCHEMA_VERSION = 1


def build_pipeline(model_name: str, seed: int) -> Pipeline:
    if model_name == "logistic_regression":
        classifier = LogisticRegression(C=1.0, max_iter=2000, random_state=seed)
    elif model_name == "random_forest":
        classifier = RandomForestClassifier(
            n_estimators=200, max_depth=6, min_samples_leaf=2,
            max_features="sqrt", random_state=seed, n_jobs=1,
        )
    else:
        raise ValueError(f"Model must be one of: {', '.join(MODEL_NAMES)}.")
    return Pipeline([
        ("imputer", SimpleImputer(strategy="median", keep_empty_features=True, add_indicator=True)),
        ("scaler", StandardScaler()),
        ("classifier", classifier),
    ])


def speaker_weights(rows: pd.DataFrame) -> np.ndarray:
    """Equal total weight per speaker, then balance classes by speaker count."""
    speakers = rows.drop_duplicates("speaker_id")
    class_counts = speakers["label"].value_counts()
    recordings = rows.groupby("speaker_id")["speaker_id"].transform("size")
    weights = len(speakers) / (2 * rows["label"].map(class_counts) * recordings)
    return weights.to_numpy(dtype=float)


def fit_pipeline(pipeline: Pipeline, features: pd.DataFrame, rows: pd.DataFrame) -> None:
    with warnings.catch_warnings():
        warnings.simplefilter("error", ConvergenceWarning)
        try:
            pipeline.fit(features, rows["label"], classifier__sample_weight=speaker_weights(rows))
        except ConvergenceWarning as exc:
            raise ValueError("Classifier did not converge. Review feature scales and the training cohort.") from exc


def pd_scores(pipeline: Pipeline, features: pd.DataFrame) -> np.ndarray:
    classes = list(pipeline.named_steps["classifier"].classes_)
    return pipeline.predict_proba(features)[:, classes.index(1)]


def summarize_speakers(rows: pd.DataFrame, scores: np.ndarray) -> tuple[dict, list[dict]]:
    predictions = rows.loc[:, ["speaker_id", "label"]].copy()
    predictions["classifier_score"] = scores
    speakers = predictions.groupby("speaker_id", sort=True).agg(
        label=("label", "first"), classifier_score=("classifier_score", "mean"),
        recording_count=("label", "size"),
    ).reset_index()
    labels = speakers["label"].to_numpy()
    scores = speakers["classifier_score"].to_numpy()
    predicted = (scores >= 0.5).astype(int)
    tn, fp, fn, tp = confusion_matrix(labels, predicted, labels=[0, 1]).ravel()
    sensitivity = float(tp / (tp + fn)) if tp + fn else None
    specificity = float(tn / (tn + fp)) if tn + fp else None
    metrics = {
        "speaker_count": len(speakers), "recording_count": len(rows),
        "accuracy": float(accuracy_score(labels, predicted)),
        "balanced_accuracy": (sensitivity + specificity) / 2
            if sensitivity is not None and specificity is not None else None,
        "sensitivity": sensitivity, "specificity": specificity,
        "f1": float(f1_score(labels, predicted, zero_division=0)),
        "roc_auc": float(roc_auc_score(labels, scores)) if len(set(labels)) == 2 else None,
        "confusion_matrix": [[int(tn), int(fp)], [int(fn), int(tp)]],
        "threshold": 0.5,
    }
    speakers["predicted_label"] = predicted
    return metrics, speakers.to_dict(orient="records")


@dataclass
class VoiceClassifier:
    pipeline: Pipeline
    metadata: dict[str, Any]

    def predict(
        self, features: Mapping[str, float | None], *, age: float, task: str,
        quality_passed: bool,
    ) -> dict[str, Any]:
        if isinstance(age, bool) or not isinstance(age, (int, float)) or not np.isfinite(age) or not 0 <= age <= 120:
            raise ValueError("Age must be a finite number between 0 and 120.")
        if not isinstance(quality_passed, bool):
            raise ValueError("quality_passed must be an explicit boolean from recording quality checks.")
        if not isinstance(task, str) or not task.strip():
            raise ValueError("A nonempty recording task is required.")
        if not isinstance(features, Mapping):
            raise ValueError("Features must be a mapping of feature names to measurements.")
        base = {
            "model": self.metadata["model_name"], "age": age, "task": task,
            "quality_passed": quality_passed, "classifier_score": None,
            "predicted_class": None, "limitations": list(LIMITATIONS),
            "coverage": {
                "minimum_age": MIN_AGE, "recording_task": self.metadata["task"],
                "training_age_range": self.metadata["training_age_range"],
            },
        }
        if age < MIN_AGE:
            return {**base, "status": "outside_model_coverage",
                    "message": "Outside the population evaluated by this model (age below 50)."}
        if task != self.metadata["task"]:
            return {**base, "status": "outside_model_coverage",
                    "message": "The recording task does not match this model's training task."}
        if not quality_passed:
            return {**base, "status": "insufficient_recording_quality",
                    "message": "Repeat the recording after resolving the quality checks."}
        names = self.metadata["feature_names"]
        if set(features) != set(names):
            missing, extra = set(names) - set(features), set(features) - set(names)
            raise ValueError(f"Feature schema mismatch: missing={sorted(missing)}, extra={sorted(extra)}.")
        if any(value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)))
               for value in features.values()):
            raise ValueError("Feature values must be numbers or null.")
        values = numeric_features(pd.DataFrame([features]), names)
        # JSON requests must use null for unavailable measurements, never NaN/Infinity.
        if any(value is not None and not np.isfinite(value) for value in features.values()):
            raise ValueError("Use null for missing measurements; numbers must be finite.")
        score = float(pd_scores(self.pipeline, values)[0])
        return {
            **base, "status": "ok", "classifier_score": score,
            "predicted_class": "pd_like" if score >= 0.5 else "control_like",
            "threshold": 0.5, "measurements": dict(features),
            "imputed_features": [name for name in names if features[name] is None],
            "message": "Voice pattern classification from a research model; discuss health concerns with a clinician.",
        }

    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({"pipeline": self.pipeline, "metadata": self.metadata}, path, compress=3)

    @classmethod
    def load(cls, path: str | Path) -> "VoiceClassifier":
        """Load a trusted local artifact only. Joblib/pickle may execute code."""
        with warnings.catch_warnings():
            warnings.simplefilter("error", InconsistentVersionWarning)
            try:
                payload = joblib.load(path)
            except InconsistentVersionWarning as exc:
                raise ValueError("Artifact scikit-learn version differs from this runtime; retrain in this environment.") from exc
        if not isinstance(payload, dict) or set(payload) != {"pipeline", "metadata"}:
            raise ValueError("Invalid classifier artifact.")
        metadata = payload["metadata"]
        if not isinstance(metadata, dict) or metadata.get("schema_version") != SCHEMA_VERSION:
            raise ValueError("Unsupported classifier artifact schema.")
        if metadata.get("sklearn_version") != sklearn.__version__:
            raise ValueError("Artifact scikit-learn version differs from this runtime; retrain in this environment.")
        required = {
            "model_name", "task", "feature_names", "training_speaker_ids", "dataset_name",
            "training_age_range", "minimum_age", "threshold",
        }
        if not required.issubset(metadata) or not isinstance(payload["pipeline"], Pipeline):
            raise ValueError("Classifier artifact is incomplete.")
        if metadata["model_name"] not in MODEL_NAMES or metadata["minimum_age"] != MIN_AGE or metadata["threshold"] != 0.5:
            raise ValueError("Classifier artifact has unsupported model settings.")
        names = validate_feature_names(metadata["feature_names"])
        if "embedding_models" in metadata:
            from backend.audio.embeddings import validate_models

            validate_models(metadata["embedding_models"])
        pipeline = payload["pipeline"]
        if set(pipeline.named_steps) != {"imputer", "scaler", "classifier"}:
            raise ValueError("Classifier artifact has an unexpected pipeline.")
        for step in pipeline.named_steps.values():
            check_is_fitted(step)
        if list(pipeline.feature_names_in_) != list(names):
            raise ValueError("Classifier artifact feature metadata does not match its fitted pipeline.")
        if list(pipeline.named_steps["classifier"].classes_) != [0, 1]:
            raise ValueError("Classifier artifact must have control and PD classes.")
        return cls(payload["pipeline"], metadata)


def train(
    frame: pd.DataFrame, *, task: str, dataset_name: str,
    model_name: str = "logistic_regression", feature_names: Sequence[str] = DEFAULT_FEATURES,
    cv: str = "groupkfold", n_splits: int = 5, seed: int = 42,
) -> tuple[VoiceClassifier, dict[str, Any]]:
    """Evaluate a fixed baseline, then refit it on all eligible training speakers."""
    if not isinstance(dataset_name, str) or not dataset_name.strip():
        raise ValueError("Provide a training dataset name for provenance.")
    dataset_name = dataset_name.strip()
    task = task.strip() if isinstance(task, str) else task
    feature_names = validate_feature_names(feature_names)
    cohort = prepare_cohort(frame, feature_names, task)
    rows, features = cohort.rows, cohort.features
    extractor_signature = None
    embedding_models = ()
    if "embedding_models" in rows:
        from backend.audio.embeddings import validate_models

        profiles = rows["embedding_models"].fillna("").unique()
        if len(profiles) != 1:
            raise ValueError("Training recordings must use one embedding profile.")
        embedding_models = validate_models(profiles[0].split(",") if profiles[0] else ())
    selected_embeddings = {name.split("_")[1] for name in feature_names if name.startswith("embedding_")}
    if selected_embeddings - set(embedding_models):
        raise ValueError("Selected embedding features require their extraction profile in embedding_models.")
    if "extractor_signature" in rows:
        signatures = rows["extractor_signature"].dropna().unique()
        if rows["extractor_signature"].isna().any() or len(signatures) != 1:
            raise ValueError("Training recordings must use one consistent extractor configuration.")
        extractor_signature = str(signatures[0])
    if features.isna().all(axis=0).any():
        raise ValueError("Every selected feature needs a measurement in the training cohort.")
    groups = rows["speaker_id"]
    if cv == "groupkfold":
        if isinstance(n_splits, bool) or not isinstance(n_splits, int) or not 2 <= n_splits <= groups.nunique():
            raise ValueError("GroupKFold splits must be between 2 and the eligible speaker count.")
        splitter = GroupKFold(n_splits=n_splits)
    elif cv == "loso":
        splitter = LeaveOneGroupOut()
    else:
        raise ValueError("CV must be groupkfold or loso.")
    splits = list(splitter.split(features, rows["label"], groups))
    # Fail before fitting if any fold lacks a class; never fall back to random row splits.
    for fold, (train_idx, _) in enumerate(splits, start=1):
        if rows.iloc[train_idx]["label"].nunique() != 2:
            raise ValueError(f"Fold {fold} training speakers lack both classes. Change folds or add speakers.")
    out_of_fold = np.full(len(rows), np.nan)
    fold_reports = []
    for fold, (train_idx, test_idx) in enumerate(splits, start=1):
        pipeline = build_pipeline(model_name, seed)
        training, testing = rows.iloc[train_idx], rows.iloc[test_idx]
        fit_pipeline(pipeline, features.iloc[train_idx], training)
        scores = pd_scores(pipeline, features.iloc[test_idx])
        out_of_fold[test_idx] = scores
        metrics, _ = summarize_speakers(testing, scores)
        fold_reports.append({
            "fold": fold, "train_speaker_ids": sorted(training["speaker_id"].unique().tolist()),
            "test_speaker_ids": sorted(testing["speaker_id"].unique().tolist()),
            "metrics": metrics,
        })
    metrics, predictions = summarize_speakers(rows, out_of_fold)
    pipeline = build_pipeline(model_name, seed)
    fit_pipeline(pipeline, features, rows)
    metadata = {
        "schema_version": SCHEMA_VERSION, "model_name": model_name,
        "dataset_name": dataset_name, "task": task, "minimum_age": MIN_AGE,
        "feature_names": list(feature_names), "seed": seed,
        "extractor_signature": extractor_signature,
        "embedding_models": list(embedding_models),
        "threshold": 0.5, "sklearn_version": sklearn.__version__,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "training_speaker_ids": sorted(groups.unique().tolist()),
        "training_age_range": [float(rows["age"].min()), float(rows["age"].max())],
    }
    report = {
        "metadata": metadata, "evaluation": "out_of_fold_speaker_level",
        "cv": cv, "fold_count": len(splits), "exclusions": cohort.exclusions,
        "aggregation": "Mean recording score per speaker; fixed threshold 0.5.",
        "training_weights": "Equal total speaker weight, balanced by speaker class counts.",
        "metrics": metrics, "folds": fold_reports, "speaker_predictions": predictions,
        "limitations": list(LIMITATIONS) + [
            "Baseline hyperparameters are fixed; selecting a winner on these metrics requires independent testing.",
            "No external validation is implied by this cross-validation report.",
        ],
    }
    return VoiceClassifier(pipeline, metadata), report


def evaluate_external(
    model: VoiceClassifier, frame: pd.DataFrame, *, dataset_name: str,
) -> dict[str, Any]:
    """Evaluate once on task-matched unseen speakers without refitting anything."""
    if not isinstance(dataset_name, str) or not dataset_name.strip() or dataset_name.strip() == model.metadata["dataset_name"]:
        raise ValueError("External evaluation requires a distinct dataset name.")
    dataset_name = dataset_name.strip()
    cohort = prepare_cohort(frame, model.metadata["feature_names"], model.metadata["task"])
    signature = model.metadata.get("extractor_signature")
    if signature is not None and ("extractor_signature" not in cohort.rows or
                                 not cohort.rows["extractor_signature"].eq(signature).all()):
        raise ValueError("External features do not match the model's extractor configuration.")
    # Check all supplied speakers, even those excluded by task or age.
    speaker_ids = set(frame["speaker_id"].astype(str).str.strip())
    if speaker_ids.intersection(model.metadata["training_speaker_ids"]):
        raise ValueError("External dataset includes training speaker IDs. Use globally unique IDs and unseen speakers.")
    scores = pd_scores(model.pipeline, cohort.features)
    metrics, predictions = summarize_speakers(cohort.rows, scores)
    return {
        "evaluation": "external_speaker_level", "dataset_name": dataset_name,
        "training_dataset_name": model.metadata["dataset_name"],
        "task": model.metadata["task"], "model_name": model.metadata["model_name"],
        "exclusions": cohort.exclusions, "metrics": metrics,
        "speaker_predictions": predictions, "limitations": list(LIMITATIONS),
    }
