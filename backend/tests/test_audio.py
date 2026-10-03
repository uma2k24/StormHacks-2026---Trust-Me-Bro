"""Real extractor integration on synthetic audio, plus upload and report contracts."""

import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx
import numpy as np
import pandas as pd
import soundfile as sf
from fastapi.testclient import TestClient

from backend.app import create_app, MAX_UPLOAD_BYTES
from backend.audio import AudioExtractor, AudioInputError
from backend.audio.batch import extract_manifest
from backend.classifier import DEFAULT_FEATURES, train, evaluate_external
from backend.classifier.__main__ import main
from backend.reports import build_report
from backend.tests.test_classifier import fixture


def wav_bytes(rate=44100, duration=3.0, *, kind="voice", subtype="PCM_24", channels=1):
    times = np.arange(round(rate * duration)) / rate
    signal = .2 * np.sin(2 * np.pi * 150 * times) + .08 * np.sin(2 * np.pi * 300 * times) + .03 * np.sin(2 * np.pi * 450 * times)
    if kind == "silence":
        signal *= 0
    if kind == "clipped":
        signal = np.clip(signal * 20, -1, 1)
    if channels == 2:
        signal = np.column_stack([signal, signal])
    buffer = io.BytesIO()
    sf.write(buffer, signal, rate, format="WAV", subtype=subtype)
    return buffer.getvalue()


class AudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.extractor = AudioExtractor()

    def test_24_bit_audio_extracts_known_pitch_period_and_finite_features(self):
        result = self.extractor.extract(io.BytesIO(wav_bytes()), speaker_verified=True)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["quality"]["source_subtype"], "PCM_24")
        self.assertEqual(len(result["features"]), 97)
        self.assertAlmostEqual(result["features"]["f0_mean_hz"], 150, delta=1)
        self.assertAlmostEqual(result["features"]["mean_period_s"], 1 / 150, delta=0.0001)
        self.assertLess(result["features"]["jitter_local"], .001)
        self.assertLess(result["features"]["shimmer_local"], .001)
        self.assertTrue(result["quality"]["quality_passed"])
        json.dumps(result, allow_nan=False)

    def test_resampling_and_stereo_preserve_pitch(self):
        result = self.extractor.extract(io.BytesIO(wav_bytes(rate=48000, channels=2)), speaker_verified=True)
        self.assertAlmostEqual(result["features"]["f0_mean_hz"], 150, delta=1)
        self.assertEqual(result["quality"]["source_channels"], 2)
        self.assertEqual(result["quality"]["analysis_sample_rate_hz"], 16000)

    def test_quality_failures_have_no_features(self):
        for kind, duration, reason in (("silence", 3, "insufficient_signal_activity"),
                                       ("clipped", 3, "excessive_clipping"), ("voice", .2, "too_short")):
            with self.subTest(kind=kind):
                result = self.extractor.extract(io.BytesIO(wav_bytes(kind=kind, duration=duration)), speaker_verified=True)
                self.assertEqual(result["status"], "insufficient_recording_quality")
                self.assertIn(reason, result["quality"]["failures"])
                self.assertTrue(all(value is None for value in result["features"].values()))

    def test_speaker_review_required_without_inventing_diarization(self):
        result = self.extractor.extract(io.BytesIO(wav_bytes()), speaker_verified=False)
        self.assertEqual(result["status"], "needs_speaker_review")
        self.assertTrue(result["quality"]["signal_quality_passed"])
        self.assertFalse(result["quality"]["quality_passed"])
        self.assertIsNotNone(result["features"]["f0_mean_hz"])

    def test_segment_bounds_and_unsupported_audio(self):
        result = self.extractor.extract(io.BytesIO(wav_bytes(duration=4)), speaker_verified=True, start_s=1, end_s=3)
        self.assertEqual(result["quality"]["duration_s"], 2)
        self.assertEqual(result["quality"]["source_duration_s"], 4)
        for raw, bounds in ((b"not audio", {}), (wav_bytes(rate=8000), {}),
                            (wav_bytes(subtype="ULAW"), {}),
                            (wav_bytes(), {"start_s": -1}), (wav_bytes(), {"end_s": 10}),
                            (wav_bytes(), {"start_s": 2, "end_s": 1})):
            with self.subTest(bounds=bounds), self.assertRaises(AudioInputError):
                self.extractor.extract(io.BytesIO(raw), speaker_verified=True, **bounds)
        oversized = io.BytesIO()
        sf.write(oversized, np.full(48000, 1e30), 16000, format="WAV", subtype="FLOAT")
        oversized.seek(0)
        with self.assertRaisesRegex(AudioInputError, "amplitudes"):
            self.extractor.extract(oversized, speaker_verified=True)

    def test_batch_keeps_failed_rows_missing_ages_and_speaker_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            (directory / "good.wav").write_bytes(wav_bytes())
            (directory / "silent.wav").write_bytes(wav_bytes(kind="silence"))
            manifest = pd.DataFrame({"file_path": ["good.wav", "silent.wav", "missing.wav"],
                                     "speaker_id": ["test:001", "test:001", "test:002"], "label": [0, 0, 1],
                                     "age": [np.nan, np.nan, np.nan], "task": ["reading"] * 3,
                                     "speaker_verified": [True, True, False]})
            frame, report = extract_manifest(manifest, audio_root=directory, extractor=self.extractor)
        self.assertEqual(len(frame), 3)
        self.assertTrue(frame.age.isna().all())
        self.assertEqual(frame.speaker_id.tolist(), manifest.speaker_id.tolist())
        self.assertEqual(report["status_counts"], {"ok": 1, "insufficient_recording_quality": 1, "invalid_audio": 1})
        self.assertEqual(frame.quality_passed.tolist(), [True, False, False])
        self.assertEqual(report["extractor_signature"], self.extractor.signature)
        json.dumps(report, allow_nan=False)

    def test_training_rejects_unreviewed_rows_or_mixed_extractor_configs(self):
        frame = fixture()
        frame["quality_passed"] = True
        frame.loc[0, "quality_passed"] = False
        with self.assertRaisesRegex(ValueError, "quality"):
            train(frame, task="sustained_a", dataset_name="test", n_splits=3)
        frame["quality_passed"] = True
        frame["extractor_signature"] = "first"
        frame.loc[0, "extractor_signature"] = "different"
        with self.assertRaisesRegex(ValueError, "consistent extractor"):
            train(frame, task="sustained_a", dataset_name="test", n_splits=3)

    def test_external_evaluation_rejects_extractor_mismatch(self):
        frame = fixture()
        frame["extractor_signature"] = self.extractor.signature
        model, _ = train(frame, task="sustained_a", dataset_name="test", n_splits=3)
        external = fixture("external")
        external["extractor_signature"] = "different"
        with self.assertRaisesRegex(ValueError, "extractor configuration"):
            evaluate_external(model, external, dataset_name="external")

    def test_cli_writes_feature_csv_quality_report_and_schema(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            (directory / "voice.wav").write_bytes(wav_bytes())
            manifest, output = directory / "manifest.csv", directory / "features.csv"
            pd.DataFrame([{"file_path": "voice.wav", "speaker_id": "test:001", "label": 0,
                           "age": np.nan, "task": "reading"}]).to_csv(manifest, index=False)
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                main(["extract", "--manifest", str(manifest), "--audio-root", str(directory), "--output", str(output)])
            self.assertEqual(len(pd.read_csv(output)), 1)
            self.assertTrue(pd.read_csv(output).age.isna().all())
            self.assertEqual(json.loads(output.with_suffix(".quality.json").read_text())["status_counts"], {"needs_speaker_review": 1})
            self.assertEqual(len(json.loads(output.with_suffix(".features.json").read_text())["combined"]), 97)
            self.assertTrue(pd.read_csv(output.with_suffix(".ready.csv")).empty)


class UploadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = wav_bytes()
        cls.extractor = AudioExtractor()
        frame = fixture()
        frame["extractor_signature"] = cls.extractor.signature
        cls.model, _ = train(frame, task="sustained_a", dataset_name="test", n_splits=3)

    def post(self, client, raw=None, **fields):
        return client.post("/analyze", files={"file": ("voice.wav", self.raw if raw is None else raw, "audio/wav")},
                           data={"age": "60", "task": "sustained_a", "speaker_verified": "true", **fields})

    def test_upload_predicts_with_matching_trained_artifact(self):
        app = create_app()
        app.state.classifier = self.model
        app.state.extractor = self.extractor
        with TestClient(app) as client:
            result = self.post(client)
        self.assertEqual(result.status_code, 200)
        data = result.json()
        self.assertEqual(data["status"], "ok")
        self.assertIsNotNone(data["classifier_score"])
        self.assertEqual(data["report"]["source"], "template")
        self.assertTrue(data["quality"]["quality_passed"])

    def test_upload_without_model_still_returns_quality_and_measurements(self):
        with TestClient(create_app()) as client:
            result = self.post(client).json()
            self.assertEqual(client.get("/").status_code, 200)
            self.assertEqual(client.get("/static/app.js").status_code, 200)
        self.assertEqual(result["status"], "model_unavailable")
        self.assertIsNone(result["classifier_score"])
        self.assertAlmostEqual(result["features"]["f0_mean_hz"], 150, delta=1)

    def test_age_and_task_coverage_skip_extraction(self):
        app = create_app()
        app.state.classifier = self.model
        with TestClient(app) as client, patch("backend.audio.AudioExtractor", side_effect=AssertionError("Must not extract")):
            for fields in ({"age": "49"}, {"task": "reading"}):
                result = self.post(client, raw=b"not audio", **fields).json()
                self.assertEqual(result["status"], "outside_model_coverage")
                self.assertIsNone(result["classifier_score"])

    def test_silence_and_unverified_speaker_do_not_predict(self):
        app = create_app()
        app.state.classifier = self.model
        with TestClient(app) as client, patch.object(self.model.pipeline, "predict_proba", side_effect=AssertionError):
            self.assertEqual(self.post(client, raw=wav_bytes(kind="silence")).json()["status"], "insufficient_recording_quality")
            self.assertEqual(self.post(client, speaker_verified="false").json()["status"], "needs_speaker_review")

    def test_legacy_artifact_is_not_silently_used_for_audio(self):
        app = create_app()
        model, _ = train(fixture(), task="sustained_a", dataset_name="test", n_splits=3)
        app.state.classifier = model
        with TestClient(app) as client:
            result = self.post(client).json()
        self.assertEqual(result["status"], "model_incompatible")
        self.assertIsNone(result["classifier_score"])

    def test_invalid_upload_parameters_and_request_size(self):
        with TestClient(create_app()) as client:
            for raw, fields in ((b"", {}), (b"not wav", {}), (self.raw, {"age": "nan"}),
                                (self.raw, {"age": "-1"}), (self.raw, {"task": "anything"})):
                self.assertEqual(self.post(client, raw=raw, **fields).status_code, 422)
            response = client.post("/analyze", content=b"", headers={"content-length": str(MAX_UPLOAD_BYTES + 100000)})
            self.assertEqual(response.status_code, 413)
            prefix = b'--test\r\nContent-Disposition: form-data; name="file"; filename="voice.wav"\r\nContent-Type: audio/wav\r\n\r\n'
            response = client.post("/analyze", content=iter([prefix, b"x" * (MAX_UPLOAD_BYTES + 100000), b"\r\n--test--\r\n"]),
                                   headers={"content-type": "multipart/form-data; boundary=test"})
            self.assertEqual(response.status_code, 413)


class ReportTests(unittest.TestCase):
    def result(self):
        return {"status": "ok", "task": "reading", "predicted_class": "pd_like",
                "classifier_score": .8, "features": {"f0_mean_hz": 150.0, "hnr_db": 20.0}}

    def test_local_report_and_missing_configuration_fallback(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "", "GEMINI_MODEL": ""}):
            report = build_report(self.result(), use_gemini=True)
        self.assertEqual(report["source"], "template")
        self.assertEqual(report["provider_status"], "not_configured")
        self.assertIn("not a personal probability", report["disclaimer"])

    def test_gemini_only_selects_known_measurements_with_vetted_text(self):
        response = {"candidates": [{"content": {"parts": [{"text": '{"feature_ids":["hnr_db"]}'}]}}]}
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-secret", "GEMINI_MODEL": "test-model"}), \
                patch("backend.reports.httpx.Client") as client:
            client.return_value.__enter__.return_value.post.return_value.json.return_value = response
            report = build_report(self.result(), use_gemini=True)
            request = client.return_value.__enter__.return_value.post.call_args
        self.assertEqual(report["source"], "gemini")
        self.assertEqual([row["feature"] for row in report["observations"]], ["hnr_db"])
        payload = json.dumps(request.kwargs["json"])
        self.assertNotIn('"classifier_score"', payload)
        self.assertNotIn('"age"', payload)
        self.assertEqual(request.kwargs["headers"]["x-goog-api-key"], "test-secret")

    def test_invented_features_free_text_and_provider_failures_fall_back(self):
        for text in ('{"feature_ids":["made_up"]}', '{"feature_ids":["hnr_db"],"diagnosis":"PD"}',
                     '{"feature_ids":["hnr_db","hnr_db"]}', 'not JSON'):
            with self.subTest(text=text), patch.dict(os.environ, {"GEMINI_API_KEY": "test", "GEMINI_MODEL": "test"}), \
                    patch("backend.reports.httpx.Client") as client:
                client.return_value.__enter__.return_value.post.return_value.json.return_value = {
                    "candidates": [{"content": {"parts": [{"text": text}]}}]}
                report = build_report(self.result(), use_gemini=True)
                self.assertEqual(report["source"], "template")
                self.assertEqual(report["provider_status"], "unavailable_or_invalid_response")
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test", "GEMINI_MODEL": "test"}), \
                patch("backend.reports.select_explanations", side_effect=httpx.ConnectError("offline")):
            self.assertEqual(build_report(self.result(), use_gemini=True)["source"], "template")

    def test_no_gemini_call_for_coverage_or_quality_failure(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test", "GEMINI_MODEL": "test"}), \
                patch("backend.reports.select_explanations", side_effect=AssertionError):
            report = build_report({"status": "outside_model_coverage"}, use_gemini=True)
        self.assertEqual(report["provider_status"], "skipped_for_nonprediction")
        self.assertEqual(report["observations"], [])


if __name__ == "__main__":
    unittest.main()
