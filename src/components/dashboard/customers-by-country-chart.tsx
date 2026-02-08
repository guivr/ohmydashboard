"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IntegrationLogo } from "@/components/integration-logo";
import { formatNumber } from "@/lib/format";
import { Globe, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { CustomerCountryType, CustomersByCountryResponse } from "@/hooks/use-metrics";
import { apiGet } from "@/lib/api-client";
import { BreakdownBar } from "@/components/dashboard/breakdown-bar";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

// ─── Country name resolution ───────────────────────────────────────────────

/**
 * Use the browser's Intl.DisplayNames API to resolve any valid ISO 3166-1
 * alpha-2 code to its full English name. Falls back to the raw code if
 * resolution fails (e.g. "Unknown", "Other", invalid codes).
 */
const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

function getCountryName(code: string): string {
  if (code === "Unknown" || code === "Other") return code;
  try {
    return displayNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

// ─── Country code → flag emoji ─────────────────────────────────────────────

function getCountryFlag(code: string): string {
  if (code === "Unknown" || code === "Other" || code.length !== 2) return "\uD83C\uDF10";
  const codePoints = code
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// ─── Chart colors ──────────────────────────────────────────────────────────

const BAR_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CountryDataPoint {
  country: string;
  count: number;
}

export interface CountrySourceBreakdownEntry {
  country: string;
  count: number;
  accountId: string;
  projectId: string | null;
}

export interface IntegrationInfoSlim {
  id: string;
  name: string;
  accounts: Array<{ id: string; label: string }>;
}

interface CustomersByCountryChartProps {
  data: CountryDataPoint[];
  /** Per-source breakdown (account + optional project) */
  bySource?: CountrySourceBreakdownEntry[];
  /** Account ID → label mapping */
  accountLabels?: Record<string, string>;
  /** Project ID → { label, accountId } mapping */
  projectLabels?: Record<string, { label: string; accountId: string }>;
  /** Integration info for rendering logos next to source names */
  accountIntegrationMap?: IntegrationInfoSlim[];
  loading?: boolean;
  /** Max countries to display (rest are grouped into "Other") */
  maxCountries?: number;
  /** Account IDs for fetching toggled data */
  accountIds?: string[];
  /** Date range for fetching toggled data */
  from?: string;
  to?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function useResolvedChartColors(ref: React.RefObject<HTMLElement | null>) {
  const [colors, setColors] = useState<string[]>([
    "#6C8EEF",
    "#F59E0B",
    "#10B981",
    "#8B5CF6",
    "#EC4899",
  ]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const style = getComputedStyle(el);
      const resolved = BAR_PALETTE.map((v) => {
        const varName = v.replace("var(", "").replace(")", "");
        return style.getPropertyValue(varName).trim() || v;
      });
      if (resolved.some((c) => c && !c.startsWith("var("))) {
        setColors(resolved);
      }
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

interface SourceEntry {
  accountId: string;
  label: string;
  integrationName: string;
  count: number;
  percentage: number;
}

const MEDAL_STYLES = [
  "bg-amber-400/15 text-amber-600 ring-1 ring-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400",
  "bg-slate-300/20 text-slate-600 ring-1 ring-slate-400/20 dark:bg-slate-300/10 dark:text-slate-300",
  "bg-orange-400/15 text-orange-600 ring-1 ring-orange-400/20 dark:bg-orange-400/10 dark:text-orange-400",
];

const BAR_COLORS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
];

// ─── Component ─────────────────────────────────────────────────────────────

export function CustomersByCountryChart({
  data: initialData,
  bySource: initialBySource,
  accountLabels: initialAccountLabels,
  projectLabels: initialProjectLabels,
  accountIntegrationMap,
  loading: initialLoading = false,
  maxCountries = 10,
  accountIds,
  from,
  to,
}: CustomersByCountryChartProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const resolvedColors = useResolvedChartColors(cardRef);
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);

  // ── Toggle: paying vs all ──
  const [viewType, setViewType] = useState<CustomerCountryType>("paying");
  const [altData, setAltData] = useState<CustomersByCountryResponse | null>(null);
  const [altLoading, setAltLoading] = useState(false);

  // Fetch "all" data on demand when toggle switches
  const fetchAltData = useCallback(async () => {
    setAltLoading(true);
    try {
      const params = new URLSearchParams();
      if (accountIds?.length) params.set("accountIds", accountIds.join(","));
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("type", "all");
      const result = await apiGet<CustomersByCountryResponse>(
        `/api/metrics/customers-by-country?${params.toString()}`
      );
      setAltData(result);
    } catch {
      // silently fail — user can retry
    } finally {
      setAltLoading(false);
    }
  }, [accountIds, from, to]);

  useEffect(() => {
    if (viewType === "all" && !altData && !altLoading) {
      fetchAltData();
    }
  }, [viewType, altData, altLoading, fetchAltData]);

  // Reset alt data when filters change
  useEffect(() => {
    setAltData(null);
  }, [accountIds, from, to]);

  // Resolve which dataset to display
  const data = viewType === "all" && altData ? altData.totals : initialData;
  const bySource = viewType === "all" && altData ? altData.bySource : initialBySource;
  const accountLabels = viewType === "all" && altData ? altData.accounts : initialAccountLabels;
  const projectLabels = viewType === "all" && altData ? altData.projects : initialProjectLabels;
  const loading = initialLoading || (viewType === "all" && altLoading);
  const [expandedOtherCountry, setExpandedOtherCountry] = useState<string | null>(null);

  const accountToIntegration = useMemo(() => {
    const map = new Map<string, string>();
    if (accountIntegrationMap) {
      for (const integration of accountIntegrationMap) {
        for (const account of integration.accounts ?? []) {
          map.set(account.id, integration.name);
        }
      }
    }
    return map;
  }, [accountIntegrationMap]);

  // Build per-country source breakdown.
  // When a row has a projectId, use the project label (e.g. "CSS Scan 4.0").
  // When it doesn't, use the account label (e.g. "Drawings Alive").
  const sourcesByCountry = useMemo(() => {
    if (!bySource || bySource.length === 0) return new Map<string, SourceEntry[]>();

    const map = new Map<string, SourceEntry[]>();

    // Group by country, then by a composite key (projectId ?? accountId)
    const grouped = new Map<string, Map<string, { count: number; accountId: string; projectId: string | null }>>();
    for (const entry of bySource) {
      if (!grouped.has(entry.country)) grouped.set(entry.country, new Map());
      const srcMap = grouped.get(entry.country)!;
      const key = entry.projectId ?? `account:${entry.accountId}`;
      const existing = srcMap.get(key);
      if (existing) {
        existing.count += entry.count;
      } else {
        srcMap.set(key, { count: entry.count, accountId: entry.accountId, projectId: entry.projectId });
      }
    }

    for (const [country, srcMap] of grouped) {
      const countryTotal = Array.from(srcMap.values()).reduce((a, b) => a + b.count, 0);
      const entries: SourceEntry[] = Array.from(srcMap.values(), (src) => {
        // Prefer project label; fall back to account label
        const label = src.projectId
          ? (projectLabels?.[src.projectId]?.label ?? src.projectId.slice(0, 12))
          : (accountLabels?.[src.accountId] ?? src.accountId.slice(0, 8));
        return {
          accountId: src.accountId,
          label,
          integrationName: accountToIntegration.get(src.accountId) ?? "Unknown",
          count: src.count,
          percentage: countryTotal > 0 ? (src.count / countryTotal) * 100 : 0,
        };
      }).sort((a, b) => b.count - a.count);
      map.set(country, entries);
    }

    return map;
  }, [bySource, accountLabels, projectLabels, accountToIntegration]);

  // Separate known countries from "Unknown"
  const { knownData, unknownCount, totalAll } = useMemo(() => {
    if (!data || data.length === 0) return { knownData: [], unknownCount: 0, totalAll: 0 };
    const unknown = data.find((d) => d.country === "Unknown")?.count ?? 0;
    const known = data.filter((d) => d.country !== "Unknown");
    const all = data.reduce((s, d) => s + d.count, 0);
    return { knownData: known, unknownCount: unknown, totalAll: all };
  }, [data]);

  // Build chart data from known countries only, tracking which countries
  // get grouped into "Other" so we can aggregate their sources.
  const { chartData, otherCountries } = useMemo(() => {
    if (knownData.length === 0) return { chartData: [], otherCountries: [] as string[] };
    const sorted = [...knownData].sort((a, b) => b.count - a.count);
    const mapEntry = (d: CountryDataPoint) => ({
      country: d.country,
      name: getCountryName(d.country),
      flag: getCountryFlag(d.country),
      count: d.count,
      label: `${getCountryFlag(d.country)} ${getCountryName(d.country)}`,
    });

    if (sorted.length <= maxCountries) {
      return { chartData: sorted.map(mapEntry), otherCountries: [] as string[] };
    }
    const top = sorted.slice(0, maxCountries - 1);
    const rest = sorted.slice(maxCountries - 1);
    const otherCount = rest.reduce((sum, d) => sum + d.count, 0);
    return {
      chartData: [
        ...top.map(mapEntry),
        {
          country: "Other",
          name: "Other",
          flag: "\uD83C\uDF10",
          count: otherCount,
          label: "\uD83C\uDF10 Other",
        },
      ],
      otherCountries: rest.map((d) => d.country),
    };
  }, [knownData, maxCountries]);

  // Build detailed data for the "Other" group — each country with its
  // count and source breakdown, so expanding "Other" shows all the
  // individual countries just like the main ranking.
  const otherCountryDetails = useMemo(() => {
    if (otherCountries.length === 0) return [];
    // otherCountries are already sorted by count (they come from the tail of the sorted knownData)
    return otherCountries.map((code) => {
      const d = knownData.find((c) => c.country === code);
      const count = d?.count ?? 0;
      return {
        country: code,
        name: getCountryName(code),
        flag: getCountryFlag(code),
        count,
        sources: sourcesByCountry.get(code) ?? [],
      };
    }).sort((a, b) => b.count - a.count);
  }, [otherCountries, knownData, sourcesByCountry]);

  const knownTotal = useMemo(
    () => chartData.reduce((sum, d) => sum + d.count, 0),
    [chartData]
  );
  const chartHeight = useMemo(
    () => Math.max(chartData.length * 40 + 20, 200),
    [chartData]
  );

  const hasData = chartData.length > 0 || unknownCount > 0;
  const hasSources = sourcesByCountry.size > 0;

  return (
    <div ref={cardRef}>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Customers by Country
            </CardTitle>
            <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5 text-[11px]">
              <button
                className={cn(
                  "rounded px-2 py-0.5 font-medium transition-colors",
                  viewType === "paying"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setViewType("paying")}
              >
                Paying
              </button>
              <button
                className={cn(
                  "rounded px-2 py-0.5 font-medium transition-colors",
                  viewType === "all"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setViewType("all")}
              >
                All
              </button>
            </div>
          </div>
          <Globe className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-[300px] w-full" />
            </div>
          ) : !hasData ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              No country data available yet. Data will appear after the next sync.
            </div>
          ) : chartData.length === 0 ? (
            /* Only unknown data, no known countries */
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              {formatNumber(unknownCount)} customers with unknown location.
              Country data is only available for customers with a payment method on file.
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="mb-4 flex items-baseline gap-2">
                <span className="text-2xl font-bold">
                  {formatNumber(knownTotal)}
                </span>
                <span className="text-sm text-muted-foreground">
                  across {knownData.length}{" "}
                  {knownData.length === 1 ? "country" : "countries"}
                </span>
              </div>

              <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
                {/* Horizontal bar chart — known countries only */}
                <div className="-mx-2">
                  <ResponsiveContainer width="100%" height={chartHeight}>
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
                    >
                      <XAxis
                        type="number"
                        tickFormatter={(v) => formatNumber(v)}
                        tick={{ fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={160}
                        tick={{ fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                    <Tooltip
                      cursor={false}
                      content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const point = payload[0].payload;
                          const pct =
                            knownTotal > 0
                              ? ((point.count / knownTotal) * 100).toFixed(1)
                              : "0";
                          const sources = sourcesByCountry.get(point.country);
                          return (
                            <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md">
                              <p className="text-xs text-muted-foreground">
                                {point.flag} {point.name}
                              </p>
                              <p className="text-sm font-semibold">
                                {formatNumber(point.count)} customers
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {pct}% of identified
                              </p>
                              {sources && sources.length > 0 && (
                                <div className="mt-2 border-t border-border pt-2">
                                  <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                                    Sources
                                  </p>
                                  <div className="space-y-1">
                                    {sources.slice(0, 5).map((src, srcIdx) => (
                                      <div
                                        key={`${src.accountId}-${src.label}-${srcIdx}`}
                                        className="flex items-center justify-between gap-4 text-xs"
                                      >
                                        <span className="flex items-center gap-1.5 truncate">
                                          <IntegrationLogo
                                            integration={src.integrationName}
                                            size={14}
                                          />
                                          <span className="truncate">{src.label}</span>
                                        </span>
                                        <span className="shrink-0 font-medium tabular-nums">
                                          {formatNumber(src.count)}
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
                    <Bar
                      dataKey="count"
                      radius={[0, 4, 4, 0]}
                      barSize={24}
                      activeBar={{
                        stroke: "rgba(255, 255, 255, 0.45)",
                        strokeWidth: 2,
                        fillOpacity: 1,
                      }}
                    >
                        {chartData.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={resolvedColors[index % resolvedColors.length]}
                            fillOpacity={0.85}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Ranking list with source breakdown */}
                <div
                  className="space-y-2 overflow-y-auto border-t border-border pt-4 pr-2 lg:border-t-0 lg:border-l lg:pl-4 lg:pt-0"
                  style={{ maxHeight: chartHeight }}
                >
                {chartData.map((entry, i) => {
                  const pct = knownTotal > 0 ? (entry.count / knownTotal) * 100 : 0;
                  const isOther = entry.country === "Other";
                  const sources = isOther ? undefined : sourcesByCountry.get(entry.country);
                  const isExpanded = expandedCountry === entry.country;
                  const isExpandable = isOther
                    ? otherCountryDetails.length > 0
                    : hasSources && sources && sources.length > 1;
                  const barColor = BAR_COLORS[i % BAR_COLORS.length];

                  return (
                    <div key={entry.country}>
                      <div
                        className={cn(
                          "flex items-center justify-between text-sm",
                          isExpandable && "cursor-pointer"
                        )}
                        onClick={
                          isExpandable
                            ? () => setExpandedCountry(isExpanded ? null : entry.country)
                            : undefined
                        }
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold",
                              i < 3
                                ? MEDAL_STYLES[i]
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {i + 1}
                          </span>
                          <span className="text-base">{entry.flag}</span>
                          <span className="font-medium">{entry.name}</span>
                          {!isOther && hasSources && sources && sources.length === 1 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <IntegrationLogo
                                integration={sources[0].integrationName}
                                size={14}
                              />
                              {sources[0].label}
                            </span>
                          )}
                          {isOther && (
                            <span className="text-xs text-muted-foreground">
                              {otherCountryDetails.length}{" "}
                              {otherCountryDetails.length === 1 ? "country" : "countries"}
                            </span>
                          )}
                          {isExpandable && (
                            <ChevronDown
                              className={cn(
                                "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200",
                                isExpanded && "rotate-180"
                              )}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {!isOther && hasSources && sources && sources.length > 1 && (() => {
                            const uniqueIntegrations = [...new Map(
                              sources.map((s) => [s.integrationName, s])
                            ).values()];
                            return (
                              <span
                                className="relative flex shrink-0 items-center"
                                style={{
                                  width: 14 + (uniqueIntegrations.length - 1) * 9,
                                  height: 14,
                                }}
                              >
                                {uniqueIntegrations.map((src, logoIdx) => (
                                  <span
                                    key={src.integrationName}
                                    className="absolute top-0 flex h-3.5 w-3.5 items-center justify-center overflow-hidden rounded-full bg-card ring-[1px] ring-card"
                                    style={{
                                      left: logoIdx * 9,
                                      zIndex: uniqueIntegrations.length - logoIdx,
                                    }}
                                  >
                                    <IntegrationLogo
                                      integration={src.integrationName}
                                      size={14}
                                    />
                                  </span>
                                ))}
                              </span>
                            );
                          })()}
                          <span className="tabular-nums font-medium">
                            {formatNumber(entry.count)}
                          </span>
                          <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {/* Source breakdown for regular countries */}
                      {isExpanded && !isOther && sources && sources.length > 1 && (
                        <div className="mt-2 ml-7 space-y-2 border-l-2 border-border pl-3">
                          {sources.map((src, srcIdx) => (
                            <div key={`${src.accountId}-${src.label}-${srcIdx}`}>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <IntegrationLogo
                                    integration={src.integrationName}
                                    size={14}
                                    className="shrink-0"
                                  />
                                  <span className="truncate text-xs font-medium text-foreground/70">
                                    {src.label}
                                  </span>
                                </div>
                                <span className="shrink-0 font-mono text-xs tabular-nums text-foreground/60">
                                  {formatNumber(src.count)}
                                </span>
                              </div>
                              <BreakdownBar
                                percentage={src.percentage}
                                barClassName={cn("opacity-60", barColor)}
                              />
                              <div className="mt-0.5 text-right">
                                <span className="text-[10px] tabular-nums text-muted-foreground">
                                  {src.percentage.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Country breakdown for "Other" group */}
                      {isExpanded && isOther && otherCountryDetails.length > 0 && (
                        <div className="mt-2 ml-7 space-y-1.5 border-l-2 border-border pl-3">
                          {otherCountryDetails.map((c) => {
                            const cPct = entry.count > 0 ? (c.count / entry.count) * 100 : 0;
                            const isCExpandable = c.sources.length > 1;
                            const isCExpanded = expandedOtherCountry === c.country;
                            return (
                              <div key={c.country}>
                                <div
                                  className={cn(
                                    "flex items-center justify-between text-xs",
                                    isCExpandable && "cursor-pointer"
                                  )}
                                  onClick={
                                    isCExpandable
                                      ? () =>
                                          setExpandedOtherCountry(
                                            isCExpanded ? null : c.country
                                          )
                                      : undefined
                                  }
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span>{c.flag}</span>
                                    <span className="font-medium text-foreground/80">{c.name}</span>
                                    {c.sources.length === 1 && (
                                      <span className="flex items-center gap-1 text-muted-foreground">
                                        <IntegrationLogo
                                          integration={c.sources[0].integrationName}
                                          size={12}
                                        />
                                        <span className="truncate">{c.sources[0].label}</span>
                                      </span>
                                    )}
                                    {c.sources.length > 1 && (() => {
                                      const uniqueIntegrations = [...new Map(
                                        c.sources.map((s) => [s.integrationName, s])
                                      ).values()];
                                      return (
                                        <span
                                          className="relative flex shrink-0 items-center"
                                          style={{
                                            width: 12 + (uniqueIntegrations.length - 1) * 7,
                                            height: 12,
                                          }}
                                        >
                                          {uniqueIntegrations.map((src, logoIdx) => (
                                            <span
                                              key={src.integrationName}
                                              className="absolute top-0 flex h-3 w-3 items-center justify-center overflow-hidden rounded-full bg-card ring-[1px] ring-card"
                                              style={{
                                                left: logoIdx * 7,
                                                zIndex: uniqueIntegrations.length - logoIdx,
                                              }}
                                            >
                                              <IntegrationLogo
                                                integration={src.integrationName}
                                                size={12}
                                              />
                                            </span>
                                          ))}
                                        </span>
                                      );
                                    })()}
                                    {isCExpandable && (
                                      <ChevronDown
                                        className={cn(
                                          "h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200",
                                          isCExpanded && "rotate-180"
                                        )}
                                      />
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono tabular-nums text-foreground/60">
                                      {formatNumber(c.count)}
                                    </span>
                                    <span className="w-10 text-right tabular-nums text-muted-foreground text-[10px]">
                                      {cPct.toFixed(1)}%
                                    </span>
                                  </div>
                                </div>
                                {isCExpanded && isCExpandable && (
                                  <div className="mt-2 ml-4 space-y-2 border-l-2 border-border pl-3">
                                    {c.sources.map((src, srcIdx) => (
                                      <div key={`${src.accountId}-${src.label}-${srcIdx}`}>
                                        <div className="mb-1 flex items-center justify-between gap-2">
                                          <div className="flex min-w-0 items-center gap-1.5">
                                            <IntegrationLogo
                                              integration={src.integrationName}
                                              size={12}
                                              className="shrink-0"
                                            />
                                            <span className="truncate text-[11px] font-medium text-foreground/70">
                                              {src.label}
                                            </span>
                                          </div>
                                          <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground/60">
                                            {formatNumber(src.count)}
                                          </span>
                                        </div>
                                        <BreakdownBar
                                          percentage={src.percentage}
                                          barClassName={cn("opacity-60", barColor)}
                                        />
                                        <div className="mt-0.5 text-right">
                                          <span className="text-[10px] tabular-nums text-muted-foreground">
                                            {src.percentage.toFixed(1)}%
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>

              {/* Unknown location footnote */}
              {unknownCount > 0 && (
                <div className="mt-4 flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {formatNumber(unknownCount)} additional{" "}
                    {unknownCount === 1 ? "customer" : "customers"} with unknown
                    location (
                    {totalAll > 0
                      ? ((unknownCount / totalAll) * 100).toFixed(0)
                      : 0}
                    % of total). Typically free-tier signups without a payment
                    method.
                  </span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
