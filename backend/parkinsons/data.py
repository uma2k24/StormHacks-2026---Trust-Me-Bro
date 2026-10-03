"""Indexes the Italian Parkinson's Voice and Speech dataset and caches 16 kHz audio."""

import json
import re
import unicodedata
from dataclasses import dataclass

import librosa
import numpy as np
import soundfile as sf

from config import (
    CACHE_DIR,
    DATA_DIR,
    GROUPS,
    SAMPLE_RATE,
    VAD_DB_BELOW_MAX,
    VAD_FRAME,
    VAD_HOP,
    VAD_MIN_VOICED_FRACTION,
)


@dataclass
class Recording:
    path: str
    subject: str
    group: str
    label: int
    task: str
    task_group: str
    orig_sr: int
    offset: int = 0
    length: int = 0


def _task_of(filename: str) -> tuple[str, str]:
    code = re.match(r"[A-Za-z]+", filename).group(0).upper()
    if code.startswith("V"):
        return code, "vowel"
    if code == "D":
        return code, "ddk"
    return code, "speech"


def _subject_key(group: str, folder: str) -> str:
    name = unicodedata.normalize("NFKD", folder).encode("ascii", "ignore").decode()
    name = re.sub(r"[^a-z ]", "", name.lower()).strip()
    return f"{group}:{name}"


def index_dataset() -> list[Recording]:
    recordings = []
    for wav in sorted(DATA_DIR.rglob("*.wav")):
        rel = wav.relative_to(DATA_DIR).parts
        group, label = GROUPS[rel[0]]
        # PD folders are nested in session batches (e.g. "1-5/Vito S"); the same
        # person can appear in several batches, so identity is the person folder.
        subject = _subject_key(group, rel[-2])
        task, task_group = _task_of(wav.name)
        recordings.append(
            Recording(
                path=str(wav),
                subject=subject,
                group=group,
                label=label,
                task=task,
                task_group=task_group,
                orig_sr=sf.info(str(wav)).samplerate,
            )
        )
    return recordings


def voiced_mask(audio: np.ndarray) -> np.ndarray:
    """Per-frame voiced flags (10 ms hop): frame RMS within VAD_DB_BELOW_MAX dB of the loudest frame."""
    if len(audio) < VAD_FRAME:
        return np.zeros(0, dtype=bool)
    frames = np.lib.stride_tricks.sliding_window_view(audio, VAD_FRAME)[::VAD_HOP]
    db = 10.0 * np.log10(np.mean(frames.astype(np.float64) ** 2, axis=1) + 1e-10)
    return db > (db.max() - VAD_DB_BELOW_MAX)


def valid_window_starts(audio: np.ndarray, window: int, hop: int) -> np.ndarray:
    """Window starts whose voiced fraction passes the gate; falls back to the single most voiced window."""
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
    return keep if len(keep) else starts[[int(np.argmax(frac))]]


def load_cache() -> tuple[list[Recording], np.ndarray]:
    """Returns recordings and one concatenated float32 waveform buffer at 16 kHz."""
    CACHE_DIR.mkdir(exist_ok=True)
    meta_path, audio_path = CACHE_DIR / "index.json", CACHE_DIR / "audio_int16.npy"
    if meta_path.exists() and audio_path.exists():
        recordings = [Recording(**r) for r in json.loads(meta_path.read_text())]
        return recordings, np.load(audio_path, mmap_mode="r")

    recordings = index_dataset()
    chunks, offset = [], 0
    for i, rec in enumerate(recordings):
        audio, sr = sf.read(rec.path, dtype="float32", always_2d=True)
        audio = audio.mean(axis=1)
        if sr != SAMPLE_RATE:
            audio = librosa.resample(audio, orig_sr=sr, target_sr=SAMPLE_RATE, res_type="soxr_hq")
        audio = audio - audio.mean()
        peak = np.abs(audio).max() + 1e-9
        audio = np.clip(audio / peak * 0.95, -1, 1)
        rec.offset, rec.length = offset, len(audio)
        chunks.append((audio * 32767).astype(np.int16))
        offset += len(audio)
        if i % 100 == 0:
            print(f"cached {i}/{len(recordings)}")
    np.save(audio_path, np.concatenate(chunks))
    meta_path.write_text(json.dumps([r.__dict__ for r in recordings]))
    return recordings, np.load(audio_path, mmap_mode="r")


def get_audio(buffer: np.ndarray, rec: Recording) -> np.ndarray:
    return buffer[rec.offset : rec.offset + rec.length].astype(np.float32) / 32767.0


if __name__ == "__main__":
    recs, buf = load_cache()
    subjects = {}
    for r in recs:
        subjects.setdefault(r.subject, r.group)
    print(f"{len(recs)} recordings, {len(subjects)} subjects, {len(buf) / SAMPLE_RATE / 3600:.2f} h audio")
    for g in ("YHC", "EHC", "PD"):
        print(g, sum(1 for v in subjects.values() if v == g), "subjects")
    print(sorted(s for s, g in subjects.items() if g == "PD"))
