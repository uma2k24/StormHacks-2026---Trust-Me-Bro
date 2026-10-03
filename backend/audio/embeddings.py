"""Optional frozen encoders; deterministic chunks, no transcripts or fine tuning."""

from importlib.metadata import PackageNotFoundError, version
import math

import numpy as np

# Immutable Hub commits, rather than moving `main` revisions.
MODELS = {
    "whisper": ("openai/whisper-tiny", "169d4a4341b33bc18d8881c4b69c2e104e1cc0af", 384),
    "hubert": ("facebook/hubert-base-ls960", "dba3bb02fda4248b6e082697eee756de8fe8aa8a", 768),
    "wavlm": ("microsoft/wavlm-base-plus", "4c66d4806a428f2e922ccfa1a962776e232d487b", 768),
}
SAMPLE_RATE = 16000
CHUNK_SECONDS = 20
MIN_CHUNK_SAMPLES = 1600


def validate_models(names):
    if isinstance(names, str):
        raise ValueError("Embedding models must be a list of whisper, hubert, or wavlm.")
    names = tuple(names)
    if len(names) != len(set(names)) or any(name not in MODELS for name in names):
        raise ValueError("Embedding models must be unique choices from whisper, hubert, wavlm.")
    return tuple(name for name in MODELS if name in names)


def feature_names(name):
    return [f"embedding_{name}_{stat}_{index:04d}"
            for stat in ("mean", "std") for index in range(MODELS[name][2])]


def pool_hidden_states(states):
    """Pool all valid encoder frames, weighting chunks by frame count."""
    count, total, squares = 0, None, None
    for hidden in states:
        hidden = np.asarray(hidden, dtype=np.float64)
        if hidden.ndim != 2 or not len(hidden) or not np.isfinite(hidden).all():
            raise ValueError("Encoder output must contain finite time-by-channel frames.")
        if total is not None and hidden.shape[1] != len(total):
            raise ValueError("Encoder hidden dimensions changed between chunks.")
        count += len(hidden)
        sums, sums_squared = hidden.sum(axis=0), np.square(hidden).sum(axis=0)
        total = sums if total is None else total + sums
        squares = sums_squared if squares is None else squares + sums_squared
    if not count:
        raise ValueError("No encoder frames to pool.")
    mean = total / count
    std = np.sqrt(np.maximum(squares / count - np.square(mean), 0))
    return np.concatenate([mean, std])


class FrozenEmbeddings:
    def __init__(self, models, *, local_files_only=False):
        self.models = validate_models(models)
        self.local_files_only = local_files_only
        self.feature_names = [column for name in self.models for column in feature_names(name)]
        try:
            packages = {name: version(name) for name in ("torch", "transformers")}
        except PackageNotFoundError as exc:
            raise ValueError("Install backend/requirements-embeddings.txt to enable embeddings.") from exc
        # Older torch versions cannot load the publisher .bin snapshots through
        # Transformers' restricted loader. Check before processing a manifest.
        from packaging.version import Version

        if Version(packages["torch"].split("+")[0]) < Version("2.6"):
            raise ValueError("Embedding extraction requires Torch 2.6 or later; install requirements-embeddings.txt.")
        self.provenance = {
            "models": {name: {"id": MODELS[name][0], "revision": MODELS[name][1],
                              "hidden_size": MODELS[name][2]} for name in self.models},
            "packages": packages, "sample_rate_hz": SAMPLE_RATE,
            "chunk_seconds": CHUNK_SECONDS, "minimum_tail_samples": MIN_CHUNK_SAMPLES,
            "pooling": "Last encoder layer; global frame-weighted mean and population std; exclude padding frames.",
            "device": "cpu", "frozen": True,
            "weights": "Whisper safetensors; HuBERT/WavLM publisher PyTorch weights with weights_only=True.",
        }
        self._loaded = {}

    def _load(self, name):
        if name not in self._loaded:
            from transformers import AutoFeatureExtractor, AutoModel, WhisperModel

            identifier, revision, _ = MODELS[name]
            options = {"revision": revision, "local_files_only": self.local_files_only,
                       "trust_remote_code": False}
            processor = AutoFeatureExtractor.from_pretrained(identifier, **options)
            model_class = WhisperModel if name == "whisper" else AutoModel
            # These pinned HuBERT/WavLM publisher snapshots contain only .bin weights.
            # Transformers loads them through torch's restricted weights-only loader.
            model = model_class.from_pretrained(identifier, use_safetensors=name == "whisper",
                                                 weights_only=True, **options)
            # Only Whisper's audio encoder is used; no transcript or decoder inference.
            if name == "whisper":
                model = model.encoder
            model = model.to("cpu").eval()
            model.requires_grad_(False)
            self._loaded[name] = (processor, model)
        return self._loaded[name]

    def _hidden(self, name, signal):
        import torch

        processor, model = self._load(name)
        inputs = processor(signal.astype(np.float32), sampling_rate=SAMPLE_RATE,
                           return_tensors="pt")
        with torch.inference_mode():
            if name == "whisper":
                hidden = model(input_features=inputs.input_features).last_hidden_state[0]
                # Whisper pads its mel input to 30 s; encoder stride is two mel frames.
                frames = math.ceil(len(signal) / (processor.hop_length * 2))
                hidden = hidden[:frames]
            else:
                # No batch padding: every returned HuBERT/WavLM frame is valid.
                hidden = model(**inputs).last_hidden_state[0]
        return hidden.detach().cpu().numpy()

    def extract(self, signal):
        signal = np.asarray(signal, dtype=np.float32)
        if signal.ndim != 1 or not np.isfinite(signal).all() or len(signal) < MIN_CHUNK_SAMPLES:
            raise ValueError("Embeddings require finite mono audio at 16 kHz.")
        values = {}
        step = CHUNK_SECONDS * SAMPLE_RATE
        for name in self.models:
            states = (self._hidden(name, signal[start:start + step])
                      for start in range(0, len(signal), step)
                      if len(signal[start:start + step]) >= MIN_CHUNK_SAMPLES)
            vector = pool_hidden_states(states)
            columns = feature_names(name)
            if len(vector) != len(columns):
                raise ValueError(f"Unexpected embedding dimensions for {name}.")
            values.update(zip(columns, map(float, vector)))
        return values
