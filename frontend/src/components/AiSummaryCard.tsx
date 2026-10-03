"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { Waveform } from "@/components/Waveform";
import { Window } from "@/components/Window";

type AiSummaryCardProps = {
  summary: string;
};

export function AiSummaryCard({ summary }: AiSummaryCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <Window title="Your Voice Summary">
      <p className="m-0 text-[1.5rem] leading-[1.5]">{summary}</p>

      <button
        type="button"
        onClick={() => setIsPlaying((value) => !value)}
        className={`btn btn-block mt-7 ${isPlaying ? "btn-teal" : ""}`}
        aria-label={isPlaying ? "Pause voice summary" : "Play voice summary"}
        aria-pressed={isPlaying}
      >
        {isPlaying ? (
          <Pause className="h-6 w-6 fill-current" strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <Play className="h-6 w-6 fill-current" strokeWidth={2.5} aria-hidden="true" />
        )}
        <span>{isPlaying ? "Pause summary" : "Play summary"}</span>
      </button>

      {isPlaying ? (
        <div
          className="mt-4 flex items-center gap-3 text-[var(--teal-deep)]"
          aria-live="polite"
        >
          <Waveform bars={9} />
          <p className="m-0 text-[1.15rem] font-bold text-[var(--ink)]">
            Playing summary…
          </p>
        </div>
      ) : null}
    </Window>
  );
}
