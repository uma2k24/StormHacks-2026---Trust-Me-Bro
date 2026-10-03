"""
External test: train on the Italian sustained /a/ recordings, test on the Figshare phone recordings.

    python backend/pd_external.py --italian "../pd-data/data/Italian%20Parkinson%27s%20Voice%20and%20speech" --figshare ~/Downloads/23849127

Add  --features praat6  to use only the six Parselmouth measures (jitter, shimmer, HNR, pitch mean/std, CPPS).
     --features praat   uses the same without CPPS.   Default (all) adds a few openSMILE voice-quality measures.

The Figshare folder must contain PD_AH/, HC_AH/ and Demographics_age_sex.xlsx.
Needs:  pip install openpyxl scipy

Both sets are converted to 8 kHz mono and peak-normalised first, so sample rate and gain do not differ.
Only voice-quality and pitch features are used. The list is fixed before looking at any result.
"""
import argparse
from math import gcd
from pathlib import Path

import numpy as np
import opensmile
import pandas as pd
import parselmouth
import soundfile as sf
from parselmouth.praat import call
from scipy.signal import resample_poly
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

SR = 8000
SMILE_FEATURES = [
    "jitterLocal_sma3nz_amean",
    "shimmerLocaldB_sma3nz_amean",
    "HNRdBACF_sma3nz_amean",
    "F0semitoneFrom27.5Hz_sma3nz_amean",
    "F0semitoneFrom27.5Hz_sma3nz_stddevNorm",
]
PRAAT_FEATURES = ["jitter", "shimmer", "hnr", "f0_mean", "f0_std"]
PRAAT6 = PRAAT_FEATURES + ["cpps"]

smile = opensmile.Smile(
    feature_set=opensmile.FeatureSet.eGeMAPSv02,
    feature_level=opensmile.FeatureLevel.Functionals,
)


def load(path):
    x, sr = sf.read(str(path))
    if x.ndim > 1:
        x = x.mean(axis=1)
    if sr != SR:
        g = gcd(int(sr), SR)
        x = resample_poly(x, SR // g, int(sr) // g)
    return x / (np.abs(x).max() + 1e-9)


def praat_features(x):
    snd = parselmouth.Sound(x, sampling_frequency=SR)
    pp = call(snd, "To PointProcess (periodic, cc)", 75, 500)
    out = {k: np.nan for k in PRAAT_FEATURES}
    try:
        out["jitter"] = call(pp, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
        out["shimmer"] = call([snd, pp], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        out["hnr"] = call(snd.to_harmonicity(), "Get mean", 0, 0)
    except Exception:
        pass
    f0 = snd.to_pitch().selected_array["frequency"]
    f0 = f0[f0 > 0]
    out["f0_mean"] = f0.mean() if len(f0) else np.nan
    out["f0_std"] = f0.std() if len(f0) else np.nan
    try:
        pcg = call(snd, "To PowerCepstrogram", 60, 0.002, 4000, 50)
        out["cpps"] = call(pcg, "Get CPPS", "no", 0.02, 0.0005, 60, 330, 0.05, "parabolic", 0.001, 0, "Straight", "Robust")
    except Exception:
        out["cpps"] = np.nan
    return out


def features(path):
    x = load(path)
    s = smile.process_signal(x, SR).iloc[0].to_dict()
    row = {k: s.get(k, np.nan) for k in SMILE_FEATURES}
    row.update(praat_features(x))
    return row


def italian_table(root):
    rows = []
    for wav in sorted(Path(root).rglob("*.wav")):
        top = wav.relative_to(root).parts[0].lower()
        if not wav.name.upper().startswith("VA"):
            continue
        if "elderly" in top:
            y = 0
        elif "parkinson" in top:
            y = 1
        else:
            continue
        r = {"speaker": wav.parent.name, "y": y}
        r.update(features(wav))
        rows.append(r)
    return pd.DataFrame(rows)


def figshare_table(folder):
    folder = Path(folder)
    demo = pd.read_excel(folder / "Demographics_age_sex.xlsx")
    rows = []
    for _, d in demo.iterrows():
        name = str(d["Sample ID"]) + ".wav"
        wav = next((p for p in (folder / "PD_AH" / name, folder / "HC_AH" / name) if p.exists()), None)
        if wav is None:
            continue
        r = {"y": int(d["Label"] == "PwPD"), "age": float(d["Age"]), "sex": d["Sex"]}
        r.update(features(wav))
        rows.append(r)
    return pd.DataFrame(rows)


def new_model():
    return make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                         LogisticRegression(C=0.1, max_iter=2000))


def auc_ci(y, p, n=1000, seed=0):
    rng = np.random.default_rng(seed)
    y, p = np.asarray(y), np.asarray(p)
    vals = []
    for _ in range(n):
        i = rng.integers(0, len(y), len(y))
        if len(set(y[i])) == 2:
            vals.append(roc_auc_score(y[i], p[i]))
    return roc_auc_score(y, p), np.percentile(vals, [2.5, 97.5])


def report(label, y, score):
    a, (lo, hi) = auc_ci(y, score)
    print(f"  {label:<38} AUROC {a:.3f}  95% CI [{lo:.3f}, {hi:.3f}]")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--italian", required=True)
    ap.add_argument("--figshare", required=True)
    ap.add_argument("--features", default="all", choices=["all", "praat", "praat6"])
    args = ap.parse_args()
    cols = {"all": SMILE_FEATURES + PRAAT_FEATURES, "praat": PRAAT_FEATURES, "praat6": PRAAT6}[args.features]
    print("features used:", args.features, cols)

    ita = italian_table(args.italian)
    fig = figshare_table(Path(args.figshare).expanduser())
    print(f"Italian: {len(ita)} recordings, {ita.speaker.nunique()} speakers "
          f"({ita.groupby('y').speaker.nunique().to_dict()} by label 0=healthy, 1=PD)")
    print(f"Figshare: {len(fig)} recordings (PD {int(fig.y.sum())}, healthy {int((1 - fig.y).sum())})")
    print(f"Figshare age, healthy: {fig[fig.y == 0].age.mean():.1f} avg;  PD: {fig[fig.y == 1].age.mean():.1f} avg")

    # train on Italian, test on Figshare
    model = new_model().fit(ita[cols], ita.y)
    fig["score"] = model.decision_function(fig[cols])
    old = fig[fig.age >= 50]
    print("\nTrain on Italian, test on Figshare")
    report("all Figshare recordings", fig.y, fig.score)
    report(f"age >= 50 only (n={len(old)})", old.y, old.score)
    print("Reference: how well does age alone separate the same groups?")
    report("age alone, all", fig.y, fig.age)
    report("age alone, age >= 50", old.y, old.age)

    # train on Figshare (age >= 50), test on Italian, scored per speaker
    model2 = new_model().fit(old[cols], old.y)
    ita["score"] = model2.decision_function(ita[cols])
    per_speaker = ita.groupby("speaker").agg(y=("y", "first"), score=("score", "mean"))
    print("\nTrain on Figshare (age >= 50), test on Italian (one score per speaker)")
    report("Italian speakers", per_speaker.y, per_speaker.score)

    print("\nRule fixed in advance: only a transfer AUROC clearly above the age-alone line, with the interval "
          "above 0.5, counts as evidence of anything beyond age.")
