"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ListChecks } from "lucide-react";
import { AiSummaryCard } from "@/components/AiSummaryCard";
import { ReadinessDial } from "@/components/ReadinessDial";
import { TrendChart } from "@/components/TrendChart";
import { VitalDetail } from "@/components/VitalDetail";
import { VitalsGrid } from "@/components/VitalsGrid";
import { MEASURES } from "@/data/voiceReading";
import type { MeasureKey, ScreeningResults } from "@/types/screening";

type ResultsDashboardProps = {
  results: ScreeningResults;
  /** After the last page: on to the day's list. */
  onFinish: () => void;
};

/** One thing at a time: the score first, then the details, each on its own page. */
const PAGE_TITLES = [
  "Today's readiness",
  "Your voice summary",
  "Today's vitals",
  "Readiness over 14 days",
] as const;

export function ResultsDashboard({ results, onFinish }: ResultsDashboardProps) {
  const [page, setPage] = useState(0);
  // A vital that has been tapped: its numbers replace the page until they go back.
  const [detail, setDetail] = useState<MeasureKey | null>(null);
  const isLast = page === PAGE_TITLES.length - 1;

  // the numbers start at the top, not wherever the vitals page was scrolled to
  useEffect(() => {
    if (detail) window.scrollTo({ top: 0 });
  }, [detail]);

  return (
    <section className="flex flex-1 flex-col">
      <p className="sr-only" aria-live="polite">
        {detail
          ? `The numbers for ${MEASURES[detail].label}`
          : `Page ${page + 1} of ${PAGE_TITLES.length}: ${PAGE_TITLES[page]}`}
      </p>

      <div className="pager-stage" key={detail ?? page}>
        {detail ? (
          <>
            <h1 className="sr-only">The numbers for {MEASURES[detail].label}</h1>
            <VitalDetail results={results} focus={detail} />
          </>
        ) : page === 0 ? (
          <>
            <header className="pop-in text-center">
              <h1 className="display h2">
                Thanks, <span className="marker">{results.user}</span>!
              </h1>
            </header>
            <ReadinessDial
              score={results.readinessScore}
              statusColor={results.statusColor}
            />
            {results.source === "sample" ? (
              <p className="m-0 -mt-3 text-center text-[1.05rem] leading-snug text-[var(--ink-soft)]">
                These are sample numbers. Your voice couldn’t be measured today.
              </p>
            ) : null}
          </>
        ) : (
          <h1 className="sr-only">{PAGE_TITLES[page]}</h1>
        )}

        {!detail && page === 1 ? <AiSummaryCard summary={results.aiSummary} /> : null}
        {!detail && page === 2 ? <VitalsGrid metrics={results.metrics} onOpen={setDetail} /> : null}
        {!detail && page === 3 ? <TrendChart data={results.trendData} /> : null}
      </div>

      <nav className="pager-nav" aria-label="Results pages">
        {detail ? (
          <div className="pager-buttons">
            <button type="button" onClick={() => setDetail(null)} className="btn btn-accent flex-1">
              <ArrowLeft className="h-5 w-5" strokeWidth={2.75} aria-hidden="true" />
              Back to my vitals
            </button>
          </div>
        ) : (
          <>
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
                <button type="button" onClick={onFinish} className="btn btn-accent flex-1">
                  <ListChecks className="h-5 w-5" strokeWidth={2.75} aria-hidden="true" />
                  Your day
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
          </>
        )}
      </nav>
    </section>
  );
}
