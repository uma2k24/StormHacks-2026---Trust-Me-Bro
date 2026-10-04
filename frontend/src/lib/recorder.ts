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

export type EndReason = "silence" | "no-speech" | "limit";

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
};

export type Recorder = {
  /** While true, a pause doesn't end the answer (the person is holding the button). */
  setHeld(held: boolean): void;
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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    // blocked or missing: the show finds that out (and says so) when it first goes to listen
  }
}

/** Opens the microphone and starts recording. Rejects with a MicError when it can't. */
export async function startRecording(onEnd: (reason: EndReason) => void): Promise<Recorder> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new MicError("unavailable"); // an old browser, or a page that isn't https / localhost
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
  let ended = false;
  let context: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  try {
    context = new AudioContext();
    void context.resume();
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
  } catch {
    analyser = null; // no level meter: only the time limit and the Done button end the answer
  }

  const samples = new Float32Array(analyser?.fftSize ?? 0);
  const timer = window.setInterval(() => {
    const now = Date.now();
    if (analyser) {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const db = 20 * Math.log10(Math.sqrt(sum / samples.length) || 1e-8);
      if (db > SPEECH_DB) {
        if (!heardSpeech) firstLoudAt = now;
        heardSpeech = true;
        lastLoudAt = now;
      }
    }

    if (ended) return;
    const reason: EndReason | null =
      now - startedAt >= MAX_ANSWER_MS
        ? "limit"
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
