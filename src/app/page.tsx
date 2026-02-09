"use client";

import { useDashboardData } from "@/hooks/use-dashboard-data";
import { MetricCard, type RankingEntry } from "@/components/dashboard/metric-card";
import { CustomersByCountryChart } from "@/components/dashboard/customers-by-country-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DashboardFilter } from "@/components/dashboard/dashboard-filter";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { SyncStatusBar } from "@/components/dashboard/sync-status-bar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBackfillErrorDetails } from "@/components/dashboard/backfill-error";
import {
  DollarSign,
  Users,
  CreditCard,
  TrendingUp,
  Repeat,
  ShoppingBag,
  Package,
  Landmark,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCallback, useMemo, useState, type ReactNode } from "react";

export default function Dashboard() {
  const {
    loading,
    integrationsLoading,
    metricsLoading,
    integrations,
    hasAccounts,
    allAccountsFlat,
    enabledAccountIds,
    enabledProjectIds,
    totalAccountCount,
    filteredAccountCount,
    handleFilterChange,
    dateRangePreset,
    compareEnabled,
    compareBackfillStatus,
    compareBackfillError,
    rangeFrom,
    rangeTo,
    prevRangeFrom,
    prevRangeTo,
    handleDateRangeChange,
    handleCustomRangeChange,
    handleCompareToggle,
    currentTotals,
    previousTotals,
    comparisonAvailability,
    revenueByDay,
    metricsByDay,
    revenueBreakdownByDay,
    breakdownByMetricAndDay,
    pendingByMetricAndDay,
    pendingSourceIdsByMetric,
    pendingSourcesByMetric,
    accountRankings,
    blendedRankings,
    todayTotals,
    yesterdayTotals,
    todayNewMrr,
    yesterdayNewMrr,
    todayBlendedRankings,
    todayLoading,
    pendingTodayByMetric,
    pendingRangeByMetric,
    customersByCountry,
    customersByCountryLoading,
    utcBucketedIntegrations,
    handleSyncComplete,
  } = useDashboardData();

  const [backfillErrorOpen, setBackfillErrorOpen] = useState(false);

  // Compute when UTC midnight falls in the user's local time for the tooltip,
  // and which direction a sale near the boundary would shift.
  const { utcResetLabel, utcDayShift } = useMemo(() => {
    if (utcBucketedIntegrations.size === 0) return { utcResetLabel: "", utcDayShift: "" };
    const offsetMin = new Date().getTimezoneOffset();
    if (offsetMin === 0) return { utcResetLabel: "midnight", utcDayShift: "" };
    const localMinutes = (1440 - offsetMin) % 1440;
    const h = Math.floor(localMinutes / 60);
    const m = localMinutes % 60;
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const timeStr = m === 0 ? `${h12}:00 ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
    const shift = offsetMin < 0 ? "the previous day" : "the following day";
    return { utcResetLabel: timeStr, utcDayShift: shift };
  }, [utcBucketedIntegrations]);

  const comparisonLabel = useCallback(() => {
    if (!compareEnabled) return undefined;
    switch (dateRangePreset) {
      case "today":
        return "yesterday";
      case "last_7_days":
        return "previous 7 days";
      case "last_4_weeks":
        return "previous 4 weeks";
      case "last_30_days":
        return "previous 30 days";
      case "month_to_date":
        return "previous month-to-date";
      case "quarter_to_date":
        return "previous quarter-to-date";
      case "year_to_date":
        return "previous year-to-date";
      case "custom":
        return "previous period";
      case "all_time":
      default:
        return undefined;
    }
  }, [compareEnabled, dateRangePreset]);

  const rangeSuffix = useCallback(() => {
    switch (dateRangePreset) {
      case "today":
        return "Today";
      case "last_7_days":
        return "7d";
      case "last_4_weeks":
        return "4w";
      case "last_30_days":
        return "30d";
      case "month_to_date":
        return "MTD";
      case "quarter_to_date":
        return "QTD";
      case "year_to_date":
        return "YTD";
      case "custom":
        return "Custom";
      case "all_time":
      default:
        return "All time";
    }
  }, [dateRangePreset]);

  const stockMetricKeys = useMemo(
    () => new Set(["mrr", "active_subscriptions", "active_trials", "active_users", "products_count"]),
    []
  );

  // Use blended rankings: product-level entries from integrations that have them,
  // account-level entries from integrations that don't. Always reflects the full total.
  const getRanking = useCallback(
    (metricType: string): { ranking?: RankingEntry[]; label: string } => {
      const blended = blendedRankings[metricType];
      if (blended && blended.length > 0) {
        return { ranking: blended, label: "Breakdown" };
      }
      return { ranking: accountRankings[metricType], label: "Source leaderboard" };
    },
    [accountRankings, blendedRankings]
  );

  const getTodayRanking = useCallback(
    (metricType: string): { ranking?: RankingEntry[]; label: string } => {
      const blended = todayBlendedRankings[metricType];
      if (blended && blended.length > 0) {
        return { ranking: blended, label: "Breakdown" };
      }
      return { ranking: undefined, label: "Breakdown" };
    },
    [todayBlendedRankings]
  );

  // Revenue breakdown: only show when there's actual subscription/one-time revenue data
  // Checking if metrics exist (not just 0) by looking at any positive value or previous period
  const hasSubscriptionRevenue =
    currentTotals.subscriptionRevenue > 0 || previousTotals.subscriptionRevenue > 0;
  const hasOneTimeRevenue =
    currentTotals.oneTimeRevenue > 0 || previousTotals.oneTimeRevenue > 0;
  const hasRevenueBreakdown = hasSubscriptionRevenue || hasOneTimeRevenue;
  const hasPlatformFees =
    currentTotals.platformFees > 0 || previousTotals.platformFees > 0;

  const { currency } = currentTotals;

  type MetricCardConfig = {
    title: string;
    current: number;
    previous: number;
    format: "currency" | "number" | "percentage";
    icon: ReactNode;
    metricKey: string;
    changeDirection?: "up" | "down";
    subtitle?: string;
    pending?: boolean;
  };

  const metricCards: MetricCardConfig[] = [
    {
      title: `Total Revenue (${rangeSuffix()})`,
      current: currentTotals.revenue,
      previous: previousTotals.revenue,
      format: "currency",
      icon: <DollarSign className="h-4 w-4" />,
      metricKey: "revenue",
    },
    {
      title: "MRR",
      current: currentTotals.mrr,
      previous: previousTotals.mrr,
      format: "currency",
      icon: <TrendingUp className="h-4 w-4" />,
      metricKey: "mrr",
    },
    {
      title: "Net Revenue",
      current: currentTotals.netRevenue,
      previous: previousTotals.netRevenue,
      format: "currency",
      icon: <DollarSign className="h-4 w-4" />,
      metricKey: "net_revenue",
    },
    {
      title: "Active Subscriptions",
      current: currentTotals.activeSubscriptions,
      previous: previousTotals.activeSubscriptions,
      format: "number",
      icon: <CreditCard className="h-4 w-4" />,
      metricKey: "active_subscriptions",
    },
    {
      title: `New Customers (${rangeSuffix()})`,
      current: currentTotals.newCustomers,
      previous: previousTotals.newCustomers,
      format: "number",
      icon: <Users className="h-4 w-4" />,
      metricKey: "new_customers",
    },
    ...((hasRevenueBreakdown || metricsLoading)
      ? [
          {
            title: `Subscription Revenue (${rangeSuffix()})`,
            current: currentTotals.subscriptionRevenue,
            previous: previousTotals.subscriptionRevenue,
            format: "currency" as const,
            icon: <Repeat className="h-4 w-4" />,
            metricKey: "subscription_revenue",
          },
          {
            title: `One-Time Revenue (${rangeSuffix()})`,
            current: currentTotals.oneTimeRevenue,
            previous: previousTotals.oneTimeRevenue,
            format: "currency" as const,
            icon: <ShoppingBag className="h-4 w-4" />,
            metricKey: "one_time_revenue",
          },
          {
            title: `Total Sales (${rangeSuffix()})`,
            current: currentTotals.salesCount,
            previous: previousTotals.salesCount,
            format: "number" as const,
            icon: <Package className="h-4 w-4" />,
            metricKey: "sales_count",
          },
        ]
      : []),
    ...((hasPlatformFees || metricsLoading)
      ? [
          {
            title: `Platform Fees (${rangeSuffix()})`,
            current: currentTotals.platformFees,
            previous: previousTotals.platformFees,
            format: "currency" as const,
            icon: <Landmark className="h-4 w-4" />,
            metricKey: "platform_fees",
            changeDirection: "down" as const,
          },
        ]
      : []),
  ];

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your business at a glance.
          </p>
        </div>
        <SyncStatusBar
          accounts={allAccountsFlat}
          onSyncComplete={handleSyncComplete}
          autoSync
        />
      </div>

      {/* Filter bar */}
      <div className="mb-6 min-h-[36px]">
        {hasAccounts && !integrationsLoading ? (
          <div className="flex flex-wrap items-center gap-3">
            <DashboardFilter
              integrations={integrations}
              enabledAccountIds={enabledAccountIds}
              enabledProjectIds={enabledProjectIds}
              onFilterChange={handleFilterChange}
            />
          </div>
        ) : integrationsLoading ? (
          <div className="flex items-center gap-2">
            <Skeleton className="h-[30px] w-20" />
          </div>
        ) : null}
      </div>

      <Dialog open={backfillErrorOpen} onOpenChange={setBackfillErrorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Backfill error</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            {formatBackfillErrorDetails(compareBackfillError).map((line, i) => (
              <p key={`backfill-error-${i}`}>{line}</p>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Empty state */}
      {!loading && !hasAccounts && <EmptyState />}

      {/* No accounts selected */}
      {hasAccounts && filteredAccountCount === 0 && !loading && (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No accounts selected. Toggle an integration above to see data.
        </div>
      )}

      {/* Dashboard content */}
      {(hasAccounts || loading) && filteredAccountCount !== 0 && (
        <div className="space-y-6">
          {/* Today section — 3 cards, no charts */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-sm font-medium text-muted-foreground">Today</h2>
              {utcBucketedIntegrations.size > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help border-b border-dotted border-muted-foreground/30 text-[11px] text-muted-foreground/60">
                        {[...utcBucketedIntegrations].join(", ")} in UTC
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <p className="text-xs">
                        {[...utcBucketedIntegrations].join(", ")} report{utcBucketedIntegrations.size === 1 ? "s" : ""} data
                        by UTC day, which resets at {utcResetLabel} your time.
                        A sale near that hour may appear under {utcDayShift} compared to your other sources.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {([
                {
                  title: "New Revenue",
                  current: todayTotals.revenue,
                  previous: yesterdayTotals.revenue,
                  format: "currency" as const,
                  icon: <DollarSign className="h-4 w-4" />,
                  metricKey: "revenue",
                  pending: pendingTodayByMetric.revenue ?? false,
                },
                {
                  title: "New MRR",
                  current: todayNewMrr,
                  previous: yesterdayNewMrr,
                  format: "currency" as const,
                  icon: <TrendingUp className="h-4 w-4" />,
                  metricKey: "mrr",
                  pending: false,
                },
                {
                  title: "New Sales",
                  current: todayTotals.salesCount,
                  previous: yesterdayTotals.salesCount,
                  format: "number" as const,
                  icon: <Package className="h-4 w-4" />,
                  metricKey: "sales_count",
                  pending: pendingTodayByMetric.sales_count ?? false,
                },
              ]).map((card) => {
                const { ranking, label } = getTodayRanking(card.metricKey);
                return (
                  <MetricCard
                    key={`today-${card.metricKey}`}
                    title={card.title}
                    value={card.current}
                    previousValue={card.previous}
                    format={card.format}
                    currency={card.format === "currency" ? todayTotals.currency : undefined}
                    icon={card.icon}
                    pending={card.pending}
                    pendingSourceIds={pendingSourceIdsByMetric[card.metricKey]}
                    pendingSources={pendingSourcesByMetric[card.metricKey]}
                    description="yesterday"
                    ranking={ranking}
                    rankingLabel={label}
                    loading={todayLoading}
                    alwaysShowBreakdown
                    hideChange
                    utcBucketedIntegrations={utcBucketedIntegrations}
                  />
                );
              })}
            </div>
          </div>

          {hasAccounts && !integrationsLoading && (
            <div className="flex flex-wrap items-center gap-3">
              <DateRangeFilter
                value={dateRangePreset}
                rangeFrom={rangeFrom}
                rangeTo={rangeTo}
                compareEnabled={compareEnabled}
                onChange={handleDateRangeChange}
                onCustomRangeChange={handleCustomRangeChange}
                onCompareToggle={handleCompareToggle}
              />
              {compareBackfillStatus === "running" && (
                <span className="text-xs text-muted-foreground">
                  Backfilling comparison data…
                </span>
              )}
              {compareBackfillStatus === "error" && (
                <button
                  type="button"
                  onClick={() => setBackfillErrorOpen(true)}
                  className="text-xs font-medium text-destructive hover:underline"
                >
                  Backfill failed — details
                </button>
              )}
            </div>
          )}

          {/* Metric Cards — 2 per row, each with inline chart */}
          <div className="grid gap-4 md:grid-cols-2">
            {metricCards.map((card) => {
              const { ranking, label } = getRanking(card.metricKey);
              const canCompare = comparisonAvailability[card.metricKey] ?? true;
              const isStockMetric = stockMetricKeys.has(card.metricKey);
              const noCompareNote =
                isStockMetric && !canCompare
                  ? "Comparison unavailable — snapshot coverage is incomplete."
                  : undefined;
              const pending =
                card.metricKey === "net_revenue"
                  ? (pendingRangeByMetric.revenue ?? false) || (pendingRangeByMetric.platform_fees ?? false)
                  : (pendingRangeByMetric[card.metricKey] ?? false);
              return (
                <MetricCard
                  key={card.metricKey}
                  title={card.title}
                  value={card.current}
                  previousValue={canCompare ? card.previous || undefined : undefined}
                  format={card.format}
                  currency={card.format === "currency" ? currency : undefined}
                  icon={card.icon}
                  pending={pending}
                  pendingSourceIds={pendingSourceIdsByMetric[card.metricKey]}
                  pendingSources={pendingSourcesByMetric[card.metricKey]}
                  ranking={ranking}
                  rankingLabel={label}
                  description={
                    canCompare ? comparisonLabel() : noCompareNote
                  }
                  changeDirection={card.changeDirection}
                  calculation={{
                    metricKey: card.metricKey,
                    isStock: stockMetricKeys.has(card.metricKey),
                    from: rangeFrom,
                    to: rangeTo,
                    prevFrom: prevRangeFrom,
                    prevTo: prevRangeTo,
                    currentValue: card.current,
                    previousValue: canCompare ? card.previous || undefined : undefined,
                    compareEnabled,
                    compareAvailable: canCompare,
                  }}
                  chartData={metricsByDay[card.metricKey]}
                  chartId={card.metricKey}
                  breakdownByDate={breakdownByMetricAndDay[card.metricKey]}
                  pendingByDate={pendingByMetricAndDay[card.metricKey]}
                  loading={metricsLoading}
                  subtitle={"subtitle" in card ? (card as any).subtitle : undefined}
                  utcBucketedIntegrations={utcBucketedIntegrations}
                />
              );
            })}
          </div>

          {/* Customers by Country */}
          {(customersByCountry.totals.length > 0 || customersByCountryLoading) && (
            <CustomersByCountryChart
              data={customersByCountry.totals}
              bySource={customersByCountry.bySource}
              accountLabels={customersByCountry.accounts}
              projectLabels={customersByCountry.projects}
              accountIntegrationMap={integrations}
              loading={customersByCountryLoading}
              accountIds={[...enabledAccountIds]}
              from={rangeFrom}
              to={rangeTo}
            />
          )}
        </div>
      )}
    </div>
  );
}
