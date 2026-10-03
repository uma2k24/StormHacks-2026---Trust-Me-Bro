"""
Sanity checks for a suspiciously good result. Run after pd_eval.py (needs features.csv).

    python backend/pd_checks.py
"""
import re

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

df = pd.read_csv("features.csv")
df = df[df.group.isin(["elderly_healthy", "pd"])].reset_index(drop=True)
df["y"] = (df.group == "pd").astype(int)
cols = [c for c in df.columns if c not in ("file", "group", "speaker", "y")]


def speaker_auc(frame, feats, labels, seed=0):
    model = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                          LogisticRegression(C=0.1, max_iter=2000))
    cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=seed)
    p = cross_val_predict(model, frame[feats], labels, groups=frame.speaker, cv=cv,
                          method="predict_proba")[:, 1]
    d = pd.DataFrame({"s": frame.speaker, "y": labels, "p": p}).groupby("s").agg(y=("y", "first"), p=("p", "mean"))
    return roc_auc_score(d.y, d.p)


# 1. When were the groups recorded? (date is read from the end of the file name: ddmmyyyyhhmm)
def file_date(name):
    m = re.search(r"(\d{2})(\d{2})(\d{4})\d{4}\.+wav$", name)
    return pd.to_datetime(m.group(3) + m.group(2) + m.group(1), format="%Y%m%d", errors="coerce") if m else pd.NaT


df["date"] = df.file.map(file_date)
print("1. Recording dates per group (if the ranges do not overlap, the groups were recorded in different sessions)")
print(df.groupby("group")["date"].agg(["min", "max", "nunique"]))
print("   files without a readable date:", int(df.date.isna().sum()))

# 2. The result we are checking
real = speaker_auc(df, cols, df.y)
print(f"\n2. Speaker-level AUROC with all features: {real:.3f}")

# 3. Only loudness / recording-level features (these mostly reflect microphone gain and distance)
level_cols = [c for c in cols if "loudness" in c.lower() or "soundlevel" in c.lower()]
if level_cols:
    print(f"3. AUROC using only {len(level_cols)} loudness-level features: {speaker_auc(df, level_cols, df.y):.3f}")
    print("   (high here means the groups differ in recording level, not necessarily in voice)")

# 4. Shuffle the patient/healthy labels between speakers. A sound pipeline should give about 0.5.
rng = np.random.default_rng(0)
speakers = df.groupby("speaker").y.first()
perm = []
for i in range(100):
    shuffled = pd.Series(rng.permutation(speakers.values), index=speakers.index)
    perm.append(speaker_auc(df, cols, df.speaker.map(shuffled), seed=i))
perm = np.array(perm)
print(f"4. Shuffled-label AUROC: mean {perm.mean():.3f}, 95th percentile {np.percentile(perm, 95):.3f}, "
      f"runs at or above the real result: {(perm >= real).sum()} of 100")

# 5. Which single features separate the groups best (one value per speaker)?
means = df.groupby("speaker")[cols + ["y"]].mean().dropna(axis=1)
rows = []
for c in cols:
    if c in means.columns:
        a = roc_auc_score(means.y, means[c])
        rows.append((c, max(a, 1 - a), "higher in PD" if a > 0.5 else "lower in PD"))
top = sorted(rows, key=lambda r: -r[1])[:8]
print("\n5. Top single features by speaker-level AUROC")
for name, a, direction in top:
    print(f"   {a:.3f}  {name}  ({direction})")
print("   (mostly pitch features can mean the groups differ in sex or age rather than disease)")
