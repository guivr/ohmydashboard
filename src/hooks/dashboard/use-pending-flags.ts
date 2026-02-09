import { useMemo } from "react";
import { buildSourceId } from "./source-ids";

type MetricRow = {
  metricType: string;
  date: string;
  metadata?: string | null;
  accountId: string;
  projectId?: string | null;
};

interface PendingFlagsParams {
  dailyMetrics: MetricRow[];
  productMetrics?: MetricRow[];
  todayDailyMetrics: MetricRow[];
  todayProductMetrics?: MetricRow[];
  yesterdayDailyMetrics: MetricRow[];
  yesterdayProductMetrics?: MetricRow[];
  todayDate: string;
  yesterdayDate: string;
  rangeTo?: string;
  flowMetricKeys: string[];
}

interface PendingFlagsResult {
  pendingTodayByMetric: Record<string, boolean>;
  pendingRangeByMetric: Record<string, boolean>;
  pendingByMetricAndDay: Record<string, Record<string, boolean>>;
  pendingSourceIdsByMetricAndDay: Record<string, Record<string, Record<string, boolean>>>;
}

function hasPendingMetadata(metadata?: string | null): boolean {
  if (!metadata) return false;
  try {
    const parsed = JSON.parse(metadata);
    return parsed?.pending === "true";
  } catch {
    return false;
  }
}

export function usePendingFlags({
  dailyMetrics,
  productMetrics = [],
  todayDailyMetrics,
  todayProductMetrics = [],
  yesterdayDailyMetrics,
  yesterdayProductMetrics = [],
  todayDate,
  yesterdayDate,
  rangeTo,
  flowMetricKeys,
}: PendingFlagsParams): PendingFlagsResult {
  const todayAllMetrics = useMemo(
    () => [...todayDailyMetrics, ...todayProductMetrics],
    [todayDailyMetrics, todayProductMetrics]
  );

  const yesterdayAllMetrics = useMemo(
    () => [...yesterdayDailyMetrics, ...yesterdayProductMetrics],
    [yesterdayDailyMetrics, yesterdayProductMetrics]
  );

  const todayMetricTypes = useMemo(() => {
    const types = new Set<string>();
    for (const m of todayAllMetrics) types.add(m.metricType);
    return types;
  }, [todayAllMetrics]);

  const todayPendingTypes = useMemo(() => {
    const types = new Set<string>();
    for (const m of todayAllMetrics) {
      if (hasPendingMetadata(m.metadata)) types.add(m.metricType);
    }
    return types;
  }, [todayAllMetrics]);

  const yesterdayMetricTypes = useMemo(() => {
    const types = new Set<string>();
    for (const m of yesterdayAllMetrics) types.add(m.metricType);
    return types;
  }, [yesterdayAllMetrics]);

  const pendingTodayByMetric = useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const key of flowMetricKeys) {
      result[key] =
        todayPendingTypes.has(key) ||
        (!todayMetricTypes.has(key) && yesterdayMetricTypes.has(key));
    }
    return result;
  }, [flowMetricKeys, todayMetricTypes, todayPendingTypes, yesterdayMetricTypes]);

  const rangeEndsToday = useMemo(() => rangeTo === todayDate, [rangeTo, todayDate]);

  const rangeTodayMetricTypes = useMemo(() => {
    const types = new Set<string>();
    for (const m of dailyMetrics) {
      if (m.date === todayDate) types.add(m.metricType);
    }
    return types;
  }, [dailyMetrics, todayDate]);

  const rangeTodayPendingTypes = useMemo(() => {
    const types = new Set<string>();
    for (const m of dailyMetrics) {
      if (m.date !== todayDate) continue;
      if (hasPendingMetadata(m.metadata)) types.add(m.metricType);
    }
    return types;
  }, [dailyMetrics, todayDate]);

  const rangeYesterdayMetricTypes = useMemo(() => {
    const types = new Set<string>();
    for (const m of dailyMetrics) {
      if (m.date === yesterdayDate) types.add(m.metricType);
    }
    return types;
  }, [dailyMetrics, yesterdayDate]);

  const pendingRangeByMetric = useMemo(() => {
    if (!rangeEndsToday) return {} as Record<string, boolean>;
    const result: Record<string, boolean> = {};
    for (const key of flowMetricKeys) {
      result[key] =
        rangeTodayPendingTypes.has(key) ||
        (!rangeTodayMetricTypes.has(key) && rangeYesterdayMetricTypes.has(key));
    }
    return result;
  }, [flowMetricKeys, rangeEndsToday, rangeTodayMetricTypes, rangeTodayPendingTypes, rangeYesterdayMetricTypes]);

  const pendingByMetricAndDay = useMemo(() => {
    const result: Record<string, Record<string, boolean>> = {};
    const allMetrics = [
      ...dailyMetrics,
      ...productMetrics,
      ...todayDailyMetrics,
      ...todayProductMetrics,
      ...yesterdayDailyMetrics,
      ...yesterdayProductMetrics,
    ];
    for (const m of allMetrics) {
      if (!hasPendingMetadata(m.metadata)) continue;
      if (!result[m.metricType]) result[m.metricType] = {};
      result[m.metricType][m.date] = true;
    }
    return result;
  }, [
    dailyMetrics,
    productMetrics,
    todayDailyMetrics,
    todayProductMetrics,
    yesterdayDailyMetrics,
    yesterdayProductMetrics,
  ]);

  const pendingSourceIdsByMetricAndDay = useMemo(() => {
    const result: Record<string, Record<string, Record<string, boolean>>> = {};
    const allMetrics = [
      ...dailyMetrics,
      ...productMetrics,
      ...todayDailyMetrics,
      ...todayProductMetrics,
      ...yesterdayDailyMetrics,
      ...yesterdayProductMetrics,
    ];
    for (const m of allMetrics) {
      if (!hasPendingMetadata(m.metadata)) continue;
      const sourceId = buildSourceId(m.accountId, m.projectId);
      if (!sourceId) continue;
      if (!result[m.metricType]) result[m.metricType] = {};
      if (!result[m.metricType][m.date]) result[m.metricType][m.date] = {};
      result[m.metricType][m.date][sourceId] = true;
    }
    return result;
  }, [
    dailyMetrics,
    productMetrics,
    todayDailyMetrics,
    todayProductMetrics,
    yesterdayDailyMetrics,
    yesterdayProductMetrics,
  ]);

  return {
    pendingTodayByMetric,
    pendingRangeByMetric,
    pendingByMetricAndDay,
    pendingSourceIdsByMetricAndDay,
  };
}
