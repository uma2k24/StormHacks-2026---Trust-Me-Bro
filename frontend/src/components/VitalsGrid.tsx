"use client";

import {
  ArrowDown,
  ArrowRight,
  AudioLines,
  Brain,
  Mic2,
  Smile,
} from "lucide-react";
import type { Metric } from "@/types/screening";

type VitalsGridProps = {
  metrics: {
    vocalEnergy: Metric;
    vocalControl: Metric;
    cognitivePacing: Metric;
    expressionLevel: Metric;
  };
};

const VITALS = [
  {
    key: "vocalEnergy" as const,
    label: "Vocal Energy",
    icon: AudioLines,
  },
  {
    key: "vocalControl" as const,
    label: "Vocal Control",
    icon: Mic2,
  },
  {
    key: "cognitivePacing" as const,
    label: "Cognitive Pacing",
    icon: Brain,
  },
  {
    key: "expressionLevel" as const,
    label: "Expression Level",
    icon: Smile,
  },
];

function deviationText(metric: Metric): string {
  if (metric.deviation === 0) return "Matches normal";
  const sign = metric.deviation > 0 ? "+" : "";
  return `${sign}${metric.deviation}% from normal`;
}

export function VitalsGrid({ metrics }: VitalsGridProps) {
  return (
    <section aria-labelledby="vitals-heading">
      <h3
        id="vitals-heading"
        className="text-2xl font-bold text-white sm:text-3xl"
      >
        Today&apos;s Vitals
      </h3>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {VITALS.map(({ key, label, icon: Icon }) => {
          const metric = metrics[key];
          const isFlat = metric.deviation === 0;
          const tone = metric.isWarning
            ? "border-amber-400/50 bg-amber-400/10"
            : "border-slate-600/70 bg-slate-900/70";
          const statusTone = metric.isWarning
            ? "text-amber-300"
            : "text-emerald-300";

          return (
            <article
              key={key}
              className={`rounded-3xl border p-5 sm:p-6 ${tone}`}
            >
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-amber-200">
                  <Icon className="h-8 w-8" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xl font-semibold text-white sm:text-2xl">
                    {label}
                  </h4>
                  <p className={`mt-2 text-2xl font-bold ${statusTone}`}>
                    {metric.status}
                  </p>
                  <p className="mt-2 flex items-center gap-2 text-lg text-slate-300">
                    {isFlat ? (
                      <ArrowRight className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <ArrowDown className="h-5 w-5" aria-hidden="true" />
                    )}
                    <span>{deviationText(metric)}</span>
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
