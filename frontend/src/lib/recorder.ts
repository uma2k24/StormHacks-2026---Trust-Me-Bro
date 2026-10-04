import { MAX_ANSWER_MS, NO_SPEECH_MS, SILENCE_END_MS, SPEECH_DB } from "@/data/checkInScript";

/**
 * Records one spoken answer from the microphone. The mic is only open from startRecording until
 * stop() or cancel(), so the browser's recording indicator is on exactly while the radio listens.
 *
 * While recording it also listens for the end of the answer, like a voice assistant: a pause after
 * they have spoken, nothing at all for a long while, or the time limit all call onEnd, and the
 * screen then sends the answer. (While the button is held, only the time limit applies: the
 * person is in charge of when they are done. See setHeld.)
 * Mirrored in ios/VoiceReadiness/Models/AnswerRecorder.swift.
 */

export type MicProblem = "blocked" | "unavailable";

export class MicError extends Error {
  constructor(readonly problem: MicProblem) {
    super(`microphone ${problem}`);
  }
}

export type EndReason = "silence" | "no-speech" | "limit" | "target";

/** What the microphone heard, uncompressed (mono, at the sound card's own sample rate). */
export type RawAudio = { samples: Float32Array; sampleRate: number };

export type Recording = {
  blob: Blob;
  /** The whole recording, silence included. */
  durationMs: number;
  /** When the recording began (epoch ms). */
  startedAt: number;
  /** How long after it began they started speaking; null when no speech was ever picked up. */
  speechStartMs: number | null;
  /** From their first word to their last: how long they actually talked. */
  speechMs: number;
  /** Time actually spent talking: speechMs less the pauses between words and sentences. */
  voicedMs: number;
  /**
   * The same recording, uncompressed, for measuring the voice (the blob is squeezed for sending to
   * speech-to-text, which blurs the fine detail jitter and shimmer are made of). Null when the
   * browser can't give it, and the blob is analysed instead.
   */
  raw: RawAudio | null;
};

export type RecordOptions = {
  /**
   * Record the voice as it is: no echo cancelling, noise suppression or automatic gain, which would
   * flatten the very wobbles being measured. Used for the sustained "ahhh".
   */
  untouched?: boolean;
  /** Stop by itself once this much talking has been heard (the sustained "ahhh"). */
  voicedTargetMs?: number;
};

export type Recorder = {
  /** While true, a pause doesn't end the answer (the person is holding the button). */
  setHeld(held: boolean): void;
  /** How loud the microphone is right now, 0 (a quiet room) to 1 (loud talking), for the bars on screen. */
  level(): number;
  /** How long they have really been talking so far (pauses not counted), for the bar that shows how long to hold the "ahhh". */
  voicedMs(): number;
  /** Stops listening and resolves with what was recorded; the microphone is released. */
  stop(): Promise<Recording>;
  /** Stops and throws the recording away. */
  cancel(): void;
};

// Safari records MP4/AAC, Chrome and Firefox WebM/Opus. ElevenLabs reads all of them.
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/**
 * Asks for the microphone and lets go of it again. Called when the show starts, inside the tap on
 * Play, so the browser's permission question comes before the conversation and never in the middle
 * of it: after that the show listens and replies without anyone touching the screen.
 */
export async function primeMicrophone(): Promise<void> {
  try {
    // already answered, yes or no: there is nothing to ask, so Play goes straight on
    const permission = await navigator.permissions?.query({ name: "microphone" as PermissionName });
    if (permission && permission.state !== "prompt") return;
  } catch {
    // this browser can't say: ask
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    // blocked or missing: the show finds that out (and says so) when it first goes to listen
  }
}

// Copies what the microphone hears, 4096 samples at a time, to the page.
const TAP_WORKLET = `
class AnswerTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = new Float32Array(4096);
    this.filled = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.chunk[this.filled++] = channel[i];
      if (this.filled === this.chunk.length) {
        this.port.postMessage(this.chunk, [this.chunk.buffer]);
        this.chunk = new Float32Array(4096);
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor("answer-tap", AnswerTap);
`;

/** The chunks the tap sent, as one recording; null when there were none. */
function rawOf(chunks: Float32Array[], sampleRate: number): RawAudio | null {
  if (!chunks.length || !sampleRate) return null;
  const samples = new Float32Array(chunks.length * chunks[0].length);
  chunks.forEach((chunk, index) => samples.set(chunk, index * chunk.length));
  return { samples, sampleRate };
}

/** A pause shorter than this between words doesn't stop the clock on how long they have talked. */
const VOICED_HANGOVER_MS = 300;

// level(): this loud (dBFS) or quieter reads 0, this loud or louder reads 1
const LEVEL_FLOOR_DB = -55;
const LEVEL_FULL_DB = -15;

/** Opens the microphone and starts recording. Rejects with a MicError when it can't. */
export async function startRecording(
  onEnd: (reason: EndReason) => void,
  options: RecordOptions = {},
): Promise<Recorder> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new MicError("unavailable"); // an old browser, or a page that isn't https / localhost
  }

  let stream: MediaStream;
  try {
    const processing = !options.untouched;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: processing, noiseSuppression: processing, autoGainControl: processing },
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    throw new MicError(name === "NotAllowedError" || name === "SecurityError" ? "blocked" : "unavailable");
  }

  const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const startedAt = Date.now();
  recorder.start();

  // ---- listening for the end of the answer ----
  let held = false;
  let heardSpeech = false;
  let firstLoudAt = 0;
  let lastLoudAt = startedAt;
  let voicedMs = 0;
  let lastTickAt = startedAt;
  let ended = false;
  let context: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  const rawChunks: Float32Array[] = [];
  try {
    context = new AudioContext();
    void context.resume();
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);

    // the uncompressed copy; without it the compressed recording is analysed instead
    try {
      const url = URL.createObjectURL(new Blob([TAP_WORKLET], { type: "application/javascript" }));
      await context.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
      const tap = new AudioWorkletNode(context, "answer-tap", { numberOfOutputs: 1, outputChannelCount: [1] });
      tap.port.onmessage = (event: MessageEvent<Float32Array>) => rawChunks.push(event.data);
      source.connect(tap);
      tap.connect(context.destination); // it writes no output, so this is silent; it keeps the tap running
    } catch {
      // the compressed recording is analysed instead
    }
  } catch {
    analyser = null; // no level meter: only the time limit and the Done button end the answer
  }

  const samples = new Float32Array(analyser?.fftSize ?? 0);
  /** How loud the microphone is right now, in dBFS. */
  const loudness = (meter: AnalyserNode) => {
    meter.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) sum += sample * sample;
    return 20 * Math.log10(Math.sqrt(sum / samples.length) || 1e-8);
  };

  const timer = window.setInterval(() => {
    const now = Date.now();
    const sinceTick = now - lastTickAt;
    lastTickAt = now;
    if (analyser) {
      const db = loudness(analyser);
      if (db > SPEECH_DB) {
        if (!heardSpeech) firstLoudAt = now;
        heardSpeech = true;
        lastLoudAt = now;
      }
      if (heardSpeech && now - lastLoudAt < VOICED_HANGOVER_MS) voicedMs += sinceTick;
    }

    if (ended) return;
    const reason: EndReason | null =
      now - startedAt >= MAX_ANSWER_MS
        ? "limit"
        : options.voicedTargetMs && voicedMs >= options.voicedTargetMs
          ? "target"
          : held || !analyser
            ? null
            : heardSpeech && now - lastLoudAt >= SILENCE_END_MS
              ? "silence"
              : !heardSpeech && now - startedAt >= NO_SPEECH_MS
                ? "no-speech"
                : null;
    if (reason) {
      ended = true;
      onEnd(reason);
    }
  }, 100);

  const release = () => {
    window.clearInterval(timer);
    stream.getTracks().forEach((track) => track.stop());
    void context?.close().catch(() => {});
  };

  return {
    setHeld(next) {
      held = next;
      if (!next) lastLoudAt = Date.now(); // the pause starts counting from letting go
    },
    level() {
      if (!analyser || context?.state === "closed") return 0;
      const level = (loudness(analyser) - LEVEL_FLOOR_DB) / (LEVEL_FULL_DB - LEVEL_FLOOR_DB);
      return Math.min(1, Math.max(0, level));
    },
    voicedMs() {
      return voicedMs;
    },
    stop() {
      return new Promise<Recording>((resolve) => {
        const finish = () => {
          release();
          resolve({
            blob: new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }),
            durationMs: Date.now() - startedAt,
            startedAt,
            speechStartMs: heardSpeech ? firstLoudAt - startedAt : null,
            speechMs: heardSpeech ? lastLoudAt - firstLoudAt : 0,
            voicedMs,
            raw: rawOf(rawChunks, context?.sampleRate ?? 0),
          });
        };
        if (recorder.state === "inactive") return finish();
        recorder.onstop = finish;
        recorder.stop();
      });
    },
    cancel() {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
  };
}
