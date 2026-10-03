"use client";

import { Mic } from "lucide-react";
import { StatusChip } from "@/components/StatusChip";
import { Window } from "@/components/Window";
import { statusColorForScore } from "@/data/mockResults";

type IdleScreenProps = {
  userName: string;
  yesterdayScore: number;
  yesterdayLabel: string;
  onStart: () => void;
};

const RING_TEXT = "TAP TO TALK • TAP TO TALK • TAP TO TALK • ";

export function IdleScreen({
  userName,
  yesterdayScore,
  yesterdayLabel,
  onStart,
}: IdleScreenProps) {
  return (
    <section className="flex flex-1 flex-col items-center justify-between gap-12 pt-2 text-center">
      <header className="w-full">
        <h1 className="display h1">
          Good Morning, <span className="marker">{userName}</span>.
        </h1>
        <p className="lede mx-auto mt-4 max-w-[22rem]">
          Want to check in? Just tap and we&apos;ll talk.
        </p>
      </header>

      <div className="sonar rounded-full">
        <svg
          className="badge-ring"
          viewBox="0 0 300 300"
          aria-hidden="true"
        >
          <defs>
            <path
              id="badge-ring-path"
              d="M150,150 m-128,0 a128,128 0 1,1 256,0 a128,128 0 1,1 -256,0"
            />
          </defs>
          <text
            fill="#4A4270"
            fontFamily="var(--ff-ui)"
            fontWeight="700"
            fontSize="21"
          >
            <textPath
              href="#badge-ring-path"
              textLength="796"
              lengthAdjust="spacing"
            >
              {RING_TEXT}
            </textPath>
          </text>
        </svg>

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

      <Window title="Yesterday" tone="pink" index={1} className="w-full text-left">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="display text-[3.4rem] leading-none tabular-nums">
            {yesterdayScore}
          </span>
          <StatusChip
            status={statusColorForScore(yesterdayScore)}
            label={yesterdayLabel}
          />
        </p>
      </Window>
    </section>
  );
}
