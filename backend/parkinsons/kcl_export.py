"""Exports the MDVR-KCL ensemble for iOS (Core ML) and web (ONNX).

Outputs:
    ios/VoiceReadiness/ML/ParkinsonVoiceClassifier.mlmodel
    backend/parkinsons/artifacts/parkinson_voice_classifier.onnx

The previous Italian-only model is archived under artifacts/ rather than deleted.
"""

import json
import shutil

import coremltools as ct
import numpy as np
import onnxruntime as ort
import torch

from config import ARTIFACTS_DIR, IOS_ML_DIR, SAMPLE_RATE, WINDOW_SAMPLES
from kcl_report import build_ensemble, load_runs
from model import VoiceClassifier


class Exportable(torch.nn.Module):
    def __init__(self, model: VoiceClassifier):
        super().__init__()
        self.model = model

    def forward(self, audio: torch.Tensor) -> torch.Tensor:
        return self.model(audio)


def main():
    report = json.loads((ARTIFACTS_DIR / "kcl_report.json").read_text())
    threshold = report["mean_nested_threshold"]
    runs = load_runs()
    members = build_ensemble(runs, width=0.5, dropout=0.4)
    model = Exportable(VoiceClassifier(members).eval()).eval()
    example = torch.randn(1, WINDOW_SAMPLES) * 0.1

    with torch.no_grad():
        traced = torch.jit.trace(model, example)
        reference = model(example).numpy()

    onnx_path = ARTIFACTS_DIR / "parkinson_voice_classifier.onnx"
    if onnx_path.exists():
        shutil.copy2(onnx_path, ARTIFACTS_DIR / "archive_italian_only.onnx")
    torch.onnx.export(
        model, example, onnx_path, input_names=["audio"], output_names=["parkinsons_probability"],
        opset_version=17, dynamic_axes={"audio": {0: "batch"}, "parkinsons_probability": {0: "batch"}},
    )
    onnx_out = ort.InferenceSession(str(onnx_path)).run(None, {"audio": example.numpy()})[0]
    print("onnx max abs diff vs torch:", float(np.abs(onnx_out - reference).max()))

    mlmodel = ct.convert(
        traced,
        inputs=[ct.TensorType(name="audio", shape=(1, WINDOW_SAMPLES), dtype=np.float32)],
        outputs=[ct.TensorType(name="parkinsons_probability")],
        convert_to="neuralnetwork",
        minimum_deployment_target=ct.target.iOS14,
    )
    auc = report["pooled_oof_auc_per_seed"]["mean"]
    mlmodel.short_description = (
        "Estimates the probability that a 4-second, 16 kHz mono voice clip shows Parkinsonian speech. "
        f"Trained on MDVR-KCL English speakers; speaker-held-out AUC {auc:.2f}. Screening aid, not a diagnosis."
    )
    mlmodel.author = "StormHacks 2026 - Trust Me Bro"
    mlmodel.version = "2.0"
    mlmodel.input_description["audio"] = f"Float32 waveform, {SAMPLE_RATE} Hz mono, exactly {WINDOW_SAMPLES} samples in [-1, 1]"
    mlmodel.output_description["parkinsons_probability"] = "Ensemble probability of Parkinsonian speech (0-1)"
    mlmodel.user_defined_metadata.update(
        {
            "sample_rate": str(SAMPLE_RATE),
            "window_samples": str(WINDOW_SAMPLES),
            "decision_threshold": f"{threshold:.4f}",
            "training_data": "MDVR-KCL (37 English speakers)",
            "cv_subject_auc": f"{auc:.4f}",
            "n_ensemble_members": str(len(members)),
        }
    )
    IOS_ML_DIR.mkdir(parents=True, exist_ok=True)
    out = IOS_ML_DIR / "ParkinsonVoiceClassifier.mlmodel"
    if out.exists():
        shutil.copy2(out, ARTIFACTS_DIR / "archive_italian_only.mlmodel")
    mlmodel.save(str(out))
    print(f"saved {out} | members {len(members)} | threshold {threshold:.4f}")


if __name__ == "__main__":
    main()
