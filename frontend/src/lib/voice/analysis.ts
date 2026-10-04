import type { VoiceAnalysis, VoiceTask, VoiceTaskId } from "@/types/voice";
import { measureVowel, SAMPLE_RATE } from "@/lib/voice/acoustics";
import { classify, WINDOW_SAMPLES } from "@/lib/voice/classifier";

/**
 * Server-only: turns what the listener said during the show (16 kHz mono) and their sustained
 * "ahhh" into one VoiceAnalysis.
 *
 *   - Silences are cut out, so every four-second window the model listens to has a voice in it.
 *   - A task's number is the average over its windows (speech: a new window every 2 s; the vowel,
 *     which is steadier and shorter, every second).
 *   - The tasks are weighed together, the "ahhh" a little less than the talking, as in the
 *     screening this was calibrated on (sustained vowel 35 %, read-aloud speech 50 %; the third
 *     task there, rapid syllables 15 %, isn't part of this show, so the other two share its weight).
 *   - The "ahhh" is also where jitter, shimmer and HNR are measured (acoustics.ts).
 */

/**
 * At or above this combined number the voice is "flagged". It is the operating point of the v1
 * model, copied unrounded from `threshold` in the data_training branch
 * (backend/parkinsons/artifacts/releases/v1-italian-clinic/cv_report.json). A different model file
 * has its own threshold: change both together.
 */
export const DECISION_THRESHOLD = 0.6458601629247063;

const TASK_WEIGHTS: Record<VoiceTaskId, number> = { vowel: 0.35, speech: 0.5 };

/** Shorter than a window but at least this long is looped to fill one, so a short answer still gets a number. */
const MIN_LOOPED_SECONDS = 2;
/**
 * Windows per task are capped, evenly spread, so a long ramble costs a bounded amount. The cap
 * covers about 98 s of voice with no gaps (a show asks for 30 s or more, and 48 windows take well
 * under a second), so every answer the listener gave is heard in full.
 */
const MAX_WINDOWS = 48;
const HOP_SECONDS: Record<VoiceTaskId, number> = { speech: 2, vowel: 1 };

// ---------- cutting the silences out ----------------------------------------

const FRAME = Math.round(0.02 * SAMPLE_RATE); // 20 ms
const PADDING_FRAMES = 6; // keep 120 ms around every voiced frame, so words aren't clipped

/**
 * Keeps the stretches with a voice in them and drops the silences between. "Voice" is anything
 * louder than a tenth of how loud the loud parts are (and above the noise floor of a quiet room).
 */
export function withoutSilence(x: Float32Array): Float32Array {
  const frames = Math.floor(x.length / FRAME);
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * FRAME; i < (f + 1) * FRAME; i++) sum += x[i] * x[i];
    rms[f] = Math.sqrt(sum / FRAME);
  }

  const sorted = Array.from(rms).sort((a, b) => a - b);
  const loud = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  const threshold = Math.max(0.1 * loud, 0.002);

  const keep = new Uint8Array(frames);
  for (let f = 0; f < frames; f++) {
    if (rms[f] < threshold) continue;
    for (let g = Math.max(0, f - PADDING_FRAMES); g <= Math.min(frames - 1, f + PADDING_FRAMES); g++) keep[g] = 1;
  }

  const kept = keep.reduce((sum, flag) => sum + flag, 0);
  const out = new Float32Array(kept * FRAME);
  let at = 0;
  for (let f = 0; f < frames; f++) {
    if (!keep[f]) continue;
    out.set(x.subarray(f * FRAME, (f + 1) * FRAME), at);
    at += FRAME;
  }
  return out;
}

// ---------- four-second windows ---------------------------------------------

function windowsOf(x: Float32Array, hopSeconds: number): Float32Array[] {
  if (x.length < MIN_LOOPED_SECONDS * SAMPLE_RATE) return [];

  if (x.length < WINDOW_SAMPLES) {
    const looped = new Float32Array(WINDOW_SAMPLES);
    for (let i = 0; i < WINDOW_SAMPLES; i++) looped[i] = x[i % x.length];
    return [looped];
  }

  const hop = Math.round(hopSeconds * SAMPLE_RATE);
  const starts: number[] = [];
  for (let start = 0; start + WINDOW_SAMPLES <= x.length; start += hop) starts.push(start);
  if (starts[starts.length - 1] + WINDOW_SAMPLES < x.length) starts.push(x.length - WINDOW_SAMPLES); // the tail too

  const chosen =
    starts.length <= MAX_WINDOWS
      ? starts
      : Array.from({ length: MAX_WINDOWS }, (_, k) => starts[Math.round((k * (starts.length - 1)) / (MAX_WINDOWS - 1))]);
  return chosen.map((start) => x.slice(start, start + WINDOW_SAMPLES));
}

// ---------- all together ----------------------------------------------------

export type VoiceInput = {
  /** Everything said during the show, 16 kHz mono. */
  speech: Float32Array;
  /** The sustained "ahhh", 16 kHz mono. */
  vowel: Float32Array;
};

async function runTask(id: VoiceTaskId, audio: Float32Array): Promise<Omit<VoiceTask, "weight"> | null> {
  const voiced = withoutSilence(audio);
  const windows = windowsOf(voiced, HOP_SECONDS[id]);
  if (!windows.length) return null;
  const probabilities = await classify(windows);
  return {
    id,
    probability: probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length,
    seconds: voiced.length / SAMPLE_RATE,
    windows: windows.length,
  };
}

/** Returns null when there was too little voice in either recording for the classifier to listen to. */
export async function analyseVoice({ speech, vowel }: VoiceInput): Promise<VoiceAnalysis | null> {
  const [speechTask, vowelTask] = await Promise.all([runTask("speech", speech), runTask("vowel", vowel)]);
  const heard = [vowelTask, speechTask].filter((task): task is NonNullable<typeof task> => task !== null);
  if (!heard.length) return null;

  const total = heard.reduce((sum, task) => sum + TASK_WEIGHTS[task.id], 0);
  const tasks: VoiceTask[] = heard.map((task) => ({ ...task, weight: TASK_WEIGHTS[task.id] / total }));
  const probability = tasks.reduce((sum, task) => sum + task.probability * task.weight, 0);

  const measured = measureVowel(vowel);
  return {
    probability,
    threshold: DECISION_THRESHOLD,
    tasks,
    measures: measured && {
      jitter: measured.jitter,
      shimmer: measured.shimmer,
      hnr: measured.hnr,
      f0: measured.f0,
    },
  };
}
