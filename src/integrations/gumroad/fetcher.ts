import { format, subDays, startOfDay } from "date-fns";
import type {
  AccountConfig,
  DataFetcher,
  NormalizedMetric,
  SyncResult,
  SyncStep,
} from "../types";

// ─── Gumroad API types ──────────────────────────────────────────────────────

const GUMROAD_API_BASE = "https://api.gumroad.com/v2";

interface GumroadSale {
  id: string;
  created_at: string; // ISO 8601
  product_name: string;
  product_id: string;
  price: number; // cents
  gumroad_fee: number; // cents
  refunded: boolean;
  partially_refunded: boolean;
  chargedback: boolean;
  currency_symbol: string;
  subscription_duration?: string | null;
  quantity: number;
}

interface GumroadProduct {
  id: string;
  name: string;
  published: boolean;
  deleted: boolean;
  price: number; // cents
  currency: string;
  sales_count: string;
  sales_usd_cents: string;
  is_tiered_membership: boolean;
  subscription_duration?: string | null;
}

interface GumroadSubscriber {
  id: string;
  product_id: string;
  status: string; // "alive", "pending_cancellation", "pending_failure", "failed_payment", "fixed_subscription_period_ended", "cancelled"
  created_at: string;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function gumroadGet<T>(
  path: string,
  accessToken: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${GUMROAD_API_BASE}${path}`);
  url.searchParams.set("access_token", accessToken);
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      url.searchParams.set(key, val);
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Gumroad API error ${res.status}: ${body.slice(0, 200)}`
    );
  }

  return res.json() as Promise<T>;
}

// ─── Data fetching ───────────────────────────────────────────────────────────

/**
 * Fetch all sales since a given date, handling pagination via page_key.
 */
async function fetchSales(
  accessToken: string,
  since: Date
): Promise<GumroadSale[]> {
  const sales: GumroadSale[] = [];
  const afterDate = format(since, "yyyy-MM-dd");
  let pageKey: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params: Record<string, string> = { after: afterDate };
    if (pageKey) {
      params.page_key = pageKey;
    }

    const data = await gumroadGet<{
      success: boolean;
      sales: GumroadSale[];
      next_page_key?: string;
    }>("/sales", accessToken, params);

    if (data.sales) {
      sales.push(...data.sales);
    }

    if (data.next_page_key) {
      pageKey = data.next_page_key;
    } else {
      break;
    }
  }

  return sales;
}

/**
 * Fetch all products for the authenticated user.
 */
async function fetchProducts(
  accessToken: string
): Promise<GumroadProduct[]> {
  const data = await gumroadGet<{
    success: boolean;
    products: GumroadProduct[];
  }>("/products", accessToken);

  return data.products ?? [];
}

/**
 * Fetch active subscribers for a specific product.
 * Uses pagination to get all results.
 */
async function fetchSubscribers(
  accessToken: string,
  productId: string
): Promise<GumroadSubscriber[]> {
  const subscribers: GumroadSubscriber[] = [];
  let pageKey: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params: Record<string, string> = { paginated: "true" };
    if (pageKey) {
      params.page_key = pageKey;
    }

    const data = await gumroadGet<{
      success: boolean;
      subscribers: GumroadSubscriber[];
      next_page_key?: string;
    }>(`/products/${productId}/subscribers`, accessToken, params);

    if (data.subscribers) {
      subscribers.push(...data.subscribers);
    }

    if (data.next_page_key) {
      pageKey = data.next_page_key;
    } else {
      break;
    }
  }

  return subscribers;
}

// ─── Metric computation ──────────────────────────────────────────────────────

/** Look up whether a product is a subscription or a one-time purchase. */
function buildProductLookup(products: GumroadProduct[]): Map<string, GumroadProduct> {
  const map = new Map<string, GumroadProduct>();
  for (const p of products) {
    map.set(p.id, p);
  }
  return map;
}

/**
 * Compute per-product daily metrics from sales.
 *
 * Produces for each (product, day):
 *   - `revenue` with projectId (per-product revenue)
 *   - `sales_count` with projectId (per-product sale count)
 *
 * Also produces account-level totals (no projectId):
 *   - `revenue` (all products combined)
 *   - `sales_count` (all products combined)
 *   - `subscription_revenue` (subscription products only)
 *   - `one_time_revenue` (one-time purchase products only)
 *
 * Excludes fully refunded and chargedback sales.
 */
function computeSalesMetrics(
  sales: GumroadSale[],
  productLookup: Map<string, GumroadProduct>
): NormalizedMetric[] {
  // Per-product per-day
  const productDayMap = new Map<
    string, // "productId|date"
    {
      productId: string;
      productName: string;
      date: string;
      revenue: number;
      count: number;
      isSubscription: boolean;
    }
  >();

  // Account-level per-day
  const totalDayMap = new Map<
    string, // date
    {
      revenue: number;
      count: number;
      subscriptionRevenue: number;
      oneTimeRevenue: number;
    }
  >();

  for (const sale of sales) {
    if (sale.refunded || sale.chargedback) continue;

    const date = format(new Date(sale.created_at), "yyyy-MM-dd");
    const product = productLookup.get(sale.product_id);
    const isSubscription = product?.is_tiered_membership ??
      (sale.subscription_duration != null && sale.subscription_duration !== "");
    const priceDollars = sale.price / 100;

    // Per-product
    const key = `${sale.product_id}|${date}`;
    const existing = productDayMap.get(key) || {
      productId: sale.product_id,
      productName: product?.name ?? sale.product_name,
      date,
      revenue: 0,
      count: 0,
      isSubscription,
    };
    existing.revenue += priceDollars;
    existing.count += 1;
    productDayMap.set(key, existing);

    // Account-level total
    const dayTotal = totalDayMap.get(date) || {
      revenue: 0,
      count: 0,
      subscriptionRevenue: 0,
      oneTimeRevenue: 0,
    };
    dayTotal.revenue += priceDollars;
    dayTotal.count += 1;
    if (isSubscription) {
      dayTotal.subscriptionRevenue += priceDollars;
    } else {
      dayTotal.oneTimeRevenue += priceDollars;
    }
    totalDayMap.set(date, dayTotal);
  }

  const allMetrics: NormalizedMetric[] = [];

  // Per-product metrics
  for (const data of productDayMap.values()) {
    const productType = data.isSubscription ? "subscription" : "one_time";
    allMetrics.push({
      metricType: "revenue",
      value: data.revenue,
      currency: "USD",
      date: data.date,
      projectId: data.productId,
      metadata: {
        product_name: data.productName,
        product_type: productType,
      },
    });
    allMetrics.push({
      metricType: "sales_count",
      value: data.count,
      date: data.date,
      projectId: data.productId,
      metadata: {
        product_name: data.productName,
        product_type: productType,
      },
    });
  }

  // Account-level totals (no projectId — these aggregate across all products)
  for (const [date, data] of totalDayMap) {
    allMetrics.push({
      metricType: "revenue",
      value: data.revenue,
      currency: "USD",
      date,
    });
    allMetrics.push({
      metricType: "sales_count",
      value: data.count,
      date,
    });
    if (data.subscriptionRevenue > 0) {
      allMetrics.push({
        metricType: "subscription_revenue",
        value: data.subscriptionRevenue,
        currency: "USD",
        date,
      });
    }
    if (data.oneTimeRevenue > 0) {
      allMetrics.push({
        metricType: "one_time_revenue",
        value: data.oneTimeRevenue,
        currency: "USD",
        date,
      });
    }
  }

  return allMetrics;
}

/**
 * Count published (non-deleted) products.
 */
function computeProductsCount(
  products: GumroadProduct[],
  today: string
): NormalizedMetric[] {
  const publishedCount = products.filter(
    (p) => p.published && !p.deleted
  ).length;

  return [
    {
      metricType: "products_count",
      value: publishedCount,
      date: today,
    },
  ];
}

/**
 * Count active subscribers per membership product, plus an account-level total.
 */
function computeActiveSubscribers(
  subscribersByProduct: Map<string, { subscribers: GumroadSubscriber[]; productName: string }>,
  today: string
): NormalizedMetric[] {
  const allMetrics: NormalizedMetric[] = [];
  let totalActive = 0;

  for (const [productId, { subscribers, productName }] of subscribersByProduct) {
    const activeCount = subscribers.filter(
      (s) => s.status === "alive" || s.status === "pending_cancellation"
    ).length;

    totalActive += activeCount;

    // Per-product subscriber count
    allMetrics.push({
      metricType: "active_subscribers",
      value: activeCount,
      date: today,
      projectId: productId,
      metadata: {
        product_name: productName,
        product_type: "subscription",
      },
    });
  }

  // Account-level total
  allMetrics.push({
    metricType: "active_subscribers",
    value: totalActive,
    date: today,
  });

  return allMetrics;
}

// ─── DataFetcher implementation ──────────────────────────────────────────────

/**
 * Gumroad data fetcher.
 * Reports each fetch phase as a discrete SyncStep for UI transparency.
 */
export const gumroadFetcher: DataFetcher = {
  async sync(
    account: AccountConfig,
    since?: Date
  ): Promise<SyncResult> {
    const accessToken = account.credentials.access_token;
    const syncSince = since || subDays(startOfDay(new Date()), 30);
    const today = format(new Date(), "yyyy-MM-dd");

    const steps: SyncStep[] = [];
    const allMetrics: NormalizedMetric[] = [];
    let totalRecords = 0;
    let hasAnyError = false;

    // Step 1: Fetch products first (needed for sale classification)
    let products: GumroadProduct[] = [];
    let productLookup = new Map<string, GumroadProduct>();
    let t0 = Date.now();
    try {
      products = await fetchProducts(accessToken);
      productLookup = buildProductLookup(products);
      const productMetrics = computeProductsCount(products, today);
      allMetrics.push(...productMetrics);
      totalRecords += products.length;
      steps.push({
        key: "fetch_products",
        label: "Fetch products",
        status: "success",
        recordCount: products.length,
        durationMs: Date.now() - t0,
      });
    } catch (error) {
      hasAnyError = true;
      steps.push({
        key: "fetch_products",
        label: "Fetch products",
        status: "error",
        durationMs: Date.now() - t0,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch products",
      });
    }

    // Step 2: Fetch sales (uses product lookup to classify subscription vs one-time)
    t0 = Date.now();
    try {
      const sales = await fetchSales(accessToken, syncSince);
      const salesMetrics = computeSalesMetrics(sales, productLookup);
      allMetrics.push(...salesMetrics);
      totalRecords += sales.length;
      steps.push({
        key: "fetch_sales",
        label: "Fetch sales & revenue",
        status: "success",
        recordCount: sales.length,
        durationMs: Date.now() - t0,
      });
    } catch (error) {
      hasAnyError = true;
      steps.push({
        key: "fetch_sales",
        label: "Fetch sales & revenue",
        status: "error",
        durationMs: Date.now() - t0,
        error:
          error instanceof Error ? error.message : "Failed to fetch sales",
      });
    }

    // Step 3: Fetch subscribers (only for membership products, per-product)
    t0 = Date.now();
    try {
      const membershipProducts = products.filter(
        (p) => p.is_tiered_membership && !p.deleted
      );

      const subscribersByProduct = new Map<
        string,
        { subscribers: GumroadSubscriber[]; productName: string }
      >();
      let totalSubscriberRecords = 0;

      for (const product of membershipProducts) {
        const subs = await fetchSubscribers(accessToken, product.id);
        subscribersByProduct.set(product.id, {
          subscribers: subs,
          productName: product.name,
        });
        totalSubscriberRecords += subs.length;
      }

      const subscriberMetrics = computeActiveSubscribers(
        subscribersByProduct,
        today
      );
      allMetrics.push(...subscriberMetrics);
      totalRecords += totalSubscriberRecords;
      steps.push({
        key: "fetch_subscribers",
        label: "Fetch subscribers",
        status: membershipProducts.length === 0 ? "skipped" : "success",
        recordCount: totalSubscriberRecords,
        durationMs: Date.now() - t0,
      });
    } catch (error) {
      hasAnyError = true;
      steps.push({
        key: "fetch_subscribers",
        label: "Fetch subscribers",
        status: "error",
        durationMs: Date.now() - t0,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch subscribers",
      });
    }

    // If all steps failed, report overall failure
    const allFailed = steps.every((s) => s.status === "error");
    if (allFailed) {
      return {
        success: false,
        recordsProcessed: 0,
        metrics: [],
        steps,
        error: "All sync steps failed",
      };
    }

    return {
      success: true,
      recordsProcessed: totalRecords,
      metrics: allMetrics,
      steps,
      error: hasAnyError ? "Some sync steps failed" : undefined,
    };
  },

  async validateCredentials(
    credentials: Record<string, string>
  ): Promise<boolean> {
    try {
      await gumroadGet<{ success: boolean }>(
        "/user",
        credentials.access_token
      );
      return true;
    } catch {
      return false;
    }
  },
};
