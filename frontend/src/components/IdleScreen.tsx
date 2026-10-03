"use client";

import type { CSSProperties } from "react";
import { Radio } from "lucide-react";
import { SegmentIcon } from "@/components/SegmentIcon";
import type { BriefingSegment } from "@/data/checkInScript";

type IdleScreenProps = {
  userName: string;
  segments: BriefingSegment[];
  onStart: () => void;
};

export function IdleScreen({ userName, segments, onStart }: IdleScreenProps) {
  return (
    <section className="flex flex-1 flex-col items-center justify-between gap-14 text-center">
      <header className="w-full">
        <h1 className="display h1">
          Good Morning, <span className="marker">{userName}</span>.
        </h1>
        <p className="lede mx-auto mt-5 max-w-[22rem]">
          Your morning radio is ready. Tap to tune in.
        </p>
      </header>

      <div className="sonar rounded-full">
        <button
          type="button"
          onClick={onStart}
          className="orb orb-xl"
          aria-label="Tap to play your morning radio"
        >
          <Radio className="h-[4.25rem] w-[4.25rem]" strokeWidth={2.5} aria-hidden="true" />
          <span className="display text-[2.1rem]">Play</span>
        </button>
      </div>

      <div
        className="stat pop-in w-full text-left"
        style={{ "--i": 1 } as CSSProperties}
        role="group"
        aria-label={`On today's show: ${segments.map((segment) => segment.topic).join(", ")}`}
      >
        <span className="text-[1.25rem] font-bold text-[var(--ink-soft)]">
          On today&apos;s show
        </span>
        <span className="flex flex-wrap gap-2" aria-hidden="true">
          {segments.map((segment) => (
            <span key={segment.id} className="chip">
              <SegmentIcon kind={segment.kind} className="h-5 w-5" strokeWidth={2.5} />
              {segment.topic}
            </span>
          ))}
        </span>
      </div>
    </section>
  );
}
