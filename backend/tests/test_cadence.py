"""CADENCE route and optional embedding contracts; no downloaded models in unit tests."""

import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient
import numpy as np

from backend.app import MAX_UPLOAD_BYTES, create_app
from backend.audio import AudioExtractor
from backend.audio.embeddings import FrozenEmbeddings, feature_names, pool_hidden_states, validate_models
from backend.classifier import VoiceClassifier, train
from backend.classifier.__main__ import main
from backend.tests.test_classifier import fixture
from backend.tests.test_audio import wav_bytes


class EmbeddingTests(unittest.TestCase):
    def test_pooling_weights_frames_and_uses_population_std(self):
        # A short tail must not receive equal weight to a full chunk.
        chunks = [np.array([[1, 10], [3, 20], [5, 30]]), np.array([[9, 40]])]
        values = np.concatenate(chunks)
        result = pool_hidden_states(chunks)
        np.testing.assert_allclose(result, np.r_[values.mean(0), values.std(0)])
        np.testing.assert_allclose(pool_hidden_states([np.array([[4, 7]])]), [4, 7, 0, 0])
        with self.assertRaises(ValueError):
            pool_hidden_states([np.array([[np.nan]])])

    def test_chunking_covers_recording_and_discards_sub_100ms_tail(self):
        with patch("backend.audio.embeddings.version", return_value="2.8.0"):
            encoder = FrozenEmbeddings(["whisper"])
        lengths = []

        def hidden(name, signal):
            lengths.append(len(signal))
            return np.ones((2, 384)) * len(signal)

        with patch.object(encoder, "_hidden", side_effect=hidden):
            result = encoder.extract(np.zeros(320000 + 16000 + 10))
        self.assertEqual(lengths, [320000, 16010])
        self.assertEqual(len(result), 768)
        self.assertEqual(set(result), set(feature_names("whisper")))
        lengths.clear()
        with patch.object(encoder, "_hidden", side_effect=hidden):
            encoder.extract(np.zeros(320000 + 10))
        self.assertEqual(lengths, [320000])

    def test_profile_order_signature_and_default_acoustic_schema(self):
        self.assertEqual(validate_models(["wavlm", "whisper"]), ("whisper", "wavlm"))
        for names in (["whisper", "whisper"], ["unknown"], "whisper"):
            with self.assertRaises(ValueError):
                validate_models(names)
        acoustic = AudioExtractor()
        with patch("backend.audio.embeddings.version", return_value="2.8.0"):
            combined = AudioExtractor(embedding_models=["whisper", "hubert", "wavlm"])
        self.assertEqual(len(acoustic.feature_names), 97)
        self.assertEqual(len(combined.feature_names), 3937)
        self.assertNotEqual(acoustic.signature, combined.signature)
        self.assertTrue(combined.provenance["embeddings"]["frozen"])

    def test_quality_and_review_gate_embedding_inference(self):
        with patch("backend.audio.embeddings.version", return_value="2.8.0"):
            extractor = AudioExtractor(embedding_models=["whisper"])
        values = dict.fromkeys(feature_names("whisper"), .25)
        with patch.object(extractor.embeddings, "extract", return_value=values) as embed:
            for raw, reviewed in ((wav_bytes(kind="silence"), True), (wav_bytes(), False)):
                result = extractor.extract(io.BytesIO(raw), speaker_verified=reviewed)
                self.assertFalse(result["quality"]["quality_passed"])
                self.assertIsNone(result["features"]["embedding_whisper_mean_0000"])
            embed.assert_not_called()
            result = extractor.extract(io.BytesIO(wav_bytes()), speaker_verified=True)
            self.assertEqual(result["status"], "ok")
            self.assertEqual(result["features"]["embedding_whisper_mean_0000"], .25)
            self.assertEqual(len(result["features"]), 865)
            signal = embed.call_args.args[0]
            self.assertEqual(signal.ndim, 1)
            self.assertEqual(len(signal), 48000)

    def test_feature_set_cli_artifact_preserves_encoder_profile(self):
        frame = fixture()
        frame["embedding_models"] = "whisper"
        frame["extractor_signature"] = "test-profile"
        frame["embedding_whisper_mean_0000"] = np.arange(len(frame)) / 100
        with tempfile.TemporaryDirectory() as directory:
            csv, output = Path(directory) / "features.ready.csv", Path(directory) / "model.joblib"
            frame.to_csv(csv, index=False)
            (Path(directory) / "features.features.json").write_text(json.dumps({"whisper": ["jitter_local", "embedding_whisper_mean_0000"]}))
            with contextlib.redirect_stdout(io.StringIO()):
                main(["train", "--csv", str(csv), "--dataset", "italian_pvs", "--task", "sustained_a",
                      "--feature-set", "whisper", "--folds", "3", "--output", str(output)])
            model = VoiceClassifier.load(output)
        self.assertEqual(model.metadata["embedding_models"], ["whisper"])
        self.assertEqual(model.metadata["feature_names"], ["jitter_local", "embedding_whisper_mean_0000"])
        frame.loc[0, "embedding_models"] = "hubert"
        with self.assertRaisesRegex(ValueError, "embedding profile"):
            train(frame, task="sustained_a", dataset_name="italian_pvs", n_splits=3)


class CadenceApiTests(unittest.TestCase):
    def test_adapted_frontend_assets_and_health(self):
        with TestClient(create_app()) as client:
            page = client.get("/")
            self.assertIn('data-api-prefix="/api"', page.text)
            self.assertIn('id="age"', page.text)
            self.assertEqual(client.get("/static/cadence/upstream.css").status_code, 200)
            self.assertEqual(client.get("/static/cadence/style.css").status_code, 200)
            self.assertEqual(client.get("/voice-lab").status_code, 200)
            self.assertFalse(client.get("/api/health").json()["model_loaded"])
            self.assertEqual(client.get("/api/config").json()["minimum_age"], 50)

    def test_age_required_and_gate_never_decodes_or_scores(self):
        with TestClient(create_app()) as client, patch("backend.audio.AudioExtractor", side_effect=AssertionError):
            for route in ("/api/screen", "/api/vowel"):
                response = client.post(route, files={"audio": ("x.wav", b"bad audio")},
                                       data={"speaker_verified": "true"})
                self.assertEqual(response.status_code, 422)
                response = client.post(route, files={"audio": ("x.wav", b"bad audio")},
                                       data={"age": "49", "speaker_verified": "true"})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["status"], "outside_model_coverage")
                self.assertIsNone(response.json()["classifier_score"])

    def test_routes_share_extraction_and_force_vowel_task(self):
        app = create_app()
        extractor = Mock()
        extractor.extract.return_value = {"status": "needs_speaker_review", "features": {"f0_mean_hz": 150},
                                           "quality": {"quality_passed": False}, "extractor_signature": "test"}
        app.state.extractor = extractor
        with TestClient(app) as client:
            for route, task in (("/api/screen", "reading"), ("/api/vowel", "sustained_a")):
                response = client.post(route, files={"audio": ("x.wav", b"audio")},
                                       data={"age": "60", "speaker_verified": "false"})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["task"], task)
                self.assertEqual(response.json()["status"], "needs_speaker_review")
                self.assertIsNone(response.json()["classifier_score"])
                self.assertFalse(extractor.extract.call_args.kwargs["speaker_verified"])

    def test_cadence_upload_limits_include_streamed_bodies(self):
        with TestClient(create_app()) as client:
            for route in ("/api/screen", "/api/vowel"):
                response = client.post(route, content=b"", headers={"content-length": str(MAX_UPLOAD_BYTES + 100000)})
                self.assertEqual(response.status_code, 413)
                prefix = b'--test\r\nContent-Disposition: form-data; name="audio"; filename="x.wav"\r\nContent-Type: audio/wav\r\n\r\n'
                response = client.post(route, content=iter([prefix, b"x" * (MAX_UPLOAD_BYTES + 100000), b"\r\n--test--\r\n"]),
                                       headers={"content-type": "multipart/form-data; boundary=test"})
                self.assertEqual(response.status_code, 413)

    def test_legacy_multiple_clips_are_not_silently_scored_as_one(self):
        with TestClient(create_app()) as client, patch("backend.audio.AudioExtractor", side_effect=AssertionError):
            for route in ("/api/screen", "/api/vowel"):
                response = client.post(route, files=[("audio", ("a.wav", b"audio")),
                                                    ("audio", ("b.wav", b"audio"))],
                                       data={"age": "60", "speaker_verified": "true"})
                self.assertEqual(response.status_code, 422)
                self.assertIn("exactly one", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
