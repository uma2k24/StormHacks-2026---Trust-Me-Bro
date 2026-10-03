"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/types/screening";

type TrendChartProps = {
  data: TrendPoint[];
};

export function TrendChart({ data }: TrendChartProps) {
  return (
    <section aria-labelledby="trend-heading">
      <h3
        id="trend-heading"
        className="text-2xl font-bold text-white sm:text-3xl"
      >
        Readiness Over 14 Days
      </h3>
      <p className="mt-2 text-lg text-slate-300">
        A simple look at how your score has been trending.
      </p>

      <div className="mt-6 h-64 w-full rounded-3xl border border-slate-600/70 bg-slate-900/70 p-4 sm:h-72 sm:p-6">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="readinessFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F5C518" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#F5C518" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#94A3B8", fontSize: 14 }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[50, 100]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#94A3B8", fontSize: 14 }}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: "#0F172A",
                border: "1px solid #475569",
                borderRadius: 16,
                fontSize: 16,
                color: "#F8FAFC",
              }}
              labelStyle={{ color: "#F5C518", fontWeight: 700 }}
              formatter={(value) => [`${value}`, "Readiness"]}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#F5C518"
              strokeWidth={4}
              fill="url(#readinessFill)"
              dot={false}
              activeDot={{ r: 7, fill: "#FFE566", stroke: "#0F172A", strokeWidth: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
