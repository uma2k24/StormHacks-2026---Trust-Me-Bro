"""
Parkinson's voice evaluation: honest, speaker-level, age-matched.

Expected layout: the folder that holds the wav files is one speaker
(works for group/speaker/*.wav and group/batch/speaker/*.wav).
Group folder names are matched by keyword: "young", "elderly", "parkinson".

Run:  python pd_eval.py "path/to/dataset" --prefix VA     (only the sustained /a/ files)
Delete features.csv before changing --prefix, because it is saved and reused.
If features.csv already exists you can skip the path:  python pd_eval.py --prefix VA
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import opensmile
import pandas as pd
import parselmouth
from parselmouth.praat import call
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import KFold, StratifiedGroupKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

GROUP_KEYWORDS = {"young": "young_healthy", "elderly": "elderly_healthy", "parkinson": "pd"}

smile = opensmile.Smile(
    feature_set=opensmile.FeatureSet.eGeMAPSv02,
    feature_level=opensmile.FeatureLevel.Functionals,
)


def praat_features(path):
    # jitter, shimmer, HNR and pitch from Praat
    snd = parselmouth.Sound(str(path))
    pp = call(snd, "To PointProcess (periodic, cc)", 75, 500)
    out = {"jitter": np.nan, "shimmer": np.nan, "hnr": np.nan}
    try:
        out["jitter"] = call(pp, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
        out["shimmer"] = call([snd, pp], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        out["hnr"] = call(snd.to_harmonicity(), "Get mean", 0, 0)
    except Exception:
        pass  # very short or unvoiced clips can fail
    f0 = snd.to_pitch().selected_array["frequency"]
    f0 = f0[f0 > 0]
    out["f0_mean"] = f0.mean() if len(f0) else np.nan
    out["f0_std"] = f0.std() if len(f0) else np.nan
    return out


def find_group(path, root):
    parts = [p.lower() for p in path.relative_to(root).parts]
    for key, name in GROUP_KEYWORDS.items():
        if key in parts[0]:
            return name
    return None


def name_ok(filename, prefix):
    # keep a file only if its name starts with one of the prefixes, e.g. "VA" or "VA,VE"
    if not prefix:
        return True
    return filename.upper().startswith(tuple(p.strip().upper() for p in prefix.split(",")))


def build_table(root, prefix=None):
    rows = []
    for wav in sorted(root.rglob("*.wav")):
        group = find_group(wav, root)
        if group is None or not name_ok(wav.name, prefix):
            continue
        speaker = wav.parent.name  # the folder that holds this person's files
        row = {"file": str(wav), "group": group, "speaker": f"{group}/{speaker}"}
        row.update(smile.process_file(str(wav)).iloc[0].to_dict())
        row.update(praat_features(wav))
        rows.append(row)
    return pd.DataFrame(rows)


def speaker_auc(df, prob):
    d = df.assign(prob=prob).groupby("speaker").agg(y=("y", "first"), prob=("prob", "mean"))
    return roc_auc_score(d.y, d.prob), d


def bootstrap_ci(d, n=1000, seed=0):
    rng = np.random.default_rng(seed)
    vals = []
    for _ in range(n):
        s = d.sample(len(d), replace=True, random_state=int(rng.integers(10**9)))
        if s.y.nunique() == 2:
            vals.append(roc_auc_score(s.y, s.prob))
    return np.percentile(vals, [2.5, 97.5])


def main(root, prefix):
    cache = Path("features.csv")
    if cache.exists():
        df = pd.read_csv(cache)
    else:
        if root is None:
            sys.exit("No features.csv found. Give the dataset path: python pd_eval.py \"path\"")
        df = build_table(Path(root), prefix)
        df.to_csv(cache, index=False)

    if prefix:  # keep only files whose name starts with the prefix, e.g. VA
        df = df[[name_ok(Path(f).name, prefix) for f in df.file]]

    print(df.groupby("group").agg(recordings=("file", "count"), speakers=("speaker", "nunique")))
    print("\nExample files and the speaker each one was given:")
    print(df[["file", "speaker"]].head(3).to_string(index=False))

    # age-matched: elderly healthy vs Parkinson's only
    df = df[df.group.isin(["elderly_healthy", "pd"])].reset_index(drop=True)
    df["y"] = (df.group == "pd").astype(int)
    feature_cols = [c for c in df.columns if c not in ("file", "group", "speaker", "y")]
    X, y, groups = df[feature_cols], df.y, df.speaker

    model = make_pipeline(SimpleImputer(strategy="median"), StandardScaler(),
                          LogisticRegression(C=0.1, max_iter=2000))

    # honest: folds split by speaker
    cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=0)
    p = cross_val_predict(model, X, y, groups=groups, cv=cv, method="predict_proba")[:, 1]
    auc, d = speaker_auc(df, p)
    lo, hi = bootstrap_ci(d)
    print(f"\nSpeaker-level AUROC (speaker-independent): {auc:.3f}  95% CI [{lo:.3f}, {hi:.3f}]")

    # leaky: folds split by recording (same speaker in train and test)
    p_leaky = cross_val_predict(model, X, y, cv=KFold(5, shuffle=True, random_state=0),
                                method="predict_proba")[:, 1]
    print(f"Leaky AUROC (split by recording, do NOT report): {roc_auc_score(y, p_leaky):.3f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("root", nargs="?", default=None)
    ap.add_argument("--prefix", default=None, help='file name prefix, e.g. VA or "VA,VE,VI,VO,VU"')
    args = ap.parse_args()
    main(args.root, args.prefix)
