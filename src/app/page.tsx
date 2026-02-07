"use client";

import { useMetrics, useIntegrations } from "@/hooks/use-metrics";
import { MetricCard } from "@/components/dashboard/metric-card";
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
import { format, subDays } from "date-fns";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";

// Date windows — current 30d and previous 30d for comparison
const today = format(new Date(), "yyyy-MM-dd");
const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
const sixtyDaysAgo = format(subDays(new Date(), 60), "yyyy-MM-dd");
const thirtyOneDaysAgo = format(subDays(new Date(), 31), "yyyy-MM-dd");

export default function Dashboard() {
  const { data: integrations, loading: integrationsLoading, refetch: refetchIntegrations } =
    useIntegrations();

  // ─── Filter state ──────────────────────────────────────────────────────────
  // Start with all accounts enabled. Updated once integrations load.
  const [enabledAccountIds, setEnabledAccountIds] = useState<Set<string>>(
    new Set()
  );
  const initialized = useRef(false);

  // Initialize filter with all account IDs once integrations load
  useEffect(() => {
    if (!integrationsLoading && integrations.length > 0 && !initialized.current) {
      const allIds = new Set<string>();
      for (const integration of integrations) {
        for (const account of integration.accounts ?? []) {
          allIds.add(account.id);
        }
      }
      if (allIds.size > 0) {
        setEnabledAccountIds(allIds);
        initialized.current = true;
      }
    }
  }, [integrations, integrationsLoading]);

  // Stable array of enabled account IDs for the hooks
  const accountIdsArray = useMemo(
    () => Array.from(enabledAccountIds),
    [enabledAccountIds]
  );

  // ─── Metrics queries ──────────────────────────────────────────────────────
  // Only fetch when we have account IDs to filter by (avoids fetching everything on init)
  const hasFilter = accountIdsArray.length > 0;

  // Current period: daily metrics (for chart + per-account rankings)
  const {
    data: metricsData,
    loading: metricsLoading,
    refetch: refetchMetrics,
  } = useMetrics({
    from: thirtyDaysAgo,
    to: today,
    accountIds: hasFilter ? accountIdsArray : undefined,
  });

  // Current period: aggregated totals
  const {
    data: totalsData,
    loading: totalsLoading,
    refetch: refetchTotals,
  } = useMetrics({
    from: thirtyDaysAgo,
    to: today,
    aggregation: "total",
    accountIds: hasFilter ? accountIdsArray : undefined,
  });

  // Previous period: aggregated totals (for % change comparison)
  const {
    data: prevTotalsData,
    loading: prevTotalsLoading,
    refetch: refetchPrevTotals,
  } = useMetrics({
    from: sixtyDaysAgo,
    to: thirtyOneDaysAgo,
    aggregation: "total",
    accountIds: hasFilter ? accountIdsArray : undefined,
  });

  // Per-product metrics (for product drill-down)
  const {
    data: productMetricsData,
    loading: productMetricsLoading,
    refetch: refetchProductMetrics,
  } = useMetrics({
    from: thirtyDaysAgo,
    to: today,
    accountIds: hasFilter ? accountIdsArray : undefined,
    withProject: "true",
  });

  const loading = integrationsLoading || metricsLoading || totalsLoading;

  // ─── Derived data ─────────────────────────────────────────────────────────

  const hasAccounts = useMemo(
    () => integrations?.some((i: any) => i.accounts?.length > 0) ?? false,
    [integrations]
  );

  // Flat list of all accounts with their integration name (for the sync bar)
  const allAccountsFlat = useMemo(() => {
    const result: Array<{ id: string; label: string; integrationName: string }> = [];
    for (const integration of integrations ?? []) {
      for (const account of integration.accounts ?? []) {
        if (account.isActive) {
          result.push({
            id: account.id,
            label: account.label,
            integrationName: integration.name,
          });
        }
      }
    }
    return result;
  }, [integrations]);

  // All account IDs across all integrations (for "all accounts" context)
  const allAccountIds = useMemo(() => {
    const ids = new Set<string>();
    for (const integration of integrations ?? []) {
      for (const account of integration.accounts ?? []) {
        ids.add(account.id);
      }
    }
    return ids;
  }, [integrations]);

  // How many accounts are currently filtered in vs total
  const totalAccountCount = allAccountIds.size;
  const filteredAccountCount = accountIdsArray.length;
  const isFiltered = filteredAccountCount < totalAccountCount;

  // Extract metrics from response
  const dailyMetrics =
    metricsData && "metrics" in metricsData ? metricsData.metrics : [];
  const totals = Array.isArray(totalsData) ? totalsData : [];
  const prevTotals = Array.isArray(prevTotalsData) ? prevTotalsData : [];

  // Helper to get total for a metric type from a totals array
  const getTotal = useCallback(
    (arr: any[], metricType: string) =>
      arr.find((t: any) => t.metricType === metricType)?.total || 0,
    []
  );
  const getCurrency = useCallback(
    (arr: any[], metricType: string) =>
      arr.find((t: any) => t.metricType === metricType)?.currency || "USD",
    []
  );

  // Current period values
  const totalRevenue = getTotal(totals, "revenue");
  const revenueCurrency = getCurrency(totals, "revenue");
  const currentMRR = getTotal(totals, "mrr");
  const activeSubscriptions = getTotal(totals, "active_subscriptions");
  const newCustomers = getTotal(totals, "new_customers");
  const subscriptionRevenue = getTotal(totals, "subscription_revenue");
  const oneTimeRevenue = getTotal(totals, "one_time_revenue");
  const salesCount = getTotal(totals, "sales_count");

  // Previous period values (for % change)
  const prevRevenue = getTotal(prevTotals, "revenue");
  const prevMRR = getTotal(prevTotals, "mrr");
  const prevActiveSubscriptions = getTotal(prevTotals, "active_subscriptions");
  const prevNewCustomers = getTotal(prevTotals, "new_customers");
  const prevSubscriptionRevenue = getTotal(prevTotals, "subscription_revenue");
  const prevOneTimeRevenue = getTotal(prevTotals, "one_time_revenue");
  const prevSalesCount = getTotal(prevTotals, "sales_count");

  // ─── Per-account rankings for MetricCards ─────────────────────────────────
  // Build a map: accountId → integration name for labelling
  const accountIntegrationMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const integration of integrations ?? []) {
      for (const account of integration.accounts ?? []) {
        m.set(account.id, integration.name);
      }
    }
    return m;
  }, [integrations]);

  // Account labels from the metrics response (accountId → user-given label)
  const accountLabels: Record<string, string> =
    metricsData && "accounts" in metricsData ? metricsData.accounts : {};

  // Compute rankings: for each metricType, sum values per account, sort desc
  const rankingsByMetric = useMemo(() => {
    const byTypeAndAccount = new Map<string, Map<string, number>>();

    for (const m of dailyMetrics) {
      const mt = (m as any).metricType as string;
      const aid = (m as any).accountId as string;
      const val = (m as any).value as number;

      if (!byTypeAndAccount.has(mt)) {
        byTypeAndAccount.set(mt, new Map());
      }
      const accMap = byTypeAndAccount.get(mt)!;
      accMap.set(aid, (accMap.get(aid) ?? 0) + val);
    }

    const result: Record<
      string,
      Array<{
        label: string;
        integrationName: string;
        value: number;
        percentage: number;
      }>
    > = {};

    for (const [metricType, accMap] of byTypeAndAccount) {
      const entries = Array.from(accMap, ([accountId, value]) => ({
        accountId,
        value,
        label: accountLabels[accountId] ?? accountId.slice(0, 8),
        integrationName: accountIntegrationMap.get(accountId) ?? "Unknown",
      }));
      entries.sort((a, b) => b.value - a.value);
      const total = entries.reduce((sum, e) => sum + e.value, 0);

      result[metricType] = entries.map((e) => ({
        label: e.label,
        integrationName: e.integrationName,
        value: e.value,
        percentage: total > 0 ? (e.value / total) * 100 : 0,
      }));
    }

    return result;
  }, [dailyMetrics, accountLabels, accountIntegrationMap]);

  // ─── Per-product rankings ─────────────────────────────────────────────────
  const productRankingsByMetric = useMemo(() => {
    const productMetrics =
      productMetricsData && "metrics" in productMetricsData
        ? productMetricsData.metrics
        : [];

    // Group by metricType → projectId → sum of values
    const byTypeAndProject = new Map<string, Map<string, { value: number; name: string; integrationName: string }>>();

    for (const m of productMetrics) {
      const mt = (m as any).metricType as string;
      const pid = (m as any).projectId as string | null;
      if (!pid) continue; // skip account-level metrics
      const val = (m as any).value as number;
      const aid = (m as any).accountId as string;
      const metadata = (m as any).metadata ? JSON.parse((m as any).metadata) : {};
      const productName = metadata.product_name || pid.slice(0, 12);
      const integrationName = accountIntegrationMap.get(aid) ?? "Unknown";

      if (!byTypeAndProject.has(mt)) {
        byTypeAndProject.set(mt, new Map());
      }
      const projMap = byTypeAndProject.get(mt)!;
      const existing = projMap.get(pid);
      if (existing) {
        existing.value += val;
      } else {
        projMap.set(pid, { value: val, name: productName, integrationName });
      }
    }

    const result: Record<
      string,
      Array<{
        label: string;
        integrationName: string;
        value: number;
        percentage: number;
      }>
    > = {};

    for (const [metricType, projMap] of byTypeAndProject) {
      const entries = Array.from(projMap, ([, data]) => ({
        label: data.name,
        integrationName: data.integrationName,
        value: data.value,
        percentage: 0,
      }));
      entries.sort((a, b) => b.value - a.value);
      const total = entries.reduce((sum, e) => sum + e.value, 0);

      result[metricType] = entries.map((e) => ({
        ...e,
        percentage: total > 0 ? (e.value / total) * 100 : 0,
      }));
    }

    return result;
  }, [productMetricsData, accountIntegrationMap]);

  // Merge account-level and product-level rankings.
  // For MetricCard, we show product rankings when available (2+ products), otherwise account rankings.
  const effectiveRankings = useCallback(
    (metricType: string): { ranking?: typeof rankingsByMetric[string]; label: string } => {
      const productRanking = productRankingsByMetric[metricType];
      // Prefer product rankings if we have 2+ products for this metric
      if (productRanking && productRanking.length > 1) {
        return { ranking: productRanking, label: "Product leaderboard" };
      }
      return { ranking: rankingsByMetric[metricType], label: "Source leaderboard" };
    },
    [rankingsByMetric, productRankingsByMetric]
  );

  // Revenue chart data — aggregate across accounts per day
  const revenueByDay = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const m of dailyMetrics) {
      if ((m as any).metricType !== "revenue") continue;
      const date = (m as any).date;
      byDate.set(date, (byDate.get(date) ?? 0) + (m as any).value);
    }
    return Array.from(byDate, ([date, value]) => ({ date, value }));
  }, [dailyMetrics]);

  // ─── Callbacks ────────────────────────────────────────────────────────────

  const handleSyncComplete = useCallback(() => {
    refetchIntegrations();
    refetchMetrics();
    refetchTotals();
    refetchPrevTotals();
    refetchProductMetrics();
  }, [refetchIntegrations, refetchMetrics, refetchTotals, refetchPrevTotals, refetchProductMetrics]);

  const handleFilterChange = useCallback((next: Set<string>) => {
    setEnabledAccountIds(next);
  }, []);

  // ─── Which extra cards to show ────────────────────────────────────────────
  // Only show subscription/one-time breakdown cards if we have that data
  const hasRevenueBreakdown = subscriptionRevenue > 0 || oneTimeRevenue > 0;
  const hasSalesCount = salesCount > 0 || prevSalesCount > 0;

  // ─── Render ───────────────────────────────────────────────────────────────

  const isDataLoading = metricsLoading || totalsLoading;

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

      {/* Filter bar — always reserve height to prevent layout shift */}
      <div className="mb-6 min-h-[36px]">
        {hasAccounts && !integrationsLoading ? (
          <DashboardFilter
            integrations={integrations}
            enabledAccountIds={enabledAccountIds}
            onFilterChange={handleFilterChange}
          />
        ) : integrationsLoading ? (
          <div className="flex items-center gap-2">
            <Skeleton className="h-[30px] w-20" />
            <Skeleton className="h-[30px] w-40 rounded-lg" />
          </div>
        ) : null}
      </div>

      {/* Empty state — only when fully loaded and no accounts */}
      {!loading && !hasAccounts && <EmptyState />}

      {/* No accounts selected */}
      {hasAccounts && filteredAccountCount === 0 && !loading && (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No accounts selected. Toggle an integration above to see data.
        </div>
      )}

      {/* Dashboard content — always render grid to prevent layout shift */}
      {(hasAccounts || loading) && filteredAccountCount !== 0 && (
        <div className="space-y-6">
          {/* Primary Metric Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Revenue (30d)"
              value={totalRevenue}
              previousValue={prevRevenue || undefined}
              format="currency"
              currency={revenueCurrency}
              icon={<DollarSign className="h-4 w-4" />}
              ranking={effectiveRankings("revenue").ranking}
              rankingLabel={effectiveRankings("revenue").label}
              description="vs previous 30 days"
              loading={isDataLoading}
            />
            <MetricCard
              title="MRR"
              value={currentMRR}
              previousValue={prevMRR || undefined}
              format="currency"
              currency={revenueCurrency}
              icon={<TrendingUp className="h-4 w-4" />}
              ranking={effectiveRankings("mrr").ranking}
              rankingLabel={effectiveRankings("mrr").label}
              description="vs previous 30 days"
              loading={isDataLoading}
            />
            <MetricCard
              title="Active Subscriptions"
              value={activeSubscriptions}
              previousValue={prevActiveSubscriptions || undefined}
              format="number"
              icon={<CreditCard className="h-4 w-4" />}
              ranking={effectiveRankings("active_subscriptions").ranking}
              rankingLabel={effectiveRankings("active_subscriptions").label}
              description="vs previous 30 days"
              loading={isDataLoading}
            />
            <MetricCard
              title="New Customers (30d)"
              value={newCustomers}
              previousValue={prevNewCustomers || undefined}
              format="number"
              icon={<Users className="h-4 w-4" />}
              ranking={effectiveRankings("new_customers").ranking}
              rankingLabel={effectiveRankings("new_customers").label}
              description="vs previous 30 days"
              loading={isDataLoading}
            />
          </div>

          {/* Revenue Breakdown Cards — only shown when data exists */}
          {(hasRevenueBreakdown || hasSalesCount) && !isDataLoading && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {hasRevenueBreakdown && (
                <>
                  <MetricCard
                    title="Subscription Revenue (30d)"
                    value={subscriptionRevenue}
                    previousValue={prevSubscriptionRevenue || undefined}
                    format="currency"
                    currency={revenueCurrency}
                    icon={<Repeat className="h-4 w-4" />}
                    ranking={effectiveRankings("subscription_revenue").ranking}
                    rankingLabel={effectiveRankings("subscription_revenue").label}
                    description="vs previous 30 days"
                    loading={isDataLoading}
                  />
                  <MetricCard
                    title="One-Time Revenue (30d)"
                    value={oneTimeRevenue}
                    previousValue={prevOneTimeRevenue || undefined}
                    format="currency"
                    currency={revenueCurrency}
                    icon={<ShoppingBag className="h-4 w-4" />}
                    ranking={effectiveRankings("one_time_revenue").ranking}
                    rankingLabel={effectiveRankings("one_time_revenue").label}
                    description="vs previous 30 days"
                    loading={isDataLoading}
                  />
                </>
              )}
              {hasSalesCount && (
                <MetricCard
                  title="Total Sales (30d)"
                  value={salesCount}
                  previousValue={prevSalesCount || undefined}
                  format="number"
                  icon={<Package className="h-4 w-4" />}
                  ranking={effectiveRankings("sales_count").ranking}
                  rankingLabel={effectiveRankings("sales_count").label}
                  description="vs previous 30 days"
                  loading={isDataLoading}
                />
              )}
            </div>
          )}

          {/* Skeleton row for breakdown cards while loading */}
          {isDataLoading && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <MetricCard title="Subscription Revenue (30d)" value={0} format="currency" icon={<Repeat className="h-4 w-4" />} loading />
              <MetricCard title="One-Time Revenue (30d)" value={0} format="currency" icon={<ShoppingBag className="h-4 w-4" />} loading />
              <MetricCard title="Total Sales (30d)" value={0} format="number" icon={<Package className="h-4 w-4" />} loading />
            </div>
          )}

          {/* Revenue Chart — always in the DOM at fixed position */}
          <RevenueChart
            title="Revenue Over Time"
            data={revenueByDay}
            currency={revenueCurrency}
          />
        </div>
      )}
    </div>
  );
}
