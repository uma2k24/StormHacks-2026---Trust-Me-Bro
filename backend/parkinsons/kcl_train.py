"""Trains the MDVR-KCL model with repeated, subject-grouped nested cross-validation.

    python kcl_train.py --seed 0 --fold 0

With only 37 speakers, every choice here is aimed at not overfitting:
  * speakers are split, never recordings, so a voice is in exactly one of train/val/test
  * an inner validation split (held out from training) picks the decision threshold,
    so the test fold never influences anything
  * small network, mixup, vocal-tract warping, SpecAugment, microphone/noise augmentation
  * fixed schedule with EMA weights instead of early stopping, which would peek at val
  * repeated over several seeds, because single-split estimates on 37 people are noisy
"""

import argparse
import copy
import json
import random
import time

import numpy as np
import torch
import torch.nn.functional as F
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedKFold

from augment import augment
from config import ARTIFACTS_DIR, EVAL_HOP_SECONDS, SAMPLE_RATE, TRAIN_HOP_SECONDS, WINDOW_SAMPLES
from kcl_data import load_kcl, window_starts
from model import LogMelFrontend, PDNet, mel_warp, mixup, spec_augment
from train import window_at

N_FOLDS = 5
KCL_CV_DIR = ARTIFACTS_DIR / "kcl_cv"
TASK_WEIGHTS = {"ReadText": 0.5, "SpontaneousDialogue": 0.5}


def get_audio(buffer, rec) -> np.ndarray:
    return buffer[rec.offset : rec.offset + rec.length].astype(np.float32) / 32767.0


def subject_folds(recordings, seed: int) -> list[list[str]]:
    labels = {r.subject: r.label for r in recordings}
    subjects = np.array(sorted(labels))
    y = [labels[s] for s in subjects]
    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=seed)
    return [list(subjects[test]) for _, test in skf.split(subjects, y)]


def inner_split(recordings, train_subjects: list[str], seed: int, n_val_per_class: int = 3):
    """Holds out a few training speakers of each class for threshold selection."""
    labels = {r.subject: r.label for r in recordings}
    rng = random.Random(seed)
    val = []
    for label in (0, 1):
        pool = sorted(s for s in train_subjects if labels[s] == label)
        val += rng.sample(pool, n_val_per_class)
    return [s for s in train_subjects if s not in val], val


class Sampler:
    """Samples a speaker first, then one of their windows, so talkative speakers don't dominate."""

    def __init__(self, recordings, buffer, subjects: list[str]):
        self.buffer = buffer
        self.pool = {}
        for r in recordings:
            if r.subject in subjects:
                self.pool.setdefault((r.task, r.label), {}).setdefault(r.subject, []).append(r)
        self.starts = {
            r.path: window_starts(get_audio(buffer, r), WINDOW_SAMPLES, int(TRAIN_HOP_SECONDS * SAMPLE_RATE))
            for by_subject in self.pool.values()
            for recs in by_subject.values()
            for r in recs
        }
        self.keys = [k for k in self.pool if self.pool[k]]
        tasks = sorted({t for t, _ in self.keys})
        weights = np.array([TASK_WEIGHTS[t] for t in tasks])
        self.tasks, self.task_p = tasks, weights / weights.sum()

    def batch(self, size: int) -> tuple[torch.Tensor, torch.Tensor]:
        wavs, labels = [], []
        while len(wavs) < size:
            task = self.tasks[np.random.choice(len(self.tasks), p=self.task_p)]
            label = random.randint(0, 1)
            by_subject = self.pool.get((task, label))
            if not by_subject:
                continue
            rec = random.choice(by_subject[random.choice(list(by_subject))])
            start = int(random.choice(self.starts[rec.path]))
            jitter = int(TRAIN_HOP_SECONDS * SAMPLE_RATE)
            if rec.length > WINDOW_SAMPLES:
                start = min(start + random.randint(0, jitter), rec.length - WINDOW_SAMPLES)
            wavs.append(window_at(get_audio(self.buffer, rec), start))
            labels.append(label)
        return torch.from_numpy(np.stack(wavs)), torch.tensor(labels, dtype=torch.float32)


class EMA:
    """Exponential moving average of weights; steadier than the final iterate on small data."""

    def __init__(self, model, decay: float = 0.995):
        self.decay = decay
        self.shadow = copy.deepcopy(model).eval()
        for p in self.shadow.parameters():
            p.requires_grad_(False)

    @torch.no_grad()
    def update(self, model):
        for s, m in zip(self.shadow.state_dict().values(), model.state_dict().values()):
            if s.dtype.is_floating_point:
                s.mul_(self.decay).add_(m, alpha=1 - self.decay)
            else:
                s.copy_(m)


@torch.no_grad()
def predict(frontend, net, recordings, buffer) -> list[dict]:
    net.eval()
    hop = int(EVAL_HOP_SECONDS * SAMPLE_RATE)
    out = []
    for r in recordings:
        audio = get_audio(buffer, r)
        starts = window_starts(audio, WINDOW_SAMPLES, hop)
        windows = torch.from_numpy(np.stack([window_at(audio, int(s)) for s in starts]))
        probs = torch.cat([torch.sigmoid(net(frontend(w))) for w in windows.split(32)]).tolist()
        out.append(
            {
                "path": r.path,
                "subject": r.subject,
                "label": r.label,
                "task": r.task,
                "severity": r.severity,
                "prob": float(np.mean(probs)),
                "window_probs": probs,
            }
        )
    return out


def subject_means(rows):
    by_subject = {}
    for r in rows:
        by_subject.setdefault(r["subject"], []).append(r)
    return [(s, rs[0]["label"], float(np.mean([r["prob"] for r in rs]))) for s, rs in by_subject.items()]


def pick_threshold(val_rows) -> float:
    """Youden-J threshold on inner-validation speakers only."""
    subjects = subject_means(val_rows)
    y = np.array([s[1] for s in subjects])
    p = np.array([s[2] for s in subjects])
    scores = np.unique(p)
    if len(scores) < 2:
        return 0.5
    best_t, best_j = 0.5, -1.0
    for t in (scores[1:] + scores[:-1]) / 2:
        sens = np.sum((p >= t) & (y == 1)) / max(np.sum(y == 1), 1)
        spec = np.sum((p < t) & (y == 0)) / max(np.sum(y == 0), 1)
        if sens + spec - 1 > best_j:
            best_t, best_j = float(t), sens + spec - 1
    return best_t


def run(seed: int, fold: int, epochs: int, steps: int, batch: int, width: float, dropout: float) -> None:
    run_seed = seed * 100 + fold
    random.seed(run_seed)
    np.random.seed(run_seed)
    torch.manual_seed(run_seed)

    recordings, buffer = load_kcl()
    folds = subject_folds(recordings, seed)
    test_subjects = folds[fold]
    all_subjects = sorted({r.subject for r in recordings})
    train_pool = [s for s in all_subjects if s not in test_subjects]
    train_subjects, val_subjects = inner_split(recordings, train_pool, run_seed)

    sampler = Sampler(recordings, buffer, train_subjects)
    frontend, net = LogMelFrontend(), PDNet(dropout=dropout, width=width)
    ema = EMA(net)
    opt = torch.optim.AdamW(net.parameters(), lr=1.5e-3, weight_decay=5e-2)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=1.5e-3, total_steps=epochs * steps, pct_start=0.25)

    print(
        f"seed {seed} fold {fold}: train {len(train_subjects)} / val {len(val_subjects)} / test {len(test_subjects)} speakers "
        f"| params {sum(p.numel() for p in net.parameters())}",
        flush=True,
    )
    for epoch in range(epochs):
        net.train()
        t0, total, seen = time.time(), 0.0, 0
        for _ in range(steps):
            wav, y = sampler.batch(batch)
            with torch.no_grad():
                feats = mel_warp(spec_augment(frontend(augment(wav))))
            feats, y_soft = mixup(feats, y * 0.9 + 0.05)
            loss = F.binary_cross_entropy_with_logits(net(feats), y_soft)
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(net.parameters(), 5.0)
            opt.step()
            sched.step()
            ema.update(net)
            total += loss.item() * len(y)
            seen += len(y)
        print(f"seed {seed} fold {fold} epoch {epoch + 1}/{epochs} loss {total / seen:.4f} ({time.time() - t0:.0f}s)", flush=True)

    model = ema.shadow
    val_rows = predict(frontend, model, [r for r in recordings if r.subject in val_subjects], buffer)
    test_rows = predict(frontend, model, [r for r in recordings if r.subject in test_subjects], buffer)
    threshold = pick_threshold(val_rows)

    subjects = subject_means(test_rows)
    y, p = [s[1] for s in subjects], [s[2] for s in subjects]
    auc = float(roc_auc_score(y, p)) if len(set(y)) > 1 else None

    KCL_CV_DIR.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), KCL_CV_DIR / f"s{seed}_f{fold}.pt")
    (KCL_CV_DIR / f"s{seed}_f{fold}.json").write_text(
        json.dumps(
            {
                "seed": seed,
                "fold": fold,
                "threshold": threshold,
                "train_subjects": train_subjects,
                "val_subjects": val_subjects,
                "test_subjects": test_subjects,
                "val_rows": val_rows,
                "test_rows": test_rows,
            }
        )
    )
    print(f"seed {seed} fold {fold} done | test subject AUC {auc} | threshold {threshold:.3f}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--fold", type=int, default=0)
    parser.add_argument("--epochs", type=int, default=25)
    parser.add_argument("--steps", type=int, default=40)
    parser.add_argument("--batch", type=int, default=48)
    parser.add_argument("--width", type=float, default=0.5)
    parser.add_argument("--dropout", type=float, default=0.4)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    torch.set_num_threads(args.threads)
    run(args.seed, args.fold, args.epochs, args.steps, args.batch, args.width, args.dropout)
