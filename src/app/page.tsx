"use client";

import { useDashboardData } from "@/hooks/use-dashboard-data";
import { MetricCard, type RankingEntry } from "@/components/dashboard/metric-card";
import { CustomersByCountryChart } from "@/components/dashboard/customers-by-country-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DashboardFilter } from "@/components/dashboard/dashboard-filter";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { SyncStatusBar } from "@/components/dashboard/sync-status-bar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
    accountRankings,
    blendedRankings,
    customersByCountry,
    customersByCountryLoading,
    handleSyncComplete,
  } = useDashboardData();

  const [backfillErrorOpen, setBackfillErrorOpen] = useState(false);

  const comparisonLabel = useCallback(() => {
    if (!compareEnabled) return undefined;
    switch (dateRangePreset) {
      case "today":
        return "vs yesterday";
      case "last_7_days":
        return "vs previous 7 days";
      case "last_4_weeks":
        return "vs previous 4 weeks";
      case "last_30_days":
        return "vs previous 30 days";
      case "month_to_date":
        return "vs previous month-to-date";
      case "quarter_to_date":
        return "vs previous quarter-to-date";
      case "year_to_date":
        return "vs previous year-to-date";
      case "custom":
        return "vs previous period";
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
        ) : integrationsLoading ? (
          <div className="flex items-center gap-2">
            <Skeleton className="h-[30px] w-20" />
            <Skeleton className="h-[30px] w-40 rounded-lg" />
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
              return (
                <MetricCard
                  key={card.metricKey}
                  title={card.title}
                  value={card.current}
                  previousValue={canCompare ? card.previous || undefined : undefined}
                  format={card.format}
                  currency={card.format === "currency" ? currency : undefined}
                  icon={card.icon}
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
                  loading={metricsLoading}
                  subtitle={"subtitle" in card ? (card as any).subtitle : undefined}
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
