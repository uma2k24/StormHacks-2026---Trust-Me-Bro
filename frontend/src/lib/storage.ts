import { useSyncExternalStore } from "react";
import {
  DEFAULT_TEXT_SIZE,
  isInterestId,
  isTextSize,
  type Profile,
  type TextSize,
} from "@/data/profile";

/**
 * The listener's profile and text size live in localStorage so they stick between visits. Both are
 * read through useSyncExternalStore so the server and the first client render always agree.
 */

function createStore<T>(key: string, parse: (raw: string | null) => T) {
  const listeners = new Set<() => void>();
  let fallback: string | null | undefined; // used when storage is blocked (private windows)
  let cached: { raw: string | null; value: T } | undefined;

  const readRaw = (): string | null => {
    if (fallback !== undefined) return fallback;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const notify = () => listeners.forEach((listener) => listener());

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      window.addEventListener("storage", listener);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", listener);
      };
    },
    // Must return the same object until the stored text changes.
    getSnapshot(): T {
      const raw = readRaw();
      if (!cached || cached.raw !== raw) cached = { raw, value: parse(raw) };
      return cached.value;
    },
    write(next: string) {
      try {
        window.localStorage.setItem(key, next);
        fallback = undefined;
      } catch {
        fallback = next; // not persisting is harmless
      }
      notify();
    },
  };
}

function parseProfile(raw: string | null): Profile | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<Profile>;
    if (typeof data.name !== "string" || !data.name.trim()) return null;
    return {
      name: data.name,
      city: typeof data.city === "string" ? data.city : "",
      interests: Array.isArray(data.interests) ? data.interests.filter(isInterestId) : [],
      extras: typeof data.extras === "string" ? data.extras : "",
    };
  } catch {
    return null;
  }
}

const profileStore = createStore("voice-readiness:profile", parseProfile);
const textSizeStore = createStore<TextSize>("voice-readiness:text-size", (raw) =>
  isTextSize(raw) ? raw : DEFAULT_TEXT_SIZE,
);

/** undefined until the browser has been asked, null when nobody has signed up yet. */
export function useProfile(): Profile | null | undefined {
  return useSyncExternalStore(profileStore.subscribe, profileStore.getSnapshot, () => undefined);
}

export function saveProfile(profile: Profile) {
  profileStore.write(JSON.stringify(profile));
}

export function useTextSize(): TextSize {
  return useSyncExternalStore(
    textSizeStore.subscribe,
    textSizeStore.getSnapshot,
    () => DEFAULT_TEXT_SIZE,
  );
}

export function saveTextSize(size: TextSize) {
  textSizeStore.write(size);
}
