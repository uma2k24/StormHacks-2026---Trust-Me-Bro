import { useSyncExternalStore } from "react";
import { emptyLearned, type Learned, type Taste, type TodaysShow } from "@/data/learning";
import {
  DEFAULT_TEXT_SIZE,
  isInterestId,
  isTextSize,
  type Profile,
  type TextSize,
} from "@/data/profile";

/**
 * The listener's profile and text size live in localStorage so they stick between visits, along
 * with what the radio has learned about them and today's show. All are read through
 * useSyncExternalStore so the server and the first client render always agree.
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

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function parseTaste(value: unknown): Taste | null {
  const taste = value as Partial<Taste> | null;
  if (!taste || !isNumber(taste.n) || !isNumber(taste.mean) || typeof taste.last !== "string") return null;
  return { n: taste.n, mean: taste.mean, last: taste.last };
}

function parseLearned(raw: string | null): Learned {
  if (!raw) return emptyLearned;
  try {
    const data = JSON.parse(raw) as { baseline?: unknown; interests?: Record<string, unknown> };
    const interests: Learned["interests"] = {};
    for (const [id, value] of Object.entries(data.interests ?? {})) {
      const taste = parseTaste(value);
      if (isInterestId(id) && taste) interests[id] = taste;
    }
    return { baseline: parseTaste(data.baseline) ?? emptyLearned.baseline, interests };
  } catch {
    return emptyLearned;
  }
}

/** Anything saved by an older or broken build is dropped, so a bad show is never played. */
function parseTodaysShow(raw: string | null): TodaysShow | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<TodaysShow>;
    if (typeof data.day !== "string" || typeof data.key !== "string" || !Array.isArray(data.picks)) return null;
    const picks = data.picks.filter(isInterestId);
    if (picks.length !== 2) return null;
    const text = (value: unknown) => typeof value === "string";
    const briefing =
      data.briefing?.source === "live" &&
      Array.isArray(data.briefing.segments) &&
      data.briefing.segments.length > 0 &&
      data.briefing.segments.every(
        (s) => text(s.id) && text(s.kind) && text(s.topic) && text(s.brief) && text(s.question) && text(s.mockReply),
      )
        ? data.briefing
        : undefined;
    return { day: data.day, key: data.key, picks, briefing };
  } catch {
    return null;
  }
}

const profileStore = createStore("voice-readiness:profile", parseProfile);
const textSizeStore = createStore<TextSize>("voice-readiness:text-size", (raw) =>
  isTextSize(raw) ? raw : DEFAULT_TEXT_SIZE,
);
const learnedStore = createStore("voice-readiness:learned", parseLearned);
const showStore = createStore("voice-readiness:today", parseTodaysShow);

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

/** What the radio has learned about this listener (see data/learning.ts). */
export function loadLearned(): Learned {
  return learnedStore.getSnapshot();
}

export function saveLearned(learned: Learned) {
  learnedStore.write(JSON.stringify(learned));
}

/** The saved show, but only if it was made on `day` for this very profile. */
function showFor(saved: TodaysShow | null, key: string | null, day: string): TodaysShow | null {
  return saved && key !== null && saved.key === key && saved.day === day ? saved : null;
}

export function loadTodaysShow(key: string | null, day: string): TodaysShow | null {
  return showFor(showStore.getSnapshot(), key, day);
}

export function useTodaysShow(key: string | null, day: string): TodaysShow | null {
  return useSyncExternalStore(
    showStore.subscribe,
    () => showFor(showStore.getSnapshot(), key, day),
    () => null,
  );
}

export function saveTodaysShow(show: TodaysShow) {
  showStore.write(JSON.stringify(show));
}
