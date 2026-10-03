"use client";

import {
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Window } from "@/components/Window";
import type { TrendPoint } from "@/types/screening";

type TrendChartProps = {
  data: TrendPoint[];
};

const INK = "#0F2E33";

type DotProps = { cx?: number; cy?: number; index?: number };

export function TrendChart({ data }: TrendChartProps) {
  const last = data.length - 1;
  const first = data[0];
  const today = data[last];

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

  return (
    <Window title="Readiness Over 14 Days">
      <p className="m-0 text-[1.15rem] text-[var(--ink-soft)]">
        A simple look at how your score has been trending.
      </p>

      <div
        className="mt-5 h-64 w-full"
        role="img"
        aria-label={`Line chart of your readiness over 14 days. It started at ${first.score} and today is ${today.score}.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 22, right: 34, left: 0, bottom: 4 }}>
            {/* the same three zones as the gauge, kept very light */}
            <ReferenceArea y1={50} y2={60} fill="#FF9873" fillOpacity={0.4} />
            <ReferenceArea y1={60} y2={80} fill="#FFC6B2" fillOpacity={0.55} />
            <ReferenceArea y1={80} y2={100} fill="#41CBBC" fillOpacity={0.3} />
            <XAxis
              dataKey="day"
              ticks={[first.day, "7", "Thu", today.day]}
              tickLine={false}
              axisLine={{ stroke: INK, strokeWidth: 2.5 }}
              tick={{ fill: INK, fontSize: "1.05rem", fontWeight: 800, fontFamily: "var(--ff-head)" }}
              tickMargin={8}
            />
            <YAxis
              domain={[50, 100]}
              ticks={[60, 80, 100]}
              tickLine={false}
              axisLine={{ stroke: INK, strokeWidth: 2.5 }}
              tick={{ fill: INK, fontSize: "1.05rem", fontWeight: 800, fontFamily: "var(--ff-head)" }}
              width={44}
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
