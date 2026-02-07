"use client";

import { useDashboardData } from "@/hooks/use-dashboard-data";
import { MetricCard, type RankingEntry } from "@/components/dashboard/metric-card";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DashboardFilter } from "@/components/dashboard/dashboard-filter";
import { SyncStatusBar } from "@/components/dashboard/sync-status-bar";
import {
  DollarSign,
  Users,
  CreditCard,
  TrendingUp,
  Repeat,
  ShoppingBag,
  Package,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useCallback } from "react";

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
    currentTotals,
    previousTotals,
    revenueByDay,
    accountRankings,
    productRankings,
    handleSyncComplete,
  } = useDashboardData();

  // Pick the best ranking for a metric: product-level if 2+ products, else account-level
  const getRanking = useCallback(
    (metricType: string): { ranking?: RankingEntry[]; label: string } => {
      const productRanking = productRankings[metricType];
      if (productRanking && productRanking.length > 1) {
        return { ranking: productRanking, label: "Product leaderboard" };
      }
      return { ranking: accountRankings[metricType], label: "Source leaderboard" };
    },
    [accountRankings, productRankings]
  );

  // Revenue breakdown visibility
  const hasRevenueBreakdown =
    currentTotals.subscriptionRevenue > 0 || currentTotals.oneTimeRevenue > 0;
  const hasSalesCount =
    currentTotals.salesCount > 0 || previousTotals.salesCount > 0;

  const { currency } = currentTotals;

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
          <DashboardFilter
            integrations={integrations}
            enabledAccountIds={enabledAccountIds}
            enabledProjectIds={enabledProjectIds}
            onFilterChange={handleFilterChange}
          />
        ) : integrationsLoading ? (
          <div className="flex items-center gap-2">
            <Skeleton className="h-[30px] w-20" />
            <Skeleton className="h-[30px] w-40 rounded-lg" />
          </div>
        ) : null}
      </div>

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
          {/* Primary Metric Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {([
              {
                title: "Total Revenue (30d)",
                current: currentTotals.revenue,
                previous: previousTotals.revenue,
                format: "currency" as const,
                icon: <DollarSign className="h-4 w-4" />,
                metricKey: "revenue",
              },
              {
                title: "MRR",
                current: currentTotals.mrr,
                previous: previousTotals.mrr,
                format: "currency" as const,
                icon: <TrendingUp className="h-4 w-4" />,
                metricKey: "mrr",
              },
              {
                title: "Active Subscriptions",
                current: currentTotals.activeSubscriptions,
                previous: previousTotals.activeSubscriptions,
                format: "number" as const,
                icon: <CreditCard className="h-4 w-4" />,
                metricKey: "active_subscriptions",
              },
              {
                title: "New Customers (30d)",
                current: currentTotals.newCustomers,
                previous: previousTotals.newCustomers,
                format: "number" as const,
                icon: <Users className="h-4 w-4" />,
                metricKey: "new_customers",
              },
            ]).map((card) => {
              const { ranking, label } = getRanking(card.metricKey);
              return (
                <MetricCard
                  key={card.metricKey}
                  title={card.title}
                  value={card.current}
                  previousValue={card.previous || undefined}
                  format={card.format}
                  currency={card.format === "currency" ? currency : undefined}
                  icon={card.icon}
                  ranking={ranking}
                  rankingLabel={label}
                  description="vs previous 30 days"
                  loading={metricsLoading}
                />
              );
            })}
          </div>

          {/* Revenue Breakdown Cards */}
          {(hasRevenueBreakdown || hasSalesCount) && !metricsLoading && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {hasRevenueBreakdown && (
                <>
                  {(() => {
                    const { ranking, label } = getRanking("subscription_revenue");
                    return (
                      <MetricCard
                        title="Subscription Revenue (30d)"
                        value={currentTotals.subscriptionRevenue}
                        previousValue={previousTotals.subscriptionRevenue || undefined}
                        format="currency"
                        currency={currency}
                        icon={<Repeat className="h-4 w-4" />}
                        ranking={ranking}
                        rankingLabel={label}
                        description="vs previous 30 days"
                      />
                    );
                  })()}
                  {(() => {
                    const { ranking, label } = getRanking("one_time_revenue");
                    return (
                      <MetricCard
                        title="One-Time Revenue (30d)"
                        value={currentTotals.oneTimeRevenue}
                        previousValue={previousTotals.oneTimeRevenue || undefined}
                        format="currency"
                        currency={currency}
                        icon={<ShoppingBag className="h-4 w-4" />}
                        ranking={ranking}
                        rankingLabel={label}
                        description="vs previous 30 days"
                      />
                    );
                  })()}
                </>
              )}
              {hasSalesCount && (() => {
                const { ranking, label } = getRanking("sales_count");
                return (
                  <MetricCard
                    title="Total Sales (30d)"
                    value={currentTotals.salesCount}
                    previousValue={previousTotals.salesCount || undefined}
                    format="number"
                    icon={<Package className="h-4 w-4" />}
                    ranking={ranking}
                    rankingLabel={label}
                    description="vs previous 30 days"
                  />
                );
              })()}
            </div>
          )}

          {/* Skeleton row while loading */}
          {metricsLoading && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <MetricCard title="Subscription Revenue (30d)" value={0} format="currency" icon={<Repeat className="h-4 w-4" />} loading />
              <MetricCard title="One-Time Revenue (30d)" value={0} format="currency" icon={<ShoppingBag className="h-4 w-4" />} loading />
              <MetricCard title="Total Sales (30d)" value={0} format="number" icon={<Package className="h-4 w-4" />} loading />
            </div>
          )}

          {/* Revenue Chart */}
          <RevenueChart
            title="Revenue Over Time"
            data={revenueByDay}
            currency={currency}
          />
        </div>
      )}
    </div>
  );
}
