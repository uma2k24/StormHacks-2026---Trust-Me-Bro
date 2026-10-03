"""Feature-level prediction API. Audio extraction is supplied by the upstream pipeline."""

import logging
import os
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr

from .classifier import VoiceClassifier
from .classifier.data import MIN_AGE

FiniteNumber = Annotated[float, Field(strict=True, allow_inf_nan=False)]


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    age: Annotated[FiniteNumber, Field(ge=0, le=120)]
    task: Annotated[StrictStr, Field(min_length=1)]
    quality_passed: StrictBool
    features: dict[str, FiniteNumber | None] = Field(default_factory=dict)


def create_app(model_path: str | Path | None = None) -> FastAPI:
    app = FastAPI(title="Voice Research Classifier", version="0.1.0")
    app.state.classifier = None
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

    return app


app = create_app(os.environ.get("CLASSIFIER_MODEL_PATH"))
