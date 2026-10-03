"use client";

import { useEffect, useState } from "react";
import { Waveform } from "@/components/Waveform";
import { Window } from "@/components/Window";

const MESSAGES = [
  "Hearing you back…",
  "Comparing to your usual…",
  "Almost there…",
] as const;

const BLOCKS = 16;
const TOTAL_MS = 4800;
const TICK_MS = TOTAL_MS / BLOCKS;

type ProcessingScreenProps = {
  onComplete: () => void;
};

export function ProcessingScreen({ onComplete }: ProcessingScreenProps) {
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setFilled((current) => Math.min(current + 1, BLOCKS));
    }, TICK_MS);

    const finishTimer = window.setTimeout(onComplete, TOTAL_MS + 300);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(finishTimer);
    };
  }, [onComplete]);

  const messageIndex = Math.min(
    Math.floor((filled / BLOCKS) * MESSAGES.length),
    MESSAGES.length - 1,
  );
  const percent = Math.round((filled / BLOCKS) * 100);

  return (
    <section className="flex flex-1 flex-col justify-center py-4">
      <Window title="Working…" className="w-full">
        <div className="flex flex-col items-center gap-9 py-3 text-center">
          <div
            className="grid h-24 w-24 place-items-center rounded-full border-[3px] border-[var(--ink)] bg-[var(--teal)] text-[var(--ink)] shadow-[4px_4px_0_var(--ink)]"
            aria-hidden="true"
          >
            <Waveform bars={7} />
          </div>

          <div className="space-y-3" aria-live="polite">
            <p key={MESSAGES[messageIndex]} className="display h2 pop-in">
              {MESSAGES[messageIndex]}
            </p>
            <p className="lede">Please wait a moment.</p>
          </div>

          <div
            className="blocks w-full"
            role="progressbar"
            aria-label="Checking your voice"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            {Array.from({ length: BLOCKS }).map((_, index) => (
              <span key={index} data-on={index < filled} />
            ))}
          </div>
        </div>
      </Window>
    </section>
  );
}
