"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { format, subDays } from "date-fns";
import {
  useMetrics,
  useProductMetrics,
  useIntegrations,
  type MetricsResponse,
  type AggregatedMetric,
  type ProductMetricsResponse,
} from "./use-metrics";
import type { RankingEntry } from "@/components/dashboard/metric-card";

// ─── Date windows ─────────────────────────────────────────────────────────────

const today = format(new Date(), "yyyy-MM-dd");
const thirtyDaysAgo = format(subDays(new Date(), 30), "yyyy-MM-dd");
const sixtyDaysAgo = format(subDays(new Date(), 60), "yyyy-MM-dd");
const thirtyOneDaysAgo = format(subDays(new Date(), 31), "yyyy-MM-dd");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductInfo {
  id: string;
  label: string;
}

export interface AccountInfo {
  id: string;
  label: string;
  isActive: boolean;
  products: ProductInfo[];
}

export interface IntegrationInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  accounts: AccountInfo[];
}

export interface DashboardTotals {
  revenue: number;
  mrr: number;
  activeSubscriptions: number;
  newCustomers: number;
  subscriptionRevenue: number;
  oneTimeRevenue: number;
  salesCount: number;
  currency: string;
}

export interface DashboardData {
  // Loading states
  loading: boolean;
  integrationsLoading: boolean;
  metricsLoading: boolean;

  // Integration data
  integrations: IntegrationInfo[];
  hasAccounts: boolean;
  allAccountsFlat: Array<{ id: string; label: string; integrationName: string }>;

  // Filter state
  enabledAccountIds: Set<string>;
  enabledProjectIds: Set<string>;
  totalAccountCount: number;
  filteredAccountCount: number;
  handleFilterChange: (accountIds: Set<string>, projectIds: Set<string>) => void;

  // Metrics
  currentTotals: DashboardTotals;
  previousTotals: DashboardTotals;
  revenueByDay: Array<{ date: string; value: number }>;

  // Rankings
  accountRankings: Record<string, RankingEntry[]>;
  productRankings: Record<string, RankingEntry[]>;

  // Callbacks
  handleSyncComplete: () => void;
  refetchAll: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractTotals(data: MetricsResponse | AggregatedMetric[] | null): DashboardTotals {
  const totals = Array.isArray(data) ? data : [];
  const get = (key: string) => totals.find((t: any) => t.metricType === key)?.total || 0;
  const getCurrency = (key: string) => totals.find((t: any) => t.metricType === key)?.currency || "USD";

  return {
    revenue: get("revenue"),
    mrr: get("mrr"),
    activeSubscriptions: get("active_subscriptions"),
    newCustomers: get("new_customers"),
    subscriptionRevenue: get("subscription_revenue"),
    oneTimeRevenue: get("one_time_revenue"),
    salesCount: get("sales_count"),
    currency: getCurrency("revenue"),
  };
}

function computeRankings(
  dailyMetrics: any[],
  accountLabels: Record<string, string>,
  accountIntegrationMap: Map<string, string>
): Record<string, RankingEntry[]> {
  const byTypeAndAccount = new Map<string, Map<string, number>>();

  for (const m of dailyMetrics) {
    const mt = m.metricType as string;
    const aid = m.accountId as string;
    const val = m.value as number;

    if (!byTypeAndAccount.has(mt)) {
      byTypeAndAccount.set(mt, new Map());
    }
    const accMap = byTypeAndAccount.get(mt)!;
    accMap.set(aid, (accMap.get(aid) ?? 0) + val);
  }

  const result: Record<string, RankingEntry[]> = {};

  for (const [metricType, accMap] of byTypeAndAccount) {
    const entries = Array.from(accMap, ([accountId, value]) => ({
      label: accountLabels[accountId] ?? accountId.slice(0, 8),
      integrationName: accountIntegrationMap.get(accountId) ?? "Unknown",
      value,
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
}

function computeProductRankings(
  productMetricsData: ProductMetricsResponse | null,
  accountIntegrationMap: Map<string, string>
): Record<string, RankingEntry[]> {
  if (!productMetricsData || !("metrics" in productMetricsData)) return {};

  const productMetrics = productMetricsData.metrics;
  const projectLabels = productMetricsData.projects;

  // Group by metricType -> projectId -> sum
  const byTypeAndProject = new Map<
    string,
    Map<string, { value: number; name: string; integrationName: string }>
  >();

  for (const m of productMetrics) {
    const mt = m.metricType;
    const pid = m.projectId;
    if (!pid) continue;
    const val = m.value;
    const aid = m.accountId;
    const projectInfo = projectLabels[pid];
    const productName = projectInfo?.label || pid.slice(0, 12);
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

  const result: Record<string, RankingEntry[]> = {};

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
}

// ─── Main Hook ────────────────────────────────────────────────────────────────

export function useDashboardData(): DashboardData {
  const { data: integrations, loading: integrationsLoading, refetch: refetchIntegrations } =
    useIntegrations();

  // ─── Filter state ────────────────────────────────────────────────────────
  const [enabledAccountIds, setEnabledAccountIds] = useState<Set<string>>(new Set());
  const [enabledProjectIds, setEnabledProjectIds] = useState<Set<string>>(new Set());
  const initialized = useRef(false);

  // Initialize filter with all account + project IDs once integrations load
  useEffect(() => {
    if (!integrationsLoading && integrations.length > 0 && !initialized.current) {
      const allAccountIds = new Set<string>();
      const allProjectIds = new Set<string>();
      for (const integration of integrations) {
        for (const account of integration.accounts ?? []) {
          allAccountIds.add(account.id);
          for (const product of account.products ?? []) {
            allProjectIds.add(product.id);
          }
        }
      }
      if (allAccountIds.size > 0) {
        setEnabledAccountIds(allAccountIds);
        setEnabledProjectIds(allProjectIds);
        initialized.current = true;
      }
    }
  }, [integrations, integrationsLoading]);

  const accountIdsArray = useMemo(
    () => Array.from(enabledAccountIds),
    [enabledAccountIds]
  );

  const hasFilter = accountIdsArray.length > 0;

  // ─── Metrics queries (all fire in parallel once accountIds are set) ──────

  const { data: metricsData, loading: metricsLoading, refetch: refetchMetrics } =
    useMetrics({
      from: thirtyDaysAgo,
      to: today,
      accountIds: hasFilter ? accountIdsArray : undefined,
    });

  const { data: totalsData, loading: totalsLoading, refetch: refetchTotals } =
    useMetrics({
      from: thirtyDaysAgo,
      to: today,
      aggregation: "total",
      accountIds: hasFilter ? accountIdsArray : undefined,
    });

  const { data: prevTotalsData, refetch: refetchPrevTotals } =
    useMetrics({
      from: sixtyDaysAgo,
      to: thirtyOneDaysAgo,
      aggregation: "total",
      accountIds: hasFilter ? accountIdsArray : undefined,
    });

  const { data: productMetricsData, refetch: refetchProductMetrics } =
    useProductMetrics({
      from: thirtyDaysAgo,
      to: today,
      accountIds: hasFilter ? accountIdsArray : undefined,
    });

  // ─── Derived data ────────────────────────────────────────────────────────

  const hasAccounts = useMemo(
    () => integrations?.some((i: any) => i.accounts?.length > 0) ?? false,
    [integrations]
  );

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

  const allAccountIds = useMemo(() => {
    const ids = new Set<string>();
    for (const integration of integrations ?? []) {
      for (const account of integration.accounts ?? []) {
        ids.add(account.id);
      }
    }
    return ids;
  }, [integrations]);

  const totalAccountCount = allAccountIds.size;
  const filteredAccountCount = accountIdsArray.length;

  // ─── Account → integration map ──────────────────────────────────────────
  const accountIntegrationMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const integration of integrations ?? []) {
      for (const account of integration.accounts ?? []) {
        m.set(account.id, integration.name);
      }
    }
    return m;
  }, [integrations]);

  // ─── Totals ──────────────────────────────────────────────────────────────
  const currentTotals = useMemo(() => extractTotals(totalsData), [totalsData]);
  const previousTotals = useMemo(() => extractTotals(prevTotalsData), [prevTotalsData]);

  // ─── Daily metrics ───────────────────────────────────────────────────────
  const dailyMetrics = useMemo(
    () => (metricsData && "metrics" in metricsData ? metricsData.metrics : []),
    [metricsData]
  );

  const accountLabels: Record<string, string> = useMemo(
    () => (metricsData && "accounts" in metricsData ? metricsData.accounts : {}),
    [metricsData]
  );

  // ─── Rankings ────────────────────────────────────────────────────────────
  const accountRankings = useMemo(
    () => computeRankings(dailyMetrics, accountLabels, accountIntegrationMap),
    [dailyMetrics, accountLabels, accountIntegrationMap]
  );

  const productRankings = useMemo(
    () =>
      computeProductRankings(
        productMetricsData && "metrics" in productMetricsData
          ? productMetricsData as ProductMetricsResponse
          : null,
        accountIntegrationMap
      ),
    [productMetricsData, accountIntegrationMap]
  );

  // ─── Revenue chart ───────────────────────────────────────────────────────
  const revenueByDay = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const m of dailyMetrics) {
      if (m.metricType !== "revenue") continue;
      byDate.set(m.date, (byDate.get(m.date) ?? 0) + m.value);
    }
    return Array.from(byDate, ([date, value]) => ({ date, value }));
  }, [dailyMetrics]);

  // ─── Callbacks ───────────────────────────────────────────────────────────
  const handleSyncComplete = useCallback(() => {
    refetchIntegrations();
    refetchMetrics();
    refetchTotals();
    refetchPrevTotals();
    refetchProductMetrics();
  }, [refetchIntegrations, refetchMetrics, refetchTotals, refetchPrevTotals, refetchProductMetrics]);

  const handleFilterChange = useCallback(
    (nextAccountIds: Set<string>, nextProjectIds: Set<string>) => {
      setEnabledAccountIds(nextAccountIds);
      setEnabledProjectIds(nextProjectIds);
    },
    []
  );

  const refetchAll = useCallback(() => {
    refetchIntegrations();
    refetchMetrics();
    refetchTotals();
    refetchPrevTotals();
    refetchProductMetrics();
  }, [refetchIntegrations, refetchMetrics, refetchTotals, refetchPrevTotals, refetchProductMetrics]);

  return {
    loading: integrationsLoading || metricsLoading || totalsLoading,
    integrationsLoading,
    metricsLoading: metricsLoading || totalsLoading,

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
    refetchAll,
  };
}
