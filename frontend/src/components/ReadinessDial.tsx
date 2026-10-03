"use client";

import {
  readinessLabel,
  statusHex,
} from "@/data/mockResults";
import type { StatusColor } from "@/types/screening";

type ReadinessDialProps = {
  score: number;
  statusColor: StatusColor;
};

export function ReadinessDial({ score, statusColor }: ReadinessDialProps) {
  const size = 280;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(score, 0), 100) / 100;
  const offset = circumference * (1 - progress);
  const color = statusHex[statusColor];
  const label = readinessLabel(score);

  return (
    <div className="flex flex-col items-center text-center">
      <div
        className="relative"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`Today's readiness score ${score} out of 100. ${label}.`}
      >
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#243041"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
          <span className="text-7xl font-bold tabular-nums leading-none text-white sm:text-8xl">
            {score}
          </span>
          <span className="mt-2 text-xl font-medium text-slate-300">
            out of 100
          </span>
        </div>
      </div>
      <h2 className="mt-6 max-w-md text-3xl font-bold leading-tight text-white sm:text-4xl">
        Today&apos;s Readiness:{" "}
        <span style={{ color }}>{label}</span>
      </h2>
    </div>
  );
}
