"""Run with python -m backend.classifier from the repository root."""

import argparse
import json
from pathlib import Path

from .core import MODEL_NAMES, VoiceClassifier, evaluate_external, train
from .data import DEFAULT_FEATURES, read_feature_csv


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Research voice classifier; consumes extracted feature CSVs.")
    commands = parser.add_subparsers(dest="command", required=True)
    training = commands.add_parser("train", help="Evaluate a fixed baseline using speaker-separated CV, then save it.")
    training.add_argument("--csv", required=True)
    training.add_argument("--dataset", required=True, help="Provenance name, e.g. italian_pvs.")
    training.add_argument("--task", required=True, help="Exact task string in the CSV.")
    training.add_argument("--model", choices=MODEL_NAMES, default="logistic_regression")
    training.add_argument("--features", nargs="+", default=list(DEFAULT_FEATURES), help="Explicit numeric feature columns.")
    training.add_argument("--cv", choices=("groupkfold", "loso"), default="groupkfold")
    training.add_argument("--folds", type=int, default=5)
    training.add_argument("--seed", type=int, default=42)
    training.add_argument("--output", type=Path, required=True, help="Trusted local .joblib artifact destination.")
    external = commands.add_parser("evaluate", help="Evaluate task-matched external speakers without refitting.")
    external.add_argument("--model", type=Path, required=True)
    external.add_argument("--csv", required=True)
    external.add_argument("--dataset", required=True)
    external.add_argument("--output", type=Path, required=True)
    prediction = commands.add_parser("predict", help="Predict from a JSON request using a trusted local artifact.")
    prediction.add_argument("--model", type=Path, required=True)
    prediction.add_argument("--input", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == "train":
            if args.output.suffix != ".joblib":
                raise ValueError("Training output must have the .joblib extension.")
            if args.output.resolve() == Path(args.csv).resolve():
                raise ValueError("Training output cannot overwrite its input dataset.")
            model, report = train(
                read_feature_csv(args.csv), task=args.task, dataset_name=args.dataset,
                model_name=args.model, feature_names=args.features,
                cv=args.cv, n_splits=args.folds, seed=args.seed,
            )
            model.save(args.output)
            metrics_path = args.output.with_suffix(".metrics.json")
            write_json(metrics_path, report)
            print(json.dumps({"model": str(args.output), "report": str(metrics_path),
                              "speaker_metrics": report["metrics"]}, indent=2, allow_nan=False))
        elif args.command == "evaluate":
            if args.output.suffix != ".json":
                raise ValueError("Evaluation output must have the .json extension.")
            if args.output.resolve() in {args.model.resolve(), Path(args.csv).resolve()}:
                raise ValueError("Evaluation output cannot overwrite the model or input dataset.")
            report = evaluate_external(
                VoiceClassifier.load(args.model), read_feature_csv(args.csv), dataset_name=args.dataset,
            )
            write_json(args.output, report)
            print(json.dumps(report["metrics"], indent=2, allow_nan=False))
        else:
            request = json.loads(args.input.read_text(encoding="utf-8"))
            if not isinstance(request, dict):
                raise ValueError("Prediction input must be a JSON object.")
            required = {"features", "age", "task", "quality_passed"}
            if set(request) != required or not isinstance(request["features"], dict):
                raise ValueError("Prediction input requires exactly features, age, task, and quality_passed.")
            result = VoiceClassifier.load(args.model).predict(**request)
            print(json.dumps(result, indent=2, allow_nan=False))
    except (OSError, ValueError, TypeError) as exc:
        parser.exit(2, f"error: {exc}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
