"""Speaker-separated voice classification; consumes extracted features, not audio."""

from .core import DEFAULT_FEATURES, VoiceClassifier, evaluate_external, train

__all__ = ["DEFAULT_FEATURES", "VoiceClassifier", "evaluate_external", "train"]
