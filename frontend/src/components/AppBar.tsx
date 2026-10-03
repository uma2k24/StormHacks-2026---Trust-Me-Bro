"use client";

import { useEffect, useSyncExternalStore } from "react";

type TextSize = "standard" | "large" | "largest";

const STORAGE_KEY = "voice-readiness:text-size";

const SIZES: { id: TextSize; label: string; glyphPx: number }[] = [
  { id: "standard", label: "Standard text size", glyphPx: 17 },
  { id: "large", label: "Large text size", glyphPx: 23 },
  { id: "largest", label: "Largest text size", glyphPx: 30 },
];

function isTextSize(value: string | null): value is TextSize {
  return value === "standard" || value === "large" || value === "largest";
}

// The chosen size lives in localStorage so it sticks between visits. It is read
// through useSyncExternalStore so server and first client render always agree.
const listeners = new Set<() => void>();
let inMemory: TextSize | null = null; // fallback when storage is blocked

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): TextSize {
  if (inMemory) return inMemory;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isTextSize(saved)) return saved;
  } catch {
    // Storage can be blocked (private windows); the default size is fine.
  }
  return "standard";
}

function getServerSnapshot(): TextSize {
  return "standard";
}

function saveTextSize(next: TextSize) {
  inMemory = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Not persisting is harmless.
  }
  listeners.forEach((listener) => listener());
}

export function AppBar() {
  const size = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    document.documentElement.dataset.textSize = size;
  }, [size]);

  return (
    <header className="appbar">
      <div className="appbar-inner">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r="17.5" fill="#FFC72C" stroke="#1B1347" strokeWidth="3" />
            <g fill="#1B1347">
              <rect x="9.5" y="16" width="3.6" height="8" rx="1.8" />
              <rect x="15.5" y="10.5" width="3.6" height="19" rx="1.8" />
              <rect x="21.5" y="14" width="3.6" height="12" rx="1.8" />
              <rect x="27.5" y="17.5" width="3.6" height="5" rx="1.8" />
            </g>
          </svg>
          <span className="brand-name display">Voice Check-in</span>
        </div>

        <div className="textsize" role="group" aria-label="Text size">
          {SIZES.map(({ id, label, glyphPx }) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-pressed={size === id}
              onClick={() => saveTextSize(id)}
            >
              <span style={{ fontSize: glyphPx }} aria-hidden="true">
                A
              </span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
