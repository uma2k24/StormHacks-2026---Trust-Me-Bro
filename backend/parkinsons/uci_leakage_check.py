"""Shows why the usual ~95% accuracy claims on this dataset do not hold up.

    python uci_leakage_check.py

The 195 rows come from 32 people, about six recordings each. Splitting rows at random
puts the same voice in train and test, so the model can recognise the speaker instead
of the disease. Splitting people apart removes that shortcut.
"""

import numpy as np
from sklearn.ensemble import ExtraTreesClassifier
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold, StratifiedKFold

from uci_data import ALL_FEATURES, load_uci

N_SEEDS = 10


def run(df, grouped: bool) -> tuple[float, float]:
    X = df[ALL_FEATURES].to_numpy(dtype=float)
    y = df["status"].to_numpy(dtype=int)
    groups = df["subject"].to_numpy()

    accs, aucs = [], []
    for seed in range(N_SEEDS):
        oof = np.zeros(len(y))
        if grouped:
            splitter = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=seed).split(X, y, groups)
        else:
            splitter = StratifiedKFold(n_splits=5, shuffle=True, random_state=seed).split(X, y)
        for train_idx, test_idx in splitter:
            model = ExtraTreesClassifier(n_estimators=300, min_samples_leaf=2, random_state=0)
            model.fit(X[train_idx], y[train_idx])
            oof[test_idx] = model.predict_proba(X[test_idx])[:, 1]
        accs.append(float(((oof >= 0.5) == (y == 1)).mean()))
        aucs.append(float(roc_auc_score(y, oof)))
    return float(np.mean(accs)), float(np.mean(aucs))


if __name__ == "__main__":
    df = load_uci()
    leaky_acc, leaky_auc = run(df, grouped=False)
    honest_acc, honest_auc = run(df, grouped=True)
    print(f"random row split (same speaker in train and test): accuracy {leaky_acc:.3f}  AUC {leaky_auc:.3f}")
    print(f"subject-grouped split (speakers held out):          accuracy {honest_acc:.3f}  AUC {honest_auc:.3f}")
    print(f"inflation from leakage: {100 * (leaky_acc - honest_acc):.1f} accuracy points")
