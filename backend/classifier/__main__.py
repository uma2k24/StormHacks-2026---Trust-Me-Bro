"""Run with python -m backend.classifier from the repository root."""

import argparse
import json
from pathlib import Path

import pandas as pd

from .core import MODEL_NAMES, VoiceClassifier, evaluate_external, train
from .data import DEFAULT_FEATURES, read_feature_csv
from .mdvr import prepare_mdvr


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Research voice classifier; consumes extracted feature CSVs.")
    commands = parser.add_subparsers(dest="command", required=True)
    extraction = commands.add_parser("extract", help="Extract Parselmouth + eGeMAPSv02 features and a quality report from a manifest.")
    extraction.add_argument("--manifest", type=Path, required=True)
    extraction.add_argument("--audio-root", type=Path, default=Path("."), help="Base for manifest file_path values; default is current directory.")
    extraction.add_argument("--output", type=Path, required=True, help="Feature CSV destination.")
    extraction.add_argument("--embeddings", nargs="+", choices=("whisper", "hubert", "wavlm"), default=[],
                            help="Optional frozen encoder features; downloads pinned weights on first use.")
    extraction.add_argument("--local-models-only", action="store_true", help="Require already cached encoder weights.")
    preparation = commands.add_parser("prepare-mdvr", help="Build an MDVR-KCL manifest and header audit; unknown ages stay blank.")
    preparation.add_argument("--root", type=Path, required=True, help="Directory containing ReadText and SpontaneousDialogue.")
    preparation.add_argument("--metadata", type=Path, help="Verified speaker_id/age/sex CSV, one row per person.")
    preparation.add_argument("--output", type=Path, required=True, help="Recording manifest .csv destination.")
    training = commands.add_parser("train", help="Evaluate a fixed baseline using speaker-separated CV, then save it.")
    training.add_argument("--csv", required=True)
    training.add_argument("--dataset", required=True, help="Provenance name, e.g. italian_pvs.")
    training.add_argument("--task", required=True, help="Exact task string in the CSV.")
    training.add_argument("--model", choices=MODEL_NAMES, default="logistic_regression")
    training.add_argument("--features", nargs="+", default=list(DEFAULT_FEATURES), help="Explicit numeric feature columns.")
    training.add_argument("--feature-set", help="Named set in the CSV's sibling .features.json; overrides --features.")
    training.add_argument("--feature-schema", type=Path, help="Explicit feature-set JSON; otherwise inferred from the CSV name.")
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
        if args.command == "extract":
            from backend.audio.batch import extract_manifest
            from backend.audio import AudioExtractor

            if args.output.suffix != ".csv" or args.output.resolve() == args.manifest.resolve():
                raise ValueError("Feature output must be a .csv distinct from the input manifest.")
            report_path = args.output.with_suffix(".quality.json")
            schema_path = args.output.with_suffix(".features.json")
            ready_path = args.output.with_suffix(".ready.csv")
            if args.manifest.resolve() in {path.resolve() for path in (report_path, schema_path, ready_path)}:
                raise ValueError("Extraction outputs cannot overwrite the input manifest.")
            import sys

            def progress(count, total, status):
                print(f"Extracted {count}/{total}: {status}", file=sys.stderr, flush=True)

            extractor = AudioExtractor(embedding_models=args.embeddings, local_files_only=args.local_models_only)
            frame, report = extract_manifest(read_feature_csv(str(args.manifest)), audio_root=args.audio_root,
                                             extractor=extractor, progress=progress)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            frame.to_csv(args.output, index=False)
            ages = pd.to_numeric(frame["age"], errors="coerce")
            ready = frame.loc[frame["quality_passed"] & ages.between(50, 120)].copy()
            ready.to_csv(ready_path, index=False)
            report["ready_recording_count"] = len(ready)
            write_json(report_path, report)
            write_json(schema_path, report["feature_sets"])
            print(json.dumps({"features": str(args.output), "quality_report": str(report_path),
                              "feature_sets": str(schema_path), "recordings": len(frame),
                              "ready_features": str(ready_path), "ready_recordings": len(ready),
                              "status_counts": report["status_counts"]}, indent=2))
        elif args.command == "prepare-mdvr":
            if args.output.suffix != ".csv":
                raise ValueError("Manifest output must have the .csv extension.")
            if args.metadata is not None and args.output.resolve() == args.metadata.resolve():
                raise ValueError("Manifest output cannot overwrite the input speaker metadata.")
            metadata = read_feature_csv(str(args.metadata)) if args.metadata is not None else None
            manifest, speakers, audit = prepare_mdvr(args.root, metadata)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            manifest.to_csv(args.output, index=False)
            template = args.output.with_suffix(".speakers.csv")
            # Never overwrite demographics that a teammate has filled in.
            if not template.exists():
                speakers.to_csv(template, index=False)
            audit_path = args.output.with_suffix(".audit.json")
            write_json(audit_path, audit)
            print(json.dumps({"manifest": str(args.output), "speaker_template": str(template),
                              "audit": str(audit_path), "recordings": audit["recording_count"],
                              "speakers": audit["speaker_count"],
                              "speakers_missing_age": len(audit["missing_age_speaker_ids"])}, indent=2))
        elif args.command == "train":
            if args.output.suffix != ".joblib":
                raise ValueError("Training output must have the .joblib extension.")
            if args.output.resolve() == Path(args.csv).resolve():
                raise ValueError("Training output cannot overwrite its input dataset.")
            features = args.features
            if args.feature_set:
                csv_path = Path(args.csv)
                schema_path = args.feature_schema or csv_path.with_suffix(".features.json")
                if args.feature_schema is None and csv_path.stem.endswith(".ready"):
                    schema_path = csv_path.with_name(csv_path.stem.removesuffix(".ready") + ".features.json")
                schema = json.loads(schema_path.read_text(encoding="utf-8"))
                if not isinstance(schema, dict) or args.feature_set not in schema:
                    raise ValueError("Requested feature set is not in the CSV's .features.json schema.")
                features = schema[args.feature_set]
            model, report = train(
                read_feature_csv(args.csv), task=args.task, dataset_name=args.dataset,
                model_name=args.model, feature_names=features,
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
