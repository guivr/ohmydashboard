import type { ProductMetricsResponse } from "../use-metrics";
import type { GroupLookup } from "./group-merge";
import { mergeBreakdownEntries } from "./group-merge";
import { buildSourceId } from "./source-ids";

type DailyMetricRow = {
  metricType: string;
  date: string;
  accountId: string;
  value: number;
  projectId?: string | null;
};

type PendingSourceMap = Record<string, Record<string, Record<string, boolean>>>;

export function buildBreakdownByMetricAndDay(params: {
  resolvedProductData: ProductMetricsResponse | null;
  enabledProjectIds: Set<string>;
  dailyMetrics: DailyMetricRow[];
  accountLabels: Record<string, string>;
  accountIntegrationMap: Map<string, string>;
  groupLookup: GroupLookup;
  pendingSourceIdsByMetricAndDay?: PendingSourceMap;
}): Record<
  string,
  Record<
    string,
    Array<{
      label: string;
      value: number;
      integrationName?: string;
      integrationNames?: string[];
      sourceId?: string;
      pending?: boolean;
    }>
  >
> {
  const {
    resolvedProductData,
    enabledProjectIds,
    dailyMetrics,
    accountLabels,
    accountIntegrationMap,
    groupLookup,
    pendingSourceIdsByMetricAndDay,
  } = params;
  const projectLabelsMap = resolvedProductData?.projects ?? {};
  const hasProjectFilter = enabledProjectIds.size > 0;
  const productMetrics = resolvedProductData?.metrics ?? [];

  // For each metric type, track which accounts have product-level data
  const accountsWithProducts = new Map<string, Set<string>>();

  // 1) Product-level data: metricType -> date -> projectId -> { value, integrationName }
  const productByTypeDate = new Map<
    string,
    Map<string, Map<string, { value: number; integrationName?: string; sourceId?: string }>>
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
        sourceId: buildSourceId(m.accountId, m.projectId),
      });
    }
  }

  // 2) Account-level data: metricType -> date -> accountId -> { value, integrationName }
  const accountByTypeDate = new Map<
    string,
    Map<string, Map<string, { value: number; integrationName?: string; sourceId?: string }>>
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
        sourceId: buildSourceId(aid),
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
    Record<
      string,
      Array<{
        label: string;
        value: number;
        integrationName?: string;
        integrationNames?: string[];
        sourceId?: string;
        pending?: boolean;
      }>
    >
  > = {};

  for (const mt of allMetricTypes) {
    const prodDates = productByTypeDate.get(mt);
    const accDates = accountByTypeDate.get(mt);
    const allDates = new Set<string>([
      ...(prodDates?.keys() ?? []),
      ...(accDates?.keys() ?? []),
    ]);

    const dateResult: Record<
      string,
      Array<{
        label: string;
        value: number;
        integrationName?: string;
        integrationNames?: string[];
        sourceId?: string;
        pending?: boolean;
      }>
    > = {};

    for (const date of allDates) {
      const entries: Array<{
        label: string;
        value: number;
        integrationName?: string;
        sourceId?: string;
        pending?: boolean;
      }> = [];

      const prodMap = prodDates?.get(date);
      if (prodMap) {
        for (const [projectId, data] of prodMap) {
          entries.push({
            label: projectLabelsMap[projectId]?.label ?? projectId.slice(0, 8),
            value: data.value,
            integrationName: data.integrationName,
            sourceId: data.sourceId,
            pending:
              pendingSourceIdsByMetricAndDay?.[mt]?.[date]?.[data.sourceId ?? ""] ??
              false,
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
            sourceId: data.sourceId,
            pending:
              pendingSourceIdsByMetricAndDay?.[mt]?.[date]?.[data.sourceId ?? ""] ??
              false,
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
          dateResult[date] = mergeBreakdownEntries(
            top,
            groupLookup,
            resolvedProductData,
            accountLabels
          );
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
      Array<{
        label: string;
        value: number;
        integrationName?: string;
        integrationNames?: string[];
        sourceId?: string;
        pending?: boolean;
      }>
    > = {};
    for (const date of netDates) {
      const merged = new Map<
        string,
        {
          label: string;
          value: number;
          integrationName?: string;
          integrationNames?: string[];
          sourceId?: string;
          pending?: boolean;
        }
      >();

      const applyEntry = (
        entry: {
          label: string;
          value: number;
          integrationName?: string;
          integrationNames?: string[];
          sourceId?: string;
          pending?: boolean;
        },
        sign: 1 | -1
      ) => {
        const existing = merged.get(entry.label) ?? {
          label: entry.label,
          value: 0,
          integrationName: entry.integrationName,
          integrationNames: entry.integrationNames,
          sourceId: entry.sourceId,
          pending: entry.pending,
        };
        if (!existing.integrationName && entry.integrationName) {
          existing.integrationName = entry.integrationName;
        }
        if (!existing.integrationNames && entry.integrationNames) {
          existing.integrationNames = entry.integrationNames;
        }
        existing.value += sign * entry.value;
        if (entry.pending) {
          existing.pending = true;
        }
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
}
