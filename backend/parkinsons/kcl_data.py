"""Indexes MDVR-KCL (King's College London) and caches it at 16 kHz.

37 speakers: 21 healthy controls, 16 with Parkinson's. Each speaker has a read-text
recording and (except ID18) a spontaneous-dialogue recording, all 44.1 kHz mono.
"""

import json
import re
from dataclasses import dataclass

import librosa
import numpy as np
import soundfile as sf

from config import (
    CACHE_DIR,
    KCL_DIR,
    SAMPLE_RATE,
    VAD_DB_BELOW_MAX,
    VAD_FRAME,
    VAD_HOP,
    VAD_MIN_VOICED_FRACTION,
)

CACHE = CACHE_DIR / "kcl"
VAD_REFERENCE_PERCENTILE = 95.0
MIN_WINDOWS = 3


def voiced_mask(audio: np.ndarray) -> np.ndarray:
    """Per-frame voiced flags, referenced to a high percentile rather than the single
    loudest frame, so one cough or door slam cannot mute the whole recording."""
    if len(audio) < VAD_FRAME:
        return np.zeros(0, dtype=bool)
    frames = np.lib.stride_tricks.sliding_window_view(audio, VAD_FRAME)[::VAD_HOP]
    db = 10.0 * np.log10(np.mean(frames.astype(np.float64) ** 2, axis=1) + 1e-10)
    reference = np.percentile(db, VAD_REFERENCE_PERCENTILE)
    return db > (reference - VAD_DB_BELOW_MAX)


def window_starts(audio: np.ndarray, window: int, hop: int) -> np.ndarray:
    """Window starts that are mostly speech; falls back to the most speech-filled few."""
    if len(audio) <= window:
        return np.array([0])
    mask = voiced_mask(audio).astype(np.float32)
    frames_per_window = (window - VAD_FRAME) // VAD_HOP + 1
    starts = np.arange(0, len(audio) - window + 1, hop)
    csum = np.concatenate([[0.0], np.cumsum(mask)])
    first = starts // VAD_HOP
    last = np.minimum(first + frames_per_window, len(mask))
    frac = (csum[last] - csum[first]) / frames_per_window
    keep = starts[frac >= VAD_MIN_VOICED_FRACTION]
    if len(keep) >= MIN_WINDOWS:
        return keep
    order = np.argsort(-frac)[: min(MIN_WINDOWS, len(starts))]
    return np.sort(starts[order])


@dataclass
class KclRecording:
    path: str
    subject: str
    label: int
    task: str
    severity: str
    offset: int = 0
    length: int = 0


def index_kcl() -> list[KclRecording]:
    recordings = []
    for task in ("ReadText", "SpontaneousDialogue"):
        for group, label in (("HC", 0), ("PD", 1)):
            for wav in sorted((KCL_DIR / task / group).glob("*.wav")):
                # Filenames look like ID27_pd_4_1_1.wav; the trailing digits encode severity.
                subject = re.search(r"ID(\d+)", wav.name).group(1)
                digits = re.findall(r"_(\d+)", wav.stem)
                recordings.append(
                    KclRecording(
                        path=str(wav),
                        subject=f"ID{subject}",
                        label=label,
                        task=task,
                        severity="-".join(digits) if label else "",
                    )
                )
    return recordings


def load_kcl() -> tuple[list[KclRecording], np.ndarray]:
    CACHE.mkdir(parents=True, exist_ok=True)
    meta_path, audio_path = CACHE / "index.json", CACHE / "audio_int16.npy"
    if meta_path.exists() and audio_path.exists():
        recordings = [KclRecording(**r) for r in json.loads(meta_path.read_text())]
        return recordings, np.load(audio_path, mmap_mode="r")

    recordings = index_kcl()
    chunks, offset = [], 0
    for i, rec in enumerate(recordings):
        audio, sr = sf.read(rec.path, dtype="float32", always_2d=True)
        audio = audio.mean(axis=1)
        if sr != SAMPLE_RATE:
            audio = librosa.resample(audio, orig_sr=sr, target_sr=SAMPLE_RATE, res_type="soxr_hq")
        audio = audio - audio.mean()
        audio = np.clip(audio / (np.abs(audio).max() + 1e-9) * 0.95, -1, 1)
        rec.offset, rec.length = offset, len(audio)
        chunks.append((audio * 32767).astype(np.int16))
        offset += len(audio)
        if i % 20 == 0:
            print(f"cached {i}/{len(recordings)}", flush=True)
    np.save(audio_path, np.concatenate(chunks))
    meta_path.write_text(json.dumps([r.__dict__ for r in recordings]))
    return recordings, np.load(audio_path, mmap_mode="r")


if __name__ == "__main__":
    recs, buf = load_kcl()
    labels = {r.subject: r.label for r in recs}
    print(f"{len(recs)} recordings, {len(labels)} subjects, {len(buf) / SAMPLE_RATE / 3600:.2f} h")
    print("PD subjects:", sum(labels.values()), "HC subjects:", len(labels) - sum(labels.values()))
