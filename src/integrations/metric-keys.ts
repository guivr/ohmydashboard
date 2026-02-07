/**
 * Canonical metric keys — the single source of truth for cross-integration metrics.
 *
 * Every integration MUST use these keys when producing NormalizedMetric values.
 * The dashboard references these keys to render MetricCards.
 *
 * To add a new metric key:
 * 1. Add it here with format + label
 * 2. Use it in your integration's fetcher
 * 3. Optionally add a MetricCard for it in the dashboard
 */

export interface MetricKeyDefinition {
  /** The canonical key (used in DB and API) */
  key: string;
  /** Human-readable label for display */
  label: string;
  /** How to format this metric */
  format: "currency" | "number" | "percentage";
  /** Short description */
  description: string;
}

/**
 * All recognized metric keys.
 * Integrations should only produce metrics with these keys.
 */
export const METRIC_KEYS = {
  // ─── Revenue ────────────────────────────────────────────────────────────────
  revenue: {
    key: "revenue",
    label: "Revenue",
    format: "currency" as const,
    description: "Total revenue from all sources",
  },
  subscription_revenue: {
    key: "subscription_revenue",
    label: "Subscription Revenue",
    format: "currency" as const,
    description: "Revenue from recurring subscriptions",
  },
  one_time_revenue: {
    key: "one_time_revenue",
    label: "One-Time Revenue",
    format: "currency" as const,
    description: "Revenue from one-time purchases",
  },
  mrr: {
    key: "mrr",
    label: "MRR",
    format: "currency" as const,
    description: "Monthly Recurring Revenue",
  },
  refunds: {
    key: "refunds",
    label: "Refunds",
    format: "currency" as const,
    description: "Total refund amount",
  },

  // ─── Counts ─────────────────────────────────────────────────────────────────
  active_subscriptions: {
    key: "active_subscriptions",
    label: "Active Subscriptions",
    format: "number" as const,
    description: "Number of active subscriptions or subscribers",
  },
  new_customers: {
    key: "new_customers",
    label: "New Customers",
    format: "number" as const,
    description: "Number of new customers",
  },
  sales_count: {
    key: "sales_count",
    label: "Sales",
    format: "number" as const,
    description: "Number of completed sales",
  },
  charges_count: {
    key: "charges_count",
    label: "Charges",
    format: "number" as const,
    description: "Number of successful charges",
  },
  products_count: {
    key: "products_count",
    label: "Products",
    format: "number" as const,
    description: "Number of published products",
  },
} as const;

/** Type-safe metric key string */
export type MetricKey = keyof typeof METRIC_KEYS;

/** All valid metric key strings as an array */
export const ALL_METRIC_KEYS = Object.keys(METRIC_KEYS) as MetricKey[];

/** Get the definition for a metric key */
export function getMetricKeyDefinition(key: string): MetricKeyDefinition | undefined {
  return (METRIC_KEYS as Record<string, MetricKeyDefinition>)[key];
}
