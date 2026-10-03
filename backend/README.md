# Voice classifier

This feature consumes extracted voice measurements and predicts `pd_like` or
`control_like` voice patterns. It is a research prototype. The numeric
`classifier_score` is an uncalibrated model output, not a personal probability of
Parkinson's disease. No trained clinical model is included.

The application includes an adapted CADENCE recording interface, a shared
Parselmouth + openSMILE extractor, optional frozen Whisper/HuBERT/WavLM embeddings,
a manifest CLI, an audio-upload API, and optional Gemini-assisted reports.
The feature-level classifier API remains available for other extractors.

Start the local app, even before a real classifier is trained:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000` for CADENCE, or `/voice-lab` for the earlier UI, to
record or upload a WAV file. Without a model, the
app returns measurements and recording-quality feedback with `model_unavailable`
and no prediction. It never substitutes a synthetic or demo classifier.

See [CADENCE adaptation notes](../docs/CADENCE.md) for source attribution, the
replacement `/api/screen` and `/api/vowel` contracts, and why its bundled model
does not match this pipeline. The eight-stage protocol is Italian PVS training,
shared acoustic extraction, optional frozen embeddings, LR/RF baselines,
speaker-separated validation, 50+ coverage, independent task-matched MDVR-KCL
evaluation, and constrained Gemini-assisted reports.

## Frozen embedding experiments

Acoustic extraction remains the default and does not require Torch or download
model weights. Optional encoders require these additional dependencies:

```powershell
python -m pip install -r backend/requirements-embeddings.txt
python -m backend.classifier extract --manifest data/manifests/italian_pvs.csv --output data/features/italian_pvs.csv --embeddings whisper hubert wavlm
```

Each recording is resampled by the shared extractor to 16 kHz. The frozen audio
encoders run on CPU in inference mode, on consecutive 20-second chunks, using
the last hidden layer. Pooling returns the global frame-weighted mean and
population standard deviation; Whisper's padded frames are excluded. A final
tail under 100 ms is discarded. There is no transcription, fine tuning, learned
pooling, or dataset-wide normalization. Embeddings run only after signal quality
passes and the participant-only review flag is true.

| Profile | Checkpoint | Embedding columns |
| --- | --- | --- |
| `whisper` | `openai/whisper-tiny` (multilingual audio encoder) | 768 |
| `hubert` | `facebook/hubert-base-ls960` | 1536 |
| `wavlm` | `microsoft/wavlm-base-plus` | 1536 |

Immutable model revisions are in `backend/audio/embeddings.py`; the extraction
report records them, Torch/Transformers versions, pooling and chunk settings.
First use downloads weights to the standard Hugging Face cache. Extraction's
`--local-models-only` flag requires cached weights. Whisper uses safetensors;
the pinned HuBERT/WavLM publisher snapshots supply PyTorch weights, loaded with
the restricted `weights_only=True` loader (Torch 2.6+). Remote model code is
disabled. Checkpoint licenses/model cards remain
those of their respective publishers. Serving needs the optional dependencies
and weights when the artifact specifies embeddings; unavailable encoders return
HTTP 503. The saved profile recreates the same extraction signature at inference.

The `.features.json` output lists `acoustic` (9 Parselmouth), `egemaps` (88),
`combined` (97 acoustic), each requested encoder profile (97 plus that encoder),
and `all` (3937 when all three are enabled). Compare fixed baselines on the same
eligible speakers. Example commands after preparing a verified Italian manifest:

```powershell
python -m backend.classifier train --csv data/features/italian_pvs.ready.csv --dataset italian_pvs --task reading --feature-set combined --model logistic_regression --cv groupkfold --folds 5 --output backend/artifacts/acoustic_lr.joblib
python -m backend.classifier train --csv data/features/italian_pvs.ready.csv --dataset italian_pvs --task reading --feature-set combined --model random_forest --cv loso --output backend/artifacts/acoustic_rf.joblib
python -m backend.classifier train --csv data/features/italian_pvs.ready.csv --dataset italian_pvs --task reading --feature-set whisper --model logistic_regression --cv groupkfold --folds 5 --output backend/artifacts/whisper_lr.joblib
```

Repeat the last experiment with `hubert`, `wavlm`, then `all` only if justified
by training-cohort validation. `--feature-set` reads the sibling schema for both
the complete CSV and its `.ready.csv`; `--feature-schema` supplies another path.
All imputation and scaling remain inside speaker-separated folds. These are
fixed comparisons, not nested model selection; reported CV cannot be reused as
an unbiased estimate after choosing a winner.

Extract the verified, age-annotated MDVR manifest with the **same embedding
profile**, select matched reading recordings, and evaluate the selected frozen
artifact without refitting:

```powershell
python -m backend.classifier extract --manifest data/manifests/mdvr_kcl.csv --output data/features/mdvr_kcl.csv --embeddings whisper hubert wavlm
python -m backend.classifier evaluate --model backend/artifacts/whisper_lr.joblib --csv data/features/mdvr_kcl.ready.csv --dataset mdvr_kcl --output backend/artifacts/external_mdvr.json
$env:CLASSIFIER_MODEL_PATH = 'backend/artifacts/whisper_lr.joblib'
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

An artifact trained from an all-encoder extraction keeps that full extraction
profile even when its classifier uses a subset, to preserve the provenance
signature. For lighter serving, run extraction and training again with only the
encoder retained after the experiment. Do not tune encoders, hyperparameters or
thresholds on MDVR-KCL. Its ages and participant-only segments still need verified
metadata/review; the current manifest is not evaluation-ready. There is no real
trained model included in this adaptation.

## Setup

Run these commands from the repository root with Python 3.10 or later:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements-dev.txt
python -m unittest discover -s backend/tests -v
```

The development requirements add the HTTP test client. Runtime dependencies alone
are in `backend/requirements.txt`. Tested on Python 3.12.4, scikit-learn 1.7.2,
NumPy 2.2.6, pandas 2.3.3, FastAPI 0.111.0, and Pydantic 2.12.3.
Audio extraction uses pinned Parselmouth 0.4.7, openSMILE 2.6.0, and SoundFile
0.13.1. These packages were installed in the workspace `.venv` for validation.
Training and serving must use the same scikit-learn version. Freeze the complete
training environment alongside the model when handing it to another machine:

```powershell
New-Item -ItemType Directory -Force backend/artifacts
python -m pip freeze > backend/artifacts/environment.txt
```

## Dataset handoff

Provide one UTF-8 CSV row per recording or segment. Join the teammate's manifest
to the feature extractor output before training. Every segment, augmentation,
task, and recording from one person must retain the same `speaker_id`.

Required metadata:

| Column | Contract |
| --- | --- |
| `speaker_id` | Nonempty, globally unique person ID; use `italian_pvs:001`, `mdvr_kcl:001`, etc. Preserve a person's ID across datasets if they participate in both. |
| `label` | `0` = control, `1` = PD; consistent across the person's recordings. |
| `age` | Finite age in years, 0–120; no missing ages. Ages for a person cannot cross the age-50 gate within one CSV. |
| `task` | Consistent task vocabulary, e.g. `sustained_a`, `reading`, or `spontaneous`. |

`sex`, `file_path`, and `recording_id` can accompany the data for provenance and
later subgroup analysis. They are not classifier inputs. Age selects the cohort;
it is not a predictive feature. This module does not compute subgroup metrics.

Default acoustic feature columns:

| Column | Measurement and units |
| --- | --- |
| `jitter_local` | Local jitter as a fraction, not percentage points |
| `shimmer_local` | Local shimmer as a fraction, not dB or percentage points |
| `hnr_db` | Mean harmonics-to-noise ratio, dB |
| `f0_mean_hz` | Mean fundamental frequency, Hz |
| `f0_std_hz` | Standard deviation of fundamental frequency, Hz |
| `f1_mean_hz`, `f2_mean_hz`, `f3_mean_hz` | Mean formant frequencies, Hz |
| `mean_period_s` | Mean glottal period duration, seconds; it measures cycle duration, not cycle regularity |

An unavailable measurement may be blank in the CSV or `null` in JSON. Numeric
strings and infinities are rejected in the API. A recording with no measurements
is rejected. Every selected feature needs at least one measurement in the full
training cohort. Missing values are median-imputed inside each fold; a feature
missing throughout a training fold is retained with zero fill. The response lists
imputed measurements.

Use identical extractor settings, units, column names, and task definitions for
training and inference. The extractor writes an `extractor_signature` identifying
its configuration, versions, and feature schema. Training requires one signature
when that column is supplied, and external evaluation verifies it against the
trained artifact. Numeric-feature requests to `/classifier/predict` still rely on
the caller's explicit `quality_passed` flag. `/analyze` performs the signal checks
itself. **Only supply quality-passed, participant-only audio to training and
evaluation.** The CSV quality flag is enforced when present.

To add openSMILE measurements or one frozen embedding model, pass an explicit
`--features` list containing the desired CSV columns. The exact order and names
are saved with the artifact. All inference keys must match that feature set.
Metadata columns cannot be selected as voice features. The shared extractor
supports Parselmouth, openSMILE and the optional encoder profiles described
above. The upload API recreates the model's extraction profile and only scores
compatible features.

## Audio extraction and recording review

```powershell
python -m backend.classifier extract --manifest data/manifests/mdvr_kcl.csv --output data/features/mdvr_kcl.csv
```

Manifest `file_path` values are resolved relative to the current directory; use
`--audio-root` to select another base. The command writes:

- The complete feature CSV, retaining every source row, diagnosis label, speaker
  ID, task, unknown age, and extraction status.
- `.quality.json` with per-recording checks, counts, configuration, and versions.
- `.features.json` with the nine-column acoustic baseline and 97-column combined
  feature lists (nine Parselmouth measurements + 88 eGeMAPSv02 functionals).
- `.ready.csv` containing only quality-passed rows with known ages from 50–120.
  This can be empty; that is not a successful training cohort. Consult the full
  extraction report for exclusions before using this subset.

`data/features/` is gitignored. The initial local MDVR-KCL run processed all 73
files and populated all nine default acoustic features, but its ready subset is
empty: all ages are unknown and all recordings need speaker review.

For each recording, review the audio and set `speaker_verified=true` only after
confirming that the selected audio contains only the participant's voice.
Optional `start_s` and `end_s` columns select a participant-only interval. Bounds
must lie inside the file. Duplicate the manifest row for multiple annotated
intervals while preserving the original `speaker_id`; assign distinct
`recording_id` values. The extractor does not implement diarization or infer
speaker identity. After adding verified ages and reviewing intervals, rerun
extraction. Unknown review flags default to false; reruns never alter source audio.
`prepare-mdvr` creates review fields with false/default bounds. Keep a separate
copy of your annotated manifest: rerunning `prepare-mdvr` regenerates the recording
manifest, while `extract` preserves it.

Audio loading accepts WAV/WAVEX PCM or floating-point audio, mono/stereo, at
16–96 kHz. It averages stereo channels, removes DC, and uses polyphase resampling
to 16 kHz without gain normalization. It never silently truncates a recording;
selected intervals must be at most 300 seconds. Microphone capture produces
16-bit WAV at the browser's sample rate and stops at 60 seconds. Browser capture
requires localhost or HTTPS and microphone permission.

Engineering quality defaults, recorded in the report:

| Check | Default |
| --- | --- |
| Minimum selected duration | 2 seconds |
| Signal activity | At least 1 second of 25 ms frames above -45 dBFS RMS |
| Clipping | At most 0.5% of original samples with absolute amplitude >= 0.999 |
| Voiced audio | At least 0.5 seconds of Praat-detected voicing |

These are configurable engineering checks in `ExtractionConfig`, not validated
clinical cutoffs, background-noise estimates, or proof of speech content.
Failed recordings remain in the full output with null features. Unreviewed
recordings can have measurements but cannot pass the combined quality flag.

Pitch extraction uses 75–500 Hz and 10 ms steps. Formant analysis uses Burg with
a 5,500 Hz ceiling, sampled at voiced times. HNR uses Praat's cross-correlation
harmonicity. Jitter, shimmer, and mean period are measured within contiguous
voiced spans, split into windows of at most five seconds, and aggregated using
duration weights; pauses are not concatenated into artificial cycles. Period
factor 1.3 and amplitude factor 1.6 are measurement settings. Undefined
measurements remain null. Reading/spontaneous features describe connected speech
and must not be interpreted as sustained-vowel measures.

The configuration follows the
[Parselmouth API](https://parselmouth.readthedocs.io/en/stable/api_reference.html),
[Praat jitter definitions](https://www.fon.hum.uva.nl/praat/manual/PointProcess__Get_jitter__local____.html),
and [openSMILE eGeMAPSv02 usage](https://audeering.github.io/opensmile-python/usage.html).

## Training and comparing baselines

### Dataset currently on this branch: MDVR-KCL

`data/26-29_09_2017_KCL/` contains raw recordings in the MDVR-KCL layout.
The dataset's source description is available through the
[Zenodo record](https://zenodo.org/records/2867216) and its
[EU data catalogue entry](https://data.europa.eu/data/datasets/oai-zenodo-org-2867216).
The local file audit found:

| Task | HC recordings | PD recordings | Total |
| --- | --- | --- | --- |
| `reading` (`ReadText`) | 21 | 16 | 37 |
| `spontaneous` (`SpontaneousDialogue`) | 21 | 15 | 36 |

There are 37 distinct speakers: 21 HC and 16 PD. `ID18` has no spontaneous
recording in this checkout. The WAV headers report 44,100 Hz, mono, 24-bit PCM;
durations range from about 73 to 221 seconds. These are header observations,
not recording-quality checks. Ages and sex were not included in the added files.
The [DOI's registered source description](https://api.datacite.org/dois/10.5281/zenodo.2867216)
describes speaker IDs, HC/PD labels, and clinical scores in filenames, but supplies
no individual ages or sex metadata. The trailing numbers are clinical ratings,
not ages. It describes 16-bit acquisition; the local files' headers report 24-bit,
so audio loading must follow the actual local format.

Build or refresh the manifest and header audit with:

```powershell
python -m backend.classifier prepare-mdvr --root data/26-29_09_2017_KCL --output data/manifests/mdvr_kcl.csv
```

This writes `mdvr_kcl.csv`, `mdvr_kcl.audit.json`, and an initial
`mdvr_kcl.speakers.csv` demographic template. It assigns `label=0` for HC and
`label=1` for PD, verifies filename/folder agreement, and gives both recordings
from one person the same `mdvr_kcl:IDNN` speaker ID. It accepts the missing
separator in `ID22hc_0_0_0.wav`. The three trailing clinical scores in the
filenames are not imported as predictive features.

Fill the speaker template's ages from verified source metadata and add sex when
available. Unknown values must stay blank. Then join demographics into every
recording by running:

```powershell
python -m backend.classifier prepare-mdvr --root data/26-29_09_2017_KCL --metadata data/manifests/mdvr_kcl.speakers.csv --output data/manifests/mdvr_kcl.csv
```

The importer never overwrites an existing speaker template, even on reruns.
It accepts source IDs such as `ID00` or namespaced IDs such as `mdvr_kcl:ID00`.
The audit reports missing ages; it does not infer them from audio, IDs, or
clinical scores. The classifier still requires known ages to apply its 50+ gate.

This manifest contains metadata and audio headers. The `extract` command above
produces acoustic features and quality reports from it. In the original pipeline MDVR-KCL is the
independent external evaluation set; keep it out of training and model selection
to retain that role. Train on a separate, task-matched cohort. No sustained `/a/`
recordings are present in this folder.

### Baseline commands

```powershell
python -m backend.classifier train --csv data/italian_pvs_features.csv --dataset italian_pvs --task sustained_a --model logistic_regression --cv groupkfold --folds 5 --output backend/artifacts/logistic.joblib
python -m backend.classifier train --csv data/italian_pvs_features.csv --dataset italian_pvs --task sustained_a --model random_forest --cv groupkfold --folds 5 --output backend/artifacts/forest.joblib
```

For reading-based external evaluation, prepare and extract a separate Italian
reading manifest, then train both baselines using its `.ready.csv` and
`--task reading`. To compare the combined feature set, read the extraction schema
and explicitly pass its columns:

```powershell
$featureColumns = (Get-Content -Raw data/features/italian_pvs.features.json | ConvertFrom-Json).combined
python -m backend.classifier train --csv data/features/italian_pvs.ready.csv --dataset italian_pvs --task reading --features $featureColumns --model logistic_regression --folds 5 --output backend/artifacts/reading_combined.joblib
```

Use `--cv loso` for leave-one-speaker-out evaluation; `--folds` is only used for
GroupKFold. Nonmatching tasks and recordings under age 50 are excluded with
counts in the report. Missing ages fail validation rather than being silently
assigned a cohort. Each training fold must include both classes. If GroupKFold
produces a single-class training fold, the command fails with guidance; it never
falls back to random recording splits.

Both baselines use fixed hyperparameters and seed 42 by default. Logistic
Regression uses `C=1`, and Random Forest uses 200 trees, depth 6, and minimum leaf
size 2. Every fold fits its own imputer, missingness indicators, scaler, and
classifier. Training weights give each speaker equal total influence within a
class and balance classes by speaker counts. The metrics average recording scores
per speaker and use a fixed threshold of 0.5.

Each command writes a `.joblib` model and a sibling `.metrics.json` report with:

- Pooled out-of-fold speaker accuracy, balanced accuracy, sensitivity, specificity,
  F1, ROC AUC, and a confusion matrix with rows=true, columns=predicted, order=[control, PD].
- Fold membership and per-fold metrics. An undefined sensitivity, specificity,
  balanced accuracy, or ROC AUC is `null`, as can occur in single-class LOSO test folds.
- One held-out prediction per speaker, cohort exclusions, and model provenance.

The final saved model is refitted on all eligible training speakers after CV.
Metrics describe out-of-fold predictions, not that final model's training fit.
No hyperparameter search, feature selection, PCA, or automatic winner selection
is performed. Choose candidate features and settings using training data only.
If you add tuning, fit and select it inside nested speaker-separated folds.
Selecting the better baseline on these reports does not create an unbiased final
performance estimate; reserve an independent external test.

The preprocessing and grouping follow
[scikit-learn's cross-validation guidance](https://scikit-learn.org/stable/modules/cross_validation.html).

## External evaluation

```powershell
python -m backend.classifier evaluate --model backend/artifacts/reading_combined.joblib --csv data/features/mdvr_kcl.ready.csv --dataset mdvr_kcl --output backend/artifacts/mdvr_kcl.metrics.json
```

This loads the fixed model and never refits preprocessing or the classifier.
The dataset name must differ from the training dataset, and all supplied speaker
IDs must be disjoint from training IDs. IDs alone cannot detect a person renamed
in the manifest; verify participant independence upstream. The external CSV
must contain both classes among the age-eligible, task-matched speakers.

A `sustained_a` model cannot evaluate reading-only data. Train a separate model
with a comparable reading task for reading-based external validation. If the
external CSV has several tasks, only the trained task is evaluated and the
report records excluded rows. Matching a task label does not establish matching
language, microphone, demographics, or recording protocol. Keep the external set
out of feature selection, tuning, and model selection.

## Prediction API

```powershell
$env:CLASSIFIER_MODEL_PATH = "backend/artifacts/logistic.joblib"
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

- `GET /health`: model readiness. A running service with no usable artifact reports
  `model_unavailable` and prediction requests return HTTP 503.
- `GET /classifier/schema`: expected features, task, age gate, observed training
  age range, and score interpretation. No training speaker IDs are exposed.
- `POST /classifier/predict`: feature-level prediction; interactive API docs are
  at `http://127.0.0.1:8000/docs`.
- `GET /`: browser recording and upload UI; assets are served under `/static`.
- `GET /config`: public recording limits, model task, and Gemini availability.
- `POST /analyze`: multipart WAV upload with `file`, `age`, `task`,
  `speaker_verified`, and optional `use_gemini=false`. Computes quality and
  measurements through the same extractor used by the CLI.

`/analyze` limits uploads to 32 MiB, checks decoded duration and sample rate,
and closes uploaded files after processing. Raw audio is not persisted. Requests
under age 50 or outside a configured model's task skip extraction and inference.
Quality failures and unverified speakers return no prediction. Valid recordings
without a model return `model_unavailable` with measurements; a model trained
without the matching extractor signature returns `model_incompatible`. Use
fresh extracted CSVs to train artifacts for the upload path. Feature-only
prediction endpoints remain compatible with manually supplied features.

Example PowerShell upload:

```powershell
curl.exe -F "file=@voice.wav" -F "age=62" -F "task=reading" -F "speaker_verified=true" http://127.0.0.1:8000/analyze
```

Example request, with illustration-only measurements:

```json
{
  "age": 62,
  "task": "sustained_a",
  "quality_passed": true,
  "features": {
    "jitter_local": 0.008,
    "shimmer_local": 0.04,
    "hnr_db": 18.2,
    "f0_mean_hz": 145.0,
    "f0_std_hz": 4.1,
    "f1_mean_hz": 720.0,
    "f2_mean_hz": 1200.0,
    "f3_mean_hz": 2500.0,
    "mean_period_s": 0.0069
  }
}
```

You can also save that request to `request.json` and run:

```powershell
python -m backend.classifier predict --model backend/artifacts/logistic.joblib --input request.json
```

Successful responses include `status: "ok"`, `predicted_class`, `classifier_score`,
threshold, measurements, imputed features, quality flag, coverage, and limitations.
Age below 50 or a mismatched task returns `outside_model_coverage` with no score
or predicted class. A failed quality check returns `insufficient_recording_quality`
with no prediction. Invalid payloads or feature schemas return HTTP 422.
`control_like` is a training-label resemblance and does not establish absence of disease.
The age gate is a design restriction, not evidence that all users over 50 are
covered clinically; check the reported training age range and dataset composition.

## Reports

Every `/analyze` response contains a local report. To enable the optional Gemini
selector, set `GEMINI_API_KEY` and `GEMINI_MODEL` on the server before startup;
the model value must be a supported model identifier from your Google account.
The browser checkbox is off by default. `use_gemini=true` makes a request only
after a successful model prediction. Missing configuration, provider errors, or
invalid responses fall back to local explanations without losing the result.

Gemini receives only the recording task and measured default acoustic features.
Audio, age, speaker IDs, filenames, diagnosis labels, and classifier scores are
not sent. It returns up to three IDs from the supplied measurements; the server
rejects unknown IDs, duplicates, unavailable measurements, and free-text fields.
The application renders vetted explanations and factual measurement values.
Summary, coverage, quality, and disclaimer wording stay deterministic, so Gemini
cannot write a diagnosis or invent clinical thresholds in the displayed report.
Keys remain server-side. The REST implementation follows
[Google's generateContent API](https://ai.google.dev/api/generate-content).

Only load artifacts produced by trusted local training. Joblib uses pickle and
loading an untrusted artifact can execute code; no upload-model endpoint is
provided. Artifacts and evaluation reports can contain speaker IDs, so generated
files under `backend/artifacts/` are gitignored. The API is intended for local
integration; deployment access controls belong to the surrounding application.

Tests use generated numeric fixtures to verify software behavior, not recordings
or clinical validity, and generated WAV fixtures verify known pitch, mean period,
24-bit loading, stereo resampling, quality gates, uploads, and report fallbacks.
Real training and external evaluation require verified ages and speaker review.
The Italian training cohort is not currently present on this branch, and no
Gemini credentials are configured in the development environment.
The [public Italian PVS mirror](https://huggingface.co/datasets/birgermoell/Italian_Parkinsons_Voice_and_Speech/tree/main/italian_parkinson)
contains separate cohort directories and demographic workbooks; a future import
must verify its participant mappings, task codes, and ages against the source
documentation before using it for training. The generic manifest extraction CLI
can also consume your teammate's verified Italian manifest directly.
