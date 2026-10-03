"""Deterministic acoustic extraction, with engineering quality checks, not clinical cutoffs."""

from dataclasses import asdict, dataclass
import hashlib
import json
import math
from pathlib import Path
from typing import BinaryIO

import numpy as np
import opensmile
import parselmouth
from parselmouth.praat import call
from scipy.signal import resample_poly
import scipy
import soundfile as sf

from backend.classifier.data import DEFAULT_FEATURES


class AudioInputError(ValueError):
    """Unsupported, unreadable, or oversized audio input."""


@dataclass(frozen=True)
class ExtractionConfig:
    schema_version: int = 1
    sample_rate_hz: int = 16000
    min_input_rate_hz: int = 16000
    max_input_rate_hz: int = 96000
    min_duration_s: float = 2.0
    max_duration_s: float = 300.0
    activity_threshold_dbfs: float = -45.0
    min_active_duration_s: float = 1.0
    max_clipped_fraction: float = 0.005
    clip_amplitude: float = 0.999
    pitch_floor_hz: float = 75.0
    pitch_ceiling_hz: float = 500.0
    pitch_step_s: float = 0.01
    min_voiced_duration_s: float = 0.5
    min_period_window_s: float = 0.1
    max_period_window_s: float = 5.0
    max_period_factor: float = 1.3
    max_amplitude_factor: float = 1.6
    max_formant_hz: float = 5500.0


def finite(value: float) -> float | None:
    return float(value) if np.isfinite(value) else None


def mean_finite(values: list[float]) -> float | None:
    values = np.asarray(values, dtype=float)
    values = values[np.isfinite(values)]
    return float(values.mean()) if len(values) else None


class AudioExtractor:
    def __init__(self, config: ExtractionConfig | None = None, *, embedding_models=(), local_files_only=False):
        self.config = config or ExtractionConfig()
        self.embedding_models = tuple(embedding_models)
        self.embeddings = None
        if self.embedding_models:
            from .embeddings import FrozenEmbeddings

            self.embeddings = FrozenEmbeddings(self.embedding_models, local_files_only=local_files_only)
            self.embedding_models = self.embeddings.models
        self.smile = opensmile.Smile(
            feature_set=opensmile.FeatureSet.eGeMAPSv02,
            feature_level=opensmile.FeatureLevel.Functionals,
            num_workers=1,
        )
        self.feature_names = [*DEFAULT_FEATURES, *("opensmile_" + name for name in self.smile.feature_names)]
        self.provenance = {
            "config": asdict(self.config), "parselmouth_version": parselmouth.__version__,
            "praat_version": parselmouth.PRAAT_VERSION, "opensmile_version": opensmile.__version__,
            "soundfile_version": sf.__version__, "feature_set": "eGeMAPSv02.Functionals",
            "numpy_version": np.__version__, "scipy_version": scipy.__version__,
            "feature_names": self.feature_names,
            "preprocessing": "Mean stereo channels; remove DC; polyphase resample; no gain normalization.",
            "period_aggregation": "Duration-weighted means across contiguous voiced windows, at most 5 seconds each.",
        }
        if self.embeddings is not None:
            self.feature_names.extend(self.embeddings.feature_names)
            self.provenance["embeddings"] = self.embeddings.provenance
        self.signature = hashlib.sha256(json.dumps(self.provenance, sort_keys=True).encode()).hexdigest()

    def extract(
        self, source: str | Path | BinaryIO, *, speaker_verified: bool,
        start_s: float = 0.0, end_s: float | None = None,
    ) -> dict:
        if not isinstance(speaker_verified, bool):
            raise AudioInputError("speaker_verified must be an explicit boolean.")
        cfg = self.config
        try:
            with sf.SoundFile(source) as audio:
                if audio.format not in {"WAV", "WAVEX"}:
                    raise AudioInputError("Use an uncompressed WAV recording.")
                if audio.subtype not in {"PCM_U8", "PCM_S8", "PCM_16", "PCM_24", "PCM_32", "FLOAT", "DOUBLE"}:
                    raise AudioInputError("Use uncompressed PCM or floating-point WAV audio.")
                rate, channels = audio.samplerate, audio.channels
                if not cfg.min_input_rate_hz <= rate <= cfg.max_input_rate_hz:
                    raise AudioInputError(f"Input sample rate must be {cfg.min_input_rate_hz}–{cfg.max_input_rate_hz} Hz.")
                if channels not in (1, 2):
                    raise AudioInputError("Use mono or stereo audio.")
                source_duration = len(audio) / rate
                stop = source_duration if end_s is None else end_s
                if not isinstance(start_s, (int, float)) or not isinstance(stop, (int, float)) or not np.isfinite([start_s, stop]).all():
                    raise AudioInputError("Segment bounds must be finite seconds.")
                if not 0 <= start_s < stop <= source_duration + 1 / rate:
                    raise AudioInputError("Segment bounds must lie inside the recording, with end after start.")
                if stop - start_s > cfg.max_duration_s:
                    raise AudioInputError(f"Selected audio must be at most {cfg.max_duration_s:g} seconds.")
                audio.seek(round(start_s * rate))
                count = min(round((stop - start_s) * rate), len(audio) - audio.tell())
                original = audio.read(count, dtype="float64", always_2d=True)
                subtype = audio.subtype
        except (sf.LibsndfileError, RuntimeError) as exc:
            raise AudioInputError("Cannot decode this WAV recording.") from exc
        if not len(original) or not np.isfinite(original).all():
            raise AudioInputError("Audio must contain finite samples.")
        if np.max(np.abs(original)) > 1.0:
            raise AudioInputError("Floating-point WAV amplitudes must lie between -1 and 1.")
        mono = original.mean(axis=1)
        mono = mono - mono.mean()
        divisor = math.gcd(rate, cfg.sample_rate_hz)
        signal = resample_poly(mono, cfg.sample_rate_hz // divisor, rate // divisor) if rate != cfg.sample_rate_hz else mono
        duration = len(signal) / cfg.sample_rate_hz
        frame_size = round(0.025 * cfg.sample_rate_hz)
        padded = np.pad(signal, (0, (-len(signal)) % frame_size))
        rms = np.sqrt(np.mean(padded.reshape(-1, frame_size) ** 2, axis=1))
        active = rms >= 10 ** (cfg.activity_threshold_dbfs / 20)
        active_duration = min(float(active.sum() * frame_size / cfg.sample_rate_hz), duration)
        clipped = float(np.mean(np.abs(original) >= cfg.clip_amplitude))
        failures = []
        if duration < cfg.min_duration_s:
            failures.append("too_short")
        if active_duration < cfg.min_active_duration_s:
            failures.append("insufficient_signal_activity")
        if clipped > cfg.max_clipped_fraction:
            failures.append("excessive_clipping")
        quality = {
            "duration_s": duration, "source_duration_s": source_duration,
            "start_s": start_s, "end_s": stop, "source_sample_rate_hz": rate,
            "analysis_sample_rate_hz": cfg.sample_rate_hz, "source_channels": channels,
            "source_subtype": subtype, "clipped_fraction": clipped,
            "active_duration_s": active_duration, "active_fraction": float(active.mean()),
            "rms_dbfs": float(20 * np.log10(max(np.sqrt(np.mean(signal ** 2)), 1e-12))),
            "speaker_verified": speaker_verified, "failures": failures,
            "warnings": [] if speaker_verified else ["speaker_review_required"],
            "voiced_duration_s": 0.0, "voiced_fraction": 0.0,
        }
        features = dict.fromkeys(self.feature_names)
        if not failures:
            sound = parselmouth.Sound(signal, sampling_frequency=cfg.sample_rate_hz)
            pitch = sound.to_pitch_ac(
                time_step=cfg.pitch_step_s, pitch_floor=cfg.pitch_floor_hz,
                pitch_ceiling=cfg.pitch_ceiling_hz,
            )
            frequencies = pitch.selected_array["frequency"]
            voiced = frequencies > 0
            quality["voiced_fraction"] = float(voiced.mean()) if len(voiced) else 0.0
            quality["voiced_duration_s"] = float(voiced.sum() * cfg.pitch_step_s)
            if quality["voiced_duration_s"] < cfg.min_voiced_duration_s:
                failures.append("insufficient_voiced_audio")
            else:
                features.update(self._praat_features(sound, pitch, frequencies, voiced))
                smile_values = self.smile.process_signal(signal.astype(np.float32), cfg.sample_rate_hz).iloc[0]
                features.update({"opensmile_" + name: finite(value) for name, value in smile_values.items()})
                if speaker_verified and self.embeddings is not None:
                    features.update(self.embeddings.extract(signal))
        quality["signal_quality_passed"] = not failures
        quality["quality_passed"] = not failures and speaker_verified
        quality["missing_features"] = [name for name, value in features.items() if value is None]
        return {
            "status": "insufficient_recording_quality" if failures else "ok" if speaker_verified else "needs_speaker_review",
            "features": features, "quality": quality, "extractor_signature": self.signature,
        }

    def _praat_features(self, sound, pitch, frequencies, voiced) -> dict:
        cfg = self.config
        features = {
            "f0_mean_hz": float(frequencies[voiced].mean()),
            "f0_std_hz": float(frequencies[voiced].std()),
        }
        harmonicity = sound.to_harmonicity_cc(time_step=cfg.pitch_step_s, minimum_pitch=cfg.pitch_floor_hz)
        values = harmonicity.values.ravel()
        features["hnr_db"] = mean_finite(values[values != -200].tolist())
        formants = sound.to_formant_burg(time_step=0.02, max_number_of_formants=5, maximum_formant=cfg.max_formant_hz)
        voiced_times = pitch.xs()[voiced][::2]
        for number in (1, 2, 3):
            features[f"f{number}_mean_hz"] = mean_finite([
                formants.get_value_at_time(number, time) for time in voiced_times
            ])
        perturbations = {"jitter_local": [], "shimmer_local": [], "mean_period_s": []}
        runs = np.flatnonzero(np.diff(np.r_[False, voiced, False].astype(int)))
        times = pitch.xs()
        for first, last in zip(runs[::2], runs[1::2]):
            begin = max(0.0, float(times[first] - cfg.pitch_step_s / 2))
            end = min(sound.duration, float(times[last - 1] + cfg.pitch_step_s / 2))
            for start in np.arange(begin, end, cfg.max_period_window_s):
                stop = min(float(start + cfg.max_period_window_s), end)
                if stop - start < cfg.min_period_window_s:
                    continue
                segment = sound.extract_part(from_time=float(start), to_time=stop, preserve_times=False)
                try:
                    pulses = call(segment, "To PointProcess (periodic, cc)", cfg.pitch_floor_hz, cfg.pitch_ceiling_hz)
                    args = (0, 0, 1 / cfg.pitch_ceiling_hz, 1 / cfg.pitch_floor_hz, cfg.max_period_factor)
                    results = {
                        "jitter_local": call(pulses, "Get jitter (local)", *args),
                        "shimmer_local": call([segment, pulses], "Get shimmer (local)", *args, cfg.max_amplitude_factor),
                        "mean_period_s": call(pulses, "Get mean period", *args),
                    }
                    for name, value in results.items():
                        if np.isfinite(value):
                            perturbations[name].append((float(value), stop - start))
                except parselmouth.PraatError:
                    # A short voiced span can still have too few valid cycles.
                    continue
        for name, results in perturbations.items():
            features[name] = float(np.average([value for value, _ in results], weights=[weight for _, weight in results])) if results else None
        return features
