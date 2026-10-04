"use client";

import { CircleCheck } from "lucide-react";
import { StatusChip } from "@/components/StatusChip";
import { Window } from "@/components/Window";
import {
  formatValue,
  MEASURE_ORDER,
  MEASURES,
  positionOf,
  scaleLabels,
  verdictOf,
  ZONE_LABELS,
} from "@/data/voiceReading";
import type { MeasureKey, ScreeningResults, StatusColor, Zone } from "@/types/screening";

/**
 * The numbers behind the vitals, for anyone who taps one: each measure on its own scale with the
 * healthy and Parkinson's ranges, and what the classifier made of the whole check-in. It is kept off
 * the main pages on purpose: most people don't need it, and it is technical.
 */

const ZONE_COLOR: Record<Zone, StatusColor> = { healthy: "green", borderline: "yellow", elevated: "red" };

/** The bar a reading sits on: healthy, then in between, then the Parkinson's range, with a marker where this one is. */
function ZoneBar({ measureKey, value }: { measureKey: MeasureKey; value: number }) {
  const measure = MEASURES[measureKey];
  const marker = positionOf(measure, value);
  const borderline = positionOf(measure, measure.borderlineAt);
  const elevated = positionOf(measure, measure.elevatedAt);
  const ends = scaleLabels(measure);

  return (
    <div>
      <div className="zonebar">
        <div
          className="zonebar-track"
          style={{ gridTemplateColumns: `${borderline}fr ${elevated - borderline}fr ${1 - elevated}fr` }}
          aria-hidden="true"
        >
          <i data-zone="healthy" />
          <i data-zone="borderline" />
          <i data-zone="elevated" />
        </div>
        <span className="zonebar-marker" style={{ left: `${marker * 100}%` }} aria-hidden="true" />
      </div>
      <p className="m-0 mt-1 flex justify-between text-[1.05rem] text-[var(--ink-soft)]" aria-hidden="true">
        <span>{ends.from}</span>
        <span>{ends.to}</span>
      </p>
    </div>
  );
}

function MeasureCard({ measureKey, results }: { measureKey: MeasureKey; results: ScreeningResults }) {
  const measure = MEASURES[measureKey];
  const reading = results.metrics[measureKey].reading;

  return (
    <article className="measure-card" aria-labelledby={`measure-${measureKey}`}>
      <h3 id={`measure-${measureKey}`} className="m-0 text-[1.2rem] font-bold text-[var(--ink-soft)]">
        {measure.label}
      </h3>
      {reading ? (
        <>
          <p className="display m-0 mt-1 text-[2.6rem] leading-none tabular-nums">{formatValue(measure, reading.value)}</p>
          <StatusChip status={ZONE_COLOR[reading.zone]} label={ZONE_LABELS[reading.zone]} className="mt-2" />
          <div className="mt-3">
            <ZoneBar measureKey={measureKey} value={reading.value} />
          </div>
        </>
      ) : (
        <p className="m-0 mt-2 text-[1.2rem]">Couldn’t be measured this time.</p>
      )}
      <p className="m-0 mt-3 text-[1.1rem] text-[var(--ink-soft)]">Healthy {measure.healthyRange}</p>
      <p className="m-0 mt-1 text-[1.1rem] text-[var(--ink-soft)]">Parkinson’s {measure.parkinsonRange}</p>
      <p className="m-0 mt-3 text-[1.1rem] leading-snug">{measure.explanation}</p>
    </article>
  );
}

type VitalDetailProps = {
  results: ScreeningResults;
  /** The vital that was tapped: it comes first. */
  focus: MeasureKey;
};

export function VitalDetail({ results, focus }: VitalDetailProps) {
  const order = [focus, ...MEASURE_ORDER.filter((key) => key !== focus)];
  const verdict = verdictOf(results.metrics);
  const detail = results.detail;

  return (
    <>
      <Window title="Voice quality">
        <p className="m-0 text-[1.1rem] leading-snug text-[var(--ink-soft)]">
          Measured on your “ahhh”. Higher jitter and shimmer are worse. Lower HNR is worse.
        </p>
        {verdict ? (
          <div className="mt-4">
            <StatusChip status={ZONE_COLOR[verdict.zone]} label={ZONE_LABELS[verdict.zone]} />
            <p className="m-0 mt-2 text-[1.15rem] leading-snug">{verdict.line}</p>
          </div>
        ) : null}
        <div className="mt-5 grid gap-4">
          {order.map((key) => (
            <MeasureCard key={key} measureKey={key} results={results} />
          ))}
        </div>
      </Window>

      {detail ? (
        <Window title="Overall result" index={1}>
          <p className="display h3 m-0 flex items-start gap-2">
            {detail.flagged ? null : <CircleCheck className="mt-0.5 h-7 w-7 flex-none" strokeWidth={2.5} aria-hidden="true" />}
            {detail.flagged
              ? "Flagged: speech patterns resemble the Parkinson’s group"
              : "Not flagged: speech patterns resemble the control group"}
          </p>
          <div
            className="probbar mt-4"
            role="img"
            aria-label={`Probability ${detail.probability.toFixed(3)} against a decision threshold of ${detail.threshold.toFixed(3)}`}
          >
            <div className="probbar-fill" style={{ width: `${detail.probability * 100}%` }} />
            <span className="probbar-marker" style={{ left: `${detail.threshold * 100}%` }} />
          </div>
          <p className="m-0 mt-3 text-[1.15rem] leading-snug">
            Probability {detail.probability.toFixed(3)} against a decision threshold of {detail.threshold.toFixed(3)}.
          </p>
          <ul className="m-0 mt-3 list-none space-y-1 p-0 text-[1.05rem] text-[var(--ink-soft)]">
            {detail.tasks.map((task) => (
              <li key={task.label}>
                {task.label}: {task.probability.toFixed(3)} (weight {Math.round(task.weight * 100)}%)
              </li>
            ))}
          </ul>
          <p className="m-0 mt-4 text-[1.05rem] leading-snug text-[var(--ink-soft)]">
            This is a screening aid, not a diagnosis. If you are worried, talk with your doctor.
          </p>
        </Window>
      ) : null}
    </>
  );
}
