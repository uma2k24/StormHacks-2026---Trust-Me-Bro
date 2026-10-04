"""Local web demo: speak into the microphone and screen the recording with the exported model.

    cd backend/parkinsons
    python server.py            # open http://127.0.0.1:8000

The browser captures audio, resamples it to 16 kHz mono float32, and posts the raw
samples here. Scoring is the same code path as predict.py, so a clip scored in the
browser and the same clip scored from the command line give identical numbers.
"""

import argparse
import io
import json
import os

from pathlib import Path

import librosa
import numpy as np
import onnxruntime as ort
import uvicorn
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.staticfiles import StaticFiles

from config import ARTIFACTS_DIR, ROOT, SAMPLE_RATE, TASK_GROUPS
from predict import screen

FRONTEND_DIR = ROOT / "frontend"
# Pinned to a saved release so retraining, which rewrites artifacts/, cannot silently
# change what the demo serves. Point PD_MODEL_DIR at artifacts/ to try a new model.
RELEASE_DIR = ARTIFACTS_DIR / "releases" / "v1-italian-clinic"
MODEL_DIR = Path(os.environ.get("PD_MODEL_DIR", RELEASE_DIR))

# One prompt per task group the model was trained on. Weights come from config so the
# combined score mixes tasks the same way training did.
CHECK_IN = [
    {
        "id": "vowel",
        "title": "Sustained vowel",
        "prompt": "Take a breath, then hold a steady \u201caah\u201d for the whole countdown.",
        "hint": "Keep the pitch and loudness as even as you can.",
        "seconds": 8,
    },
    {
        "id": "ddk",
        "title": "Rapid syllables",
        "prompt": "Repeat \u201cpa-ta-ka\u201d over and over, as fast and as evenly as possible.",
        "hint": "Crisp consonants matter more than speed.",
        "seconds": 8,
    },
    {
        "id": "speech",
        "title": "Read aloud",
        "prompt": "The rainbow is a division of white light into many beautiful colors. "
        "These take the shape of a long round arch, with its path high above and its two ends "
        "apparently beyond the horizon.",
        "hint": "Read at your normal speaking pace and volume.",
        "seconds": 16,
    },
]

app = FastAPI(title="Parkinson's voice screening demo")
session = ort.InferenceSession(str(MODEL_DIR / "parkinson_voice_classifier.onnx"))
cv_report = json.loads((MODEL_DIR / "cv_report.json").read_text())
external = json.loads((MODEL_DIR / "external_report.json").read_text())
THRESHOLD = float(cv_report["threshold"])
RELEASE = json.loads((MODEL_DIR / "release.json").read_text()) if (MODEL_DIR / "release.json").exists() else {}


def analyze(audio: np.ndarray) -> dict:
    if audio.size < SAMPLE_RATE:
        raise HTTPException(status_code=400, detail="Need at least 1 second of audio.")
    if not np.isfinite(audio).all():
        raise HTTPException(status_code=400, detail="Audio contains invalid samples.")
    probs = screen(session, audio)
    probability = float(np.mean(probs))
    rms = float(np.sqrt(np.mean(audio**2)))
    return {
        "probability": probability,
        "threshold": THRESHOLD,
        "flagged": probability >= THRESHOLD,
        "windowProbabilities": [round(float(p), 4) for p in probs],
        "seconds": audio.size / SAMPLE_RATE,
        "level": rms,
        "tooQuiet": rms < 1e-3,
    }


@app.get("/api/config")
def get_config() -> dict:
    return {
        "threshold": THRESHOLD,
        "sampleRate": SAMPLE_RATE,
        "release": RELEASE.get("name", MODEL_DIR.name),
        "tasks": [{**task, "weight": TASK_GROUPS[task["id"]]} for task in CHECK_IN],
        "validation": {
            "heldOutItalianSubjectAuc": cv_report["subject_level"]["at_chosen_threshold"]["auc"],
            "heldOutItalianAccuracy": cv_report["subject_level"]["at_chosen_threshold"]["accuracy"],
            "externalEnglishAuc": external["mdvr_kcl"]["subject_level"]["auc"],
            "externalEnglishSensitivity": external["mdvr_kcl"]["subject_level"]["sensitivity"],
            "externalEnglishSpecificity": external["mdvr_kcl"]["subject_level"]["specificity"],
        },
    }


@app.post("/api/screen")
async def post_screen(request: Request, task: str = "speech") -> dict:
    """Scores raw little-endian float32 mono samples at SAMPLE_RATE."""
    body = await request.body()
    if len(body) % 4:
        raise HTTPException(status_code=400, detail="Body must be float32 samples.")
    audio = np.frombuffer(body, dtype="<f4").astype(np.float32)
    return {"task": task, **analyze(audio)}


@app.post("/api/screen-file")
async def post_screen_file(file: UploadFile = File(...)) -> dict:
    """Scores an uploaded recording, so dataset clips can be checked in the same UI."""
    try:
        audio, _ = librosa.load(io.BytesIO(await file.read()), sr=SAMPLE_RATE, mono=True)
    except Exception as exc:  # soundfile/audioread raise several unrelated types
        raise HTTPException(status_code=400, detail=f"Could not decode {file.filename}: {exc}")
    return {"task": "file", "name": file.filename, **analyze(audio)}


@app.post("/api/combine")
async def post_combine(payload: dict) -> dict:
    """Weighted average of per-task probabilities, using the training task mix."""
    clips = payload.get("clips") or []
    weights = [TASK_GROUPS.get(c.get("task"), 0.0) for c in clips]
    total = sum(weights)
    if not total:
        raise HTTPException(status_code=400, detail="No scored clips to combine.")
    probability = sum(w * float(c["probability"]) for w, c in zip(weights, clips)) / total
    return {"probability": probability, "threshold": THRESHOLD, "flagged": probability >= THRESHOLD}


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    print(f"model {MODEL_DIR.name} | threshold {THRESHOLD:.3f} | open http://127.0.0.1:{args.port}")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
