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

/** Reads a line aloud and resolves when it has finished (or was aborted). */
export async function speak(text: string, signal: AbortSignal): Promise<void> {
  const url = await Promise.race([
    prefetchClip(text),
    wait(CLIP_TIMEOUT_MS, signal).then(() => null),
  ]);
  if (signal.aborted) return;

  const player = audio;
  if (!url || !player) return wait(readingTime(text), signal);

  player.src = url;
  try {
    await player.play();
  } catch {
    return wait(readingTime(text), signal);
  }

  await new Promise<void>((resolve) => {
    const done = () => {
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
