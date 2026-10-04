"use client";

import { Activity, Check, ChevronRight, TriangleAlert, Waves, Wind } from "lucide-react";
import { Window } from "@/components/Window";
import type { MeasureKey, Metric } from "@/types/screening";

type VitalsGridProps = {
  metrics: Record<MeasureKey, Metric>;
  /** Opens the numbers behind a vital. Without it the rows are plain. */
  onOpen?: (key: MeasureKey) => void;
};

const VITALS = [
  { key: "jitter" as const, label: "Jitter", icon: Activity },
  { key: "shimmer" as const, label: "Shimmer", icon: Waves },
  { key: "hnr" as const, label: "HNR", icon: Wind },
];

export function VitalsGrid({ metrics, onOpen }: VitalsGridProps) {
  return (
    <Window title="Today's Vitals" padded={false}>
      <ul className="m-0 list-none p-0">
        {VITALS.map(({ key, label, icon: Icon }) => {
          const metric = metrics[key];
          const StatusIcon = metric.isWarning ? TriangleAlert : Check;

          const tappable = Boolean(metric.reading && onOpen); // only a vital with a measurement behind it can be opened
          const chip = (
            <p className={`chip whitespace-nowrap ${metric.isWarning ? "chip-warn" : "chip-ok"}`}>
              <StatusIcon className="h-[1.3em] w-[1.3em]" strokeWidth={2.5} aria-hidden="true" />
              {metric.status}
            </p>
          );

          const content = (
            <>
              <div className="vital-icon">
                <Icon className="h-7 w-7" strokeWidth={2.4} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="display h3 m-0">{label}</h3>
                  {tappable ? (
                    <ChevronRight className="h-7 w-7 flex-none" strokeWidth={3} aria-hidden="true" />
                  ) : null}
                </div>
                <p className="m-0 mt-1 text-[1.1rem] leading-snug text-[var(--ink-soft)]">
                  {metric.description}
                </p>
                <div className="mt-1.5">{chip}</div>
              </div>
            </>
          );

          return tappable ? (
            <li key={key} className="vital" data-tappable="true">
              <button
                type="button"
                className="vital-button"
                onClick={() => onOpen?.(key)}
                aria-label={`${label}: ${metric.status}. See the numbers.`}
              >
                {content}
              </button>
            </li>
          ) : (
            <li key={key} className="vital">
              {content}
            </li>
          );
        })}
      </ul>
    </Window>
  );
}
