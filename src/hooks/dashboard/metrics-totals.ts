import type { AggregatedMetric, MetricsResponse } from "../use-metrics";

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

export function extractTotals(
  data: MetricsResponse | AggregatedMetric[] | null
): DashboardTotals {
  const totals = Array.isArray(data) ? data : [];
  const get = (key: string) =>
    totals.find((t: any) => t.metricType === key)?.total || 0;
  const getCurrency = (key: string) =>
    totals.find((t: any) => t.metricType === key)?.currency || "USD";

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
