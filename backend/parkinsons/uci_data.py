"""Loads the UCI Parkinsons voice dataset (Little et al., 2007).

195 sustained-vowel recordings from 31 people (23 with Parkinson's). The subject is
encoded in the name column, e.g. phon_R01_S01_1 -> S01, and must be used for grouping:
the same person contributes about six recordings, so a random row split leaks identity
and inflates accuracy by roughly ten points.
"""

import re

import pandas as pd

from config import ROOT

UCI_DIR = ROOT / "data" / "uci_parkinsons"
DATA_FILE = UCI_DIR / "parkinsons.data"

# Every column the dataset ships, in file order.
ALL_FEATURES = [
    "MDVP:Fo(Hz)", "MDVP:Fhi(Hz)", "MDVP:Flo(Hz)",
    "MDVP:Jitter(%)", "MDVP:Jitter(Abs)", "MDVP:RAP", "MDVP:PPQ", "Jitter:DDP",
    "MDVP:Shimmer", "MDVP:Shimmer(dB)", "Shimmer:APQ3", "Shimmer:APQ5", "MDVP:APQ", "Shimmer:DDA",
    "NHR", "HNR",
    "RPDE", "DFA", "spread1", "spread2", "D2", "PPE",
]

# The subset Praat reproduces directly, so a microphone recording can be turned into
# the same numbers at inference time. RPDE/D2/spread1/spread2 are dropped because their
# published definitions are ambiguous and MDVP-specific.
PRAAT_FEATURES = [
    "MDVP:Fo(Hz)", "MDVP:Fhi(Hz)", "MDVP:Flo(Hz)",
    "MDVP:Jitter(%)", "MDVP:Jitter(Abs)", "MDVP:RAP", "MDVP:PPQ", "Jitter:DDP",
    "MDVP:Shimmer", "MDVP:Shimmer(dB)", "Shimmer:APQ3", "Shimmer:APQ5", "MDVP:APQ", "Shimmer:DDA",
    "NHR", "HNR",
]


def load_uci() -> pd.DataFrame:
    df = pd.read_csv(DATA_FILE)
    df["subject"] = df["name"].map(lambda n: re.search(r"_(S\d+)_", n).group(1))
    return df


if __name__ == "__main__":
    df = load_uci()
    by_subject = df.groupby("subject")["status"].first()
    print(f"{len(df)} recordings, {len(by_subject)} subjects "
          f"({int(by_subject.sum())} PD, {int((by_subject == 0).sum())} healthy)")
    print(f"recordings per subject: {df.groupby('subject').size().min()}-{df.groupby('subject').size().max()}")
    print(f"{len(ALL_FEATURES)} features, {len(PRAAT_FEATURES)} reproducible from Praat")
