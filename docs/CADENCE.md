# CADENCE adaptation

Source: https://github.com/ahammadshawki8/CADENCE, commit
`8ca105ffe330573312de9643069f689564f5287f`, inspected October 3, 2026.
Upstream author: Ahammad Shawki (`ahammadshawki8`). Upstream README declares
`license: mit`; that snapshot contains no separate LICENSE file.

`frontend/cadence/upstream.css`, `favicon.svg`, and the mascot markup in
`index.html` come from that snapshot. The local stylesheet, recording form,
result rendering, and API integration adapt its interface to this branch's
research pipeline. The original Voice Lab remains at `/voice-lab`.

The upstream trained joblib bundles, demo examples, claimed validation metrics,
SHAP narrative, risk bands, DDK thresholds, training scripts, and deployment
configuration are not used by this application. The upstream model pools Italian
and MDVR-KCL data. Our protocol trains on Italian PVS and reserves MDVR-KCL for
independent task-matched evaluation, so the upstream weights cannot implement it.

## Replacement contracts

Run `python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000` from the
repository root. `/` opens the adapted CADENCE interface. It uses the same
extractor and trusted model loader as `/analyze`, with no second prediction path.

| Route | Contract |
| --- | --- |
| `GET /api/health` | Model readiness, rather than a blanket success claim |
| `GET /api/config` | Model task, age coverage, embedding profile, Gemini availability |
| `POST /api/screen` | One WAV in `audio`, required `age` and `speaker_verified`, optional `task` (default `reading`) and `use_gemini` (default false) |
| `POST /api/vowel` | Same contract, task fixed to `sustained_a` |

Responses use `status`, nullable `classifier_score` and `predicted_class`, quality
checks, measurements and the constrained report. There is no disease probability
percentage, clinical risk band, or arbitrary healthy/PD biomarker cutoff. Missing
ages fail request validation. Ages below 50 and task mismatches return
`outside_model_coverage` without decoding/scoring. The 32 MiB upload limit applies
to every audio route, including streamed multipart bodies.

This is a deliberate change to CADENCE's API: original clients sending only
audio, multiple recordings, or expecting `probability`/risk-band fields must be
updated. The bundled adapted frontend implements the new contract. DDK is not a
classification task in the specified pipeline and has no endpoint here.

See [backend/README.md](../backend/README.md) for dataset preparation, optional
Whisper/HuBERT/WavLM extraction, baseline comparisons, external evaluation and
Gemini configuration. No upstream performance claim applies to these models.

## Validation of this adaptation

Validated on Python 3.12.4 with Torch 2.8.0+cpu and Transformers 4.57.6:
57 unit/API tests, JavaScript syntax check, and real loading/inference of all
three pinned encoders. A generated three-second waveform produced 3937 columns
(97 acoustic + 3840 embedding). A software-only synthetic classifier exercised
the adapted vowel API and speaker-level external evaluation with that profile.
These checks establish software behavior, not clinical accuracy. No browser
surface was available for visual or microphone-interaction testing.
