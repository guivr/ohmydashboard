import { useMemo } from "react";
import { useMetrics } from "../use-metrics";
import { extractTotals, type DashboardTotals } from "./metrics-totals";

interface DailyTotalsSnapshotsParams {
  accountIds?: string[];
  todayDate: string;
  yesterdayDate: string;
  dayBeforeDate: string;
}

interface DailyTotalsSnapshotsResult {
  todayTotals: DashboardTotals;
  yesterdayTotals: DashboardTotals;
  dayBeforeTotals: DashboardTotals;
  todayNewMrr: number;
  yesterdayNewMrr: number;
  refetchTodayTotals: () => void;
  refetchYesterdayTotals: () => void;
  refetchDayBeforeTotals: () => void;
}

export function useDailyTotalsSnapshots({
  accountIds,
  todayDate,
  yesterdayDate,
  dayBeforeDate,
}: DailyTotalsSnapshotsParams): DailyTotalsSnapshotsResult {
  const { data: todayTotalsData, refetch: refetchTodayTotals } = useMetrics({
    from: todayDate,
    to: todayDate,
    aggregation: "total",
    accountIds,
  });

  const { data: yesterdayTotalsData, refetch: refetchYesterdayTotals } = useMetrics({
    from: yesterdayDate,
    to: yesterdayDate,
    aggregation: "total",
    accountIds,
  });

  const { data: dayBeforeTotalsData, refetch: refetchDayBeforeTotals } = useMetrics({
    from: dayBeforeDate,
    to: dayBeforeDate,
    aggregation: "total",
    accountIds,
  });

  const todayTotals = useMemo(() => extractTotals(todayTotalsData), [todayTotalsData]);
  const yesterdayTotals = useMemo(() => extractTotals(yesterdayTotalsData), [yesterdayTotalsData]);
  const dayBeforeTotals = useMemo(() => extractTotals(dayBeforeTotalsData), [dayBeforeTotalsData]);

  const todayNewMrr = todayTotals.mrr - yesterdayTotals.mrr;
  const yesterdayNewMrr = yesterdayTotals.mrr - dayBeforeTotals.mrr;

  return {
    todayTotals,
    yesterdayTotals,
    dayBeforeTotals,
    todayNewMrr,
    yesterdayNewMrr,
    refetchTodayTotals,
    refetchYesterdayTotals,
    refetchDayBeforeTotals,
  };
}
