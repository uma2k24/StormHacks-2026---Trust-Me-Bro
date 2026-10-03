"""Builds the fold ensemble and exports it for iOS (Core ML) and web (ONNX).

Outputs:
    ios/VoiceReadiness/ML/ParkinsonVoiceClassifier.mlmodel
    backend/parkinsons/artifacts/parkinson_voice_classifier.onnx
"""

import json

import coremltools as ct
import numpy as np
import onnxruntime as ort
import torch

from config import ARTIFACTS_DIR, IOS_ML_DIR, SAMPLE_RATE, WINDOW_SAMPLES
from model import PDNet, VoiceClassifier
from train import CV_DIR, N_FOLDS


def build_ensemble() -> VoiceClassifier:
    members = []
    for k in range(N_FOLDS):
        net = PDNet()
        net.load_state_dict(torch.load(CV_DIR / f"fold{k}.pt", map_location="cpu"))
        members.append(net)
    return VoiceClassifier(members).eval()


class Exportable(torch.nn.Module):
    def __init__(self, model: VoiceClassifier):
        super().__init__()
        self.model = model

    def forward(self, audio: torch.Tensor) -> torch.Tensor:
        return self.model(audio)


def main():
    report = json.loads((ARTIFACTS_DIR / "cv_report.json").read_text())
    threshold = report["threshold"]
    model = Exportable(build_ensemble()).eval()
    example = torch.randn(1, WINDOW_SAMPLES) * 0.1

    with torch.no_grad():
        traced = torch.jit.trace(model, example)
        reference = model(example).numpy()

    onnx_path = ARTIFACTS_DIR / "parkinson_voice_classifier.onnx"
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
    mlmodel.short_description = (
        "Estimates the probability that a 4-second, 16 kHz mono voice clip comes from a person with "
        "Parkinson's disease. Screening aid only, not a diagnosis."
    )
    mlmodel.author = "StormHacks 2026 - Trust Me Bro"
    mlmodel.version = "1.0"
    mlmodel.input_description["audio"] = f"Float32 waveform, {SAMPLE_RATE} Hz mono, exactly {WINDOW_SAMPLES} samples in [-1, 1]"
    mlmodel.output_description["parkinsons_probability"] = "Ensemble probability of Parkinsonian speech (0-1)"
    mlmodel.user_defined_metadata.update(
        {
            "sample_rate": str(SAMPLE_RATE),
            "window_samples": str(WINDOW_SAMPLES),
            "decision_threshold": f"{threshold:.4f}",
            "cv_subject_auc": f"{report['subject_level']['at_chosen_threshold']['auc']:.4f}",
        }
    )
    IOS_ML_DIR.mkdir(parents=True, exist_ok=True)
    out = IOS_ML_DIR / "ParkinsonVoiceClassifier.mlmodel"
    mlmodel.save(str(out))
    print("saved", out, f"threshold={threshold:.4f}")


if __name__ == "__main__":
    main()
