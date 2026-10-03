"""
Same-session test on MDVR-KCL (patients and healthy controls recorded on the same days, same room, same phone).

    python backend/pd_kcl.py ~/Downloads/26-29_09_2017_KCL

File names look like  ID02_pd_1_2_1.wav  (speaker, pd or hc, ...). The folder name is used to tell
reading from conversation if it contains "read" or "spont".

These are connected-speech recordings, not sustained vowels, so jitter and shimmer are NOT used
(they are only meaningful on a held vowel). The feature list is fixed before looking at any result.
There is no age or sex information, so a good score here could still be an age effect.
"""
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import parselmouth
import soundfile as sf
from parselmouth.praat import call
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

pd.set_option("display.width", 200)
pd.set_option("display.max_columns", 30)

VOICE = ["f0_mean_st", "f0_sd_st", "f0_range_st", "intensity_sd_db", "voiced_fraction", "pause_ratio", "hnr_mean"]
CHANNEL = ["level_db", "noise_floor_db"]
MAX_SECONDS = 60


def measure(path):
    x, sr = sf.read(str(path))
    if x.ndim > 1:
        x = x.mean(axis=1)
    x = x[int(sr): int(sr) * (1 + MAX_SECONDS)]  # skip the first second, use up to 60 s
    fr = int(0.025 * sr)
    n = len(x) // fr
    rms = np.sqrt((x[: n * fr].reshape(n, fr) ** 2).mean(axis=1)) + 1e-9
    out = {"level_db": 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9),
           "noise_floor_db": 20 * np.log10(np.percentile(rms, 10))}

    snd = parselmouth.Sound(x, sampling_frequency=sr)
    pitch = snd.to_pitch(time_step=0.01, pitch_floor=75, pitch_ceiling=500).selected_array["frequency"]
    voiced = pitch[pitch > 0]
    st = 12 * np.log2(voiced / 100.0) if len(voiced) else np.array([np.nan])
    out["f0_mean_st"] = np.nanmean(st)
    out["f0_sd_st"] = np.nanstd(st)
    out["f0_range_st"] = np.nanpercentile(st, 95) - np.nanpercentile(st, 5)
    out["voiced_fraction"] = len(voiced) / max(len(pitch), 1)

    inten = snd.to_intensity(minimum_pitch=100, time_step=0.01).values.flatten()
    speech = inten > (np.percentile(inten, 95) - 25)
    out["pause_ratio"] = 1 - speech.mean()
    out["intensity_sd_db"] = inten[speech].std() if speech.any() else np.nan

    try:
        out["hnr_mean"] = call(snd.to_harmonicity(), "Get mean", 0, 0)
    except Exception:
        out["hnr_mean"] = np.nan
    return out


def oof_speaker_auc(df, feats, repeats=20):
    """Average out-of-fold scores over several random speaker-level splits, then one score per speaker."""
    scores = np.zeros(len(df))
    for seed in range(repeats):
        cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=seed)
        for tr, te in cv.split(df[feats], df.y, df.speaker):
            m = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                              LogisticRegression(C=0.1, max_iter=2000))
            m.fit(df.iloc[tr][feats], df.iloc[tr].y)
            scores[te] += m.decision_function(df.iloc[te][feats])
    per = pd.DataFrame({"s": df.speaker, "y": df.y, "p": scores / repeats}).groupby("s").agg(y=("y", "first"), p=("p", "mean"))
    rng = np.random.default_rng(0)
    vals = []
    for _ in range(1000):
        i = rng.integers(0, len(per), len(per))
        if per.y.values[i].min() != per.y.values[i].max():
            vals.append(roc_auc_score(per.y.values[i], per.p.values[i]))
    return roc_auc_score(per.y, per.p), np.percentile(vals, [2.5, 97.5]), len(per)


if __name__ == "__main__":
    root = Path(sys.argv[1]).expanduser()
    rows = []
    for wav in sorted(p for p in root.rglob("*") if p.suffix.lower() == ".wav"):
        m = re.search(r"(ID\d+)_(hc|pd)", wav.name, re.IGNORECASE)
        if not m:
            print("skipping (cannot read label from name):", wav.name)
            continue
        path_text = str(wav.parent).lower()
        task = "read" if "read" in path_text else "spont" if "spont" in path_text else "all"
        r = {"speaker": m.group(1).upper(), "y": int(m.group(2).lower() == "pd"), "task": task}
        r.update(measure(wav))
        rows.append(r)
    df = pd.DataFrame(rows)
    if df.empty:
        sys.exit("No usable files. Check the folder path and the file names.")
    print(f"{len(df)} recordings from {df.speaker.nunique()} speakers "
          f"(healthy {df[df.y == 0].speaker.nunique()}, PD {df[df.y == 1].speaker.nunique()}); tasks: {df.task.value_counts().to_dict()}")
    print("\nAverage per group (recording level and noise should be similar if the session really was the same):")
    print(df.groupby("y")[CHANNEL + VOICE].mean().round(2).rename(index={0: "healthy", 1: "PD"}))

    print("\nSpeaker-level AUROC (average of 20 random speaker-level splits)")
    for label, feats in [("recording level and noise only", CHANNEL), ("voice measures", VOICE)]:
        a, (lo, hi), n = oof_speaker_auc(df, feats)
        print(f"  {label:<32} {a:.3f}  95% CI [{lo:.3f}, {hi:.3f}]  ({n} speakers)")
    for task in sorted(set(df.task)):
        sub = df[df.task == task].reset_index(drop=True)
        if len(set(df.task)) > 1 and sub.speaker.nunique() >= 10:
            a, (lo, hi), n = oof_speaker_auc(sub, VOICE)
            print(f"  voice measures, {task} only{'':<14} {a:.3f}  95% CI [{lo:.3f}, {hi:.3f}]  ({n} speakers)")
    print("\nNo age or sex is available, so even a high score does not rule out an age effect.")
