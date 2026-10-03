"use client";

import type { CSSProperties } from "react";
import { Mic } from "lucide-react";
import { StatusChip } from "@/components/StatusChip";
import { statusColorForScore } from "@/data/mockResults";

type IdleScreenProps = {
  userName: string;
  yesterdayScore: number;
  yesterdayLabel: string;
  onStart: () => void;
};

export function IdleScreen({
  userName,
  yesterdayScore,
  yesterdayLabel,
  onStart,
}: IdleScreenProps) {
  return (
    <section className="flex flex-1 flex-col items-center justify-between gap-14 text-center">
      <header className="w-full">
        <h1 className="display h1">
          Good Morning, <span className="marker">{userName}</span>.
        </h1>
        <p className="lede mx-auto mt-5 max-w-[22rem]">
          Want to check in? Just tap and we&apos;ll talk.
        </p>
      </header>

      <div className="sonar rounded-full">
        <button
          type="button"
          onClick={onStart}
          className="orb orb-xl"
          aria-label="Tap to start a conversational check-in"
        >
          <Mic className="h-[4.25rem] w-[4.25rem]" strokeWidth={2.5} aria-hidden="true" />
          <span className="display text-[2.1rem]">Start</span>
        </button>
      </div>

      <div
        className="stat pop-in w-full text-left"
        style={{ "--i": 1 } as CSSProperties}
        role="group"
        aria-label={`Yesterday: ${yesterdayScore} — ${yesterdayLabel}`}
      >
        <span className="text-[1.25rem] font-bold text-[var(--ink-soft)]">
          Yesterday
        </span>
        <span className="flex items-center gap-4">
          <span className="display text-[2.6rem] leading-none tabular-nums">
            {yesterdayScore}
          </span>
          <StatusChip
            status={statusColorForScore(yesterdayScore)}
            label={yesterdayLabel}
          />
        </span>
      </div>
    </section>
  );
}
