"""Test raw-dataset discovery, speaker identity, and honest missing metadata."""

import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import wave

import numpy as np
import pandas as pd

from backend.classifier.__main__ import main
from backend.classifier.data import DEFAULT_FEATURES, prepare_cohort
from backend.classifier.mdvr import prepare_mdvr


def recording(root: Path, task="ReadText", diagnosis="HC", filename="ID00_hc_0_0_0.wav") -> Path:
    path = root / task / diagnosis / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(3)
        audio.setframerate(44100)
        audio.writeframes(b"\x00" * 3 * 4410)
    return path


def dataset(root: Path) -> None:
    recording(root)
    recording(root, "SpontaneousDialogue")
    recording(root, diagnosis="PD", filename="ID02_pd_2_0_0.wav")
    recording(root, diagnosis="HC", filename="ID22_hc_0_0_0.wav")
    recording(root, "SpontaneousDialogue", filename="ID22hc_0_0_0.wav")


class MdvrTests(unittest.TestCase):
    def test_discovery_preserves_person_ids_tasks_and_filename_anomaly(self):
        with tempfile.TemporaryDirectory() as directory:
            dataset(Path(directory))
            manifest, speakers, audit = prepare_mdvr(directory)
        self.assertEqual(len(manifest), 5)
        self.assertEqual(len(speakers), 3)
        self.assertEqual(set(manifest["task"]), {"reading", "spontaneous"})
        self.assertEqual(manifest.loc[manifest.source_speaker_id == "ID22", "speaker_id"].nunique(), 1)
        self.assertEqual(audit["speakers_by_label"], {"HC": 2, "PD": 1})
        self.assertEqual(audit["missing_tasks"], {"mdvr_kcl:ID02": ["spontaneous"]})
        self.assertEqual(audit["audio_formats"], [{"sample_rate_hz": 44100, "channels": 1, "sample_width_bits": 24}])
        self.assertEqual(len(audit["filename_separator_anomalies"]), 1)
        self.assertTrue(audit["audio_headers_readable"])
        self.assertFalse(audit["quality_checks_completed"])
        self.assertFalse(audit["features_extracted"])
        json.dumps(audit, allow_nan=False)

    def test_unknown_ages_stay_missing_and_cannot_enter_training(self):
        with tempfile.TemporaryDirectory() as directory:
            dataset(Path(directory))
            manifest, speakers, audit = prepare_mdvr(directory)
        self.assertTrue(manifest.age.isna().all())
        self.assertTrue(speakers.age.isna().all())
        self.assertEqual(len(audit["missing_age_speaker_ids"]), 3)
        for feature in DEFAULT_FEATURES:
            manifest[feature] = 1.0
        with self.assertRaisesRegex(ValueError, "finite age"):
            prepare_cohort(manifest, DEFAULT_FEATURES, "reading")

    def test_verified_demographics_propagate_to_every_task(self):
        metadata = pd.DataFrame({"speaker_id": ["ID00", "mdvr_kcl:ID02", "ID22"],
                                 "age": [60, 49, 68], "sex": ["F", "M", "F"]})
        with tempfile.TemporaryDirectory() as directory:
            dataset(Path(directory))
            manifest, _, audit = prepare_mdvr(directory, metadata)
        self.assertTrue(manifest.loc[manifest.source_speaker_id == "ID00", "age"].eq(60).all())
        self.assertTrue(manifest.loc[manifest.source_speaker_id == "ID00", "sex"].eq("F").all())
        self.assertTrue(audit["age_metadata_complete"])
        self.assertEqual(audit["known_age_under_50_speaker_count"], 1)

    def test_partial_metadata_does_not_invent_missing_ages(self):
        with tempfile.TemporaryDirectory() as directory:
            dataset(Path(directory))
            manifest, _, audit = prepare_mdvr(directory, pd.DataFrame({"speaker_id": ["ID00"], "age": [60]}))
        self.assertEqual(set(audit["missing_age_speaker_ids"]), {"mdvr_kcl:ID02", "mdvr_kcl:ID22"})
        self.assertTrue(manifest.loc[manifest.source_speaker_id == "ID22", "age"].isna().all())
        self.assertTrue(manifest.sex.eq("").all())

    def test_bad_demographics_are_rejected(self):
        bad_metadata = [
            pd.DataFrame({"speaker_id": ["ID00", "mdvr_kcl:ID00"], "age": [60, 60]}),
            pd.DataFrame({"speaker_id": ["ID99"], "age": [60]}),
            pd.DataFrame({"speaker_id": ["ID00"], "age": [np.inf]}),
            pd.DataFrame({"speaker_id": ["ID00"], "age": [-1]}),
            pd.DataFrame({"speaker_id": ["ID00"], "age": [60], "label": [1]}),
        ]
        with tempfile.TemporaryDirectory() as directory:
            dataset(Path(directory))
            for metadata in bad_metadata:
                with self.subTest(metadata=metadata.to_dict()), self.assertRaises(ValueError):
                    prepare_mdvr(directory, metadata)

    def test_folder_and_filename_labels_must_agree(self):
        with tempfile.TemporaryDirectory() as directory:
            recording(Path(directory), diagnosis="HC", filename="ID02_pd_2_0_0.wav")
            with self.assertRaisesRegex(ValueError, "disagrees"):
                prepare_mdvr(directory)

    def test_conflicting_person_labels_across_tasks_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            recording(Path(directory))
            recording(Path(directory), "SpontaneousDialogue", "PD", "ID00_pd_2_0_0.wav")
            with self.assertRaisesRegex(ValueError, "conflicting"):
                prepare_mdvr(directory)

    def test_unreadable_or_unexpected_files_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(ValueError, "No WAV"):
                prepare_mdvr(root)
            path = recording(root)
            path.write_bytes(b"not a wav")
            with self.assertRaisesRegex(ValueError, "header"):
                prepare_mdvr(root)

    def test_cli_preserves_filled_demographics_template(self):
        with tempfile.TemporaryDirectory() as directory:
            directory = Path(directory)
            root = directory / "raw"
            dataset(root)
            output = directory / "manifest.csv"
            command = ["prepare-mdvr", "--root", str(root), "--output", str(output)]
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(main(command), 0)
            template = output.with_suffix(".speakers.csv")
            speakers = pd.read_csv(template)
            speakers["age"] = [60, 65, 70]
            speakers.to_csv(template, index=False)
            before = template.read_bytes()
            with contextlib.redirect_stdout(io.StringIO()):
                main([*command, "--metadata", str(template)])
            self.assertEqual(template.read_bytes(), before)
            self.assertTrue(pd.read_csv(output).age.notna().all())
            self.assertTrue(json.loads(output.with_suffix(".audit.json").read_text())["age_metadata_complete"])


if __name__ == "__main__":
    unittest.main()
