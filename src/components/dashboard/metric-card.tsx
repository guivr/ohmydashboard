"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatNumber, formatPercentage } from "@/lib/format";
import { ChevronDown, Crown, Trophy, Info } from "lucide-react";
import { IntegrationLogo } from "@/components/integration-logo";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { buildCalculationLines, type CalculationInfo } from "./metric-calculation";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export interface RankingEntry {
  label: string;
  integrationName: string;
  /** When entry represents a project group, contains all integration names for stacked logos. */
  integrationNames?: string[];
  value: number;
  percentage: number;
  /** For project group entries: the individual members that were merged. */
  children?: RankingEntry[];
  /** Optional secondary annotation shown below the label (e.g., "8.2% of revenue"). */
  subtitle?: string;
  /** Optional stable identifier for matching entries across metric types (projectId or accountId). */
  sourceId?: string;
}

export interface ChartDataPoint {
  date: string;
  value: number;
}

interface MetricCardProps {
  title: string;
  value: number;
  previousValue?: number;
  format: "currency" | "number" | "percentage";
  currency?: string;
  icon?: React.ReactNode;
  description?: string;
  /** Direction that indicates a "good" change (default: "up"). */
  changeDirection?: "up" | "down";
  ranking?: RankingEntry[];
  /** Custom label for the ranking dropdown header (default: "Source leaderboard") */
  rankingLabel?: string;
  calculation?: CalculationInfo;
  /** Show skeleton shimmer instead of real data */
  loading?: boolean;
  /** Daily time-series data for the inline area chart */
  chartData?: ChartDataPoint[];
  /** CSS color for the chart line/fill (defaults to --chart-1) */
  chartColor?: string;
  /** Stable unique ID for SVG gradient references (e.g. the metric key) */
  chartId?: string;
  /** Per-date source breakdown for chart tooltip (date -> top-N entries) */
  breakdownByDate?: Record<
    string,
    Array<{ label: string; value: number; integrationName?: string; integrationNames?: string[] }>
  >;
  /** Optional subtitle shown below the main value (e.g. "8.2% of revenue") */
  subtitle?: string;
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

/**
 * Resolve CSS custom properties to computed color strings.
 */
function useResolvedChartColors(ref: React.RefObject<HTMLElement | null>) {
  const [colors, setColors] = useState({
    chart: "#6C8EEF",
    muted: "#888888",
    grid: "rgba(255,255,255,0.06)",
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

function formatTickDate(timestamp: number): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTooltipDate(timestamp: number): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function MetricCard({
  title,
  value,
  previousValue,
  format,
  currency = "USD",
  icon,
  description,
  changeDirection = "up",
  ranking,
  rankingLabel = "Source leaderboard",
  calculation,
  loading = false,
  chartData,
  chartColor,
  chartId,
  breakdownByDate,
  subtitle,
}: MetricCardProps) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [showAllRanking, setShowAllRanking] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [calcOpen, setCalcOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const resolved = useResolvedChartColors(cardRef);
  const appearance = useAppearance();
  const lineColor = chartColor ?? resolved.chart;

  // Fill in missing dates with zeros for a continuous time series
  const filledChartData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    const sorted = [...chartData].sort((a, b) => a.date.localeCompare(b.date));
    const start = new Date(sorted[0].date);
    const end = new Date(sorted[sorted.length - 1].date);
    const dataByDate = new Map(sorted.map((d) => [d.date, d.value]));
    const result: Array<{ timestamp: number; value: number; date: string }> = [];
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
  }, [chartData]);
  const hasChart = filledChartData.length > 1;

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
  const changeIsGood =
    change === null || change === 0
      ? null
      : changeDirection === "up"
        ? change > 0
        : change < 0;

  const hasRanking = !loading && ranking && ranking.length > 1;
  const topSource = !loading && ranking && ranking.length > 0 ? ranking[0] : null;



  const rankingList = ranking ?? [];
  const collapsedCount =
    rankingList.length > 5 ? rankingList.length - 5 : 0;
  const visibleRanking = showAllRanking
    ? rankingList
    : rankingList.slice(0, 5);

  return (
    <div ref={cardRef} className="h-full">
      <Card
        className="h-full gap-2"
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {icon && <div className="text-muted-foreground">{icon}</div>}
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
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{formattedValue}</span>
                {change !== null && (
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      changeIsGood === null
                        ? "text-muted-foreground"
                        : changeIsGood
                          ? "text-emerald-500"
                          : "text-red-500"
                    )}
                  >
                    {formatPercentage(change)}
                  </span>
                )}
                {calculation && (
                  <button
                    type="button"
                    onClick={() => setCalcOpen(true)}
                    className="business-square inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground/60 transition hover:bg-muted-foreground/20 hover:text-foreground"
                    aria-label="View calculation"
                  >
                    <Info className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
              {subtitle && (
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                  {subtitle}
                </p>
              )}
              {previousValue !== undefined && previousValue !== 0 && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {format === "currency"
                    ? formatCurrency(previousValue, currency)
                    : format === "percentage"
                      ? `${previousValue.toFixed(1)}%`
                      : formatNumber(previousValue)}{" "}
                  {description ?? "previous period"}
                </p>
              )}
              {change === null && description && (
                <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
              )}

              {/* Top source — leader callout */}
              {topSource && hasRanking && (
                <div className="mt-3 flex items-center gap-1.5">
                  <span
                    className={cn(
                      "business-square inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      MEDAL_STYLES[0]
                    )}
                  >
                    <Crown className="h-2.5 w-2.5" />
                    {topSource.label}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {topSource.percentage.toFixed(0)}% via{" "}
                    {topSource.integrationNames && topSource.integrationNames.length > 1
                      ? topSource.integrationNames.join(" + ")
                      : topSource.integrationName}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Inline area chart */}
          {!loading && hasChart && (
            <div className="mt-6 -mx-2">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart
                  data={filledChartData}
                  margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
                >
                  <defs>
                    <linearGradient
                      id={`grad-${chartId ?? "chart"}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={lineColor}
                        stopOpacity={0.5}
                      />
                      <stop
                        offset="80%"
                        stopColor={lineColor}
                        stopOpacity={0.1}
                      />
                      <stop
                        offset="100%"
                        stopColor={lineColor}
                        stopOpacity={0}
                      />
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
                    tickFormatter={(v) =>
                      format === "currency"
                        ? formatCurrency(v, currency)
                        : formatNumber(v)
                    }
                    tick={{ fontSize: 12, fill: resolved.muted }}
                    axisLine={false}
                    tickLine={false}
                    width={format === "currency" ? 80 : 40}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const point = payload[0].payload;
                      const fmtValue =
                        format === "currency"
                          ? formatCurrency(point.value, currency)
                          : format === "percentage"
                            ? `${point.value.toFixed(1)}%`
                            : formatNumber(point.value);
                      const rawBreakdown = breakdownByDate?.[point.date] ?? [];
                      // Expand group entries that are open in the breakdown
                      const breakdown = rawBreakdown.flatMap((item) => {
                        if (expandedGroups.has(item.label) && item.integrationNames && item.integrationNames.length > 1) {
                          // Find the matching ranking entry to get children
                          const groupEntry = rankingList.find(
                            (r) => r.label === item.label && r.children && r.children.length > 0
                          );
                          if (groupEntry?.children) {
                            // Scale children values proportionally to this day's group total
                            const groupTotal = groupEntry.value;
                            return groupEntry.children.map((child) => ({
                              label: child.label,
                              value: groupTotal > 0 ? (child.value / groupTotal) * item.value : 0,
                              integrationName: child.integrationName,
                            }));
                          }
                        }
                        return [item];
                      });
                      return (
                        <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
                          <p className="text-xs text-muted-foreground">
                            {formatTooltipDate(point.timestamp)}
                          </p>
                          <p className="text-sm font-semibold">{fmtValue}</p>
                          {breakdown.length > 0 && (
                            <div className="mt-2 border-t border-border pt-2">
                              <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                                Top sources
                              </p>
                              <div className="space-y-1">
                                {breakdown.map((item, idx) => (
                                  <div
                                    key={`${item.integrationName ?? "unknown"}:${item.label}:${idx}`}
                                    className="flex items-center justify-between gap-4 text-xs"
                                  >
                                    <span className="flex items-center gap-1.5 truncate">
                                      {item.integrationNames && item.integrationNames.length > 1 ? (
                                        <span className="relative flex shrink-0 items-center" style={{ width: 14 + (item.integrationNames.length - 1) * 9, height: 14 }}>
                                          {item.integrationNames.map((name, logoIdx) => (
                                            <span
                                              key={name}
                                              className="absolute top-0 flex h-3.5 w-3.5 items-center justify-center overflow-hidden rounded-full bg-card ring-[1px] ring-card"
                                              style={{ left: logoIdx * 9, zIndex: item.integrationNames!.length - logoIdx }}
                                            >
                                              <IntegrationLogo integration={name} size={14} />
                                            </span>
                                          ))}
                                        </span>
                                      ) : item.integrationName ? (
                                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm bg-muted">
                                          <IntegrationLogo
                                            integration={item.integrationName}
                                            size={14}
                                          />
                                        </span>
                                      ) : null}
                                      <span className="truncate">{item.label}</span>
                                    </span>
                                    <span className="shrink-0 font-medium tabular-nums">
                                      {format === "currency"
                                        ? formatCurrency(item.value, currency)
                                        : formatNumber(item.value)}
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
                    stroke={lineColor}
                    strokeWidth={2}
                    fill={`url(#grad-${chartId ?? "chart"})`}
                    dot={false}
                    activeDot={{
                      r: appearance === "rounded" ? 6 : 4,
                      fill: lineColor,
                      stroke: resolved.card,
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          {loading && hasChart === false && chartData !== undefined && (
            <Skeleton className="mt-6 h-[200px] w-full" />
          )}
        </CardContent>
          {/* ─── Collapsible ranking breakdown ──────────────────────────── */}
          {!loading && hasRanking && (
          <CardContent className="pt-0">
            <button
              type="button"
              onClick={() => setBreakdownOpen((o) => !o)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-medium text-muted-foreground/70 transition hover:text-muted-foreground"
            >
              <Trophy className="h-3 w-3" />
              <span>{breakdownOpen ? "Hide breakdown" : "Show breakdown"}</span>
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform duration-200",
                  breakdownOpen && "rotate-180"
                )}
              />
            </button>

            {breakdownOpen && (
              <div className="mt-3 space-y-3">
                {visibleRanking.map((entry, i) => {
                  const barColor = BAR_COLORS[i % BAR_COLORS.length];
                  const medalStyle = i < 3 ? MEDAL_STYLES[i] : null;
                  const hasChildren = entry.children && entry.children.length > 0;
                  const isExpanded = expandedGroups.has(entry.label);

                  return (
                    <div key={entry.label + i}>
                      <div
                        className={cn(
                          "mb-1.5 flex items-center justify-between gap-2",
                          hasChildren && "cursor-pointer"
                        )}
                        onClick={hasChildren ? () => {
                          setExpandedGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(entry.label)) {
                              next.delete(entry.label);
                            } else {
                              next.add(entry.label);
                            }
                            return next;
                          });
                        } : undefined}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              "business-square inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold",
                              medalStyle ?? "bg-muted text-muted-foreground"
                            )}
                          >
                            {i + 1}
                          </span>
                          {entry.integrationNames && entry.integrationNames.length > 1 ? (
                            <span className="relative flex shrink-0 items-center" style={{ width: 16 + (entry.integrationNames.length - 1) * 12, height: 16 }}>
                              {entry.integrationNames.map((name, logoIdx) => (
                                <span
                                  key={name}
                                  className="absolute top-0 flex h-4 w-4 items-center justify-center overflow-hidden rounded-full bg-card ring-[1.5px] ring-card"
                                  style={{ left: logoIdx * 12, zIndex: entry.integrationNames!.length - logoIdx }}
                                >
                                  <IntegrationLogo
                                    integration={name}
                                    size={16}
                                  />
                                </span>
                              ))}
                            </span>
                          ) : (
                            <IntegrationLogo
                              integration={entry.integrationName}
                              size={16}
                              className="shrink-0"
                            />
                          )}
                          <span className="flex min-w-0 flex-col">
                            <span
                              className={cn(
                                "truncate text-sm font-medium leading-none",
                                i === 0 ? "text-foreground" : "text-foreground/80"
                              )}
                            >
                              {entry.label}
                            </span>
                            {entry.subtitle && (
                              <span className="mt-0.5 truncate text-[11px] font-medium leading-tight text-muted-foreground/80">
                                {entry.subtitle}
                              </span>
                            )}
                          </span>
                          {hasChildren && (
                            <ChevronDown
                              className={cn(
                                "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200",
                                isExpanded && "rotate-180"
                              )}
                            />
                          )}
                        </div>
                        <span
                          className={cn(
                            "shrink-0 font-mono text-sm tabular-nums",
                            i === 0 ? "font-bold text-foreground" : "font-medium text-foreground/70"
                          )}
                        >
                          {formatRankingValue(entry.value, format, currency)}
                        </span>
                      </div>

                      <div className="business-square relative h-2 w-full overflow-hidden rounded-full bg-muted/60">
                        <div
                          className={cn(
                            "business-square absolute inset-y-0 left-0 rounded-full",
                            barColor,
                            i === 0 ? "opacity-100" : "opacity-75"
                          )}
                          style={{
                            width: `${entry.percentage < 0.5 ? 0.5 : Math.max(entry.percentage, 3)}%`,
                          }}
                        />
                      </div>

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

                      {/* ─── Sub-breakdown for project groups ──────────── */}
                      {hasChildren && isExpanded && (
                        <div className="mt-2 ml-7 space-y-2 border-l-2 border-border pl-3">
                          {entry.children!.map((child, ci) => (
                            <div key={child.label + ci}>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <IntegrationLogo
                                    integration={child.integrationName}
                                    size={14}
                                    className="shrink-0"
                                  />
                                  <span className="flex min-w-0 flex-col">
                                    <span className="truncate text-xs font-medium text-foreground/70">
                                      {child.label}
                                    </span>
                                    {child.subtitle && (
                                      <span className="truncate text-[10px] leading-tight text-muted-foreground">
                                        {child.subtitle}
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <span className="shrink-0 font-mono text-xs tabular-nums text-foreground/60">
                                  {formatRankingValue(child.value, format, currency)}
                                </span>
                              </div>
                              <div className="business-square relative h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
                                <div
                                  className={cn(
                                    "business-square absolute inset-y-0 left-0 rounded-full opacity-60",
                                    barColor
                                  )}
                                  style={{
                                    width: `${Math.max(child.percentage, 4)}%`,
                                  }}
                                />
                              </div>
                              <div className="mt-0.5 text-right">
                                <span className="text-[10px] tabular-nums text-muted-foreground">
                                  {child.percentage.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {collapsedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAllRanking((prev) => !prev)}
                    className="w-full rounded-md border border-border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 transition hover:border-primary/30 hover:text-foreground"
                  >
                    {showAllRanking
                      ? "Show less"
                      : `Expand (${collapsedCount} others)`}
                  </button>
                )}


              </div>
            )}
          </CardContent>
        )}
      </Card>

      {calculation && (
        <Dialog open={calcOpen} onOpenChange={setCalcOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{title} calculation</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm text-muted-foreground">
              {buildCalculationLines(calculation).map((line, i) => (
                <p key={`${calculation.metricKey}-${i}`}>{line}</p>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Current
                </div>
                <div className="text-base font-semibold text-foreground">
                  {formatRankingValue(value, format, currency)}
                </div>
              </div>
              <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Previous
                </div>
                <div className="text-base font-semibold text-foreground">
                  {previousValue !== undefined
                    ? formatRankingValue(previousValue, format, currency)
                    : "—"}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
