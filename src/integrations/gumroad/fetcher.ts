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

/**
 * Max concurrent per-subscriber sale lookups during MRR computation.
 * Gumroad rate-limits API requests; firing hundreds of /sales/:id calls
 * in parallel causes failures that silently inflate MRR via tier-price
 * fallbacks (free subscribers get counted as paying full price).
 */
const SALE_LOOKUP_CONCURRENCY = 5;

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
  /** Whether this is a recurring subscription charge (not the initial purchase) */
  recurring_charge?: boolean;
  /** Buyer email — used to count unique new customers */
  email?: string;
  /** Full country name, e.g. "United States" */
  country?: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "US" */
  country_iso2?: string;
}

/** Tier pricing for a specific recurrence within a variant option */
interface GumroadRecurrencePrice {
  price_cents: number;
  suggested_price_cents?: number | null;
}

/** A single variant option (e.g. a membership tier) */
interface GumroadVariantOption {
  name: string;
  price_difference?: number;
  is_pay_what_you_want?: boolean;
  /** Present for membership products; maps recurrence → price info */
  recurrence_prices?: Record<string, GumroadRecurrencePrice> | null;
}

/** A variant category (e.g. "Tier") containing multiple options */
interface GumroadVariantCategory {
  title: string;
  options: GumroadVariantOption[];
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
  /** Available subscription durations (e.g. ["monthly"]) — present for tiered memberships */
  recurrences?: string[] | null;
  /** Product variants with tier pricing */
  variants?: GumroadVariantCategory[] | null;
}

interface GumroadSubscriber {
  id: string;
  product_id: string;
  status: string; // "alive", "pending_cancellation", "pending_failure", "failed_payment", "fixed_subscription_period_ended", "cancelled"
  created_at: string;
  /** Subscription billing interval: "monthly", "quarterly", "biannually", "yearly", "every_two_years" */
  recurrence?: string | null;
  /** IDs of the subscriber's purchase/charge records (most recent last) */
  purchase_ids?: string[];
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
 * Fetch a single sale by ID. Returns the sale's price (cents) and
 * subscription_duration, or null if the sale can't be retrieved.
 */
async function fetchSalePrice(
  accessToken: string,
  saleId: string
): Promise<{ price: number; subscriptionDuration: string | null } | null> {
  try {
    const data = await gumroadGet<{
      success: boolean;
      sale: { price: number; subscription_duration?: string | null };
    }>(`/sales/${saleId}`, accessToken);
    return {
      price: data.sale.price,
      subscriptionDuration: data.sale.subscription_duration ?? null,
    };
  } catch {
    return null;
  }
}

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
      fees: number;
      count: number;
      isSubscription: boolean;
    }
  >();

  // Account-level per-day
  const totalDayMap = new Map<
    string, // date
    {
      revenue: number;
      fees: number;
      count: number;
      subscriptionRevenue: number;
      oneTimeRevenue: number;
    }
  >();

  // New customers: unique emails per day, excluding recurring charges
  // (recurring_charge = true means a subscription renewal, not a new customer)
  const newCustomersByDay = new Map<string, Set<string>>();
  // Per-country per-product new customers: day -> country -> productId -> Set<email>
  const newCustomersByDayCountryProduct = new Map<
    string, Map<string, Map<string, { emails: Set<string>; productName: string }>>
  >();

  for (const sale of sales) {
    if (sale.refunded || sale.chargedback) continue;

    const date = format(new Date(sale.created_at), "yyyy-MM-dd");
    const product = productLookup.get(sale.product_id);
    const isSubscription = product?.is_tiered_membership ??
      (sale.subscription_duration != null && sale.subscription_duration !== "");
    const grossDollars = sale.price / 100;

    // Per-product
    const key = `${sale.product_id}|${date}`;
    // Gumroad's gumroad_fee field is unreliable — sometimes it only includes
    // payment processing (~3%), sometimes the full cut (~14%).
    // Use the higher of the API value or Gumroad's documented pricing:
    // 10% platform fee + 2.9% processing + $0.30 processing + $0.50 Gumroad = ~12.9% + $0.80
    const apiFee = sale.gumroad_fee / 100;
    const estimatedFee = grossDollars * 0.129 + 0.80;
    const feeDollars = Math.max(apiFee, estimatedFee);

    const existing = productDayMap.get(key) || {
      productId: sale.product_id,
      productName: product?.name ?? sale.product_name,
      date,
      revenue: 0,
      fees: 0,
      count: 0,
      isSubscription,
    };
    existing.revenue += grossDollars;
    existing.fees += feeDollars;
    existing.count += 1;
    productDayMap.set(key, existing);

    // Account-level total
    const dayTotal = totalDayMap.get(date) || {
      revenue: 0,
      fees: 0,
      count: 0,
      subscriptionRevenue: 0,
      oneTimeRevenue: 0,
    };
    dayTotal.revenue += grossDollars;
    dayTotal.fees += feeDollars;
    dayTotal.count += 1;
    if (isSubscription) {
      dayTotal.subscriptionRevenue += grossDollars;
    } else {
      dayTotal.oneTimeRevenue += grossDollars;
    }
    totalDayMap.set(date, dayTotal);

    // Track new customers: non-recurring sales with an email
    if (!sale.recurring_charge && sale.email) {
      if (!newCustomersByDay.has(date)) newCustomersByDay.set(date, new Set());
      newCustomersByDay.get(date)!.add(sale.email);

      // Track per-country per-product
      const country = sale.country_iso2?.toUpperCase() || "Unknown";
      if (!newCustomersByDayCountryProduct.has(date)) {
        newCustomersByDayCountryProduct.set(date, new Map());
      }
      const countryMap = newCustomersByDayCountryProduct.get(date)!;
      if (!countryMap.has(country)) countryMap.set(country, new Map());
      const productMap = countryMap.get(country)!;
      const productName = product?.name ?? sale.product_name;
      if (!productMap.has(sale.product_id)) {
        productMap.set(sale.product_id, { emails: new Set(), productName });
      }
      productMap.get(sale.product_id)!.emails.add(sale.email);
    }
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
    // Per-product subscription/one-time revenue for breakdown rankings
    allMetrics.push({
      metricType: data.isSubscription ? "subscription_revenue" : "one_time_revenue",
      value: data.revenue,
      currency: "USD",
      date: data.date,
      projectId: data.productId,
      metadata: {
        product_name: data.productName,
        product_type: productType,
      },
    });
    if (data.fees > 0) {
      allMetrics.push({
        metricType: "platform_fees",
        value: data.fees,
        currency: "USD",
        date: data.date,
        projectId: data.productId,
        metadata: {
          product_name: data.productName,
          fee_source: "gumroad",
        },
      });
    }
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
    // Always emit subscription/one-time revenue (even when 0) so that the
    // metric rows exist for every synced day. This ensures incremental syncs
    // backfill the breakdown for days that were initially synced without it.
    allMetrics.push({
      metricType: "subscription_revenue",
      value: data.subscriptionRevenue,
      currency: "USD",
      date,
    });
    allMetrics.push({
      metricType: "one_time_revenue",
      value: data.oneTimeRevenue,
      currency: "USD",
      date,
    });
    if (data.fees > 0) {
      allMetrics.push({
        metricType: "platform_fees",
        value: data.fees,
        currency: "USD",
        date,
        metadata: { fee_source: "gumroad" },
      });
    }
  }

  // New customers per day (unique emails from non-recurring sales)
  for (const [date, emails] of newCustomersByDay) {
    allMetrics.push({
      metricType: "new_customers",
      value: emails.size,
      date,
    });
  }

  // New customers per day per country per product — Gumroad customers are
  // inherently paying (derived from sales), so we emit both metrics.
  for (const [date, countryMap] of newCustomersByDayCountryProduct) {
    for (const [country, productMap] of countryMap) {
      for (const [productId, { emails, productName }] of productMap) {
        allMetrics.push(
          {
            metricType: "new_customers_by_country",
            value: emails.size,
            date,
            projectId: productId,
            metadata: { country, product_name: productName },
          },
          {
            metricType: "paying_customers_by_country",
            value: emails.size,
            date,
            projectId: productId,
            metadata: { country, product_name: productName },
          },
        );
      }
    }
  }

  return allMetrics;
}

/**
 * Count published (non-deleted) products.
 * Also emits a per-product placeholder metric for every published product
 * so that the sync engine creates project rows even for products with no
 * recent sales (ensuring they appear in the "Data from" filter).
 */
function computeProductsCount(
  products: GumroadProduct[],
  today: string,
  productsWithSales: Set<string>
): NormalizedMetric[] {
  const published = products.filter((p) => p.published && !p.deleted);

  const metrics: NormalizedMetric[] = [
    {
      metricType: "products_count",
      value: published.length,
      date: today,
    },
  ];

  // Ensure every published product gets a project row, even if it had
  // no sales in the current sync window. Emit a zero-value revenue metric
  // for products not already covered by computeSalesMetrics.
  for (const product of published) {
    if (!productsWithSales.has(product.id)) {
      const isSubscription = product.is_tiered_membership;
      metrics.push({
        metricType: "revenue",
        value: 0,
        currency: "USD",
        date: today,
        projectId: product.id,
        metadata: {
          product_name: product.name,
          product_type: isSubscription ? "subscription" : "one_time",
        },
      });
    }
  }

  return metrics;
}

/**
 * Normalize a Gumroad subscription duration to a monthly multiplier.
 * E.g. "yearly" → 1/12, "quarterly" → 1/3, "monthly" → 1.
 */
function subscriptionDurationToMonthlyMultiplier(
  duration: string | null | undefined
): number {
  switch (duration) {
    case "monthly":
      return 1;
    case "quarterly":
      return 1 / 3;
    case "biannually":
      return 1 / 6;
    case "yearly":
      return 1 / 12;
    case "every_two_years":
      return 1 / 24;
    default:
      // Default to monthly if unknown
      return 1;
  }
}

/**
 * Look up the charge price (in dollars) for a given recurrence from a tiered
 * membership product's variant pricing.
 *
 * For tiered memberships, `product.price` is 0 because the real price depends
 * on the chosen tier. The API returns `variants` with `recurrence_prices`
 * per tier option, e.g.:
 *   variants[0].options[0].recurrence_prices.monthly.price_cents = 3000
 *   variants[0].options[0].recurrence_prices.yearly.price_cents = 18000
 *
 * When multiple tiers exist (e.g. "Basic", "Pro"), we don't know which tier
 * each subscriber is on — the subscriber API doesn't include tier info — so
 * we choose the lowest tier for the given recurrence to avoid overestimating.
 *
 * Returns the charge amount in dollars for one billing cycle of the given
 * recurrence, or 0 if unavailable.
 */
function getTierChargePrice(
  product: GumroadProduct,
  recurrence: string
): number {
  if (!product.variants || product.variants.length === 0) return 0;

  const prices: number[] = [];
  for (const category of product.variants) {
    for (const option of category.options) {
      const rp = option.recurrence_prices?.[recurrence];
      if (rp) {
        prices.push(rp.price_cents / 100);
      }
    }
  }

  if (prices.length === 0) return 0;
  return Math.min(...prices);
}

/**
 * Resolve the monthly MRR contribution for a single subscriber.
 *
 * Uses a 3-tier fallback strategy:
 *
 * 1. **Actual charge price** — fetch the subscriber's most recent sale via
 *    their `purchase_ids` to get the exact amount they were charged. This
 *    is the only way to handle grandfathered pricing, discount codes, and
 *    different tier prices accurately.
 *
 * 2. **Tier variant pricing** — for tiered memberships, look up
 *    `variants[].options[].recurrence_prices` for the subscriber's
 *    billing interval. Because the tier is unknown, we use the lowest
 *    tier price for the recurrence to avoid overestimating.
 *
 * 3. **Product base price** — for simple (non-tiered) subscriptions, use
 *    `product.price`.
 *
 * **Important:** Fallbacks 2 and 3 only apply when the subscriber has no
 * `purchase_ids` at all. If the subscriber has purchase_ids but the sale
 * fetch fails (e.g. due to rate limiting), we return 0 rather than
 * inflating MRR with a tier/product price that may be higher than the
 * subscriber's actual (possibly discounted or free) charge.
 *
 * The resolved charge amount is normalized to monthly using the subscriber's
 * `recurrence`.
 */
async function resolveSubscriberMRR(
  sub: GumroadSubscriber,
  product: GumroadProduct,
  accessToken: string
): Promise<number> {
  const recurrence =
    sub.recurrence ?? product.subscription_duration ?? "monthly";
  const monthlyMultiplier = subscriptionDurationToMonthlyMultiplier(recurrence);

  // 1. Try fetching the subscriber's most recent sale for the exact charge
  if (sub.purchase_ids && sub.purchase_ids.length > 0) {
    const latestSaleId = sub.purchase_ids[sub.purchase_ids.length - 1];
    const sale = await fetchSalePrice(accessToken, latestSaleId);
    if (sale && sale.price > 0) {
      const effectiveRecurrence = sale.subscriptionDuration ?? recurrence;
      const effectiveMultiplier =
        subscriptionDurationToMonthlyMultiplier(effectiveRecurrence);
      return (sale.price / 100) * effectiveMultiplier;
    }
    // price === 0 is valid (e.g. free/comp subscription): return 0 explicitly
    if (sale && sale.price === 0) return 0;

    // Sale fetch failed (null) — don't fall through to tier/product pricing.
    // Using a fallback here would inflate MRR for subscribers with discounts
    // or free plans whose sale data is temporarily unavailable (e.g. rate limit).
    return 0;
  }

  // 2. Tiered membership: use variant pricing for this recurrence
  //    (only reached when the subscriber has NO purchase_ids at all)
  if (product.is_tiered_membership) {
    const tierPrice = getTierChargePrice(product, recurrence);
    if (tierPrice > 0) return tierPrice * monthlyMultiplier;
  }

  // 3. Simple subscription: use product.price
  if (product.price > 0) {
    return (product.price / 100) * monthlyMultiplier;
  }

  return 0;
}

/**
 * Count active subscribers per membership product, plus an account-level total.
 * Also computes MRR from active subscribers.
 *
 * MRR is computed per active subscriber by resolving their actual charge price
 * (via their most recent sale), falling back to tier variant prices, then to
 * the product's base price. See {@link resolveSubscriberMRR} for details.
 */
async function computeActiveSubscribers(
  subscribersByProduct: Map<string, { subscribers: GumroadSubscriber[]; productName: string }>,
  productLookup: Map<string, GumroadProduct>,
  accessToken: string,
  today: string
): Promise<NormalizedMetric[]> {
  const allMetrics: NormalizedMetric[] = [];
  let totalActive = 0;
  let totalMRR = 0;

  for (const [productId, { subscribers, productName }] of subscribersByProduct) {
    const activeSubscribers = subscribers.filter(
      (s) => s.status === "alive" || s.status === "pending_cancellation"
    );
    const activeCount = activeSubscribers.length;

    totalActive += activeCount;

    const product = productLookup.get(productId);
    let perProductMRR = 0;

    if (product && activeCount > 0) {
      // Resolve each subscriber's MRR with bounded concurrency.
      // Gumroad rate-limits API requests, so firing hundreds of /sales/:id
      // calls in parallel causes failures — and failed lookups for free/
      // discounted subscribers silently inflate MRR via tier-price fallbacks.
      const mrrValues: number[] = [];
      for (let i = 0; i < activeSubscribers.length; i += SALE_LOOKUP_CONCURRENCY) {
        const batch = activeSubscribers.slice(i, i + SALE_LOOKUP_CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map((sub) =>
            resolveSubscriberMRR(sub, product, accessToken)
          )
        );
        mrrValues.push(...batchResults);
      }
      perProductMRR = mrrValues.reduce((a, b) => a + b, 0);
      totalMRR += perProductMRR;
    }

    // Per-product subscriber count
    allMetrics.push({
      metricType: "active_subscriptions",
      value: activeCount,
      date: today,
      projectId: productId,
      metadata: {
        product_name: productName,
        product_type: "subscription",
      },
    });

    // Per-product MRR (mirrors active_subscriptions breakdown)
    allMetrics.push({
      metricType: "mrr",
      value: Math.round(perProductMRR * 100) / 100,
      currency: "USD",
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
    metricType: "active_subscriptions",
    value: totalActive,
    date: today,
  });

  // MRR
  allMetrics.push({
    metricType: "mrr",
    value: Math.round(totalMRR * 100) / 100,
    currency: "USD",
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
    since?: Date,
    reportStep?: (step: SyncStep) => void
  ): Promise<SyncResult> {
    const accessToken = account.credentials.access_token;
    // Gumroad /sales uses a date-only "after" filter. Backfill 1 day for
    // incremental syncs to avoid missing same-day late-arriving sales.
    const syncSince = since
      ? subDays(startOfDay(since), 1)
      : subDays(startOfDay(new Date()), 30);
    const today = format(new Date(), "yyyy-MM-dd");

    const steps: SyncStep[] = [];
    const allMetrics: NormalizedMetric[] = [];
    let totalRecords = 0;
    let hasAnyError = false;

    // Step 1: Fetch products first (needed for sale classification)
    let products: GumroadProduct[] = [];
    let productLookup = new Map<string, GumroadProduct>();
    let t0 = Date.now();
    reportStep?.({ key: "fetch_products", label: "Fetch products", status: "running" });
    try {
      products = await fetchProducts(accessToken);
      productLookup = buildProductLookup(products);
      totalRecords += products.length;
      const step: SyncStep = {
        key: "fetch_products",
        label: "Fetch products",
        status: "success",
        recordCount: products.length,
        durationMs: Date.now() - t0,
      };
      steps.push(step);
      reportStep?.(step);
    } catch (error) {
      hasAnyError = true;
      const step: SyncStep = {
        key: "fetch_products",
        label: "Fetch products",
        status: "error",
        durationMs: Date.now() - t0,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch products",
      };
      steps.push(step);
      reportStep?.(step);
    }

    // Step 2: Fetch sales (uses product lookup to classify subscription vs one-time)
    const productsWithSales = new Set<string>();
    t0 = Date.now();
    reportStep?.({ key: "fetch_sales", label: "Fetch sales & revenue", status: "running" });
    try {
      const sales = await fetchSales(accessToken, syncSince);
      // Track which products had sales
      for (const sale of sales) {
        if (!sale.refunded && !sale.chargedback) {
          productsWithSales.add(sale.product_id);
        }
      }
      const salesMetrics = computeSalesMetrics(sales, productLookup);
      allMetrics.push(...salesMetrics);
      totalRecords += sales.length;
      const step: SyncStep = {
        key: "fetch_sales",
        label: "Fetch sales & revenue",
        status: "success",
        recordCount: sales.length,
        durationMs: Date.now() - t0,
      };
      steps.push(step);
      reportStep?.(step);
    } catch (error) {
      hasAnyError = true;
      const step: SyncStep = {
        key: "fetch_sales",
        label: "Fetch sales & revenue",
        status: "error",
        durationMs: Date.now() - t0,
        error:
          error instanceof Error ? error.message : "Failed to fetch sales",
      };
      steps.push(step);
      reportStep?.(step);
    }

    // Compute product count + placeholder metrics for products with no recent sales
    // (must run after sales so we know which products are already covered)
    if (products.length > 0) {
      const productMetrics = computeProductsCount(products, today, productsWithSales);
      allMetrics.push(...productMetrics);
    }

    // Step 3: Fetch subscribers (only for membership products, per-product)
    t0 = Date.now();
    reportStep?.({ key: "fetch_subscribers", label: "Fetch subscribers", status: "running" });
    try {
      const subscriptionProducts = products.filter(
        (p) =>
          !p.deleted &&
          (p.is_tiered_membership ||
            (p.subscription_duration != null &&
              p.subscription_duration !== ""))
      );

      const subscribersByProduct = new Map<
        string,
        { subscribers: GumroadSubscriber[]; productName: string }
      >();
      let totalSubscriberRecords = 0;

      for (const product of subscriptionProducts) {
        const subs = await fetchSubscribers(accessToken, product.id);
        subscribersByProduct.set(product.id, {
          subscribers: subs,
          productName: product.name,
        });
        totalSubscriberRecords += subs.length;
      }

      const subscriberMetrics = await computeActiveSubscribers(
        subscribersByProduct,
        productLookup,
        accessToken,
        today
      );
      allMetrics.push(...subscriberMetrics);
      totalRecords += totalSubscriberRecords;
      const step: SyncStep = {
        key: "fetch_subscribers",
        label: "Fetch subscribers",
        status: subscriptionProducts.length === 0 ? "skipped" : "success",
        recordCount: totalSubscriberRecords,
        durationMs: Date.now() - t0,
      };
      steps.push(step);
      reportStep?.(step);
    } catch (error) {
      hasAnyError = true;
      const step: SyncStep = {
        key: "fetch_subscribers",
        label: "Fetch subscribers",
        status: "error",
        durationMs: Date.now() - t0,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch subscribers",
      };
      steps.push(step);
      reportStep?.(step);
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
