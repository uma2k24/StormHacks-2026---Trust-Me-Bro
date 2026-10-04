import { readingTime } from "@/data/checkInScript";

/**
 * The radio's voice: plays ElevenLabs clips from /api/briefing/speech, one at a time.
 * When there is no voice (no key, offline, autoplay blocked) it waits out the reading time
 * instead, so the show still paces itself.
 */

// A zero-length WAV, played once inside a tap so later plays are allowed (Safari's autoplay rule).
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const CLIP_TIMEOUT_MS = 8000;

let audio: HTMLAudioElement | null = null;
let voiceUnavailable = false;
const clips = new Map<string, Promise<string | null>>();

/** Call from a tap handler (the Start button) before the show begins. */
export function unlockRadioVoice() {
  audio ??= new Audio();
  audio.src = SILENCE;
  audio.play().catch(() => {});
}

/** Starts fetching a line's audio. Resolves to an object URL, or null when there's no voice. */
export function prefetchClip(text: string): Promise<string | null> {
  if (voiceUnavailable) return Promise.resolve(null);

  let clip = clips.get(text);
  if (!clip) {
    clip = fetch("/api/briefing/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then(async (response) => {
        if (response.status === 503) voiceUnavailable = true;
        if (!response.ok) return null;
        return URL.createObjectURL(await response.blob());
      })
      .catch(() => null);
    clip.then((url) => {
      if (!url) clips.delete(text); // let a later attempt try again
    });
    clips.set(text, clip);
  }
  return clip;
}

/** Resolves once a line's audio is ready (or has taken too long), so its text and voice can start together. */
export async function prepareClip(text: string, signal: AbortSignal): Promise<void> {
  await Promise.race([prefetchClip(text), wait(CLIP_TIMEOUT_MS, signal)]);
}

/**
 * Reads a line aloud and resolves when it has finished (or was aborted). `onProgress` is told how
 * far through the line the voice is (0...1) many times a second, so its words can appear as they
 * are said. Without audio it paces itself over the reading time instead, so the words still arrive.
 */
export async function speak(
  text: string,
  signal: AbortSignal,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const url = await Promise.race([
    prefetchClip(text),
    wait(CLIP_TIMEOUT_MS, signal).then(() => null),
  ]);
  if (signal.aborted) return;

  const player = audio;
  if (!url || !player) return pace(text, signal, onProgress);

  player.src = url;
  try {
    await player.play();
  } catch {
    return pace(text, signal, onProgress);
  }

  onProgress?.(0);
  const ticker = window.setInterval(() => {
    if (player.duration > 0 && Number.isFinite(player.duration)) {
      onProgress?.(Math.min(1, player.currentTime / player.duration));
    }
  }, 50);

  await new Promise<void>((resolve) => {
    const done = () => {
      window.clearInterval(ticker);
      player.removeEventListener("ended", done);
      player.removeEventListener("error", done);
      signal.removeEventListener("abort", stop);
      resolve();
    };
    const stop = () => {
      player.pause();
      done();
    };
    player.addEventListener("ended", done);
    player.addEventListener("error", done);
    signal.addEventListener("abort", stop);
  });
  if (!signal.aborted) onProgress?.(1);
}

/**
 * Reads something aloud because the listener asked (the voice summary): the radio's voice when there
 * is one, otherwise the device's own voice, so pressing Play is never silent. Call unlockRadioVoice()
 * in the same tap. `onProgress` works as it does for speak().
 */
export async function readAloud(
  text: string,
  signal: AbortSignal,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const url = await Promise.race([
    prefetchClip(text),
    wait(CLIP_TIMEOUT_MS, signal).then(() => null),
  ]);
  if (signal.aborted) return;
  if (url && audio) return speak(text, signal, onProgress);
  if (typeof window.speechSynthesis !== "undefined") return deviceVoice(text, signal, onProgress);
  return pace(text, signal, onProgress);
}

/** The browser's built-in voice, a touch slower than usual. */
function deviceVoice(
  text: string,
  signal: AbortSignal,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    let settled = false;
    // some browsers never report the end (or have no voices at all): give up after twice the reading time
    const safety = window.setTimeout(() => finish(), readingTime(text) * 2);
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(safety);
      signal.removeEventListener("abort", stop);
      if (!signal.aborted) onProgress?.(1);
      resolve();
    };
    const stop = () => {
      synth.cancel();
      finish();
    };
    utterance.onboundary = (event) => {
      if (event.name === "word") onProgress?.(event.charIndex / text.length);
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    signal.addEventListener("abort", stop);
    synth.cancel();
    onProgress?.(0);
    synth.speak(utterance);
  });
}

/** No voice: the line stays up for about as long as it takes to read, with its words arriving over that time. */
async function pace(
  text: string,
  signal: AbortSignal,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const ms = readingTime(text);
  const startedAt = Date.now();
  onProgress?.(0);
  const ticker = window.setInterval(
    () => onProgress?.(Math.min(1, (Date.now() - startedAt) / ms)),
    50,
  );
  await wait(ms, signal);
  window.clearInterval(ticker);
  if (!signal.aborted) onProgress?.(1);
}

/** Resolves after `ms`, or straight away once aborted. */
export function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const id = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(id);
        resolve();
      },
      { once: true },
    );
  });
}
