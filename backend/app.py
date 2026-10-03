"""Local voice research API and recording UI."""

import logging
import os
import io
import threading
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr

from .classifier import VoiceClassifier
from .classifier.data import MIN_AGE
from .classifier.core import LIMITATIONS
from .reports import build_report, gemini_configured

FiniteNumber = Annotated[float, Field(strict=True, allow_inf_nan=False)]
MAX_UPLOAD_BYTES = 32 * 1024 * 1024


class UploadLimitMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("path") != "/analyze":
            return await self.app(scope, receive, send)
        maximum = MAX_UPLOAD_BYTES + 64 * 1024  # Multipart field/header overhead.
        headers = dict(scope.get("headers", []))
        try:
            size = int(headers.get(b"content-length", b"0"))
        except ValueError:
            size = 0
        if size > maximum:
            return await JSONResponse({"detail": "Upload exceeds the 32 MiB audio limit."}, status_code=413)(scope, receive, send)
        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            received += len(message.get("body", b""))
            if received > maximum:
                raise HTTPException(status_code=413, detail="Upload exceeds the 32 MiB audio limit.")
            return message

        await self.app(scope, limited_receive, send)


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    age: Annotated[FiniteNumber, Field(ge=0, le=120)]
    task: Annotated[StrictStr, Field(min_length=1)]
    quality_passed: StrictBool
    features: dict[str, FiniteNumber | None] = Field(default_factory=dict)


def create_app(model_path: str | Path | None = None) -> FastAPI:
    app = FastAPI(title="Voice Research Classifier", version="0.1.0")
    app.add_middleware(UploadLimitMiddleware)
    app.state.classifier = None
    app.state.extractor = None
    app.state.extraction_lock = threading.Lock()
    if model_path is not None:
        try:
            app.state.classifier = VoiceClassifier.load(model_path)
        except Exception:
            # Keep the service inspectable but unavailable; do not substitute a demo model.
            logging.getLogger(__name__).exception("Configured classifier artifact could not be loaded")

    @app.get("/health")
    def health() -> dict:
        model = app.state.classifier
        return {"status": "ready" if model is not None else "model_unavailable",
                "model_loaded": model is not None}

    def require_model() -> VoiceClassifier:
        if app.state.classifier is None:
            raise HTTPException(status_code=503, detail="No trained classifier is available.")
        return app.state.classifier

    @app.get("/classifier/schema")
    def schema() -> dict:
        model = require_model()
        return {
            "model": model.metadata["model_name"], "task": model.metadata["task"],
            "minimum_age": MIN_AGE, "feature_names": model.metadata["feature_names"],
            "training_age_range": model.metadata["training_age_range"],
            "score_is_calibrated": False, "threshold": 0.5,
        }

    @app.post("/classifier/predict")
    def predict(request: PredictionRequest) -> dict:
        model = require_model()
        try:
            return model.predict(**request.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/config")
    def configuration() -> dict:
        model = app.state.classifier
        return {
            "model_available": model is not None, "minimum_age": MIN_AGE,
            "model_task": model.metadata["task"] if model is not None else None,
            "gemini_available": gemini_configured(), "max_upload_bytes": MAX_UPLOAD_BYTES,
            "accepted_format": "WAV", "maximum_duration_s": 300,
        }

    def analyze_audio(raw: bytes, age: float, task: str, speaker_verified: bool, use_gemini: bool) -> dict:
        from .audio import AudioExtractor, AudioInputError

        with app.state.extraction_lock:
            if app.state.extractor is None:
                app.state.extractor = AudioExtractor()
            extractor = app.state.extractor
            try:
                extraction = extractor.extract(io.BytesIO(raw), speaker_verified=speaker_verified)
            except AudioInputError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        result = {**extraction, "age": age, "task": task, "classifier_score": None,
                  "predicted_class": None, "limitations": list(LIMITATIONS)}
        if extraction["status"] == "ok":
            model = app.state.classifier
            if model is None:
                result["status"] = "model_unavailable"
            elif model.metadata.get("extractor_signature") != extractor.signature or not set(model.metadata["feature_names"]).issubset(extractor.feature_names):
                result["status"] = "model_incompatible"
            else:
                values = {name: extraction["features"][name] for name in model.metadata["feature_names"]}
                try:
                    result.update(model.predict(values, age=age, task=task, quality_passed=extraction["quality"]["quality_passed"]))
                except ValueError as exc:
                    raise HTTPException(status_code=422, detail=str(exc)) from exc
        result["report"] = build_report(result, use_gemini=use_gemini)
        return result

    @app.post("/analyze")
    async def analyze(
        file: Annotated[UploadFile, File()],
        age: Annotated[float, Form(ge=0, le=120, allow_inf_nan=False)],
        task: Annotated[Literal["sustained_a", "reading", "spontaneous"], Form()],
        speaker_verified: Annotated[bool, Form()],
        use_gemini: Annotated[bool, Form()] = False,
    ) -> dict:
        try:
            model = app.state.classifier
            if age < MIN_AGE or (model is not None and task != model.metadata["task"]):
                result = {
                    "status": "outside_model_coverage", "age": age, "task": task,
                    "classifier_score": None, "predicted_class": None, "limitations": list(LIMITATIONS),
                    "coverage": {"minimum_age": MIN_AGE, "recording_task": model.metadata["task"] if model is not None else None},
                }
                result["report"] = build_report(result)
                return result
            raw = await file.read(MAX_UPLOAD_BYTES + 1)
            if len(raw) > MAX_UPLOAD_BYTES:
                raise HTTPException(status_code=413, detail="Upload exceeds the 32 MiB audio limit.")
            if not raw:
                raise HTTPException(status_code=422, detail="The uploaded recording is empty.")
            return await run_in_threadpool(analyze_audio, raw, age, task, speaker_verified, use_gemini)
        finally:
            await file.close()

    frontend = Path(__file__).resolve().parent.parent / "frontend"
    if (frontend / "index.html").is_file():
        app.mount("/static", StaticFiles(directory=frontend), name="static")

        @app.get("/", include_in_schema=False)
        def index():
            return FileResponse(frontend / "index.html")

    return app


app = create_app(os.environ.get("CLASSIFIER_MODEL_PATH"))
