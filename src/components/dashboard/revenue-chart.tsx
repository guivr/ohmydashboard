"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { formatCurrency } from "@/lib/format";

interface RevenueChartProps {
  title: string;
  data: Array<{
    date: string;
    value: number;
  }>;
  currency?: string;
  color?: string;
}

/**
 * Resolve CSS custom properties to computed color strings.
 */
function useResolvedColors(ref: React.RefObject<HTMLElement | null>) {
  const [colors, setColors] = useState({
    chart: "#6C8EEF",
    muted: "#888888",
    grid: "rgba(255,255,255,0.1)",
    card: "#1c1c1e",
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const get = (name: string) => style.getPropertyValue(name).trim();

    setColors({
      chart: get("--chart-1") || colors.chart,
      muted: get("--muted-foreground") || colors.muted,
      grid: get("--border") || colors.grid,
      card: get("--card") || colors.card,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return colors;
}

/**
 * Format a timestamp to a short date label for axis ticks.
 */
function formatTickDate(timestamp: number): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

/**
 * Format a timestamp to a readable date for the tooltip.
 */
function formatTooltipDate(timestamp: number): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function RevenueChart({
  title,
  data,
  currency = "USD",
  color,
}: RevenueChartProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const resolved = useResolvedColors(cardRef);
  const chartColor = color ?? resolved.chart;

  // Fill in missing dates with zeros to create a continuous time series.
  // This ensures the X-axis shows every day with consistent spacing.
  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    const sorted = [...data].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const start = new Date(sorted[0].date);
    const end = new Date(sorted[sorted.length - 1].date);
    const result: Array<{ timestamp: number; value: number }> = [];

    const dataByDate = new Map(
      sorted.map((d) => [d.date, d.value])
    );

    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      result.push({
        timestamp: current.getTime(),
        value: dataByDate.get(dateStr) ?? 0,
      });
      current.setDate(current.getDate() + 1);
    }

    return result;
  }, [data]);

  return (
    <Card ref={cardRef} className="col-span-full">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No data yet. Connect an account and sync to see your metrics.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
            >
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity={0.5} />
                  <stop offset="80%" stopColor={chartColor} stopOpacity={0.1} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={resolved.grid}
                vertical={false}
              />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={formatTickDate}
                tick={{ fontSize: 12, fill: resolved.muted }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatCurrency(v, currency)}
                tick={{ fontSize: 12, fill: resolved.muted }}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
                      <p className="text-xs text-muted-foreground">
                        {formatTooltipDate(point.timestamp)}
                      </p>
                      <p className="text-sm font-semibold">
                        {formatCurrency(point.value, currency)}
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="linear"
                dataKey="value"
                stroke={chartColor}
                strokeWidth={2}
                fill="url(#revenueGradient)"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: chartColor,
                  stroke: resolved.card,
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
