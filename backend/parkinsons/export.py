"""Builds the fold ensemble and exports it for iOS (Core ML) and web (ONNX).

    python export.py                                   # from artifacts/cv
    python export.py --folds-dir artifacts/v1_italian_only --out-dir artifacts/releases/v1-italian-clinic

Outputs:
    ios/VoiceReadiness/ML/ParkinsonVoiceClassifier.mlmodel
    <out-dir>/parkinson_voice_classifier.onnx
"""

import argparse
import json
from pathlib import Path

import coremltools as ct
import numpy as np
import onnxruntime as ort
import torch

from config import ARTIFACTS_DIR, IOS_ML_DIR, SAMPLE_RATE, WINDOW_SAMPLES
from model import PDNet, VoiceClassifier
from train import CV_DIR, N_FOLDS


def build_ensemble(folds_dir: Path) -> VoiceClassifier:
    members = []
    for k in range(N_FOLDS):
        checkpoint = folds_dir / f"fold{k}.pt"
        if not checkpoint.exists():
            raise FileNotFoundError(f"missing {checkpoint}; the ensemble needs all {N_FOLDS} folds")
        net = PDNet()
        net.load_state_dict(torch.load(checkpoint, map_location="cpu"))
        members.append(net)
    return VoiceClassifier(members).eval()


def subject_auc(report: dict) -> float:
    """Reads the headline subject AUC from either report layout."""
    level = report["subject_level"]
    for key in ("all", "at_chosen_threshold"):
        if key in level:
            return float(level[key]["auc"])
    raise KeyError(f"no subject AUC in report; keys are {sorted(level)}")


class Exportable(torch.nn.Module):
    def __init__(self, model: VoiceClassifier):
        super().__init__()
        self.model = model

    def forward(self, audio: torch.Tensor) -> torch.Tensor:
        return self.model(audio)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--folds-dir", type=Path, default=CV_DIR)
    parser.add_argument("--out-dir", type=Path, default=ARTIFACTS_DIR)
    parser.add_argument("--report", type=Path, help="cv_report.json to read the threshold from")
    args = parser.parse_args()

    report = json.loads((args.report or args.out_dir / "cv_report.json").read_text())
    threshold = report["threshold"]
    model = Exportable(build_ensemble(args.folds_dir)).eval()
    example = torch.randn(1, WINDOW_SAMPLES) * 0.1

    with torch.no_grad():
        traced = torch.jit.trace(model, example)
        reference = model(example).numpy()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = args.out_dir / "parkinson_voice_classifier.onnx"
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
            "cv_subject_auc": f"{subject_auc(report):.4f}",
        }
    )
    IOS_ML_DIR.mkdir(parents=True, exist_ok=True)
    for out in (IOS_ML_DIR / "ParkinsonVoiceClassifier.mlmodel", args.out_dir / "ParkinsonVoiceClassifier.mlmodel"):
        mlmodel.save(str(out))
        print("saved", out)
    print(f"threshold={threshold:.4f}")


if __name__ == "__main__":
    main()
