"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { StatusChip } from "@/components/StatusChip";
import { Window } from "@/components/Window";
import { readinessLabel } from "@/data/mockResults";
import { parkinsonsIndication } from "@/data/voiceReading";
import type { StatusColor } from "@/types/screening";

type ReadinessDialProps = {
  score: number;
  statusColor: StatusColor;
};

const CX = 150;
const CY = 150;
const R_OUT = 132;
const R_IN = 98;
const NEEDLE_LEN = 124;

/** Zones match the labels: Rest < 60 <= Pay Attention < 80 <= Ready. */
const ZONES = [
  { from: 0, to: 60, fill: "var(--zone-rest)" },
  { from: 60, to: 80, fill: "var(--zone-attention)" },
  { from: 80, to: 100, fill: "var(--zone-ready)" },
] as const;

/** A point on the gauge: 0 is the far left, 100 the far right, sweeping over the top. */
function polar(radius: number, value: number): [number, number] {
  const angle = (value / 100) * Math.PI;
  return [CX - radius * Math.cos(angle), CY - radius * Math.sin(angle)];
}

function sector(from: number, to: number): string {
  const [x0o, y0o] = polar(R_OUT, from);
  const [x1o, y1o] = polar(R_OUT, to);
  const [x1i, y1i] = polar(R_IN, to);
  const [x0i, y0i] = polar(R_IN, from);
  return `M${x0o} ${y0o} A${R_OUT} ${R_OUT} 0 0 1 ${x1o} ${y1o} L${x1i} ${y1i} A${R_IN} ${R_IN} 0 0 0 ${x0i} ${y0i}Z`;
}

/** Counts up from 0 in step with the needle's swing. Jumps straight there if motion is reduced. */
function useCountUp(target: number, durationMs = 1500, delayMs = 350) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const delay = reduceMotion ? 0 : delayMs;
    const duration = reduceMotion ? 0 : durationMs;

    let frame = 0;
    let start = 0;
    const timer = window.setTimeout(() => {
      const step = (now: number) => {
        start ||= now;
        const t = duration === 0 ? 1 : Math.min((now - start) / duration, 1);
        setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }, delay);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [target, durationMs, delayMs]);

  return value;
}

export function ReadinessDial({ score, statusColor }: ReadinessDialProps) {
  const clamped = Math.min(Math.max(score, 0), 100);
  const label = readinessLabel(clamped);
  const indication = parkinsonsIndication(clamped);
  const shown = useCountUp(clamped);

  return (
    <Window title="Today's Readiness" index={1}>
      <div
        className="flex flex-col items-center text-center"
        role="img"
        aria-label={`Today's readiness score ${clamped} out of 100. ${label}. ${indication}`}
      >
        <svg
          className="gauge"
          viewBox="0 0 300 196"
          aria-hidden="true"
          focusable="false"
        >
          {ZONES.map((zone) => (
            <path
              key={zone.from}
              d={sector(zone.from, zone.to)}
              fill={zone.fill}
              stroke="var(--ink)"
              strokeWidth="3.5"
              strokeLinejoin="round"
            />
          ))}

          {/* tick marks every 10 */}
          {Array.from({ length: 11 }).map((_, index) => {
            const [x0, y0] = polar(R_OUT + 8, index * 10);
            const [x1, y1] = polar(R_OUT + 17, index * 10);
            return (
              <line
                key={index}
                x1={x0}
                y1={y0}
                x2={x1}
                y2={y1}
                stroke="var(--ink)"
                strokeWidth={index % 5 === 0 ? 4 : 2.5}
                strokeLinecap="round"
              />
            );
          })}

          <text x="34" y="190" textAnchor="middle" fontSize="22" fontFamily="var(--ff-head)" fontWeight="800" fill="var(--ink)">
            0
          </text>
          <text x="266" y="190" textAnchor="middle" fontSize="22" fontFamily="var(--ff-head)" fontWeight="800" fill="var(--ink)">
            100
          </text>

          <g className="needle" style={{ "--score": clamped } as CSSProperties}>
            <g className="needle-hum">
              <polygon
                points={`${CX - NEEDLE_LEN},${CY} ${CX},${CY - 9} ${CX},${CY + 9}`}
                fill="var(--ink)"
                stroke="var(--ink)"
                strokeWidth="4"
                strokeLinejoin="round"
              />
            </g>
          </g>

          {/* hub sits above the needle */}
          <circle cx={CX} cy={CY} r="19" fill="var(--ink)" />
          <circle cx={CX} cy={CY} r="7" fill="var(--accent)" />
        </svg>

        <p className="mt-1 flex flex-wrap items-baseline justify-center gap-x-3" aria-hidden="true">
          <span className="display text-[4.5rem] leading-none tabular-nums">{shown}</span>
          <span className="display text-[1.5rem] text-[var(--ink-soft)]">out of 100</span>
        </p>

        <StatusChip
          status={statusColor}
          label={label}
          className="mt-4 !px-4 !py-1.5 !text-[1.3rem]"
        />

        <p className="m-0 mt-4 max-w-[22rem] text-[1.05rem] leading-snug text-[var(--ink-soft)]" aria-hidden="true">
          {indication}
        </p>
      </div>
    </Window>
  );
}
