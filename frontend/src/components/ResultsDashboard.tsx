"use client";

import { RotateCcw } from "lucide-react";
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
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-10 sm:px-8">
      <header className="text-center">
        <p className="text-lg font-medium text-amber-200/90">
          Check-in Complete
        </p>
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
          Here&apos;s your readiness today, {results.user}.
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
        className="flex h-20 w-full items-center justify-center gap-3 rounded-2xl border-2 border-slate-400 bg-slate-800 text-2xl font-bold text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-amber-300"
      >
        <RotateCcw className="h-7 w-7" aria-hidden="true" />
        Start New Check-in
      </button>
    </section>
  );
}
