"""Subject-grouped cross-validation training across all corpora.

    python train.py --fold 0                 # one CV fold -> artifacts/cv/fold0.{pt,json}
    python train.py --all-folds              # every fold sequentially
    python train.py --holdout-source mdvr    # train without MDVR-KCL, test on all of it -> artifacts/holdout_mdvr.json

Every model is evaluated only on people it never heard during training; the CV
fold models are averaged into the shipped ensemble (export.py).
"""

import argparse
import json
import random
import time

import numpy as np
import torch
import torch.nn.functional as F
from sklearn.model_selection import StratifiedKFold

from augment import augment
from config import ARTIFACTS_DIR, EVAL_HOP_SECONDS, SAMPLE_RATE, SOURCE_WEIGHTS, TASK_GROUPS, TRAIN_HOP_SECONDS, WINDOW_SAMPLES
from data import get_audio, load_cache, valid_window_starts
from model import LogMelFrontend, PDNet, spec_augment

N_FOLDS = 5
CV_DIR = ARTIFACTS_DIR / "cv"


def subject_folds(recordings, seed: int = 42) -> list[set[str]]:
    groups = {}
    for r in recordings:
        groups[r.subject] = r.group
    subjects = sorted(groups)
    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=seed)
    return [set(np.array(subjects)[test]) for _, test in skf.split(subjects, [groups[s] for s in subjects])]


def window_at(audio: np.ndarray, start: int) -> np.ndarray:
    if len(audio) < WINDOW_SAMPLES:
        audio = np.tile(audio, int(np.ceil(WINDOW_SAMPLES / max(len(audio), 1))))
    return audio[start : start + WINDOW_SAMPLES]


class BalancedSampler:
    """Draws source, then label, then task, then subject.

    Within a source that has both classes, labels are 50/50 and tasks are drawn
    only from those both classes performed, so recording setup, task mix, and
    per-subject recording counts carry no label information.
    """

    def __init__(self, recordings, buffers, subjects: set[str]):
        self.buffers = buffers
        self.pool = {}
        for r in recordings:
            if r.subject in subjects:
                self.pool.setdefault(r.source, {}).setdefault(r.label, {}).setdefault(r.task_group, {}).setdefault(r.subject, []).append(r)
        self.starts = {
            r.path: valid_window_starts(get_audio(buffers, r), WINDOW_SAMPLES, int(TRAIN_HOP_SECONDS * SAMPLE_RATE))
            for r in recordings
            if r.subject in subjects
        }
        self.sources = sorted(self.pool)
        w = np.array([SOURCE_WEIGHTS[s] for s in self.sources])
        self.source_p = w / w.sum()
        self.tasks = {}
        for s, by_label in self.pool.items():
            shared = set.intersection(*(set(by_task) for by_task in by_label.values()))
            names = [t for t in TASK_GROUPS if t in shared]
            tw = np.array([TASK_GROUPS[t] for t in names])
            self.tasks[s] = (names, tw / tw.sum())

    def batch(self, size: int) -> tuple[torch.Tensor, torch.Tensor]:
        wavs, labels = [], []
        for _ in range(size):
            source = self.sources[np.random.choice(len(self.sources), p=self.source_p)]
            label = random.choice(sorted(self.pool[source]))
            names, p = self.tasks[source]
            task = names[np.random.choice(len(names), p=p)]
            by_subject = self.pool[source][label][task]
            rec = random.choice(by_subject[random.choice(list(by_subject))])
            start = int(random.choice(self.starts[rec.path]))
            if rec.length > WINDOW_SAMPLES:
                start = min(start + random.randint(0, int(TRAIN_HOP_SECONDS * SAMPLE_RATE)), rec.length - WINDOW_SAMPLES)
            wavs.append(window_at(get_audio(self.buffers, rec), start))
            labels.append(label)
        return torch.from_numpy(np.stack(wavs)), torch.tensor(labels, dtype=torch.float32)


@torch.no_grad()
def predict_recordings(frontend, net, recordings, buffers) -> list[dict]:
    net.eval()
    out = []
    hop = int(EVAL_HOP_SECONDS * SAMPLE_RATE)
    for r in recordings:
        audio = get_audio(buffers, r)
        starts = valid_window_starts(audio, WINDOW_SAMPLES, hop)
        wins = torch.from_numpy(np.stack([window_at(audio, int(s)) for s in starts]))
        probs = torch.cat([torch.sigmoid(net(frontend(w))) for w in wins.split(64)]).tolist()
        out.append(
            {
                "path": r.path,
                "subject": r.subject,
                "group": r.group,
                "label": r.label,
                "source": r.source,
                "task": r.task,
                "task_group": r.task_group,
                "orig_sr": r.orig_sr,
                "window_probs": probs,
            }
        )
    return out


def train_model(train_subjects, recordings, buffers, epochs, steps_per_epoch, batch_size, tag) -> tuple[LogMelFrontend, PDNet]:
    sampler = BalancedSampler(recordings, buffers, train_subjects)
    frontend, net = LogMelFrontend(), PDNet()
    opt = torch.optim.AdamW(net.parameters(), lr=2e-3, weight_decay=1e-2)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=2e-3, total_steps=epochs * steps_per_epoch, pct_start=0.15)
    for epoch in range(epochs):
        net.train()
        t0, total, correct, seen = time.time(), 0.0, 0, 0
        for _ in range(steps_per_epoch):
            wav, y = sampler.batch(batch_size)
            with torch.no_grad():
                feats = spec_augment(frontend(augment(wav)))
            logits = net(feats)
            loss = F.binary_cross_entropy_with_logits(logits, y * 0.9 + 0.05)
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            total += loss.item() * len(y)
            correct += ((logits > 0).float() == y).sum().item()
            seen += len(y)
        print(f"{tag} epoch {epoch + 1}/{epochs} loss {total / seen:.4f} train-acc {correct / seen:.3f} ({time.time() - t0:.0f}s)", flush=True)
    return frontend, net


def seed_all(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def run_fold(fold: int, args) -> None:
    seed_all(args.seed + fold)
    recordings, buffers = load_cache()
    test_subjects = subject_folds(recordings)[fold]
    train_subjects = {r.subject for r in recordings} - test_subjects
    print(f"fold {fold}: {len(train_subjects)} train / {len(test_subjects)} test subjects", flush=True)
    frontend, net = train_model(train_subjects, recordings, buffers, args.epochs, args.steps, args.batch, f"fold {fold}")
    CV_DIR.mkdir(parents=True, exist_ok=True)
    torch.save(net.state_dict(), CV_DIR / f"fold{fold}.pt")
    preds = predict_recordings(frontend, net, [r for r in recordings if r.subject in test_subjects], buffers)
    (CV_DIR / f"fold{fold}.json").write_text(json.dumps(preds))
    print(f"fold {fold} done", flush=True)


def run_holdout(source: str, args) -> None:
    seed_all(args.seed + 100)
    recordings, buffers = load_cache()
    train_subjects = {r.subject for r in recordings if r.source != source}
    print(f"holdout {source}: {len(train_subjects)} train subjects", flush=True)
    frontend, net = train_model(train_subjects, recordings, buffers, args.epochs, args.steps, args.batch, f"holdout {source}")
    preds = predict_recordings(frontend, net, [r for r in recordings if r.source == source], buffers)
    (ARTIFACTS_DIR / f"holdout_{source}.json").write_text(json.dumps(preds))
    print(f"holdout {source} done", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--fold", type=int)
    parser.add_argument("--all-folds", action="store_true")
    parser.add_argument("--holdout-source")
    parser.add_argument("--epochs", type=int, default=35)
    parser.add_argument("--steps", type=int, default=50)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    torch.set_num_threads(args.threads)
    if args.holdout_source:
        run_holdout(args.holdout_source, args)
    else:
        for f in range(N_FOLDS) if args.all_folds else [args.fold]:
            run_fold(f, args)
