"use client";

import { Activity, AudioLines, Check, TriangleAlert, Waves, Wind } from "lucide-react";
import { Window } from "@/components/Window";
import type { Metric } from "@/types/screening";

type VitalsGridProps = {
  metrics: {
    jitter: Metric;
    shimmer: Metric;
    hnr: Metric;
    mpp: Metric;
  };
};

const VITALS = [
  { key: "jitter" as const, label: "Jitter", icon: Activity, tile: "var(--pink)" },
  { key: "shimmer" as const, label: "Shimmer", icon: Waves, tile: "var(--sky)" },
  { key: "hnr" as const, label: "HNR", icon: Wind, tile: "var(--lilac)" },
  { key: "mpp" as const, label: "MPP", icon: AudioLines, tile: "var(--pink)" },
];

export function VitalsGrid({ metrics }: VitalsGridProps) {
  return (
    <Window title="Today's Vitals" tone="sky" index={3} padded={false}>
      <ul className="m-0 list-none p-0">
        {VITALS.map(({ key, label, icon: Icon, tile }) => {
          const metric = metrics[key];
          const StatusIcon = metric.isWarning ? TriangleAlert : Check;

          return (
            <li key={key} className="vital">
              <div className="vital-icon" style={{ background: tile }}>
                <Icon className="h-7 w-7" strokeWidth={2.4} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="display h3 m-0">{label}</h3>
                <p className="m-0 mt-1 text-[1.15rem] text-[var(--ink-soft)]">
                  {metric.description}
                </p>
                <p
                  className={`chip mt-2.5 ${metric.isWarning ? "chip-warn" : "chip-ok"}`}
                >
                  <StatusIcon
                    className="h-[1.3em] w-[1.3em]"
                    strokeWidth={2.5}
                    aria-hidden="true"
                  />
                  {metric.status}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Window>
  );
}
