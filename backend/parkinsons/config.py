from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "Italian%20Parkinson%27s%20Voice%20and%20speech"
KCL_DIR = ROOT / "data" / "external" / "mdvr_kcl" / "26-29_09_2017_KCL"
LIBRISPEECH_DIR = ROOT / "data" / "external" / "LibriSpeech" / "dev-clean-2"
MDVR_DIR = ROOT / "data" / "external" / "mdvr_kcl"
LIBRI_DIR = ROOT / "data" / "external" / "LibriSpeech" / "dev-clean-2"
PKG_DIR = Path(__file__).resolve().parent
CACHE_DIR = PKG_DIR / "cache"
ARTIFACTS_DIR = PKG_DIR / "artifacts"
IOS_ML_DIR = ROOT / "ios" / "VoiceReadiness" / "ML"

SAMPLE_RATE = 16_000
WINDOW_SECONDS = 4.0
WINDOW_SAMPLES = int(SAMPLE_RATE * WINDOW_SECONDS)
TRAIN_HOP_SECONDS = 0.25
EVAL_HOP_SECONDS = 2.0

N_FFT = 512
HOP_LENGTH = 160
N_MELS = 64
F_MIN = 50.0
# Capped below Nyquist so the model can't key on recorder bandwidth (some PD files were 44.1 kHz).
F_MAX = 7_000.0

# Voice-activity gating, mirrored exactly in ParkinsonVoiceScreener.swift.
VAD_FRAME = 400
VAD_HOP = 160
VAD_DB_BELOW_MAX = 35.0
VAD_MIN_VOICED_FRACTION = 0.6

GROUPS = {
    "15 Young Healthy Control": ("YHC", 0),
    "22 Elderly Healthy Control": ("EHC", 0),
    "28 People with Parkinson's disease": ("PD", 1),
}

TASK_GROUPS = {"vowel": 0.35, "ddk": 0.15, "speech": 0.50}
SOURCE_WEIGHTS = {"italian": 0.40, "mdvr": 0.35, "libri": 0.25}
