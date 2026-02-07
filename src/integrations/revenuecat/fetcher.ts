import { addDays, format, subDays } from "date-fns";
import type { AccountConfig, DataFetcher, NormalizedMetric, SyncResult, SyncStep } from "../types";

const REVENUECAT_API_BASE = "https://api.revenuecat.com/v2";

/**
 * Chart data response from RevenueCat Charts API.
 * GET /projects/{project_id}/charts/{chart_name}
 *
 * When fetched without segmentation, `values` is an array of [timestamp, value]
 * or {x, y} pairs. When fetched WITH a `segment` parameter, the response also
 * includes a `segments` array listing each segment, and `values` becomes
 * [timestamp, seg0_value, seg1_value, ...] (one extra column per segment).
 */
interface RevenueCatChartData {
  object: "chart_data";
  category: string;
  display_type: string;
  display_name: string;
  description: string;
  resolution: "day" | "week" | "month" | "quarter" | "year";
  values: Array<[number, ...(number | null)[]]> | Array<{ x: number; y: number | null }>;
  start_date: number | null;
  end_date: number | null;
  yaxis_currency?: string;
  /** Present when the chart was fetched with a `segment` parameter. */
  segments?: Array<{ id: string; display_name: string }>;
}

/**
 * Response from GET /projects/{project_id}/charts/{chart_name}/options
 */
interface RevenueCatChartOptions {
  object: "chart_options";
  resolutions: Array<{ id: string; display_name: string }>;
  segments: Array<{ id: string; display_name: string; group_display_name?: string }>;
  filters: Array<{
    id: string;
    display_name: string;
    options: Array<{ id: string; display_name: string }>;
  }>;
}

/**
 * Map RevenueCat chart names to our internal metric keys.
 */
const REVENUECAT_CHART_MAP: Record<string, string> = {
  mrr: "mrr",
  revenue: "revenue",
  actives: "active_subscriptions",
  trials: "active_trials",
  customers_new: "new_customers",
  customers_active: "active_users",
};

const REALTIME_ONLY_CHARTS = new Set(["customers_active"]);

/**
 * Segment IDs we look for on the `revenue` chart to split subscription vs
 * one-time revenue. We try them in priority order — the first one found in
 * the chart's available segments is used.
 */
const REVENUE_SEGMENT_CANDIDATES = [
  "product_duration_type",
  "product_type",
  "store_product_type",
];

/**
 * When revenue is segmented, these segment IDs are classified as subscription
 * revenue. Everything else is classified as one_time_revenue.
 */
const SUBSCRIPTION_SEGMENT_IDS = new Set([
  "subscription",
  "non_renewing_subscription",
  "auto_renewable",
  "auto_renewable_subscription",
]);

/**
 * Fetch chart data from RevenueCat API.
 * Uses GET /projects/{project_id}/charts/{chart_name} endpoint.
 * Requires permission: charts_metrics:charts:read
 *
 * @param segment - Optional segment ID to break down the chart by (e.g.,
 *   "product_duration_type"). When provided, the response includes a `segments`
 *   array and `values` has one column per segment.
 */
async function fetchChart(
  credentials: Record<string, string>,
  chartName: string,
  startDate: Date,
  endDate: Date,
  segment?: string
): Promise<RevenueCatChartData> {
  const { secret_api_key, project_id } = credentials;

  if (!secret_api_key || !project_id) {
    throw new Error("Missing required credentials: secret_api_key and project_id");
  }

  const startStr = format(startDate, "yyyy-MM-dd");
  const endStr = format(endDate, "yyyy-MM-dd");
  let url = `${REVENUECAT_API_BASE}/projects/${project_id}/charts/${chartName}?start_date=${startStr}&end_date=${endStr}&realtime=false`;
  if (segment) {
    url += `&segment=${encodeURIComponent(segment)}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret_api_key}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `RevenueCat API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json() as Promise<RevenueCatChartData>;
}

/**
 * Fetch available options (segments, filters, resolutions) for a chart.
 * Uses GET /projects/{project_id}/charts/{chart_name}/options
 */
async function fetchChartOptions(
  credentials: Record<string, string>,
  chartName: string
): Promise<RevenueCatChartOptions> {
  const { secret_api_key, project_id } = credentials;

  if (!secret_api_key || !project_id) {
    throw new Error("Missing required credentials: secret_api_key and project_id");
  }

  const url = `${REVENUECAT_API_BASE}/projects/${project_id}/charts/${chartName}/options?realtime=false`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret_api_key}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `RevenueCat API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json() as Promise<RevenueCatChartOptions>;
}

/**
 * Convert RevenueCat chart data to normalized daily metrics.
 * Handles non-segmented responses only (single value per timestamp).
 */
function normalizeChartData(
  chartData: RevenueCatChartData,
  internalMetricKey: string,
  startDate: Date,
  endDate: Date
): NormalizedMetric[] {
  const metricsByDate = new Map<string, NormalizedMetric>();

  if (!chartData.values || chartData.values.length === 0) {
    return [];
  }

  for (const dataPoint of chartData.values) {
    let timestamp: number;
    let value: number | null;

    // Handle both array format [timestamp, value] and object format {x, y}
    if (Array.isArray(dataPoint)) {
      [timestamp, value] = dataPoint as [number, number | null];
    } else {
      timestamp = dataPoint.x;
      value = dataPoint.y;
    }

    if (value === null || value === undefined) {
      continue;
    }

    // RevenueCat may return timestamps in seconds (v2) or milliseconds (v3).
    const normalizedTimestamp =
      timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
    const date = new Date(normalizedTimestamp);
    const normalizedMetric: NormalizedMetric = {
      metricType: internalMetricKey,
      value,
      date: format(date, "yyyy-MM-dd"),
    };

    // Add currency for monetary metrics
    if (chartData.yaxis_currency) {
      normalizedMetric.currency = chartData.yaxis_currency;
    }

    metricsByDate.set(normalizedMetric.date, normalizedMetric);
  }

  // Fill missing days with zeros for revenue so charts don't skip $0 days.
  if (internalMetricKey === "revenue") {
    let cursor = new Date(startDate);
    const endTime = endDate.getTime();

    while (cursor.getTime() <= endTime) {
      const dateKey = format(cursor, "yyyy-MM-dd");
      if (!metricsByDate.has(dateKey)) {
        metricsByDate.set(dateKey, {
          metricType: internalMetricKey,
          value: 0,
          date: dateKey,
          currency: chartData.yaxis_currency,
        });
      }
      cursor = addDays(cursor, 1);
    }
  }

  return Array.from(metricsByDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

/**
 * Normalize segmented chart data into per-metric-key daily metrics.
 *
 * When the revenue chart is fetched with `segment=product_duration_type`,
 * the response has `segments: [{id: "subscription", ...}, {id: "one_time", ...}]`
 * and each value row is `[timestamp, seg0_val, seg1_val, ...]`.
 *
 * We sum subscription-classified segments into `subscription_revenue` and
 * everything else into `one_time_revenue`.
 */
function normalizeSegmentedRevenueData(
  chartData: RevenueCatChartData,
  startDate: Date,
  endDate: Date
): { subscriptionMetrics: NormalizedMetric[]; oneTimeMetrics: NormalizedMetric[] } {
  const subByDate = new Map<string, NormalizedMetric>();
  const otByDate = new Map<string, NormalizedMetric>();

  const segments = chartData.segments ?? [];
  if (segments.length === 0 || !chartData.values || chartData.values.length === 0) {
    return { subscriptionMetrics: [], oneTimeMetrics: [] };
  }

  // Build a mapping: column index (1-based within values row) → "subscription" | "one_time"
  const segmentClassification: Array<"subscription" | "one_time"> = segments.map((seg) =>
    SUBSCRIPTION_SEGMENT_IDS.has(seg.id.toLowerCase()) ? "subscription" : "one_time"
  );

  for (const dataPoint of chartData.values) {
    if (!Array.isArray(dataPoint)) continue;
    const row = dataPoint as (number | null)[];
    const timestamp = row[0];
    if (timestamp === null || timestamp === undefined) continue;

    const normalizedTimestamp =
      timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
    const dateStr = format(new Date(normalizedTimestamp), "yyyy-MM-dd");

    let subTotal = 0;
    let otTotal = 0;

    for (let i = 0; i < segments.length; i++) {
      const val = row[i + 1]; // +1 because column 0 is the timestamp
      if (val === null || val === undefined) continue;
      if (segmentClassification[i] === "subscription") {
        subTotal += val;
      } else {
        otTotal += val;
      }
    }

    subByDate.set(dateStr, {
      metricType: "subscription_revenue",
      value: subTotal,
      date: dateStr,
      currency: chartData.yaxis_currency,
    });
    otByDate.set(dateStr, {
      metricType: "one_time_revenue",
      value: otTotal,
      date: dateStr,
      currency: chartData.yaxis_currency,
    });
  }

  // Zero-fill missing days for both metric types
  let cursor = new Date(startDate);
  const endTime = endDate.getTime();
  while (cursor.getTime() <= endTime) {
    const dateKey = format(cursor, "yyyy-MM-dd");
    if (!subByDate.has(dateKey)) {
      subByDate.set(dateKey, {
        metricType: "subscription_revenue",
        value: 0,
        date: dateKey,
        currency: chartData.yaxis_currency,
      });
    }
    if (!otByDate.has(dateKey)) {
      otByDate.set(dateKey, {
        metricType: "one_time_revenue",
        value: 0,
        date: dateKey,
        currency: chartData.yaxis_currency,
      });
    }
    cursor = addDays(cursor, 1);
  }

  const sortFn = (a: NormalizedMetric, b: NormalizedMetric) => a.date.localeCompare(b.date);
  return {
    subscriptionMetrics: Array.from(subByDate.values()).sort(sortFn),
    oneTimeMetrics: Array.from(otByDate.values()).sort(sortFn),
  };
}

/**
 * Discover which segment ID (if any) is available on the revenue chart for
 * splitting by product type. Returns the first match from
 * REVENUE_SEGMENT_CANDIDATES, or null if none is available.
 */
async function discoverRevenueSegment(
  credentials: Record<string, string>
): Promise<string | null> {
  try {
    const options = await fetchChartOptions(credentials, "revenue");
    const availableIds = new Set(options.segments.map((s) => s.id.toLowerCase()));

    for (const candidate of REVENUE_SEGMENT_CANDIDATES) {
      if (availableIds.has(candidate)) return candidate;
    }

    return null;
  } catch {
    // Options endpoint failed — not critical, we'll fall back to mirroring
    return null;
  }
}

/**
 * RevenueCat data fetcher implementation.
 *
 * Fetches historical chart data from RevenueCat's Charts API.
 * Supports metrics: mrr, revenue, active_subscriptions, active_trials, new_customers, active_users
 *
 * Revenue splitting strategy:
 * 1. Discover if the revenue chart supports product-type segmentation
 * 2. If yes, fetch segmented revenue to split subscription_revenue vs one_time_revenue
 * 3. If no, skip — we don't emit inaccurate data. The total `revenue` card is still correct.
 */
export const revenuecatFetcher: DataFetcher = {
  async sync(
    account: AccountConfig,
    since?: Date,
    reportStep?: (step: SyncStep) => void
  ): Promise<SyncResult> {
    const steps: SyncStep[] = [];
    const allMetrics: NormalizedMetric[] = [];

    // Check credentials first
    const { secret_api_key, project_id } = account.credentials;
    if (!secret_api_key || !project_id) {
      return {
        success: false,
        recordsProcessed: 0,
        metrics: [],
        steps,
        error: "Missing required credentials: secret_api_key and project_id",
      };
    }

    // Determine date range
    const endDate = new Date();
    // Default to 90 days if no since date provided
    const startDate = since || subDays(endDate, 90);

    // ── Step 1: Discover if the revenue chart supports product-type segmentation ──
    const t0Discover = Date.now();
    const revenueSegmentId = await discoverRevenueSegment(account.credentials);
    const discoverStep: SyncStep = {
      key: "discover_revenue_segments",
      label: "Discover revenue chart segments",
      status: revenueSegmentId ? "success" : "skipped",
      durationMs: Date.now() - t0Discover,
      error: revenueSegmentId
        ? undefined
        : "No product-type segment available on revenue chart; subscription_revenue and one_time_revenue will not be emitted",
    };
    steps.push(discoverStep);
    reportStep?.(discoverStep);

    // ── Step 2: Fetch each chart ──
    let revenueChartFetched = false;

    for (const [chartName, internalKey] of Object.entries(REVENUECAT_CHART_MAP)) {
      const t0 = Date.now();
      if (REALTIME_ONLY_CHARTS.has(chartName)) {
        const step: SyncStep = {
          key: `fetch_chart_${chartName}`,
          label: `Fetch RevenueCat chart: ${chartName}`,
          status: "skipped",
          durationMs: Date.now() - t0,
          error: "Chart requires realtime data; skipped for non-realtime sync.",
        };
        steps.push(step);
        reportStep?.(step);
        continue;
      }
      try {
        const chartData = await fetchChart(account.credentials, chartName, startDate, endDate);
        const metrics = normalizeChartData(chartData, internalKey, startDate, endDate);
        allMetrics.push(...metrics);

        if (chartName === "revenue") {
          revenueChartFetched = true;
        }

        const step: SyncStep = {
          key: `fetch_chart_${chartName}`,
          label: `Fetch RevenueCat chart: ${chartName}`,
          status: "success",
          recordCount: metrics.length,
          durationMs: Date.now() - t0,
        };
        steps.push(step);
        reportStep?.(step);
      } catch (error) {
        const step: SyncStep = {
          key: `fetch_chart_${chartName}`,
          label: `Fetch RevenueCat chart: ${chartName}`,
          status: "error",
          durationMs: Date.now() - t0,
          error: error instanceof Error ? error.message : "Failed to fetch chart",
        };
        steps.push(step);
        reportStep?.(step);
        // Continue with other charts even if one fails
      }
    }

    // ── Step 3: Split revenue into subscription_revenue / one_time_revenue ──
    // Only emitted when a product-type segment is available and the segmented
    // fetch succeeds. We never guess — inaccurate data is worse than no data.
    if (revenueChartFetched && revenueSegmentId) {
      const t0Split = Date.now();
      try {
        const segmented = await fetchChart(
          account.credentials, "revenue", startDate, endDate, revenueSegmentId
        );

        if (segmented.segments && segmented.segments.length > 0) {
          const { subscriptionMetrics, oneTimeMetrics } =
            normalizeSegmentedRevenueData(segmented, startDate, endDate);
          allMetrics.push(...subscriptionMetrics, ...oneTimeMetrics);

          const segNames = segmented.segments.map((s) => s.display_name).join(", ");
          const step: SyncStep = {
            key: "split_revenue_segmented",
            label: "Split revenue by product type (segmented)",
            status: "success",
            recordCount: subscriptionMetrics.length + oneTimeMetrics.length,
            durationMs: Date.now() - t0Split,
            error: `Segments found: ${segNames}`,
          };
          steps.push(step);
          reportStep?.(step);
        } else {
          const step: SyncStep = {
            key: "split_revenue_segmented",
            label: "Split revenue by product type",
            status: "skipped",
            durationMs: Date.now() - t0Split,
            error: "Segmented response returned no segments; subscription_revenue and one_time_revenue not emitted",
          };
          steps.push(step);
          reportStep?.(step);
        }
      } catch (error) {
        const step: SyncStep = {
          key: "split_revenue_segmented",
          label: "Split revenue by product type",
          status: "error",
          durationMs: Date.now() - t0Split,
          error: `Segmented fetch failed: ${error instanceof Error ? error.message : "unknown error"}; subscription_revenue and one_time_revenue not emitted`,
        };
        steps.push(step);
        reportStep?.(step);
      }
    }

    // Check if we got any metrics
    if (allMetrics.length === 0 && steps.some((s) => s.status === "error")) {
      return {
        success: false,
        recordsProcessed: 0,
        metrics: [],
        steps,
        error: "All chart fetches failed",
      };
    }

    return {
      success: true,
      recordsProcessed: allMetrics.length,
      metrics: allMetrics,
      steps,
    };
  },

  async validateCredentials(credentials: Record<string, string>): Promise<boolean> {
    try {
      // Try fetching the mrr chart as a validation test
      await fetchChart(credentials, "mrr", subDays(new Date(), 1), new Date());
      return true;
    } catch {
      return false;
    }
  },
};
