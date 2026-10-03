"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { AiSummaryCard } from "@/components/AiSummaryCard";
import { ReadinessDial } from "@/components/ReadinessDial";
import { TrendChart } from "@/components/TrendChart";
import { VitalsGrid } from "@/components/VitalsGrid";
import type { ScreeningResults } from "@/types/screening";

type ResultsDashboardProps = {
  results: ScreeningResults;
  onRestart: () => void;
};

/** One thing at a time: the score first, then the details, each on its own page. */
const PAGE_TITLES = [
  "Today's readiness",
  "Your voice summary",
  "Today's vitals",
  "Readiness over 14 days",
] as const;

export function ResultsDashboard({
  results,
  onRestart,
}: ResultsDashboardProps) {
  const [page, setPage] = useState(0);
  const isLast = page === PAGE_TITLES.length - 1;

  return (
    <section className="flex flex-1 flex-col">
      <p className="sr-only" aria-live="polite">
        Page {page + 1} of {PAGE_TITLES.length}: {PAGE_TITLES[page]}
      </p>

      <div className="pager-stage" key={page}>
        {page === 0 ? (
          <>
            <header className="pop-in text-center">
              <h1 className="display h2 !text-[clamp(1.85rem,7.2vw,2.35rem)]">
                Thanks, <span className="marker">{results.user}</span> — here&apos;s how you&apos;re
                looking today.
              </h1>
            </header>
            <ReadinessDial
              score={results.readinessScore}
              statusColor={results.statusColor}
            />
          </>
        ) : (
          <h1 className="sr-only">{PAGE_TITLES[page]}</h1>
        )}

        {page === 1 ? <AiSummaryCard summary={results.aiSummary} /> : null}
        {page === 2 ? <VitalsGrid metrics={results.metrics} /> : null}
        {page === 3 ? <TrendChart data={results.trendData} /> : null}
      </div>

      <nav className="pager-nav" aria-label="Results pages">
        <div
          className="dots"
          role="progressbar"
          aria-label="Results progress"
          aria-valuemin={1}
          aria-valuemax={PAGE_TITLES.length}
          aria-valuenow={page + 1}
          aria-valuetext={`Page ${page + 1} of ${PAGE_TITLES.length}`}
        >
          {PAGE_TITLES.map((title, index) => (
            <span
              key={title}
              className="dot"
              data-state={index < page ? "done" : index === page ? "current" : "todo"}
            />
          ))}
        </div>

        <div className="pager-buttons">
          {page > 0 ? (
            <button
              type="button"
              onClick={() => setPage((value) => value - 1)}
              className="btn btn-back"
              aria-label="Back"
            >
              <ArrowLeft className="h-7 w-7" strokeWidth={2.75} aria-hidden="true" />
            </button>
          ) : null}

          {isLast ? (
            <button
              type="button"
              onClick={onRestart}
              className="btn btn-accent flex-1"
            >
              <RotateCcw className="h-5 w-5" strokeWidth={2.75} aria-hidden="true" />
              Start New Check-in
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPage((value) => value + 1)}
              className="btn btn-accent flex-1"
            >
              Next
              <ArrowRight className="h-5 w-5" strokeWidth={2.75} aria-hidden="true" />
            </button>
          )}
        </div>
      </nav>
    </section>
  );
}
