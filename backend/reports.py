"""Reports rendered from verified facts; Gemini can only select vetted explanations."""

import json
import os
import re

import httpx

EXPLANATIONS = {
    "jitter_local": ("Local jitter", "fraction", "Variation between consecutive vocal-fold cycle durations."),
    "shimmer_local": ("Local shimmer", "fraction", "Variation in amplitude between consecutive vocal-fold cycles."),
    "hnr_db": ("Harmonics-to-noise ratio", "dB", "The balance of periodic voice energy and noise."),
    "f0_mean_hz": ("Mean pitch", "Hz", "The average fundamental frequency in voiced parts of this recording."),
    "f0_std_hz": ("Pitch variation", "Hz", "The spread of pitch in voiced parts; its meaning depends on the speech task."),
    "f1_mean_hz": ("First formant", "Hz", "An estimated vocal-tract resonance frequency during voiced speech."),
    "f2_mean_hz": ("Second formant", "Hz", "An estimated vocal-tract resonance frequency during voiced speech."),
    "f3_mean_hz": ("Third formant", "Hz", "An estimated vocal-tract resonance frequency during voiced speech."),
    "mean_period_s": ("Mean glottal period", "seconds", "Average vocal-fold cycle duration; this alone does not measure regularity."),
}
SUMMARIES = {
    "outside_model_coverage": "This recording is outside the model's age or recording-task coverage. No prediction was made.",
    "insufficient_recording_quality": "The recording did not pass the quality checks. No prediction was made; resolve the listed checks and record again.",
    "needs_speaker_review": "Confirm that the selected audio contains only the participant's voice. No prediction was made.",
    "model_unavailable": "Audio measurements are available, but no trained model is configured. No prediction was made.",
    "model_incompatible": "The configured model does not match this feature extractor. No prediction was made.",
}
DISCLAIMER = "Research prototype. This result is not a diagnosis, and the classifier score is not a personal probability of Parkinson's disease."


def gemini_configured() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY") and os.environ.get("GEMINI_MODEL"))


def build_report(result: dict, *, use_gemini: bool = False) -> dict:
    status = result["status"]
    features = result.get("features", result.get("measurements", {}))
    available = {name: features[name] for name in EXPLANATIONS if features.get(name) is not None}
    selected = list(available)[:3]
    source, provider_status = "template", "not_requested"
    if use_gemini:
        provider_status = "not_configured"
        if gemini_configured() and status == "ok":
            try:
                selected = select_explanations(available, result.get("task"))
                source, provider_status = "gemini", "ok"
            except (httpx.HTTPError, ValueError, KeyError, TypeError, IndexError):
                provider_status = "unavailable_or_invalid_response"
        elif gemini_configured():
            provider_status = "skipped_for_nonprediction"
    summary = SUMMARIES.get(status, "No prediction was made.")
    if status == "ok":
        classification = result.get("predicted_class")
        summary = "The model classified this voice pattern as " + (
            "PD-like." if classification == "pd_like" else "control-like."
        ) + " This describes resemblance to training labels and does not establish whether a person has Parkinson's disease."
    return {
        "source": source, "provider_status": provider_status, "summary": summary,
        "observations": [
            {"feature": name, "label": EXPLANATIONS[name][0], "value": available[name],
             "unit": EXPLANATIONS[name][1], "explanation": EXPLANATIONS[name][2]}
            for name in selected
        ],
        "disclaimer": DISCLAIMER,
    }


def select_explanations(available: dict, task: str | None) -> list[str]:
    model = os.environ["GEMINI_MODEL"]
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,100}", model):
        raise ValueError("Invalid Gemini model identifier.")
    # No audio, names, age, diagnosis, scores, or manifest paths leave the server.
    context = {"recording_task": task, "measurements": available}
    payload = {
        "systemInstruction": {"parts": [{"text":
            "Select up to three supplied measurement IDs for a plain-language explanation. "
            "These are unvalidated research measurements. Do not infer a diagnosis, normal ranges, "
            "clinical thresholds, risk, or disease probability. Return only JSON with a feature_ids "
            "array containing distinct IDs present in the supplied measurements. No free text."}]},
        "contents": [{"role": "user", "parts": [{"text": json.dumps(context, allow_nan=False)}]}],
        "generationConfig": {"temperature": 0, "maxOutputTokens": 256, "responseMimeType": "application/json"},
    }
    with httpx.Client(timeout=15, trust_env=False) as client:
        response = client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]}, json=payload,
        )
        response.raise_for_status()
    parts = response.json()["candidates"][0]["content"]["parts"]
    text = "".join(part.get("text", "") for part in parts if not part.get("thought"))
    value = json.loads(text)
    if not isinstance(value, dict) or set(value) != {"feature_ids"}:
        raise ValueError("Unexpected report selection response.")
    selected = value["feature_ids"]
    if not isinstance(selected, list) or not 1 <= len(selected) <= 3 or any(not isinstance(name, str) for name in selected):
        raise ValueError("Invalid explanation selection.")
    if len(set(selected)) != len(selected) or any(name not in available for name in selected):
        raise ValueError("Explanation selection included unknown or unavailable measurements.")
    return selected
