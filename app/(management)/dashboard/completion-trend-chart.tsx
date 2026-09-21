"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatShortDateLabel } from "@/lib/date";
import type { OverviewTrendPoint } from "./types";

export function CompletionTrendChart({ trend }: { trend: OverviewTrendPoint[] }) {
  const data = trend.map((point, index) => ({
    ...point,
    label: formatShortDateLabel(point.date),
    isLast: index === trend.length - 1,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="completionFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
            axisLine={{ stroke: "var(--color-border)" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "var(--color-muted)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(value: number) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              color: "var(--color-text)",
              fontSize: 13,
            }}
            formatter={(value) => [
              value == null ? "—" : `${value}%`,
              "Completion",
            ]}
          />
          <Area
            type="monotone"
            dataKey="completion_pct"
            stroke="var(--color-accent)"
            strokeWidth={2}
            fill="url(#completionFill)"
            connectNulls
            dot={(props: { cx?: number; cy?: number; payload?: { isLast?: boolean; completion_pct?: number | null } }) => {
              const { cx, cy, payload } = props;
              if (!payload?.isLast || cx == null || cy == null || payload.completion_pct == null) {
                return <g key={`dot-${cx}-${cy}`} />;
              }
              return (
                <g key="last-point">
                  <circle cx={cx} cy={cy} r={5} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />
                  <text x={cx} y={cy - 12} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-text)">
                    {payload.completion_pct}%
                  </text>
                </g>
              );
            }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
