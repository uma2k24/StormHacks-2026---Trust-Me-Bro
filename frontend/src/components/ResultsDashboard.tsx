"use client";

import { RotateCcw, Sparkles } from "lucide-react";
import { AiSummaryCard } from "@/components/AiSummaryCard";
import { ReadinessDial } from "@/components/ReadinessDial";
import { TrendChart } from "@/components/TrendChart";
import { VitalsGrid } from "@/components/VitalsGrid";
import type { ScreeningResults } from "@/types/screening";

type ResultsDashboardProps = {
  results: ScreeningResults;
  onRestart: () => void;
};

export function ResultsDashboard({
  results,
  onRestart,
}: ResultsDashboardProps) {
  return (
    <section className="flex flex-col gap-7">
      <header className="pop-in text-center">
        <p className="eyebrow text-[var(--cobalt)]">
          <Sparkles className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
          Nice talking with you
        </p>
        <h1 className="display h2 mt-2">
          Thanks, <span className="marker">{results.user}</span> — here&apos;s how you&apos;re
          looking today.
        </h1>
      </header>

      <ReadinessDial
        score={results.readinessScore}
        statusColor={results.statusColor}
      />

      <AiSummaryCard summary={results.aiSummary} />

      <VitalsGrid metrics={results.metrics} />

      <TrendChart data={results.trendData} />

      <button
        type="button"
        onClick={onRestart}
        className="btn btn-block btn-yellow pop-in"
        style={{ "--i": 5 } as React.CSSProperties}
      >
        <RotateCcw className="h-6 w-6" strokeWidth={2.75} aria-hidden="true" />
        Start New Check-in
      </button>
    </section>
  );
}
