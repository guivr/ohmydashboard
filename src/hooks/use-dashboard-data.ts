"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  differenceInCalendarDays,
  endOfDay,
  format,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
} from "date-fns";
import {
  useMetrics,
  useProductMetrics,
  useIntegrations,
  useProjectGroups,
  useCustomersByCountry,
  type MetricsResponse,
  type AggregatedMetric,
  type ProductMetricsResponse,
  type ProjectGroupResponse,
  type CustomersByCountryResponse,
} from "./use-metrics";
import type { RankingEntry } from "@/components/dashboard/metric-card";
import { apiPost } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { shouldStartBackfill, shouldStartRangeBackfill } from "./compare-backfill";

// ─── Date windows ─────────────────────────────────────────────────────────────

function getComparisonRange(from: string, to: string) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const dayCount = differenceInCalendarDays(toDate, fromDate) + 1;
  const prevTo = subDays(fromDate, 1);
  const prevFrom = subDays(fromDate, dayCount);
  return {
    prevFrom: format(prevFrom, "yyyy-MM-dd"),
    prevTo: format(prevTo, "yyyy-MM-dd"),
  };
}

export type DateRangePreset =
  | "today"
  | "last_7_days"
  | "last_4_weeks"
  | "last_30_days"
  | "month_to_date"
  | "quarter_to_date"
  | "year_to_date"
  | "all_time"
  | "custom";

function resolveDateRange(preset: DateRangePreset) {
  const now = new Date();
  const end = endOfDay(now);

  switch (preset) {
    case "today": {
      const start = startOfDay(now);
      return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
    }
    case "last_7_days": {
      const start = subDays(startOfDay(now), 6);
      return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
    }
    case "last_4_weeks": {
      const start = subDays(startOfDay(now), 27);
      return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
    }
    case "last_30_days": {
      const start = subDays(startOfDay(now), 29);
      return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
    }
    case "month_to_date": {
      const start = startOfMonth(now);
      return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
    }
    case "quarter_to_date": {
      const start = startOfQuarter(now);
      return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
    }
    case "year_to_date": {
      const start = startOfYear(now);
      return { from: format(start, "yyyy-MM-dd"), to: format(end, "yyyy-MM-dd") };
    }
    case "all_time":
    default:
      return { from: undefined, to: undefined };
  }
}

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
  netRevenue: number;
  activeSubscriptions: number;
  newCustomers: number;
  subscriptionRevenue: number;
  oneTimeRevenue: number;
  salesCount: number;
  platformFees: number;
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
  dateRangePreset: DateRangePreset;
  compareEnabled: boolean;
  compareBackfillStatus: "idle" | "running" | "error";
  compareBackfillError: string | null;
  rangeFrom?: string;
  rangeTo?: string;
  prevRangeFrom?: string;
  prevRangeTo?: string;
  handleDateRangeChange: (preset: DateRangePreset) => void;
  handleCustomRangeChange: (range: { from: Date; to: Date }) => void;
  handleCompareToggle: (enabled: boolean) => void;

  // Metrics
  currentTotals: DashboardTotals;
  previousTotals: DashboardTotals;
  comparisonAvailability: Record<string, boolean>;
  revenueByDay: Array<{ date: string; value: number }>;
  /** Daily time series per metric type (keyed by metric key, e.g. "revenue", "mrr"). */
  metricsByDay: Record<string, Array<{ date: string; value: number }>>;
  revenueBreakdownByDay: Record<
    string,
    Array<{ label: string; value: number; integrationName?: string }>
  >;
  /**
   * Per-metric-type daily breakdown: metricType -> date -> top-5 source entries.
   * Used for rich tooltips on inline charts.
   */
  breakdownByMetricAndDay: Record<
    string,
    Record<string, Array<{ label: string; value: number; integrationName?: string; integrationNames?: string[] }>>
  >;

  // Rankings
  accountRankings: Record<string, RankingEntry[]>;
  blendedRankings: Record<string, RankingEntry[]>;

  // Today section
  todayTotals: DashboardTotals;
  yesterdayTotals: DashboardTotals;
  todayNewMrr: number;
  todayBlendedRankings: Record<string, RankingEntry[]>;
  todayLoading: boolean;

  // Customers by country
  customersByCountry: CustomersByCountryResponse;
  customersByCountryLoading: boolean;

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
    netRevenue: get("revenue") - get("platform_fees"),
    activeSubscriptions: get("active_subscriptions"),
    newCustomers: get("new_customers"),
    subscriptionRevenue: get("subscription_revenue"),
    oneTimeRevenue: get("one_time_revenue"),
    salesCount: get("sales_count"),
    platformFees: get("platform_fees"),
    currency: getCurrency("revenue"),
  };
}

function extractCounts(data: MetricsResponse | AggregatedMetric[] | null): Record<string, number> {
  const totals = Array.isArray(data) ? data : [];
  const counts: Record<string, number> = {};
  for (const item of totals as Array<{ metricType: string; count?: number }>) {
    counts[item.metricType] = item.count ?? 0;
  }
  return counts;
}

function sumDailyMetrics(
  metrics: Array<{ metricType: string; value: number }>
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const m of metrics) {
    totals[m.metricType] = (totals[m.metricType] ?? 0) + m.value;
  }
  return totals;
}

/**
 * Compute blended rankings per metric type.
 *
 * For integrations that provide per-product data, we show individual products.
 * For integrations that only provide account-level data, we show the account.
 * This way the ranking always reflects the full total across all sources.
 *
 * Example for active_subscriptions with Stripe (account-level) + Gumroad (per-product):
 *   - "Drawings Alive" (Stripe): 161   ← account-level
 *   - "CSS Pro" (Stripe): 7            ← account-level
 *   - "CSS Pro" (Gumroad product): 6   ← product-level
 */
const STOCK_METRIC_TYPES = new Set([
  "mrr",
  "active_subscriptions",
  "active_trials",
  "active_users",
  "products_count",
]);

const FLOW_METRIC_KEYS = [
  "revenue",
  "subscription_revenue",
  "one_time_revenue",
  "sales_count",
  "new_customers",
  "platform_fees",
];

function computeBlendedRankings(
  dailyMetrics: any[],
  accountLabels: Record<string, string>,
  accountIntegrationMap: Map<string, string>,
  productMetricsData: ProductMetricsResponse | null
): { accountRankings: Record<string, RankingEntry[]>; blendedRankings: Record<string, RankingEntry[]> } {
  // Disambiguate account labels that appear across multiple integrations.
  const labelToIntegrations = new Map<string, Set<string>>();
  for (const [accountId, integrationName] of accountIntegrationMap) {
    const label = accountLabels[accountId] ?? accountId.slice(0, 8);
    if (!labelToIntegrations.has(label)) {
      labelToIntegrations.set(label, new Set());
    }
    labelToIntegrations.get(label)!.add(integrationName);
  }

  // 1. Account-level rankings (always needed as baseline)
  const byTypeAndAccount = new Map<string, Map<string, { value: number; date: string }>>();
  for (const m of dailyMetrics) {
    const mt = m.metricType as string;
    const aid = m.accountId as string;
    const val = m.value as number;
    const date = m.date as string;
    if (!byTypeAndAccount.has(mt)) byTypeAndAccount.set(mt, new Map());
    const accMap = byTypeAndAccount.get(mt)!;
    const existing = accMap.get(aid);
    if (STOCK_METRIC_TYPES.has(mt)) {
      if (!existing || existing.date < date) {
        accMap.set(aid, { value: val, date });
      }
    } else {
      accMap.set(aid, { value: (existing?.value ?? 0) + val, date });
    }
  }

  const accountRankings: Record<string, RankingEntry[]> = {};
  for (const [metricType, accMap] of byTypeAndAccount) {
    const entries = Array.from(accMap, ([accountId, { value }]) => ({
      label: (() => {
        const base = accountLabels[accountId] ?? accountId.slice(0, 8);
        const integrationName = accountIntegrationMap.get(accountId) ?? "Unknown";
        const integrationsForLabel = labelToIntegrations.get(base);
        return integrationsForLabel && integrationsForLabel.size > 1
          ? `${base} (${integrationName})`
          : base;
      })(),
      integrationName: accountIntegrationMap.get(accountId) ?? "Unknown",
      value,
      percentage: 0,
    }));
    entries.sort((a, b) => b.value - a.value);
    const total = entries.reduce((sum, e) => sum + e.value, 0);
    accountRankings[metricType] = entries.map((e) => ({
      ...e,
      percentage: total > 0 ? (e.value / total) * 100 : 0,
    }));
  }

  // 2. Product-level data: group by (metricType, accountId) and by (metricType, projectId)
  //    so we know which accounts have per-product breakdowns
  const productMetrics = productMetricsData && "metrics" in productMetricsData
    ? productMetricsData.metrics : [];
  const projectLabels = productMetricsData && "projects" in productMetricsData
    ? productMetricsData.projects : {};

  // Per metric type, which accounts have product-level data?
  const accountsWithProducts = new Map<string, Set<string>>(); // metricType -> Set<accountId>
  // Per metric type, product entries
  const productEntries = new Map<
    string,
    Map<string, { value: number; name: string; integrationName: string; date: string }>
  >(); // metricType -> projectId -> data

  for (const m of productMetrics) {
    const mt = m.metricType;
    const pid = m.projectId;
    if (!pid) continue;
    const val = m.value;
    const aid = m.accountId;
    const date = m.date;

    // Track that this account has product data for this metric
    if (!accountsWithProducts.has(mt)) accountsWithProducts.set(mt, new Set());
    accountsWithProducts.get(mt)!.add(aid);

    // Accumulate product entry
    if (!productEntries.has(mt)) productEntries.set(mt, new Map());
    const projMap = productEntries.get(mt)!;
    const existing = projMap.get(pid);
    const projectInfo = projectLabels[pid];
    const productName = projectInfo?.label || pid.slice(0, 12);
    const integrationName = accountIntegrationMap.get(aid) ?? "Unknown";
    if (existing) {
      if (STOCK_METRIC_TYPES.has(mt)) {
        if (existing.date < date) {
          existing.value = val;
          existing.date = date;
        }
      } else {
        existing.value += val;
      }
    } else {
      projMap.set(pid, { value: val, name: productName, integrationName, date });
    }
  }

  // 3. Blend: for each metric type, use product entries for accounts that have them,
  //    account entries for accounts that don't
  const blendedRankings: Record<string, RankingEntry[]> = {};

  const allMetricTypes = new Set([
    ...byTypeAndAccount.keys(),
    ...productEntries.keys(),
  ]);

  for (const metricType of allMetricTypes) {
    const accsWithProductData = accountsWithProducts.get(metricType) ?? new Set();
    const accMap = byTypeAndAccount.get(metricType);
    const projMap = productEntries.get(metricType);

    const entries: Array<{ label: string; integrationName: string; value: number; sourceId?: string }> = [];

    // Add product-level entries from integrations that have per-product data
    if (projMap) {
      for (const [projectId, data] of projMap) {
        entries.push({
          label: data.name,
          integrationName: data.integrationName,
          value: data.value,
          sourceId: projectId,
        });
      }
    }

    // Add account-level entries for accounts WITHOUT per-product data
    if (accMap) {
      for (const [accountId, data] of accMap) {
        if (!accsWithProductData.has(accountId)) {
          entries.push({
            label: (() => {
              const base = accountLabels[accountId] ?? accountId.slice(0, 8);
              const integrationName = accountIntegrationMap.get(accountId) ?? "Unknown";
              const integrationsForLabel = labelToIntegrations.get(base);
              return integrationsForLabel && integrationsForLabel.size > 1
                ? `${base} (${integrationName})`
                : base;
            })(),
            integrationName: accountIntegrationMap.get(accountId) ?? "Unknown",
            value: data.value,
            sourceId: accountId,
          });
        }
      }
    }

    // If no product data exists at all, blended = account rankings (skip duplicate)
    if (accsWithProductData.size === 0) {
      blendedRankings[metricType] = accountRankings[metricType] ?? [];
      continue;
    }

    entries.sort((a, b) => b.value - a.value);
    const total = entries.reduce((sum, e) => sum + e.value, 0);
    blendedRankings[metricType] = entries.map((e) => ({
      ...e,
      percentage: total > 0 ? (e.value / total) * 100 : 0,
    }));
  }

  return { accountRankings, blendedRankings };
}

// ─── Project Group Merging ─────────────────────────────────────────────────────

/**
 * Build a lookup from (accountId, projectId | null) -> groupId
 * and a map from groupId -> group info.
 */
export interface GroupLookup {
  /** (accountId:projectId) -> groupId */
  memberToGroup: Map<string, string>;
  /** groupId -> { name, integrationNames } */
  groupInfo: Map<string, { name: string; integrationNames: string[] }>;
}

export function buildGroupLookup(
  groups: ProjectGroupResponse[],
  accountIntegrationMap: Map<string, string>
): GroupLookup {
  const memberToGroup = new Map<string, string>();
  const groupInfo = new Map<string, { name: string; integrationNames: string[] }>();

  for (const group of groups) {
    const integrationNames = new Set<string>();
    for (const member of group.members) {
      const key = `${member.accountId}:${member.projectId ?? ""}`;
      memberToGroup.set(key, group.id);
      const integName = accountIntegrationMap.get(member.accountId);
      if (integName) integrationNames.add(integName);
    }
    groupInfo.set(group.id, {
      name: group.name,
      integrationNames: Array.from(integrationNames),
    });
  }

  return { memberToGroup, groupInfo };
}

/**
 * Post-process blended rankings to merge entries that belong to the same
 * project group. Merged entries use the group name as label, sum their
 * values, and combine integration names for stacked logos.
 *
 * Entries that don't belong to any group pass through unchanged.
 */
export function applyProjectGroupMerging(
  rankings: Record<string, RankingEntry[]>,
  lookup: GroupLookup,
  productMetricsData: ProductMetricsResponse | null,
  accountLabels?: Record<string, string>
): Record<string, RankingEntry[]> {
  if (lookup.memberToGroup.size === 0) return rankings;

  // Build a reverse lookup: label -> member keys (accountId:projectId)
  // We need this because blended rankings use labels, not IDs.

  // 1. Project labels -> keys
  const labelToKeys = new Map<string, string[]>();
  if (productMetricsData && "projects" in productMetricsData) {
    for (const [projectId, info] of Object.entries(productMetricsData.projects)) {
      const key = `${info.accountId}:${projectId}`;
      const existing = labelToKeys.get(info.label) ?? [];
      existing.push(key);
      labelToKeys.set(info.label, existing);
    }
  }

  // 2. Account labels -> keys (for account-level group members)
  //    Also handle disambiguated labels like "Drawings Alive (Stripe)"
  const accountLabelToKeys = new Map<string, string[]>();
  if (accountLabels) {
    for (const [accountId, label] of Object.entries(accountLabels)) {
      const key = `${accountId}:`;
      // Plain label
      const existing = accountLabelToKeys.get(label) ?? [];
      existing.push(key);
      accountLabelToKeys.set(label, existing);
    }
  }

  const result: Record<string, RankingEntry[]> = {};

  for (const [metricType, entries] of Object.entries(rankings)) {
    const groupBuckets = new Map<string, { value: number; integrationNames: Set<string>; members: RankingEntry[] }>();
    const ungrouped: RankingEntry[] = [];

    for (const entry of entries) {
      // Try to find the group for this entry
      let groupId: string | undefined;

      // Check by label -> projectId mapping
      const keys = labelToKeys.get(entry.label);
      if (keys) {
        for (const key of keys) {
          const gid = lookup.memberToGroup.get(key);
          if (gid) {
            groupId = gid;
            break;
          }
        }
      }

      // Check account-level: match label against account labels
      if (!groupId) {
        const accKeys = accountLabelToKeys.get(entry.label);
        if (accKeys) {
          for (const key of accKeys) {
            const gid = lookup.memberToGroup.get(key);
            if (gid) {
              groupId = gid;
              break;
            }
          }
        }
      }

      // Handle disambiguated labels like "Drawings Alive (Stripe)"
      // Strip the integration suffix and try again
      if (!groupId) {
        const suffixMatch = entry.label.match(/^(.+?)\s*\([^)]+\)$/);
        if (suffixMatch) {
          const baseLabel = suffixMatch[1];
          // Try project labels
          const projKeys = labelToKeys.get(baseLabel);
          if (projKeys) {
            for (const key of projKeys) {
              const gid = lookup.memberToGroup.get(key);
              if (gid) { groupId = gid; break; }
            }
          }
          // Try account labels
          if (!groupId) {
            const accKeys = accountLabelToKeys.get(baseLabel);
            if (accKeys) {
              for (const key of accKeys) {
                const gid = lookup.memberToGroup.get(key);
                if (gid) { groupId = gid; break; }
              }
            }
          }
        }
      }

      if (groupId) {
        const bucket = groupBuckets.get(groupId) ?? { value: 0, integrationNames: new Set<string>(), members: [] as RankingEntry[] };
        bucket.value += entry.value;
        bucket.members.push(entry);
        if (entry.integrationNames) {
          for (const n of entry.integrationNames) bucket.integrationNames.add(n);
        } else {
          bucket.integrationNames.add(entry.integrationName);
        }
        groupBuckets.set(groupId, bucket);
      } else {
        ungrouped.push(entry);
      }
    }

    // Build group entries with children
    const groupEntries: RankingEntry[] = [];
    for (const [groupId, bucket] of groupBuckets) {
      const info = lookup.groupInfo.get(groupId);
      if (!info) continue;
      const names = Array.from(bucket.integrationNames);
      // Build children with percentages relative to the group total
      const children = bucket.members
        .sort((a, b) => b.value - a.value)
        .map((m) => ({
          ...m,
          percentage: bucket.value > 0 ? (m.value / bucket.value) * 100 : 0,
        }));
      groupEntries.push({
        label: info.name,
        integrationName: names[0] ?? "Unknown",
        integrationNames: names,
        value: bucket.value,
        percentage: 0, // recalculated below
        children: children.length > 1 ? children : undefined,
      });
    }

    // Merge and recalculate percentages
    const merged = [...groupEntries, ...ungrouped];
    merged.sort((a, b) => b.value - a.value);
    const total = merged.reduce((sum, e) => sum + e.value, 0);
    for (const entry of merged) {
      entry.percentage = total > 0 ? (entry.value / total) * 100 : 0;
    }

    result[metricType] = merged;
  }

  return result;
}

/**
 * Merge daily breakdown entries (top-5 per day) using project group info.
 * Similar to applyProjectGroupMerging but operates on a flat array for a single date.
 */
function mergeBreakdownEntries(
  entries: Array<{ label: string; value: number; integrationName?: string }>,
  lookup: GroupLookup,
  productMetricsData: ProductMetricsResponse | null,
  accountLabels?: Record<string, string>
): Array<{ label: string; value: number; integrationName?: string; integrationNames?: string[] }> {
  // Build same reverse lookups as in applyProjectGroupMerging
  const labelToKeys = new Map<string, string[]>();
  if (productMetricsData && "projects" in productMetricsData) {
    for (const [projectId, info] of Object.entries(productMetricsData.projects)) {
      const key = `${info.accountId}:${projectId}`;
      const existing = labelToKeys.get(info.label) ?? [];
      existing.push(key);
      labelToKeys.set(info.label, existing);
    }
  }

  const accountLabelToKeys = new Map<string, string[]>();
  if (accountLabels) {
    for (const [accountId, label] of Object.entries(accountLabels)) {
      const key = `${accountId}:`;
      const existing = accountLabelToKeys.get(label) ?? [];
      existing.push(key);
      accountLabelToKeys.set(label, existing);
    }
  }

  const groupBuckets = new Map<string, { value: number; integrationNames: Set<string> }>();
  const ungrouped: Array<{ label: string; value: number; integrationName?: string }> = [];

  for (const entry of entries) {
    let groupId: string | undefined;

    // Try project labels
    const projKeys = labelToKeys.get(entry.label);
    if (projKeys) {
      for (const key of projKeys) {
        const gid = lookup.memberToGroup.get(key);
        if (gid) { groupId = gid; break; }
      }
    }

    // Try account labels
    if (!groupId) {
      const accKeys = accountLabelToKeys.get(entry.label);
      if (accKeys) {
        for (const key of accKeys) {
          const gid = lookup.memberToGroup.get(key);
          if (gid) { groupId = gid; break; }
        }
      }
    }

    // Try disambiguated labels
    if (!groupId) {
      const suffixMatch = entry.label.match(/^(.+?)\s*\([^)]+\)$/);
      if (suffixMatch) {
        const baseLabel = suffixMatch[1];
        const pKeys = labelToKeys.get(baseLabel);
        if (pKeys) {
          for (const key of pKeys) {
            const gid = lookup.memberToGroup.get(key);
            if (gid) { groupId = gid; break; }
          }
        }
        if (!groupId) {
          const aKeys = accountLabelToKeys.get(baseLabel);
          if (aKeys) {
            for (const key of aKeys) {
              const gid = lookup.memberToGroup.get(key);
              if (gid) { groupId = gid; break; }
            }
          }
        }
      }
    }

    if (groupId) {
      const bucket = groupBuckets.get(groupId) ?? { value: 0, integrationNames: new Set() };
      bucket.value += entry.value;
      if (entry.integrationName) bucket.integrationNames.add(entry.integrationName);
      groupBuckets.set(groupId, bucket);
    } else {
      ungrouped.push(entry);
    }
  }

  const merged: Array<{ label: string; value: number; integrationName?: string; integrationNames?: string[] }> = [];

  for (const [groupId, bucket] of groupBuckets) {
    const info = lookup.groupInfo.get(groupId);
    if (!info) continue;
    const names = Array.from(bucket.integrationNames);
    merged.push({
      label: info.name,
      integrationName: names[0],
      integrationNames: names.length > 1 ? names : undefined,
      value: bucket.value,
    });
  }

  merged.push(...ungrouped);
  merged.sort((a, b) => b.value - a.value);
  return merged.slice(0, 5);
}

// ─── Main Hook ────────────────────────────────────────────────────────────────

export function useDashboardData(): DashboardData {
  const { data: integrations, loading: integrationsLoading, refetch: refetchIntegrations } =
    useIntegrations();
  const { data: projectGroupsData, refetch: refetchProjectGroups } = useProjectGroups();

  // ─── Filter state ────────────────────────────────────────────────────────
  const [enabledAccountIds, setEnabledAccountIds] = useState<Set<string>>(new Set());
  const [enabledProjectIds, setEnabledProjectIds] = useState<Set<string>>(new Set());
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>("last_30_days");
  const [customRange, setCustomRange] = useState<{ from?: Date; to?: Date }>({});
  const [compareEnabled, setCompareEnabled] = useState(true);
  const initialized = useRef(false);
  const backfillKeyRef = useRef<string | null>(null);
  const backfillNextAtRef = useRef(new Map<string, number>());
  const [compareBackfillStatus, setCompareBackfillStatus] = useState<
    "idle" | "running" | "error"
  >("idle");
  const [compareBackfillError, setCompareBackfillError] = useState<string | null>(null);

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
  const isInitialized = initialized.current;

  // ─── Metrics queries (all fire in parallel once accountIds are set) ──────
  // While initializing (integrations loading), use undefined to skip fetching.
  // Once initialized:
  //   - If accounts are selected, use them
  //   - If nothing selected (user toggled off), use sentinel to get empty results
  const effectiveAccountIds = !isInitialized
    ? undefined
    : hasFilter
      ? accountIdsArray
      : ["__none__"];

  const { from, to } = useMemo(() => {
    if (dateRangePreset === "custom") {
      const fromDate = customRange.from ? startOfDay(customRange.from) : undefined;
      const toDate = customRange.to ? endOfDay(customRange.to) : undefined;
      return {
        from: fromDate ? format(fromDate, "yyyy-MM-dd") : undefined,
        to: toDate ? format(toDate, "yyyy-MM-dd") : undefined,
      };
    }
    return resolveDateRange(dateRangePreset);
  }, [dateRangePreset, customRange]);

  const { prevFrom, prevTo } = useMemo(() => {
    if (!from || !to || !compareEnabled) return { prevFrom: undefined, prevTo: undefined };
    return getComparisonRange(from, to);
  }, [from, to, compareEnabled]);

  const { data: metricsData, loading: metricsLoading, refetch: refetchMetrics } =
    useMetrics({
      from,
      to,
      accountIds: effectiveAccountIds,
    });

  const { data: totalsData, loading: totalsLoading, refetch: refetchTotals } =
    useMetrics({
      from,
      to,
      aggregation: "total",
      accountIds: effectiveAccountIds,
    });

  const prevAccountIds = compareEnabled ? effectiveAccountIds : ["__none__"];
  const { data: prevTotalsData, refetch: refetchPrevTotals } = useMetrics({
    from: prevFrom,
    to: prevTo,
    aggregation: "total",
    accountIds: prevAccountIds,
  });

  const { data: productMetricsData, refetch: refetchProductMetrics } =
    useProductMetrics({
      from,
      to,
      accountIds: effectiveAccountIds,
    });

  const { data: customersByCountryData, loading: customersByCountryLoading, refetch: refetchCustomersByCountry } =
    useCustomersByCountry({
      from,
      to,
      accountIds: effectiveAccountIds,
    });

  // ─── Today metrics (always fetches today regardless of date filter) ──────
  const todayDate = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const yesterdayDate = useMemo(() => format(subDays(new Date(), 1), "yyyy-MM-dd"), []);

  const { data: todayMetricsData, loading: todayMetricsLoading, refetch: refetchTodayMetrics } =
    useMetrics({
      from: todayDate,
      to: todayDate,
      accountIds: effectiveAccountIds,
    });

  const { data: todayTotalsData, refetch: refetchTodayTotals } =
    useMetrics({
      from: todayDate,
      to: todayDate,
      aggregation: "total",
      accountIds: effectiveAccountIds,
    });

  const { data: todayProductMetricsData, refetch: refetchTodayProductMetrics } =
    useProductMetrics({
      from: todayDate,
      to: todayDate,
      accountIds: effectiveAccountIds,
    });

  const { data: yesterdayTotalsData, refetch: refetchYesterdayTotals } =
    useMetrics({
      from: yesterdayDate,
      to: yesterdayDate,
      aggregation: "total",
      accountIds: effectiveAccountIds,
    });

  const { data: yesterdayMetricsData, refetch: refetchYesterdayMetrics } =
    useMetrics({
      from: yesterdayDate,
      to: yesterdayDate,
      accountIds: effectiveAccountIds,
    });

  const { data: yesterdayProductMetricsData, refetch: refetchYesterdayProductMetrics } =
    useProductMetrics({
      from: yesterdayDate,
      to: yesterdayDate,
      accountIds: effectiveAccountIds,
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

  // ─── Daily metrics ───────────────────────────────────────────────────────
  const dailyMetrics = useMemo(
    () => (metricsData && "metrics" in metricsData ? metricsData.metrics : []),
    [metricsData]
  );

  const accountLabels: Record<string, string> = useMemo(
    () => (metricsData && "accounts" in metricsData ? metricsData.accounts : {}),
    [metricsData]
  );

  // ─── Totals ──────────────────────────────────────────────────────────────
  const dailyTotals = useMemo(() => sumDailyMetrics(dailyMetrics), [dailyMetrics]);

  const currentTotals = useMemo(() => {
    const base = extractTotals(totalsData);
    const revenue = dailyTotals.revenue ?? base.revenue;
    const platformFees = dailyTotals.platform_fees ?? base.platformFees;
    return {
      ...base,
      revenue,
      newCustomers: dailyTotals.new_customers ?? base.newCustomers,
      subscriptionRevenue: dailyTotals.subscription_revenue ?? base.subscriptionRevenue,
      oneTimeRevenue: dailyTotals.one_time_revenue ?? base.oneTimeRevenue,
      salesCount: dailyTotals.sales_count ?? base.salesCount,
      platformFees,
      netRevenue: revenue - platformFees,
    };
  }, [totalsData, dailyTotals]);
  const previousTotals = useMemo(() => {
    if (!compareEnabled) {
      return {
        revenue: 0,
        mrr: 0,
        netRevenue: 0,
        activeSubscriptions: 0,
        newCustomers: 0,
        subscriptionRevenue: 0,
        oneTimeRevenue: 0,
        salesCount: 0,
        platformFees: 0,
        currency: "USD",
      };
    }
    return extractTotals(prevTotalsData);
  }, [prevTotalsData, compareEnabled]);

  const currentCounts = useMemo(() => extractCounts(totalsData), [totalsData]);
  const previousCounts = useMemo(() => extractCounts(prevTotalsData), [prevTotalsData]);
  const comparisonAvailability = useMemo(() => {
    const availability: Record<string, boolean> = {};
    const keys = new Set<string>([
      ...Object.keys(currentCounts),
      ...Object.keys(previousCounts),
    ]);
    const expectedAccounts = accountIdsArray.length;

    for (const key of keys) {
      if (!compareEnabled) {
        availability[key] = false;
        continue;
      }
      if (STOCK_METRIC_TYPES.has(key)) {
        const currentCount = currentCounts[key] ?? 0;
        const prevCount = previousCounts[key] ?? 0;
        availability[key] =
          expectedAccounts > 0 &&
          currentCount >= expectedAccounts &&
          prevCount >= expectedAccounts;
      } else {
        availability[key] = true;
      }
    }
    return availability;
  }, [compareEnabled, currentCounts, previousCounts, accountIdsArray.length]);

  // ─── Backfill missing compare windows for flow metrics ────────────────────
  const startBackfill = useCallback(
    (rangeKey: string, fromDate: string) => {
      const now = Date.now();
      const nextAt = backfillNextAtRef.current.get(rangeKey);
      if (nextAt && now < nextAt) return;

      if (backfillKeyRef.current === rangeKey) return;
      backfillKeyRef.current = rangeKey;

      setCompareBackfillStatus("running");
      setCompareBackfillError(null);

      Promise.all(
        accountIdsArray.map((accountId) =>
          apiPost("/api/sync", { accountId, from: fromDate })
        )
      )
        .then(() => {
          setCompareBackfillStatus("idle");
          refetchMetrics();
          refetchTotals();
          refetchPrevTotals();
          refetchProductMetrics();
          refetchCustomersByCountry();
          refetchTodayMetrics();
          refetchTodayTotals();
          refetchTodayProductMetrics();
          refetchYesterdayTotals();
          refetchYesterdayMetrics();
          refetchYesterdayProductMetrics();
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : "Backfill failed";
          const cooldownMatch = message.match(/wait\s+(\d+)s/i);
          if (cooldownMatch) {
            const seconds = Number(cooldownMatch[1]);
            if (!Number.isNaN(seconds)) {
              backfillNextAtRef.current.set(rangeKey, Date.now() + seconds * 1000);
              backfillKeyRef.current = null;
            }
          }
          setCompareBackfillError(message);
          setCompareBackfillStatus("error");
        });
    },
    [
      accountIdsArray,
      refetchMetrics,
      refetchTotals,
      refetchPrevTotals,
      refetchProductMetrics,
      refetchCustomersByCountry,
      refetchTodayMetrics,
      refetchTodayTotals,
      refetchTodayProductMetrics,
      refetchYesterdayTotals,
      refetchYesterdayMetrics,
      refetchYesterdayProductMetrics,
    ]
  );

  useEffect(() => {
    if (
      shouldStartRangeBackfill({
        from,
        to,
        accountIds: accountIdsArray,
        counts: currentCounts,
        flowMetricKeys: FLOW_METRIC_KEYS,
      })
    ) {
      const key = `current:${from}:${to}:${accountIdsArray.join(",")}`;
      startBackfill(key, from as string);
    }
  }, [from, to, currentCounts, accountIdsArray, startBackfill]);

  useEffect(() => {
    if (
      !shouldStartBackfill({
        compareEnabled,
        prevFrom,
        prevTo,
        accountIds: accountIdsArray,
        prevCounts: previousCounts,
        flowMetricKeys: FLOW_METRIC_KEYS,
      })
    ) {
      return;
    }
    const key = `prev:${prevFrom}:${prevTo}:${accountIdsArray.join(",")}`;
    startBackfill(key, prevFrom as string);
  }, [
    compareEnabled,
    prevFrom,
    prevTo,
    prevTotalsData,
    previousCounts,
    accountIdsArray,
    startBackfill,
  ]);

  // ─── Rankings ────────────────────────────────────────────────────────────
  const resolvedProductData = useMemo(
    () =>
      productMetricsData && "metrics" in productMetricsData
        ? (productMetricsData as ProductMetricsResponse)
        : null,
    [productMetricsData]
  );

  const { accountRankings, blendedRankings: rawBlendedRankings } = useMemo(
    () =>
      computeBlendedRankings(
        dailyMetrics,
        accountLabels,
        accountIntegrationMap,
        resolvedProductData
      ),
    [dailyMetrics, accountLabels, accountIntegrationMap, resolvedProductData]
  );

  // ─── Project group merging ─────────────────────────────────────────────
  const groupLookup = useMemo(
    () => buildGroupLookup(projectGroupsData ?? [], accountIntegrationMap),
    [projectGroupsData, accountIntegrationMap]
  );

  const blendedRankingsBeforeFeeRate = useMemo(
    () => applyProjectGroupMerging(rawBlendedRankings, groupLookup, resolvedProductData, accountLabels),
    [rawBlendedRankings, groupLookup, resolvedProductData, accountLabels]
  );

  // Annotate platform_fees ranking entries with "X.X% of revenue" subtitle
  const blendedRankings = useMemo(() => {
    const result = { ...blendedRankingsBeforeFeeRate };
    const feeEntries = result.platform_fees;
    const revenueEntries = result.revenue;
    if (!feeEntries || !revenueEntries) return result;

    // Build a label -> revenue value lookup (top-level entries)
    const revenueByLabel = new Map<string, number>();
    // Build a sourceId -> revenue value lookup for group children
    const revenueChildBySourceId = new Map<string, number>();
    for (const entry of revenueEntries) {
      revenueByLabel.set(entry.label, entry.value);
      if (entry.children) {
        for (const child of entry.children) {
          if (child.sourceId) {
            revenueChildBySourceId.set(child.sourceId, child.value);
          }
        }
      }
    }

    const revCurrency = currentTotals.currency;

    result.platform_fees = feeEntries.map((entry) => {
      const rev = revenueByLabel.get(entry.label);
      const subtitle = rev && rev > 0
        ? `${(entry.value / rev * 100).toFixed(1)}% of revenue (${formatCurrency(rev, revCurrency)})`
        : undefined;

      // Also annotate children — match against revenue group children by sourceId
      const children = entry.children?.map((child) => {
        const childRev = child.sourceId ? revenueChildBySourceId.get(child.sourceId) : undefined;
        const childSubtitle = childRev && childRev > 0
          ? `${(child.value / childRev * 100).toFixed(1)}% of revenue (${formatCurrency(childRev, revCurrency)})`
          : undefined;
        return childSubtitle ? { ...child, subtitle: childSubtitle } : child;
      });

      return {
        ...entry,
        ...(subtitle ? { subtitle } : {}),
        ...(children ? { children } : {}),
      };
    });

    // Derive net_revenue ranking (revenue - platform fees) so breakdown is available
    const feeByLabel = new Map<string, RankingEntry>();
    const feeBySourceId = new Map<string, RankingEntry>();
    for (const entry of feeEntries) {
      feeByLabel.set(entry.label, entry);
      if (entry.children) {
        for (const child of entry.children) {
          if (child.sourceId) {
            feeBySourceId.set(child.sourceId, child);
          }
        }
      }
    }

    const netEntries: RankingEntry[] = [];
    const seenLabels = new Set<string>();

    for (const entry of revenueEntries) {
      const feeEntry = feeByLabel.get(entry.label);
      const feeValue = feeEntry?.value ?? 0;
      const netValue = entry.value - feeValue;
      const children = entry.children?.map((child) => {
        const feeChild = child.sourceId ? feeBySourceId.get(child.sourceId) : undefined;
        const childNet = child.value - (feeChild?.value ?? 0);
        return { ...child, value: childNet };
      });

      netEntries.push({
        ...entry,
        value: netValue,
        ...(children ? { children } : {}),
      });
      seenLabels.add(entry.label);
    }

    // Include fee-only entries as negative net
    for (const entry of feeEntries) {
      if (seenLabels.has(entry.label)) continue;
      const children = entry.children?.map((child) => ({
        ...child,
        value: -child.value,
      }));
      netEntries.push({
        ...entry,
        value: -entry.value,
        ...(children ? { children } : {}),
      });
    }

    const netTotal = netEntries.reduce((sum, e) => sum + e.value, 0);
    result.net_revenue = netEntries
      .filter((e) => e.value !== 0)
      .sort((a, b) => b.value - a.value)
      .map((e) => ({
        ...e,
        percentage: netTotal !== 0 ? (e.value / netTotal) * 100 : 0,
      }));

    return result;
  }, [blendedRankingsBeforeFeeRate, currentTotals.currency]);

  // ─── Today totals & rankings ──────────────────────────────────────────────
  const todayDailyMetrics = useMemo(
    () => (todayMetricsData && "metrics" in todayMetricsData ? todayMetricsData.metrics : []),
    [todayMetricsData]
  );

  const todayAccountLabels: Record<string, string> = useMemo(
    () => (todayMetricsData && "accounts" in todayMetricsData ? todayMetricsData.accounts : {}),
    [todayMetricsData]
  );

  const todayTotals = useMemo(() => extractTotals(todayTotalsData), [todayTotalsData]);
  const yesterdayTotals = useMemo(() => extractTotals(yesterdayTotalsData), [yesterdayTotalsData]);
  const todayNewMrr = todayTotals.mrr - yesterdayTotals.mrr;

  const resolvedTodayProductData = useMemo(
    () =>
      todayProductMetricsData && "metrics" in todayProductMetricsData
        ? (todayProductMetricsData as ProductMetricsResponse)
        : null,
    [todayProductMetricsData]
  );

  const { blendedRankings: rawTodayBlendedRankings } = useMemo(
    () =>
      computeBlendedRankings(
        todayDailyMetrics,
        todayAccountLabels,
        accountIntegrationMap,
        resolvedTodayProductData
      ),
    [todayDailyMetrics, todayAccountLabels, accountIntegrationMap, resolvedTodayProductData]
  );

  // Yesterday daily metrics + rankings (for MRR delta breakdown)
  const yesterdayDailyMetrics = useMemo(
    () => (yesterdayMetricsData && "metrics" in yesterdayMetricsData ? yesterdayMetricsData.metrics : []),
    [yesterdayMetricsData]
  );

  const yesterdayAccountLabels: Record<string, string> = useMemo(
    () => (yesterdayMetricsData && "accounts" in yesterdayMetricsData ? yesterdayMetricsData.accounts : {}),
    [yesterdayMetricsData]
  );

  const resolvedYesterdayProductData = useMemo(
    () =>
      yesterdayProductMetricsData && "metrics" in yesterdayProductMetricsData
        ? (yesterdayProductMetricsData as ProductMetricsResponse)
        : null,
    [yesterdayProductMetricsData]
  );

  const { blendedRankings: rawYesterdayBlendedRankings } = useMemo(
    () =>
      computeBlendedRankings(
        yesterdayDailyMetrics,
        { ...yesterdayAccountLabels, ...todayAccountLabels },
        accountIntegrationMap,
        resolvedYesterdayProductData
      ),
    [yesterdayDailyMetrics, yesterdayAccountLabels, todayAccountLabels, accountIntegrationMap, resolvedYesterdayProductData]
  );

  // Apply project group merging to both today and yesterday before diffing
  const todayBlendedRankingsBeforeDelta = useMemo(
    () => applyProjectGroupMerging(rawTodayBlendedRankings, groupLookup, resolvedTodayProductData, todayAccountLabels),
    [rawTodayBlendedRankings, groupLookup, resolvedTodayProductData, todayAccountLabels]
  );

  const yesterdayBlendedRankings = useMemo(
    () => applyProjectGroupMerging(rawYesterdayBlendedRankings, groupLookup, resolvedYesterdayProductData, yesterdayAccountLabels),
    [rawYesterdayBlendedRankings, groupLookup, resolvedYesterdayProductData, yesterdayAccountLabels]
  );

  // Compute MRR delta breakdown: today snapshot - yesterday snapshot per source
  const todayBlendedRankings = useMemo(() => {
    const result = { ...todayBlendedRankingsBeforeDelta };

    const todayMrrEntries = result.mrr ?? [];
    const yesterdayMrrEntries = yesterdayBlendedRankings.mrr ?? [];

    // Build yesterday lookup by label
    const yesterdayByLabel = new Map<string, number>();
    for (const entry of yesterdayMrrEntries) {
      yesterdayByLabel.set(entry.label, entry.value);
    }

    // Also collect labels that only exist in yesterday (churned sources)
    const todayLabels = new Set(todayMrrEntries.map((e) => e.label));

    // Compute deltas for today entries
    const deltaEntries: RankingEntry[] = todayMrrEntries.map((entry) => {
      const prevValue = yesterdayByLabel.get(entry.label) ?? 0;
      const delta = entry.value - prevValue;

      // Compute child deltas if present
      const children = entry.children?.map((child) => {
        // Find matching child in yesterday's entry
        const yesterdayParent = yesterdayMrrEntries.find((e) => e.label === entry.label);
        const prevChild = yesterdayParent?.children?.find((c) => c.label === child.label);
        const childDelta = child.value - (prevChild?.value ?? 0);
        return { ...child, value: childDelta };
      });

      return {
        ...entry,
        value: delta,
        ...(children ? { children } : {}),
      };
    });

    // Add entries that existed yesterday but not today (fully churned)
    for (const entry of yesterdayMrrEntries) {
      if (!todayLabels.has(entry.label)) {
        deltaEntries.push({
          ...entry,
          value: -entry.value,
          children: entry.children?.map((c) => ({ ...c, value: -c.value })),
        });
      }
    }

    // Filter out zero-delta entries, sort by absolute value, recalculate percentages
    const nonZero = deltaEntries.filter((e) => e.value !== 0);
    nonZero.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const absTotal = nonZero.reduce((sum, e) => sum + Math.abs(e.value), 0);
    result.mrr = nonZero.map((e) => ({
      ...e,
      percentage: absTotal > 0 ? (Math.abs(e.value) / absTotal) * 100 : 0,
      children: e.children?.map((c) => {
        const parentAbs = Math.abs(e.value);
        return {
          ...c,
          percentage: parentAbs > 0 ? (Math.abs(c.value) / parentAbs) * 100 : 0,
        };
      }),
    }));

    return result;
  }, [todayBlendedRankingsBeforeDelta, yesterdayBlendedRankings]);

  // ─── Revenue chart ───────────────────────────────────────────────────────
  const revenueByDay = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const m of dailyMetrics) {
      if (m.metricType !== "revenue") continue;
      byDate.set(m.date, (byDate.get(m.date) ?? 0) + m.value);
    }
    return Array.from(byDate, ([date, value]) => ({ date, value }));
  }, [dailyMetrics]);

  // ─── Per-metric daily series (for inline card charts) ──────────────────
  const metricsByDay = useMemo(() => {
    const result: Record<string, Map<string, number>> = {};
    for (const m of dailyMetrics) {
      if (!result[m.metricType]) result[m.metricType] = new Map();
      const byDate = result[m.metricType];
      byDate.set(m.date, (byDate.get(m.date) ?? 0) + m.value);
    }
    const revenueByDate = result.revenue ?? new Map<string, number>();
    const feesByDate = result.platform_fees ?? new Map<string, number>();
    const netByDate = new Map<string, number>();
    for (const date of new Set([...revenueByDate.keys(), ...feesByDate.keys()])) {
      const netValue = (revenueByDate.get(date) ?? 0) - (feesByDate.get(date) ?? 0);
      netByDate.set(date, netValue);
    }
    if (netByDate.size > 0) {
      result.net_revenue = netByDate;
    }
    const out: Record<string, Array<{ date: string; value: number }>> = {};
    for (const [key, byDate] of Object.entries(result)) {
      out[key] = Array.from(byDate, ([date, value]) => ({ date, value })).sort(
        (a, b) => a.date.localeCompare(b.date)
      );
    }
    return out;
  }, [dailyMetrics]);

  // ─── Per-metric-type daily breakdowns (for chart tooltips) ───────────
  const breakdownByMetricAndDay = useMemo(() => {
    const projectLabelsMap = resolvedProductData?.projects ?? {};
    const hasProjectFilter = enabledProjectIds.size > 0;
    const productMetrics = resolvedProductData?.metrics ?? [];

    // For each metric type, track which accounts have product-level data
    const accountsWithProducts = new Map<string, Set<string>>();

    // 1) Product-level data: metricType -> date -> projectId -> { value, integrationName }
    const productByTypeDate = new Map<
      string,
      Map<string, Map<string, { value: number; integrationName?: string }>>
    >();

    for (const m of productMetrics) {
      if (!m.projectId) continue;
      if (hasProjectFilter && !enabledProjectIds.has(m.projectId)) continue;

      const mt = m.metricType;
      if (!accountsWithProducts.has(mt)) accountsWithProducts.set(mt, new Set());
      accountsWithProducts.get(mt)!.add(m.accountId);

      if (!productByTypeDate.has(mt)) productByTypeDate.set(mt, new Map());
      const dateMap = productByTypeDate.get(mt)!;
      if (!dateMap.has(m.date)) dateMap.set(m.date, new Map());
      const projMap = dateMap.get(m.date)!;
      const existing = projMap.get(m.projectId);
      if (existing) {
        // For stock metrics we only want the latest value, but since we're per-date
        // already, sum is fine (multiple entries same date = same snapshot typically)
        existing.value += m.value;
      } else {
        projMap.set(m.projectId, {
          value: m.value,
          integrationName: accountIntegrationMap.get(m.accountId),
        });
      }
    }

    // 2) Account-level data: metricType -> date -> accountId -> { value, integrationName }
    const accountByTypeDate = new Map<
      string,
      Map<string, Map<string, { value: number; integrationName?: string }>>
    >();

    for (const m of dailyMetrics) {
      const mt = m.metricType as string;
      const aid = m.accountId as string;
      const accsWithProds = accountsWithProducts.get(mt);
      if (accsWithProds?.has(aid)) continue; // skip if we have product-level for this

      if (!accountByTypeDate.has(mt)) accountByTypeDate.set(mt, new Map());
      const dateMap = accountByTypeDate.get(mt)!;
      if (!dateMap.has(m.date)) dateMap.set(m.date, new Map());
      const accMap = dateMap.get(m.date)!;
      const existing = accMap.get(aid);
      if (existing) {
        existing.value += m.value;
      } else {
        accMap.set(aid, {
          value: m.value,
          integrationName: accountIntegrationMap.get(aid),
        });
      }
    }

    // 3) Build result: metricType -> date -> top-5 entries
    const allMetricTypes = new Set([
      ...productByTypeDate.keys(),
      ...accountByTypeDate.keys(),
    ]);

    const result: Record<
      string,
      Record<string, Array<{ label: string; value: number; integrationName?: string; integrationNames?: string[] }>>
    > = {};

    for (const mt of allMetricTypes) {
      const prodDates = productByTypeDate.get(mt);
      const accDates = accountByTypeDate.get(mt);
      const allDates = new Set<string>([
        ...(prodDates?.keys() ?? []),
        ...(accDates?.keys() ?? []),
      ]);

      const dateResult: Record<string, Array<{ label: string; value: number; integrationName?: string; integrationNames?: string[] }>> = {};

      for (const date of allDates) {
        const entries: Array<{ label: string; value: number; integrationName?: string }> = [];

        const prodMap = prodDates?.get(date);
        if (prodMap) {
          for (const [projectId, data] of prodMap) {
            entries.push({
              label: projectLabelsMap[projectId]?.label ?? projectId.slice(0, 8),
              value: data.value,
              integrationName: data.integrationName,
            });
          }
        }

        const accMap = accDates?.get(date);
        if (accMap) {
          for (const [accId, data] of accMap) {
            entries.push({
              label: accountLabels[accId] ?? accId.slice(0, 8),
              value: data.value,
              integrationName: data.integrationName,
            });
          }
        }

        // Disambiguate duplicate labels
        const labelCounts = new Map<string, number>();
        for (const entry of entries) {
          labelCounts.set(entry.label, (labelCounts.get(entry.label) ?? 0) + 1);
        }
        const disambiguated = entries.map((entry) => {
          if ((labelCounts.get(entry.label) ?? 0) <= 1) return entry;
          const suffix = entry.integrationName ? ` (${entry.integrationName})` : "";
          return { ...entry, label: `${entry.label}${suffix}` };
        });

        const top = disambiguated.sort((a, b) => b.value - a.value).slice(0, 5);
        if (top.length > 0) {
          // Apply project group merging to daily breakdown entries
          if (groupLookup.memberToGroup.size > 0) {
            dateResult[date] = mergeBreakdownEntries(top, groupLookup, resolvedProductData, accountLabels);
          } else {
            dateResult[date] = top;
          }
        }
      }

      result[mt] = dateResult;
    }

    // 4) Derived breakdown for net revenue (revenue - platform fees)
    const revenueBreakdown = result.revenue ?? {};
    const feeBreakdown = result.platform_fees ?? {};
    const netDates = new Set<string>([
      ...Object.keys(revenueBreakdown),
      ...Object.keys(feeBreakdown),
    ]);
    if (netDates.size > 0) {
      const netByDate: Record<
        string,
        Array<{ label: string; value: number; integrationName?: string; integrationNames?: string[] }>
      > = {};
      for (const date of netDates) {
        const merged = new Map<
          string,
          { label: string; value: number; integrationName?: string; integrationNames?: string[] }
        >();

        const applyEntry = (
          entry: { label: string; value: number; integrationName?: string; integrationNames?: string[] },
          sign: 1 | -1
        ) => {
          const existing = merged.get(entry.label) ?? {
            label: entry.label,
            value: 0,
            integrationName: entry.integrationName,
            integrationNames: entry.integrationNames,
          };
          if (!existing.integrationName && entry.integrationName) {
            existing.integrationName = entry.integrationName;
          }
          if (!existing.integrationNames && entry.integrationNames) {
            existing.integrationNames = entry.integrationNames;
          }
          existing.value += sign * entry.value;
          merged.set(entry.label, existing);
        };

        for (const entry of revenueBreakdown[date] ?? []) applyEntry(entry, 1);
        for (const entry of feeBreakdown[date] ?? []) applyEntry(entry, -1);

        const netTop = Array.from(merged.values())
          .filter((entry) => entry.value !== 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);
        if (netTop.length > 0) {
          netByDate[date] = netTop;
        }
      }
      if (Object.keys(netByDate).length > 0) {
        result.net_revenue = netByDate;
      }
    }

    return result;
  }, [resolvedProductData, enabledProjectIds, dailyMetrics, accountLabels, accountIntegrationMap, groupLookup]);

  const revenueBreakdownByDay = useMemo(() => {
    const projectLabels = resolvedProductData?.projects ?? {};
    const hasProjectFilter = enabledProjectIds.size > 0;

    // Track which accounts have product-level revenue data.
    const accountsWithProductRevenue = new Set<string>();

    // 1) Product-level revenue per day
    const byDateAndProduct = new Map<
      string,
      Map<string, { value: number; integrationName?: string }>
    >();
    if (resolvedProductData && "metrics" in resolvedProductData) {
      for (const m of resolvedProductData.metrics) {
        if (m.metricType !== "revenue") continue;
        if (!m.projectId) continue;
        if (hasProjectFilter && !enabledProjectIds.has(m.projectId)) continue;

        accountsWithProductRevenue.add(m.accountId);

        const date = m.date as string;
        if (!byDateAndProduct.has(date)) byDateAndProduct.set(date, new Map());
        const productMap = byDateAndProduct.get(date)!;
        const existing = productMap.get(m.projectId);
        if (existing) {
          existing.value += m.value;
        } else {
          productMap.set(m.projectId, {
            value: m.value,
            integrationName: accountIntegrationMap.get(m.accountId),
          });
        }
      }
    }

    // 2) Account-level revenue per day (for accounts without product data)
    const byDateAndAccount = new Map<
      string,
      Map<string, { value: number; integrationName?: string }>
    >();
    for (const m of dailyMetrics) {
      if (m.metricType !== "revenue") continue;
      const aid = m.accountId as string;
      if (accountsWithProductRevenue.has(aid)) continue;
      const date = m.date as string;
      if (!byDateAndAccount.has(date)) byDateAndAccount.set(date, new Map());
      const accMap = byDateAndAccount.get(date)!;
      const existing = accMap.get(aid);
      if (existing) {
        existing.value += m.value;
      } else {
        accMap.set(aid, {
          value: m.value,
          integrationName: accountIntegrationMap.get(aid),
        });
      }
    }

    const result: Record<
      string,
      Array<{ label: string; value: number; integrationName?: string }>
    > = {};
    const allDates = new Set<string>([
      ...byDateAndProduct.keys(),
      ...byDateAndAccount.keys(),
    ]);

    for (const date of allDates) {
      const entries: Array<{ label: string; value: number; integrationName?: string }> = [];

      const productMap = byDateAndProduct.get(date);
      if (productMap) {
        for (const [projectId, data] of productMap) {
          entries.push({
            label: projectLabels[projectId]?.label ?? projectId.slice(0, 8),
            value: data.value,
            integrationName: data.integrationName,
          });
        }
      }

      const accountMap = byDateAndAccount.get(date);
      if (accountMap) {
        for (const [accountId, data] of accountMap) {
          entries.push({
            label: accountLabels[accountId] ?? accountId.slice(0, 8),
            value: data.value,
            integrationName: data.integrationName,
          });
        }
      }

      // Disambiguate duplicate labels (e.g., same project name across integrations).
      const labelCounts = new Map<string, number>();
      for (const entry of entries) {
        labelCounts.set(entry.label, (labelCounts.get(entry.label) ?? 0) + 1);
      }

      const disambiguated = entries.map((entry) => {
        if ((labelCounts.get(entry.label) ?? 0) <= 1) return entry;
        const suffix = entry.integrationName ? ` (${entry.integrationName})` : "";
        return { ...entry, label: `${entry.label}${suffix}` };
      });

      const top = disambiguated
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      if (top.length > 0) {
        result[date] = top;
      }
    }

    return result;
  }, [resolvedProductData, enabledProjectIds, dailyMetrics, accountLabels]);

  // ─── Callbacks ───────────────────────────────────────────────────────────
  const handleSyncComplete = useCallback(() => {
    refetchIntegrations();
    refetchMetrics();
    refetchTotals();
    refetchPrevTotals();
    refetchProductMetrics();
    refetchProjectGroups();
    refetchCustomersByCountry();
    refetchTodayMetrics();
    refetchTodayTotals();
    refetchTodayProductMetrics();
    refetchYesterdayTotals();
    refetchYesterdayMetrics();
    refetchYesterdayProductMetrics();
  }, [refetchIntegrations, refetchMetrics, refetchTotals, refetchPrevTotals, refetchProductMetrics, refetchProjectGroups, refetchCustomersByCountry, refetchTodayMetrics, refetchTodayTotals, refetchTodayProductMetrics, refetchYesterdayTotals, refetchYesterdayMetrics, refetchYesterdayProductMetrics]);

  const handleFilterChange = useCallback(
    (nextAccountIds: Set<string>, nextProjectIds: Set<string>) => {
      setEnabledAccountIds(nextAccountIds);
      setEnabledProjectIds(nextProjectIds);
    },
    []
  );

  const handleDateRangeChange = useCallback((preset: DateRangePreset) => {
    setDateRangePreset(preset);
    if (preset === "all_time") {
      setCompareEnabled(false);
    }
  }, []);

  const handleCustomRangeChange = useCallback((range: { from: Date; to: Date }) => {
    setCustomRange(range);
    setDateRangePreset("custom");
  }, []);

  const handleCompareToggle = useCallback((enabled: boolean) => {
    setCompareEnabled(enabled);
  }, []);

  const refetchAll = useCallback(() => {
    refetchIntegrations();
    refetchMetrics();
    refetchTotals();
    refetchPrevTotals();
    refetchProductMetrics();
    refetchProjectGroups();
    refetchCustomersByCountry();
    refetchTodayMetrics();
    refetchTodayTotals();
    refetchTodayProductMetrics();
    refetchYesterdayTotals();
    refetchYesterdayMetrics();
    refetchYesterdayProductMetrics();
  }, [refetchIntegrations, refetchMetrics, refetchTotals, refetchPrevTotals, refetchProductMetrics, refetchProjectGroups, refetchCustomersByCountry, refetchTodayMetrics, refetchTodayTotals, refetchTodayProductMetrics, refetchYesterdayTotals, refetchYesterdayMetrics, refetchYesterdayProductMetrics]);

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
    dateRangePreset,
    compareEnabled,
    compareBackfillStatus,
    compareBackfillError,
    rangeFrom: from,
    rangeTo: to,
    prevRangeFrom: prevFrom,
    prevRangeTo: prevTo,
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

    todayTotals,
    yesterdayTotals,
    todayNewMrr,
    todayBlendedRankings,
    todayLoading: todayMetricsLoading,

    customersByCountry: customersByCountryData,
    customersByCountryLoading,

    handleSyncComplete,
    refetchAll,
  };
}
