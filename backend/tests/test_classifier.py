"""Synthetic fixtures test software behavior only; never imply clinical performance."""

import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd
import joblib
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.classifier import DEFAULT_FEATURES, VoiceClassifier, evaluate_external, train
from backend.classifier.__main__ import main
from backend.classifier.core import fit_pipeline, speaker_weights
from backend.classifier.data import read_feature_csv


def fixture(prefix="italian_pvs", speakers=12) -> pd.DataFrame:
    rng = np.random.default_rng(24)
    rows = []
    for speaker in range(speakers):
        label = speaker % 2
        for recording in range(1 + speaker % 3):
            values = rng.normal(label * 0.7, 1, len(DEFAULT_FEATURES))
            rows.append({
                "speaker_id": f"{prefix}:{speaker:03}", "label": label,
                "age": 55 + speaker, "sex": "F" if speaker % 3 else "M",
                "task": "sustained_a", "file_path": f"{speaker}_{recording}.wav",
                **dict(zip(DEFAULT_FEATURES, values)),
            })
    return pd.DataFrame(rows)


class TrainingTests(unittest.TestCase):
    def test_group_folds_keep_every_speaker_together(self):
        frame = fixture()
        model, report = train(frame, task="sustained_a", dataset_name="italian_pvs", n_splits=3)
        held_out = []
        for fold in report["folds"]:
            self.assertFalse(set(fold["train_speaker_ids"]) & set(fold["test_speaker_ids"]))
            held_out.extend(fold["test_speaker_ids"])
        self.assertEqual(len(held_out), len(set(held_out)))
        self.assertEqual(set(held_out), set(frame["speaker_id"]))
        self.assertEqual(report["metrics"]["speaker_count"], 12)
        self.assertEqual(len(report["speaker_predictions"]), 12)
        self.assertEqual(sum(map(sum, report["metrics"]["confusion_matrix"])), 12)
        self.assertEqual(model.metadata["feature_names"], list(DEFAULT_FEATURES))
        json.dumps(report, allow_nan=False)

    def test_loso_and_random_forest_work_with_single_class_test_folds(self):
        for name in ("logistic_regression", "random_forest"):
            with self.subTest(model=name):
                _, report = train(fixture(speakers=6), task="sustained_a", dataset_name="italian_pvs",
                                  cv="loso", model_name=name)
                self.assertEqual(report["fold_count"], 6)
                self.assertTrue(all(fold["metrics"]["roc_auc"] is None for fold in report["folds"]))
                self.assertIsNotNone(report["metrics"]["roc_auc"])

    def test_preprocessing_sees_training_rows_only(self):
        frame = fixture()
        captured = []
        real_fit = fit_pipeline

        def capture(pipeline, features, rows):
            real_fit(pipeline, features, rows)
            captured.append((set(rows["speaker_id"]), pipeline.named_steps["imputer"].statistics_.copy()))

        with patch("backend.classifier.core.fit_pipeline", side_effect=capture):
            _, report = train(frame, task="sustained_a", dataset_name="italian_pvs", n_splits=3)
        self.assertEqual(len(captured), 4)  # Three isolated folds and the final full-cohort fit.
        for (speakers, medians), fold in zip(captured, report["folds"]):
            self.assertEqual(speakers, set(fold["train_speaker_ids"]))
            expected = frame.loc[frame["speaker_id"].isin(speakers), list(DEFAULT_FEATURES)].median()
            np.testing.assert_allclose(medians, expected.to_numpy())

    def test_weights_balance_speakers_and_classes(self):
        frame = fixture(speakers=5)
        frame["weight"] = speaker_weights(frame)
        totals = frame.groupby("speaker_id")["weight"].sum()
        labels = frame.drop_duplicates("speaker_id").set_index("speaker_id")["label"]
        for label in (0, 1):
            values = totals.loc[labels == label]
            np.testing.assert_allclose(values, np.full(len(values), values.iloc[0]))
        self.assertAlmostEqual(frame.loc[frame.label == 0, "weight"].sum(),
                               frame.loc[frame.label == 1, "weight"].sum())

    def test_age_and_task_selection_and_missing_measurements(self):
        frame = fixture()
        underage = frame.iloc[[0]].copy()
        underage["speaker_id"], underage["age"] = "young:1", 49
        other_task = frame.iloc[[0]].copy()
        other_task["speaker_id"], other_task["task"] = "reading:1", "reading"
        frame.loc[0, DEFAULT_FEATURES[0]] = np.nan
        model, report = train(pd.concat([frame, underage, other_task]), task="sustained_a",
                              dataset_name="italian_pvs", n_splits=3)
        self.assertEqual(report["exclusions"], {"other_task_recordings": 1, "under_50_recordings": 1})
        self.assertNotIn("young:1", model.metadata["training_speaker_ids"])

    def test_empty_feature_in_a_training_fold_retains_schema(self):
        frame = fixture()
        frame[DEFAULT_FEATURES[0]] = np.nan
        frame.loc[0, DEFAULT_FEATURES[0]] = 1.0
        _, report = train(frame, task="sustained_a", dataset_name="italian_pvs", n_splits=3)
        self.assertEqual(report["metrics"]["speaker_count"], 12)

    def test_explicit_open_smile_or_embedding_columns_are_supported(self):
        frame = fixture()
        frame["opensmile_loudness"] = np.arange(len(frame))
        frame["wavlm_000"] = np.linspace(0, 1, len(frame))
        names = [*DEFAULT_FEATURES, "opensmile_loudness", "wavlm_000"]
        model, _ = train(frame, task="sustained_a", dataset_name="italian_pvs", feature_names=names, n_splits=3)
        self.assertEqual(model.metadata["feature_names"], names)

    def test_invalid_training_data_is_rejected(self):
        invalid = []
        for column, value in (("speaker_id", ""), ("age", np.nan), ("age", np.inf),
                              ("label", 2), ("task", ""), (DEFAULT_FEATURES[0], np.inf),
                              (DEFAULT_FEATURES[0], "not-a-number")):
            frame = fixture().astype({column: object})
            frame.loc[0, column] = value
            invalid.append(frame)
        frame = fixture()
        frame.loc[0, list(DEFAULT_FEATURES)] = np.nan
        invalid.append(frame)
        frame = fixture()
        frame[DEFAULT_FEATURES[0]] = np.nan
        invalid.append(frame)
        frame = fixture()
        frame.loc[1, "speaker_id"] = frame.loc[0, "speaker_id"]  # conflicting labels
        invalid.append(frame)
        for index, frame in enumerate(invalid):
            with self.subTest(case=index), self.assertRaises(ValueError):
                train(frame, task="sustained_a", dataset_name="italian_pvs", n_splits=3)

    def test_metadata_cannot_be_a_feature_and_bad_folds_fail(self):
        for kwargs in ({"feature_names": ["age"]}, {"n_splits": 20},
                       {"feature_names": [DEFAULT_FEATURES[0]] * 2}, {"cv": "random"}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                train(fixture(), task="sustained_a", dataset_name="italian_pvs", **kwargs)
        frame = fixture(speakers=3)
        with self.assertRaisesRegex(ValueError, "lack both classes"):
            train(frame, task="sustained_a", dataset_name="italian_pvs", cv="loso")

    def test_csv_preserves_speaker_ids_and_rejects_duplicate_columns(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "features.csv"
            frame = fixture()
            frame["speaker_id"] = "001"
            frame.to_csv(path, index=False)
            self.assertEqual(read_feature_csv(str(path)).speaker_id.iloc[0], "001")
            path.write_text("speaker_id,speaker_id,label\n001,002,0\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate"):
                read_feature_csv(str(path))


class PredictionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.frame = fixture()
        cls.model, _ = train(cls.frame, task="sustained_a", dataset_name="italian_pvs", n_splits=3)
        cls.features = cls.frame.loc[0, list(DEFAULT_FEATURES)].to_dict()

    def test_prediction_and_trusted_artifact_round_trip(self):
        before = self.model.predict(self.features, age=60, task="sustained_a", quality_passed=True)
        self.assertEqual(before["status"], "ok")
        self.assertIn(before["predicted_class"], ("pd_like", "control_like"))
        self.assertTrue(0 <= before["classifier_score"] <= 1)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.joblib"
            self.model.save(path)
            restored = VoiceClassifier.load(path)
            self.assertEqual(before, restored.predict(self.features, age=60, task="sustained_a", quality_passed=True))

    def test_artifact_version_and_feature_mismatches_are_rejected(self):
        for updates in ({"schema_version": 999}, {"sklearn_version": "0.0.0"},
                        {"feature_names": list(reversed(DEFAULT_FEATURES))},
                        {"minimum_age": 0}):
            with self.subTest(updates=updates), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "model.joblib"
                joblib.dump({"pipeline": self.model.pipeline, "metadata": {**self.model.metadata, **updates}}, path)
                with self.assertRaises(ValueError):
                    VoiceClassifier.load(path)

    def test_coverage_and_quality_gates_never_predict(self):
        for age, task, quality, status in (
            (49, "sustained_a", True, "outside_model_coverage"),
            (60, "reading", True, "outside_model_coverage"),
            (60, "sustained_a", False, "insufficient_recording_quality"),
        ):
            with self.subTest(age=age, task=task), patch.object(self.model.pipeline, "predict_proba", side_effect=AssertionError):
                result = self.model.predict({}, age=age, task=task, quality_passed=quality)
                self.assertEqual(result["status"], status)
                self.assertIsNone(result["classifier_score"])
                self.assertIsNone(result["predicted_class"])
        self.assertEqual(self.model.predict(self.features, age=50, task="sustained_a", quality_passed=True)["status"], "ok")

    def test_feature_schema_and_nonfinite_values(self):
        for features in ({}, {**self.features, "age": 60},
                         {**self.features, DEFAULT_FEATURES[0]: np.inf},
                         {**self.features, DEFAULT_FEATURES[0]: np.nan},
                         {**self.features, DEFAULT_FEATURES[0]: "1"},
                         {name: None for name in DEFAULT_FEATURES}):
            with self.subTest(features=features), self.assertRaises(ValueError):
                self.model.predict(features, age=60, task="sustained_a", quality_passed=True)
        result = self.model.predict({**self.features, DEFAULT_FEATURES[0]: None},
                                    age=60, task="sustained_a", quality_passed=True)
        self.assertEqual(result["imputed_features"], [DEFAULT_FEATURES[0]])

    def test_invalid_age_task_and_quality_flag(self):
        for age in (None, True, "60", -1, 121, np.nan, np.inf):
            with self.subTest(age=age), self.assertRaises(ValueError):
                self.model.predict(self.features, age=age, task="sustained_a", quality_passed=True)
        for kwargs in ({"task": ""}, {"task": None}, {"quality_passed": "true"}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                self.model.predict(self.features, **{"age": 60, "task": "sustained_a", "quality_passed": True, **kwargs})

    def test_external_evaluation_is_speaker_level_and_does_not_fit(self):
        with patch.object(self.model.pipeline, "fit", side_effect=AssertionError("Must not refit")):
            report = evaluate_external(self.model, fixture("mdvr_kcl"), dataset_name="mdvr_kcl")
        self.assertEqual(report["metrics"]["speaker_count"], 12)
        self.assertEqual(report["evaluation"], "external_speaker_level")

    def test_external_task_mismatch_overlap_and_same_dataset_are_rejected(self):
        wrong_task = fixture("external")
        wrong_task["task"] = "reading"
        for frame, name in ((wrong_task, "external"), (fixture(), "external"),
                            (fixture("external"), "italian_pvs")):
            with self.subTest(name=name), self.assertRaises(ValueError):
                evaluate_external(self.model, frame, dataset_name=name)

    def test_api_serves_prediction_validates_inputs_and_handles_missing_model(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.joblib"
            self.model.save(path)
            with TestClient(create_app(path)) as client:
                self.assertTrue(client.get("/health").json()["model_loaded"])
                self.assertEqual(client.get("/classifier/schema").json()["feature_names"], list(DEFAULT_FEATURES))
                request = {"features": self.features, "age": 60, "task": "sustained_a", "quality_passed": True}
                result = client.post("/classifier/predict", json=request)
                self.assertEqual(result.status_code, 200)
                self.assertEqual(result.json()["status"], "ok")
                for invalid in ({**request, "age": -1}, {**request, "age": "60"},
                                {**request, "quality_passed": "true"}, {**request, "unexpected": 1},
                                {**request, "features": {}}, {**request, "features": {**self.features, "hnr_db": "20"}}):
                    self.assertEqual(client.post("/classifier/predict", json=invalid).status_code, 422)
                response = client.post("/classifier/predict", json={**request, "age": 49, "features": {}})
                self.assertEqual(response.json()["status"], "outside_model_coverage")
            with TestClient(create_app()) as client:
                self.assertEqual(client.get("/health").json()["status"], "model_unavailable")
                self.assertEqual(client.post("/classifier/predict", json=request).status_code, 503)

    def test_cli_training_external_evaluation_and_prediction(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            csv, artifact = directory / "train.csv", directory / "model.joblib"
            self.frame.to_csv(csv, index=False)
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(["train", "--csv", str(csv), "--task", "sustained_a",
                                       "--dataset", "italian_pvs", "--folds", "3", "--output", str(artifact)]), 0)
            report = json.loads(artifact.with_suffix(".metrics.json").read_text())
            self.assertEqual(report["metrics"]["speaker_count"], 12)
            external_csv, output = directory / "external.csv", directory / "external.json"
            fixture("external").to_csv(external_csv, index=False)
            with contextlib.redirect_stdout(io.StringIO()):
                main(["evaluate", "--model", str(artifact), "--csv", str(external_csv),
                      "--dataset", "external", "--output", str(output)])
            self.assertEqual(json.loads(output.read_text())["evaluation"], "external_speaker_level")
            request = directory / "request.json"
            request.write_text(json.dumps({"features": self.features, "age": 60,
                                           "task": "sustained_a", "quality_passed": True}))
            buffer = io.StringIO()
            with contextlib.redirect_stdout(buffer):
                main(["predict", "--model", str(artifact), "--input", str(request)])
            self.assertEqual(json.loads(buffer.getvalue())["status"], "ok")


if __name__ == "__main__":
    unittest.main()
