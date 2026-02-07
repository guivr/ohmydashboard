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
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format, subDays } from "date-fns";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";

// Default to last 30 days
const today = format(new Date(), "yyyy-MM-dd");
const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");

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

  const {
    data: metricsData,
    loading: metricsLoading,
    refetch: refetchMetrics,
  } = useMetrics({
    from: thirtyDaysAgo,
    to: today,
    accountIds: hasFilter ? accountIdsArray : undefined,
  });

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

  // Compute dashboard values from totals
  const totalRevenue =
    totals.find((t: any) => t.metricType === "revenue")?.total || 0;
  const revenueCurrency =
    totals.find((t: any) => t.metricType === "revenue")?.currency || "USD";
  const currentMRR =
    totals.find((t: any) => t.metricType === "mrr")?.total || 0;
  const activeSubscriptions =
    totals.find((t: any) => t.metricType === "active_subscriptions")?.total || 0;
  const newCustomers =
    totals.find((t: any) => t.metricType === "new_customers")?.total || 0;

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
  }, [refetchIntegrations, refetchMetrics, refetchTotals]);

  const handleFilterChange = useCallback((next: Set<string>) => {
    setEnabledAccountIds(next);
  }, []);

  // ─── Descriptions ─────────────────────────────────────────────────────────

  const revenueDesc = isFiltered
    ? `from ${filteredAccountCount} of ${totalAccountCount} accounts`
    : "from all connected accounts";

  const customersDesc = isFiltered
    ? `filtered — ${filteredAccountCount} accounts`
    : "in the last 30 days";

  // ─── Render ───────────────────────────────────────────────────────────────

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
          {/* Metric Cards — fixed grid, skeletons when loading */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Revenue (30d)"
              value={totalRevenue}
              format="currency"
              currency={revenueCurrency}
              icon={<DollarSign className="h-4 w-4" />}
              ranking={rankingsByMetric["revenue"]}
              loading={metricsLoading || totalsLoading}
            />
            <MetricCard
              title="MRR"
              value={currentMRR}
              format="currency"
              currency={revenueCurrency}
              icon={<TrendingUp className="h-4 w-4" />}
              ranking={rankingsByMetric["mrr"]}
              loading={metricsLoading || totalsLoading}
            />
            <MetricCard
              title="Active Subscriptions"
              value={activeSubscriptions}
              format="number"
              icon={<CreditCard className="h-4 w-4" />}
              ranking={rankingsByMetric["active_subscriptions"]}
              loading={metricsLoading || totalsLoading}
            />
            <MetricCard
              title="New Customers (30d)"
              value={newCustomers}
              format="number"
              icon={<Users className="h-4 w-4" />}
              ranking={rankingsByMetric["new_customers"]}
              loading={metricsLoading || totalsLoading}
            />
          </div>

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
