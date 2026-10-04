"use client";

import {
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  XAxis,
  type XAxisTickContentProps,
  YAxis,
} from "recharts";
import { Window } from "@/components/Window";
import type { TrendPoint } from "@/types/screening";

type TrendChartProps = {
  data: TrendPoint[];
};

const INK = "#0F2E33";
const AXIS_FONT_REM = 1.05;
/** Rough width of one bold display-font character, in ems. */
const CHAR_EM = 0.6;

type DotProps = { cx?: number; cy?: number; index?: number };

/** Pixels in one rem right now: the text-size setting changes the root font size. */
function remPx(): number {
  if (typeof document === "undefined") return 16;
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

export function TrendChart({ data }: TrendChartProps) {
  const last = data.length - 1;
  const first = data[0];
  const today = data[last];
  // the first point says how far back the chart goes: "Oct 1", or "2 weeks ago" for a full fortnight
  const startLabel = first.day;
  const axisFontPx = AXIS_FONT_REM * remPx();
  // room for "100" at the current text size, so the biggest setting doesn't clip it
  const yAxisWidth = Math.ceil(3 * CHAR_EM * axisFontPx) + 6;
  // A numeric x-axis (day 0 ... day 13) so the plot can be a little wider than the data:
  // the dots and zone bands then sit inside the axes instead of on them.
  const series = data.map((point, index) => ({ ...point, index }));

  const renderDot = ({ cx, cy, index }: DotProps) => {
    if (cx === undefined || cy === undefined) return <g key={index} />;
    const isToday = index === last;
    return (
      <g key={index}>
        <circle
          cx={cx}
          cy={cy}
          r={isToday ? 10 : 5}
          fill={isToday ? "#FF9873" : "#41CBBC"}
          stroke={INK}
          strokeWidth={isToday ? 3.5 : 2.5}
        />
        {isToday ? (
          // callout pill so the number never fights the line
          <g>
            <rect
              x={cx - 24}
              y={cy + 22}
              width={48}
              height={32}
              rx={16}
              fill="#FFFFFF"
              stroke={INK}
              strokeWidth={2.5}
            />
            <text
              x={cx}
              y={cy + 45}
              textAnchor="middle"
              fontSize="1.3rem"
              fontFamily="var(--ff-head)"
              fontWeight={800}
              fill={INK}
            >
              {today.score}
            </text>
          </g>
        ) : null}
      </g>
    );
  };

  // Only the two ends are labelled (the title says 14 days), each tucked inside the plot so
  // they can't run off the edge. On a narrow screen at a big text size there isn't room for
  // both, so the start label gives way and "Today" stays.
  const renderXTick = ({ x, y, width, payload }: XAxisTickContentProps) => {
    const isToday = payload.value === last;
    const bothFit =
      (startLabel.length + today.day.length + 2) * CHAR_EM * axisFontPx <= Number(width);
    if (!isToday && !bothFit) return <g />;
    return (
      <text
        x={x}
        y={y}
        dy="0.71em"
        textAnchor={isToday ? "end" : "start"}
        fill={INK}
        fontSize={`${AXIS_FONT_REM}rem`}
        fontWeight={800}
        fontFamily="var(--ff-head)"
      >
        {isToday ? today.day : startLabel}
      </text>
    );
  };

  return (
    <Window title="Readiness Over 14 Days">
      <p className="m-0 text-[1.15rem] text-[var(--ink-soft)]">
        {last === 0
          ? "This is your first reading. Every morning adds another dot."
          : "A simple look at how your score has been trending."}
      </p>

      <div
        className="mt-5 h-64 w-full"
        role="img"
        aria-label={
          last === 0
            ? `Line chart of your readiness. Today is ${today.score}, your first reading.`
            : `Line chart of your readiness since ${startLabel}. It started at ${first.score} and today is ${today.score}.`
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 22, right: 20, left: 0, bottom: 4 }}>
            {/* the same three zones as the gauge, kept very light */}
            <ReferenceArea y1={50} y2={60} fill="#FF9873" fillOpacity={0.4} />
            <ReferenceArea y1={60} y2={80} fill="#FFC6B2" fillOpacity={0.55} />
            <ReferenceArea y1={80} y2={100} fill="#41CBBC" fillOpacity={0.3} />
            <XAxis
              type="number"
              dataKey="index"
              domain={[-0.5, last + 0.6]}
              ticks={last === 0 ? [0] : [0, last]}
              interval={0}
              tickLine={false}
              axisLine={{ stroke: INK, strokeWidth: 2.5 }}
              tick={renderXTick}
              tickMargin={8}
            />
            <YAxis
              domain={[50, 100]}
              ticks={[60, 80, 100]}
              tickLine={false}
              axisLine={{ stroke: INK, strokeWidth: 2.5 }}
              tick={{ fill: INK, fontSize: `${AXIS_FONT_REM}rem`, fontWeight: 800, fontFamily: "var(--ff-head)" }}
              width={yAxisWidth}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke={INK}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={renderDot}
              activeDot={false}
              isAnimationActive
              animationDuration={1400}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Window>
  );
}
