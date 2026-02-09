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
import { IntegrationLogo } from "@/components/integration-logo";

interface RevenueChartProps {
  title: string;
  data: Array<{
    date: string;
    value: number;
  }>;
  loading?: boolean;
  breakdownByDate?: Record<
    string,
    Array<{ label: string; value: number; integrationName?: string }>
  >;
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
    const update = () => {
      const style = getComputedStyle(el);
      const get = (name: string) => style.getPropertyValue(name).trim();

      setColors((prev) => ({
        chart: get("--chart-1") || prev.chart,
        muted: get("--muted-foreground") || prev.muted,
        grid: get("--border") || prev.grid,
        card: get("--card") || prev.card,
      }));
    };

    update();

    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    return () => observer.disconnect();
  }, [ref]);

  return colors;
}

function useAppearance(): "rounded" | "modern" | "business" {
  const [appearance, setAppearance] = useState<"rounded" | "modern" | "business">("modern");

  useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      if (root.classList.contains("appearance-rounded")) return "rounded";
      if (root.classList.contains("appearance-business")) return "business";
      return "modern";
    };
    setAppearance(read());

    const observer = new MutationObserver(() => setAppearance(read()));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return appearance;
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
  loading = false,
  breakdownByDate,
  currency = "USD",
  color,
}: RevenueChartProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const resolved = useResolvedColors(cardRef);
  const appearance = useAppearance();
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
    const result: Array<{ timestamp: number; value: number; date: string }> = [];

    const dataByDate = new Map(
      sorted.map((d) => [d.date, d.value])
    );

    const current = new Date(start);
    while (current <= end) {
      const dateStr = current.toISOString().split("T")[0];
      result.push({
        timestamp: current.getTime(),
        value: dataByDate.get(dateStr) ?? 0,
        date: dateStr,
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
      <CardContent className="relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/70 text-xs font-medium text-muted-foreground backdrop-blur-sm">
            Loading chart data…
          </div>
        )}
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
                strokeLinecap={appearance === "rounded" ? "round" : "butt"}
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
                tick={(props: any) => (
                  <g className="sensitive">
                    <text x={props.x} y={props.y} dy={4} textAnchor="end" fontSize={12} fill={resolved.muted}>
                      {props.payload?.value != null ? formatCurrency(props.payload.value, currency) : ""}
                    </text>
                  </g>
                )}
                axisLine={false}
                tickLine={false}
                width={80}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload;
                  const breakdown = breakdownByDate?.[point.date] ?? [];
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
                      <p className="text-xs text-muted-foreground">
                        {formatTooltipDate(point.timestamp)}
                      </p>
                      <p className="sensitive text-sm font-semibold">
                        {formatCurrency(point.value, currency)}
                      </p>
                      {breakdown.length > 0 && (
                        <div className="mt-2 border-t border-border pt-2">
                          <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                            Top products
                          </p>
                          <div className="space-y-1">
                            {breakdown.map((item, idx) => (
                              <div
                                key={`${item.integrationName ?? "unknown"}:${item.label}:${idx}`}
                                className="flex items-center justify-between gap-4 text-xs"
                              >
                                <span className="flex items-center gap-2 truncate">
                                  {item.integrationName && (
                                    <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-muted">
                                      <IntegrationLogo
                                        integration={item.integrationName}
                                        size={12}
                                      />
                                    </span>
                                  )}
                                  <span className="truncate">{item.label}</span>
                                </span>
                                <span className="sensitive font-medium">
                                  {formatCurrency(item.value, currency)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Area
                type={appearance === "rounded" ? "monotone" : "linear"}
                dataKey="value"
                stroke={chartColor}
                strokeWidth={2}
                fill="url(#revenueGradient)"
                dot={false}
                activeDot={{
                  r: appearance === "rounded" ? 6 : 4,
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
