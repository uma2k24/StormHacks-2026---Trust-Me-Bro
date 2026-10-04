"""Try the exported model on a WAV file or a live microphone recording.

    python predict.py path/to/audio.wav [more.wav ...]
    python predict.py --record 15

Uses the ONNX export, which is the same network as the iOS .mlmodel, and the same
window selection as ParkinsonVoiceScreener.swift.
"""

import argparse
import json

import librosa
import numpy as np
import onnxruntime as ort

from config import ARTIFACTS_DIR, EVAL_HOP_SECONDS, SAMPLE_RATE, WINDOW_SAMPLES
from kcl_data import window_starts
from train import window_at


def screen(session, audio: np.ndarray) -> list[float]:
    audio = audio - audio.mean()
    starts = window_starts(audio, WINDOW_SAMPLES, int(EVAL_HOP_SECONDS * SAMPLE_RATE))
    windows = np.stack([window_at(audio, int(s)) for s in starts]).astype(np.float32)
    return session.run(None, {"audio": windows})[0].tolist()


def current_threshold() -> float:
    """Threshold of whichever model is currently exported."""
    kcl, italian = ARTIFACTS_DIR / "kcl_report.json", ARTIFACTS_DIR / "cv_report.json"
    if kcl.exists():
        return json.loads(kcl.read_text())["mean_nested_threshold"]
    return json.loads(italian.read_text())["threshold"]


def report(name: str, probs: list[float], seconds: float, threshold: float) -> None:
    p = float(np.mean(probs))
    verdict = "FLAGGED (Parkinsonian voice pattern)" if p >= threshold else "not flagged"
    print(f"\n{name}  ({seconds:.1f}s, {len(probs)} windows)")
    print(f"  probability {p:.3f}  threshold {threshold:.3f}  -> {verdict}")
    print("  per-window:", " ".join(f"{x:.2f}" for x in probs))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="*")
    parser.add_argument("--record", type=float, metavar="SECONDS", help="record from the microphone")
    parser.add_argument("--device", help="input device index or name substring (see --list-devices)")
    parser.add_argument("--list-devices", action="store_true")
    args = parser.parse_args()
    if args.list_devices:
        import sounddevice as sd

        for i, d in enumerate(sd.query_devices()):
            if d["max_input_channels"] > 0 and d["hostapi"] == 0:
                print(f"{i}: {d['name']}")
        return
    if not args.files and not args.record:
        parser.error("give WAV files or --record SECONDS")

    session = ort.InferenceSession(str(ARTIFACTS_DIR / "parkinson_voice_classifier.onnx"))
    threshold = current_threshold()

    if args.record:
        import sounddevice as sd

        device = int(args.device) if args.device and args.device.isdigit() else args.device
        print(f"Recording {args.record:.0f}s from {sd.query_devices(device, 'input')['name']}...")
        print("Speak now: read a passage aloud, or hold an 'aaah' for about 10 seconds.")
        audio = sd.rec(int(args.record * SAMPLE_RATE), samplerate=SAMPLE_RATE, channels=1, dtype="float32", device=device)
        sd.wait()
        audio = audio[:, 0]
        if np.sqrt(np.mean(audio**2)) < 1e-3:
            print("Warning: recording is nearly silent; check your microphone.")
        report("microphone", screen(session, audio), len(audio) / SAMPLE_RATE, threshold)

    for path in args.files:
        audio, _ = librosa.load(path, sr=SAMPLE_RATE, mono=True)
        if len(audio) < SAMPLE_RATE:
            print(f"\n{path}: skipped, need at least 1 second of audio")
            continue
        report(path, screen(session, audio), len(audio) / SAMPLE_RATE, threshold)


if __name__ == "__main__":
    main()
