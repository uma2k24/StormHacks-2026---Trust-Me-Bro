import type { Recording } from "@/lib/recorder";
import type { VoiceAnalysis } from "@/types/voice";

/**
 * Browser side of the voice analysis: turns the recordings the show made (or audio files the listener
 * uploaded instead) into 16 kHz mono audio and sends them to /api/voice/analyze (the classifier and
 * the jitter / shimmer / HNR measures run on the server).
 * Mirrored in ios/VoiceReadiness/Models/VoiceAnalysis.swift, except for uploads: those are web-only.
 */

/** What the show recorded: everything said in answers, and the sustained "ahhh" (the best try). */
export type Captured = {
  speech: Recording[];
  vowel: Recording | null;
};

export type VoiceOutcome =
  | { status: "done"; analysis: VoiceAnalysis }
  /** The server heard too little voice to measure anything. */
  | { status: "too-quiet" }
  /** No backend, no model or a failed upload: the dashboard shows a sample instead. */
  | { status: "unavailable" };

const RATE = 16000;
const TIMEOUT_MS = 30000;
/** The most the server will take of each part (app/api/voice/analyze/route.ts); anything longer is cut off here. */
export const MAX_SPEECH_SECONDS = 180;
export const MAX_VOWEL_SECONDS = 30;

/** Resamples to 16 kHz with the browser's own (anti-aliased) resampler. */
async function resample(samples: Float32Array, sampleRate: number): Promise<Float32Array> {
  if (sampleRate === RATE) return samples;
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil((samples.length * RATE) / sampleRate)), RATE);
  const buffer = offline.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(new Float32Array(samples), 0);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

/**
 * Any audio file the browser can play (wav, mp3, m4a, ogg, flac...) as 16 kHz mono. Null when the
 * browser can't read it.
 */
export async function decodeAudio(file: Blob): Promise<Float32Array | null> {
  try {
    // decodeAudioData on a 16 kHz context hands back 16 kHz audio (resampled below if a browser doesn't)
    const decoded = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await file.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < mono.length; i++) mono[i] += data[i] / decoded.numberOfChannels;
    }
    return decoded.sampleRate === RATE ? mono : await resample(mono, decoded.sampleRate);
  } catch {
    return null;
  }
}

/** One recording as 16 kHz mono: the uncompressed copy when there is one, otherwise the decoded blob. */
async function audioOf(recording: Recording): Promise<Float32Array | null> {
  try {
    if (recording.raw) return await resample(recording.raw.samples, recording.raw.sampleRate);
  } catch {
    return null;
  }
  return decodeAudio(recording.blob);
}

/** 16-bit little-endian PCM, which is how the server wants it. Whatever runs past `maxSeconds` is left off. */
function pcm16(parts: Float32Array[], maxSeconds: number): Blob {
  const total = Math.min(
    parts.reduce((sum, part) => sum + part.length, 0),
    maxSeconds * RATE,
  );
  const pcm = new Int16Array(total);
  let at = 0;
  for (const part of parts) {
    for (let i = 0; i < part.length && at < total; i++) {
      pcm[at++] = Math.round(Math.max(-1, Math.min(1, part[i])) * 32767);
    }
  }
  return new Blob([pcm.buffer], { type: "application/octet-stream" });
}

/** Sends 16 kHz mono audio to the server: everything said, and the sustained "ahhh". */
async function submit(speech: Float32Array[], vowel: Float32Array[]): Promise<VoiceOutcome> {
  try {
    if (!speech.length && !vowel.length) return { status: "unavailable" };

    const form = new FormData();
    form.append("speech", pcm16(speech, MAX_SPEECH_SECONDS), "speech.pcm");
    form.append("vowel", pcm16(vowel, MAX_VOWEL_SECONDS), "vowel.pcm");

    const response = await fetch("/api/voice/analyze", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 422) return { status: "too-quiet" };
    if (!response.ok) return { status: "unavailable" };
    const analysis = (await response.json()) as VoiceAnalysis;
    return typeof analysis.probability === "number" && Array.isArray(analysis.tasks)
      ? { status: "done", analysis }
      : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

async function decodeAll(recordings: Recording[]): Promise<Float32Array[]> {
  const decoded = await Promise.all(recordings.map(audioOf));
  return decoded.filter((audio): audio is Float32Array => audio !== null);
}

/** Analyses what the show recorded. */
export async function analyseVoice(captured: Captured): Promise<VoiceOutcome> {
  try {
    const [speech, vowel] = await Promise.all([
      decodeAll(captured.speech),
      decodeAll(captured.vowel ? [captured.vowel] : []),
    ]);
    return submit(speech, vowel);
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * Audio the listener uploaded instead of talking to the radio, already decoded (see decodeAudio):
 * recordings of them talking, and optionally one of them holding an "ahhh".
 */
export type Upload = {
  speech: Float32Array[];
  vowel: Float32Array | null;
};

/** Analyses uploaded audio the same way as the show's own recordings. */
export function analyseUpload(upload: Upload): Promise<VoiceOutcome> {
  return submit(upload.speech, upload.vowel ? [upload.vowel] : []);
}
