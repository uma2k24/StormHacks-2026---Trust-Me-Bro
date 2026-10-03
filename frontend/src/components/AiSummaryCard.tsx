"use client";

import { useState } from "react";
import { Pause, Play } from "lucide-react";

type AiSummaryCardProps = {
  summary: string;
};

export function AiSummaryCard({ summary }: AiSummaryCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <section
      className="rounded-3xl border border-slate-600/70 bg-slate-900/80 p-6 sm:p-8"
      aria-labelledby="ai-summary-heading"
    >
      <h3
        id="ai-summary-heading"
        className="text-2xl font-bold text-amber-200 sm:text-3xl"
      >
        Your Voice Summary
      </h3>

      <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start">
        <button
          type="button"
          onClick={() => setIsPlaying((value) => !value)}
          className="flex h-20 w-full shrink-0 items-center justify-center gap-3 rounded-2xl bg-amber-300 text-xl font-bold text-slate-950 transition hover:bg-amber-200 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white sm:h-24 sm:w-24 sm:flex-col sm:gap-1 sm:text-base"
          aria-label={isPlaying ? "Pause voice summary" : "Play voice summary"}
          aria-pressed={isPlaying}
        >
          {isPlaying ? (
            <Pause className="h-8 w-8 fill-current" aria-hidden="true" />
          ) : (
            <Play className="h-8 w-8 fill-current" aria-hidden="true" />
          )}
          <span>{isPlaying ? "Pause" : "Play"}</span>
        </button>

        <p className="text-xl leading-relaxed text-slate-100 sm:text-2xl">
          {summary}
        </p>
      </div>

      {isPlaying ? (
        <p className="mt-4 text-lg font-medium text-amber-200" aria-live="polite">
          Playing summary…
        </p>
      ) : null}
    </section>
  );
}
