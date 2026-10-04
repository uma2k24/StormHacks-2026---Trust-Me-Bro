import path from "node:path";
import * as ort from "onnxruntime-node";

/**
 * Server-only: runs the voice classifier (frontend/models/parkinson_voice_classifier_v1.onnx, the
 * "v1" release of the data_training branch: its decision threshold is DECISION_THRESHOLD in analysis.ts).
 *
 * The model takes exactly four seconds of 16 kHz mono audio (64 000 samples, any loudness: it
 * normalises the level, builds its own spectrogram and standardises it inside the graph) and gives
 * back one number between 0 and 1: how much the voice resembles the Parkinson's group rather than
 * the healthy control group. Longer recordings are cut into four-second windows by analysis.ts.
 */

export const WINDOW_SAMPLES = 64000;

const MODEL_PATH = path.join(process.cwd(), "models", "parkinson_voice_classifier_v1.onnx");

// Kept on globalThis so a dev-server reload doesn't load the 6 MB model a second time.
const cache = globalThis as typeof globalThis & { __voiceModel?: Promise<ort.InferenceSession> };

function session(): Promise<ort.InferenceSession> {
  if (!cache.__voiceModel) {
    cache.__voiceModel = ort.InferenceSession.create(MODEL_PATH, { executionProviders: ["cpu"] }).catch((error) => {
      cache.__voiceModel = undefined; // try again next time rather than failing for good
      throw error;
    });
  }
  return cache.__voiceModel;
}

/** One probability (0...1) for each four-second window. */
export async function classify(windows: Float32Array[]): Promise<number[]> {
  if (!windows.length) return [];

  const batch = new Float32Array(windows.length * WINDOW_SAMPLES);
  windows.forEach((window, index) => {
    if (window.length !== WINDOW_SAMPLES) throw new Error(`a window must be ${WINDOW_SAMPLES} samples`);
    batch.set(window, index * WINDOW_SAMPLES);
  });

  const model = await session();
  const result = await model.run({ audio: new ort.Tensor("float32", batch, [windows.length, WINDOW_SAMPLES]) });
  const output = result.parkinsons_probability.data as Float32Array;
  return Array.from(output, (value) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5));
}
