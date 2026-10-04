"""Indexes the training corpora and caches them as 16 kHz int16 audio.

Sources:
    italian  Italian Parkinson's Voice and Speech (clinic microphone; PD + young/elderly controls)
    mdvr     MDVR-KCL, King's College London (English, smartphone; PD + controls)
    libri    Mini LibriSpeech dev-clean-2 (English, assorted home microphones; healthy readers)
"""

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
    LIBRI_DIR,
    MDVR_DIR,
    SAMPLE_RATE,
    VAD_DB_BELOW_MAX,
    VAD_FRAME,
    VAD_HOP,
    VAD_MIN_VOICED_FRACTION,
)

SOURCES = ("italian", "mdvr", "libri")


@dataclass
class Recording:
    path: str
    subject: str
    group: str
    label: int
    task: str
    task_group: str
    orig_sr: int
    source: str = "italian"
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


def index_italian() -> list[Recording]:
    recordings = []
    for wav in sorted(DATA_DIR.rglob("*.wav")):
        rel = wav.relative_to(DATA_DIR).parts
        group, label = GROUPS[rel[0]]
        # PD folders are nested in session batches (e.g. "1-5/Vito S"); the same
        # person can appear in several batches, so identity is the person folder.
        subject = _subject_key(group, rel[-2])
        task, task_group = _task_of(wav.name)
        recordings.append(
            Recording(str(wav), subject, group, label, task, task_group, sf.info(str(wav)).samplerate, "italian")
        )
    return recordings


def index_mdvr() -> list[Recording]:
    recordings = []
    for wav in sorted(MDVR_DIR.rglob("*.wav")):
        task_dir, cls = wav.parts[-3], wav.parts[-2]
        label = int(cls == "PD")
        subject_id = wav.name.split("_")[0]
        task = "READ" if task_dir == "ReadText" else "DIALOGUE"
        recordings.append(
            Recording(str(wav), f"MDVR:{subject_id}", f"MDVR-{cls}", label, task, "speech", sf.info(str(wav)).samplerate, "mdvr")
        )
    return recordings


def index_libri() -> list[Recording]:
    recordings = []
    for flac in sorted(LIBRI_DIR.rglob("*.flac")):
        speaker = flac.parts[-3]
        recordings.append(
            Recording(str(flac), f"LIBRI:{speaker}", "LIBRI-HC", 0, "READ", "speech", sf.info(str(flac)).samplerate, "libri")
        )
    return recordings


INDEXERS = {"italian": index_italian, "mdvr": index_mdvr, "libri": index_libri}


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


def _build_source_cache(source: str) -> None:
    recordings = INDEXERS[source]()
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
        if i % 200 == 0:
            print(f"{source}: cached {i}/{len(recordings)}", flush=True)
    np.save(CACHE_DIR / f"{source}_audio.npy", np.concatenate(chunks))
    (CACHE_DIR / f"{source}_index.json").write_text(json.dumps([r.__dict__ for r in recordings]))


def load_cache(sources=SOURCES) -> tuple[list[Recording], dict[str, np.ndarray]]:
    """Returns recordings and a per-source memory-mapped int16 waveform buffer at 16 kHz."""
    CACHE_DIR.mkdir(exist_ok=True)
    recordings, buffers = [], {}
    for source in sources:
        meta_path, audio_path = CACHE_DIR / f"{source}_index.json", CACHE_DIR / f"{source}_audio.npy"
        if not (meta_path.exists() and audio_path.exists()):
            _build_source_cache(source)
        recordings += [Recording(**{"source": source, **r}) for r in json.loads(meta_path.read_text())]
        buffers[source] = np.load(audio_path, mmap_mode="r")
    return recordings, buffers


def get_audio(buffers: dict[str, np.ndarray], rec: Recording) -> np.ndarray:
    return buffers[rec.source][rec.offset : rec.offset + rec.length].astype(np.float32) / 32767.0


if __name__ == "__main__":
    recs, bufs = load_cache()
    for source in SOURCES:
        rs = [r for r in recs if r.source == source]
        subjects = {r.subject: r.label for r in rs}
        hours = len(bufs[source]) / SAMPLE_RATE / 3600
        print(f"{source}: {len(rs)} recordings, {len(subjects)} subjects ({sum(subjects.values())} PD), {hours:.2f} h")
