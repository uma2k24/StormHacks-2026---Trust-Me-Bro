"""
Second round of checks: can information that has nothing to do with the voice
(microphone level, background noise, clip length) separate the two groups?

    python backend/pd_checks2.py          (run from the repo root, after pd_eval.py)
"""
import numpy as np
import pandas as pd
import soundfile as sf
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

df = pd.read_csv("features.csv")
df = df[df.group.isin(["elderly_healthy", "pd"])].reset_index(drop=True)
df["y"] = (df.group == "pd").astype(int)


def channel_features(path):
    x, sr = sf.read(path)
    if x.ndim > 1:
        x = x.mean(axis=1)
    frame = int(0.025 * sr)
    n = len(x) // frame
    rms = np.sqrt((x[: n * frame].reshape(n, frame) ** 2).mean(axis=1)) + 1e-9
    return {
        "duration": len(x) / sr,
        "peak": float(np.abs(x).max()),
        "level_db": float(20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9)),
        "noise_floor_db": float(20 * np.log10(np.percentile(rms, 10))),
        "dc": float(abs(x.mean())),
    }


chan = pd.DataFrame([channel_features(f) for f in df.file])
df = pd.concat([df, chan], axis=1)

print("Average per group (clip length, level, background noise):")
print(df.groupby("group")[["duration", "level_db", "noise_floor_db", "peak"]].mean().round(2))


def speaker_auc(feats):
    model = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                          LogisticRegression(C=0.1, max_iter=2000))
    cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=0)
    p = cross_val_predict(model, df[feats], df.y, groups=df.speaker, cv=cv, method="predict_proba")[:, 1]
    d = pd.DataFrame({"s": df.speaker, "y": df.y, "p": p}).groupby("s").agg(y=("y", "first"), p=("p", "mean"))
    return roc_auc_score(d.y, d.p)


def pick(*words):
    return [c for c in df.columns if any(w in c.lower() for w in words)
            and c not in ("file", "group", "speaker", "y")]


subsets = {
    "recording channel only (level, noise floor, peak, DC)": ["level_db", "noise_floor_db", "peak", "dc"],
    "clip length only": ["duration"],
    "jitter, shimmer, HNR only": pick("jitter", "shimmer", "hnr"),
    "pitch (F0) only": pick("f0"),
}
print("\nSpeaker-level AUROC for each feature group:")
for name, feats in subsets.items():
    if feats:
        print(f"  {speaker_auc(feats):.3f}  {name}  ({len(feats)} features)")
print("\nHigh values for the first two lines mean the groups differ in how they were recorded.")
