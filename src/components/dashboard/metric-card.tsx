"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatNumber, formatPercentage } from "@/lib/format";
import { TrendingUp, TrendingDown, Minus, ChevronDown, Crown, Trophy } from "lucide-react";
import { IntegrationLogo } from "@/components/integration-logo";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";

export interface RankingEntry {
  label: string;
  integrationName: string;
  value: number;
  percentage: number;
}

interface MetricCardProps {
  title: string;
  value: number;
  previousValue?: number;
  format: "currency" | "number" | "percentage";
  currency?: string;
  icon?: React.ReactNode;
  description?: string;
  ranking?: RankingEntry[];
  /** Show skeleton shimmer instead of real data */
  loading?: boolean;
}

function formatRankingValue(
  value: number,
  fmt: "currency" | "number" | "percentage",
  currency: string
): string {
  if (fmt === "currency") return formatCurrency(value, currency);
  if (fmt === "percentage") return `${value.toFixed(1)}%`;
  return formatNumber(value);
}

// Chart-palette colors for the bar race (cycle through chart-1..5)
const BAR_COLORS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
];

// Medal accent colors for top 3
const MEDAL_STYLES = [
  // Gold
  "bg-amber-400/15 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400 ring-1 ring-amber-400/30",
  // Silver
  "bg-slate-300/20 text-slate-600 dark:bg-slate-300/10 dark:text-slate-300 ring-1 ring-slate-400/20",
  // Bronze
  "bg-orange-400/15 text-orange-600 dark:bg-orange-400/10 dark:text-orange-400 ring-1 ring-orange-400/20",
];

export function MetricCard({
  title,
  value,
  previousValue,
  format,
  currency = "USD",
  icon,
  description,
  ranking,
  loading = false,
}: MetricCardProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const formattedValue =
    format === "currency"
      ? formatCurrency(value, currency)
      : format === "percentage"
        ? `${value.toFixed(1)}%`
        : formatNumber(value);

  const change =
    previousValue !== undefined && previousValue !== 0
      ? ((value - previousValue) / previousValue) * 100
      : null;

  const hasRanking = !loading && ranking && ranking.length > 1;
  const topSource = !loading && ranking && ranking.length > 0 ? ranking[0] : null;

  // Close on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  return (
    <div ref={cardRef} className="relative">
      <Card
        className={cn(
          "transition-all duration-300",
          hasRanking && "cursor-pointer hover:shadow-md hover:border-primary/20",
          dropdownOpen && "shadow-lg border-primary/30 ring-1 ring-primary/10"
        )}
        onClick={hasRanking ? () => setDropdownOpen((o) => !o) : undefined}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {icon && <div className="text-muted-foreground">{icon}</div>}
            {hasRanking && (
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-300",
                  dropdownOpen && "rotate-180 text-primary"
                )}
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            /* Skeleton placeholder — matches the height of real content */
            <div>
              <Skeleton className="h-7 w-28" />
              <Skeleton className="mt-4 h-4 w-36" />
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold">{formattedValue}</div>

              {/* Top source — leader callout */}
              {topSource && hasRanking && (
                <div className="mt-4 flex items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      MEDAL_STYLES[0]
                    )}
                  >
                    <Crown className="h-2.5 w-2.5" />
                    {topSource.label}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {topSource.percentage.toFixed(0)}% via {topSource.integrationName}
                  </span>
                </div>
              )}

              {change !== null && (
                <div className="mt-1 flex items-center gap-1">
                  {change > 0 ? (
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  ) : change < 0 ? (
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                  ) : (
                    <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span
                    className={cn(
                      "text-xs font-medium",
                      change > 0
                        ? "text-emerald-500"
                        : change < 0
                          ? "text-red-500"
                          : "text-muted-foreground"
                    )}
                  >
                    {formatPercentage(change)}
                  </span>
                  {description && (
                    <span className="text-xs text-muted-foreground">
                      {description}
                    </span>
                  )}
                </div>
              )}
              {change === null && description && (
                <p className="mt-1 text-xs text-muted-foreground">{description}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Overlay leaderboard dropdown ─────────────────────────────── */}
      {dropdownOpen && hasRanking && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-border bg-popover p-4 shadow-xl">
          {/* Header */}
          <div className="mb-3 flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-muted-foreground/70" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Source leaderboard
            </span>
          </div>

          {/* Separator */}
          <div className="mb-3 h-px bg-border" />

          {/* Ranked entries */}
          <div className="space-y-3">
            {ranking.map((entry, i) => {
              const barColor = BAR_COLORS[i % BAR_COLORS.length];
              const medalStyle = i < 3 ? MEDAL_STYLES[i] : null;

              return (
                <div key={entry.label + i}>
                  {/* Row: rank badge + logo + label + value */}
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {/* Rank badge — shrink-0 prevents cropping */}
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold",
                          medalStyle ?? "bg-muted text-muted-foreground"
                        )}
                      >
                        {i + 1}
                      </span>

                      {/* Integration logo */}
                      <IntegrationLogo
                        integration={entry.integrationName}
                        size={16}
                        className="shrink-0"
                      />

                      {/* Account label */}
                      <span
                        className={cn(
                          "truncate text-sm font-medium leading-none",
                          i === 0 ? "text-foreground" : "text-foreground/80"
                        )}
                      >
                        {entry.label}
                      </span>
                    </div>

                    {/* Value */}
                    <span
                      className={cn(
                        "shrink-0 font-mono text-sm tabular-nums",
                        i === 0 ? "font-bold text-foreground" : "font-medium text-foreground/70"
                      )}
                    >
                      {formatRankingValue(entry.value, format, currency)}
                    </span>
                  </div>

                  {/* Bar */}
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/60">
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full",
                        barColor,
                        i === 0 ? "opacity-100" : "opacity-75"
                      )}
                      style={{
                        width: `${Math.max(entry.percentage, 3)}%`,
                      }}
                    />
                  </div>

                  {/* Percentage */}
                  <div className="mt-0.5 text-right">
                    <span
                      className={cn(
                        "text-[10px] tabular-nums",
                        i === 0
                          ? "font-semibold text-foreground/60"
                          : "text-muted-foreground"
                      )}
                    >
                      {entry.percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
