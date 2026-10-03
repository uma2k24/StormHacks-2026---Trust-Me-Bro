# Voice classifier

This feature consumes extracted voice measurements and predicts `pd_like` or
`control_like` voice patterns. It is a research prototype. The numeric
`classifier_score` is an uncalibrated model output, not a personal probability of
Parkinson's disease. No trained clinical model or patient data is included.

The classifier is independent of audio extraction and Gemini: those stages can
use the CSV and JSON contracts below. The frontend directory is currently empty.

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
Training and serving must use the same scikit-learn version. Freeze the complete
training environment alongside the model when handing it to another machine:

```powershell
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
training and inference. This module cannot verify extractor provenance or audio
quality from numeric features. **Only supply recordings that passed upstream
quality checks to training and evaluation.** Inference requires the caller's
explicit `quality_passed` flag; the API does not assess the recording itself.

To add openSMILE measurements or one frozen embedding model, pass an explicit
`--features` list containing the desired CSV columns. The exact order and names
are saved with the artifact. All inference keys must match that feature set.
Metadata columns cannot be selected as voice features. Extraction of Parselmouth,
openSMILE, Whisper, HuBERT, and WavLM features is outside this module.

## Training and comparing baselines

```powershell
python -m backend.classifier train --csv data/italian_pvs_features.csv --dataset italian_pvs --task sustained_a --model logistic_regression --cv groupkfold --folds 5 --output backend/artifacts/logistic.joblib
python -m backend.classifier train --csv data/italian_pvs_features.csv --dataset italian_pvs --task sustained_a --model random_forest --cv groupkfold --folds 5 --output backend/artifacts/forest.joblib
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
python -m backend.classifier evaluate --model backend/artifacts/logistic.joblib --csv data/mdvr_kcl_features.csv --dataset mdvr_kcl --output backend/artifacts/mdvr_kcl.metrics.json
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

Gemini can consume this structured response as report context. It must explain
only supplied measurements and model results, preserve coverage/quality statuses
and limitations, and avoid invented clinical thresholds, diagnoses, or personal
disease probabilities. This feature does not call Gemini.

Only load artifacts produced by trusted local training. Joblib uses pickle and
loading an untrusted artifact can execute code; no upload-model endpoint is
provided. Artifacts and evaluation reports can contain speaker IDs, so generated
files under `backend/artifacts/` are gitignored. The API is intended for local
integration; deployment access controls belong to the surrounding application.

Tests use generated numeric fixtures to verify software behavior, not recordings
or clinical validity. Real training and external evaluation remain dependent on
the teammate's data and manifest.
