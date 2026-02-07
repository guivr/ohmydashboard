import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AccountConfig } from "../../types";
import { gumroadFetcher } from "../fetcher";

// ─── Mock data ───────────────────────────────────────────────────────────────

const mockProducts = [
  createMockProduct({
    id: "prod_sub",
    name: "Premium Membership",
    published: true,
    is_tiered_membership: true,
  }),
  createMockProduct({
    id: "prod_ebook",
    name: "UI Design eBook",
    published: true,
    is_tiered_membership: false,
  }),
  createMockProduct({
    id: "prod_deleted",
    name: "Deleted Thing",
    published: false,
    deleted: true,
    is_tiered_membership: false,
  }),
];

const mockSales = [
  // Subscription product sales (initial purchase — new customer)
  createMockSale({
    price: 2999,
    created_at: "2026-02-01T10:00:00Z",
    product_id: "prod_sub",
    product_name: "Premium Membership",
    subscription_duration: "monthly",
    email: "alice@example.com",
  }),
  // Subscription renewal — NOT a new customer
  createMockSale({
    price: 2999,
    created_at: "2026-02-02T11:00:00Z",
    product_id: "prod_sub",
    product_name: "Premium Membership",
    subscription_duration: "monthly",
    email: "alice@example.com",
    recurring_charge: true,
  }),
  // One-time product sales (new customers)
  createMockSale({
    price: 4999,
    created_at: "2026-02-01T14:00:00Z",
    product_id: "prod_ebook",
    product_name: "UI Design eBook",
    email: "bob@example.com",
  }),
  createMockSale({
    price: 4999,
    created_at: "2026-02-02T09:00:00Z",
    product_id: "prod_ebook",
    product_name: "UI Design eBook",
    email: "carol@example.com",
  }),
  // Refunded sale — should be excluded
  createMockSale({
    price: 999,
    created_at: "2026-02-03T12:00:00Z",
    product_id: "prod_ebook",
    product_name: "UI Design eBook",
    refunded: true,
    email: "dave@example.com",
  }),
  // Chargedback sale — should be excluded
  createMockSale({
    price: 500,
    created_at: "2026-02-03T15:00:00Z",
    product_id: "prod_sub",
    product_name: "Premium Membership",
    chargedback: true,
    email: "eve@example.com",
  }),
];

const mockSubscribers = [
  createMockSubscriber({ status: "alive", purchase_ids: ["sale_sub_1"] }),
  createMockSubscriber({ status: "alive", purchase_ids: ["sale_sub_2"] }),
  createMockSubscriber({
    status: "pending_cancellation",
    purchase_ids: ["sale_sub_3"],
  }),
  createMockSubscriber({ status: "cancelled", purchase_ids: ["sale_sub_c"] }),
  createMockSubscriber({
    status: "failed_payment",
    purchase_ids: ["sale_sub_f"],
  }),
];

// ─── Mock fetch ──────────────────────────────────────────────────────────────

/** Per-subscriber sale prices returned by GET /v2/sales/:id (in cents) */
const mockSalePrices: Record<string, { price: number; subscription_duration: string }> = {
  sale_sub_1: { price: 999, subscription_duration: "monthly" },
  sale_sub_2: { price: 999, subscription_duration: "monthly" },
  sale_sub_3: { price: 999, subscription_duration: "monthly" },
};

function createFetchMock() {
  return vi.fn(async (url: string | URL | Request) => {
    const urlStr = url.toString();

    // Individual sale lookup: GET /v2/sales/:id (must be checked before paginated /v2/sales)
    const saleIdMatch = urlStr.match(/\/v2\/sales\/([^/?]+)/);
    if (saleIdMatch && !urlStr.includes("page_key") && !urlStr.includes("after=")) {
      const saleId = decodeURIComponent(saleIdMatch[1]);
      const mockSale = mockSalePrices[saleId];
      if (mockSale) {
        return new Response(
          JSON.stringify({
            success: true,
            sale: {
              id: saleId,
              price: mockSale.price,
              subscription_duration: mockSale.subscription_duration,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, message: "Sale not found" }),
        { status: 404 }
      );
    }

    // Paginated sales list: GET /v2/sales?after=...
    if (urlStr.includes("/v2/sales")) {
      return new Response(
        JSON.stringify({ success: true, sales: mockSales }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (urlStr.includes("/v2/products/") && urlStr.includes("/subscribers")) {
      return new Response(
        JSON.stringify({ success: true, subscribers: mockSubscribers }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (urlStr.includes("/v2/products")) {
      return new Response(
        JSON.stringify({ success: true, products: mockProducts }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (urlStr.includes("/v2/user")) {
      return new Response(
        JSON.stringify({
          success: true,
          user: { name: "Test User", user_id: "test123" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not found", { status: 404 });
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockSale(overrides: {
  price: number;
  created_at: string;
  product_id: string;
  product_name: string;
  refunded?: boolean;
  chargedback?: boolean;
  subscription_duration?: string;
  email?: string;
  recurring_charge?: boolean;
}) {
  return {
    id: `sale_${Math.random().toString(36).slice(2)}`,
    created_at: overrides.created_at,
    product_name: overrides.product_name,
    product_id: overrides.product_id,
    price: overrides.price,
    gumroad_fee: Math.round(overrides.price * 0.1),
    refunded: overrides.refunded ?? false,
    partially_refunded: false,
    chargedback: overrides.chargedback ?? false,
    currency_symbol: "$",
    subscription_duration: overrides.subscription_duration ?? null,
    quantity: 1,
    email: overrides.email ?? null,
    recurring_charge: overrides.recurring_charge ?? false,
  };
}

function createMockProduct(overrides: {
  id: string;
  name: string;
  published: boolean;
  is_tiered_membership: boolean;
  deleted?: boolean;
}) {
  return {
    id: overrides.id,
    name: overrides.name,
    published: overrides.published,
    deleted: overrides.deleted ?? false,
    price: overrides.is_tiered_membership ? 0 : 999,
    currency: "usd",
    sales_count: "10",
    sales_usd_cents: "9990",
    is_tiered_membership: overrides.is_tiered_membership,
    subscription_duration: overrides.is_tiered_membership ? "monthly" : null,
    recurrences: overrides.is_tiered_membership ? ["monthly"] : null,
    variants: overrides.is_tiered_membership
      ? [
          {
            title: "Tier",
            options: [
              {
                name: "Pro",
                price_difference: 0,
                is_pay_what_you_want: false,
                recurrence_prices: {
                  monthly: { price_cents: 999, suggested_price_cents: null },
                },
              },
            ],
          },
        ]
      : [],
  };
}

function createMockSubscriber(overrides: {
  status: string;
  recurrence?: string;
  purchase_ids?: string[];
}) {
  return {
    id: `sub_${Math.random().toString(36).slice(2)}`,
    product_id: "prod_sub",
    status: overrides.status,
    created_at: "2026-01-15T10:00:00Z",
    recurrence: overrides.recurrence ?? "monthly",
    purchase_ids: overrides.purchase_ids ?? [],
  };
}

// ─── Test account ────────────────────────────────────────────────────────────

const mockAccount: AccountConfig = {
  id: "acc-gumroad-test",
  integrationId: "gumroad",
  label: "Test Gumroad Account",
  credentials: { access_token: "test_token_mock" },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Gumroad Fetcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", createFetchMock());
  });

  describe("sync", () => {
    it("should return successful sync result with metrics", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      expect(result.success).toBe(true);
      expect(result.metrics.length).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    // ── Per-product metrics ──────────────────────────────────────────────

    it("should produce per-product revenue metrics with projectId", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const perProductRevenue = result.metrics.filter(
        (m) => m.metricType === "revenue" && m.projectId
      );

      // prod_sub: Feb 1 ($29.99), Feb 2 ($29.99)
      // prod_ebook: Feb 1 ($49.99), Feb 2 ($49.99)
      // Feb 3 excluded (refunded + chargedback)
      expect(perProductRevenue).toHaveLength(4);

      const subFeb1 = perProductRevenue.find(
        (m) => m.projectId === "prod_sub" && m.date === "2026-02-01"
      );
      expect(subFeb1?.value).toBeCloseTo(29.99);
      expect(subFeb1?.metadata?.product_name).toBe("Premium Membership");
      expect(subFeb1?.metadata?.product_type).toBe("subscription");

      const ebookFeb1 = perProductRevenue.find(
        (m) => m.projectId === "prod_ebook" && m.date === "2026-02-01"
      );
      expect(ebookFeb1?.value).toBeCloseTo(49.99);
      expect(ebookFeb1?.metadata?.product_name).toBe("UI Design eBook");
      expect(ebookFeb1?.metadata?.product_type).toBe("one_time");
    });

    it("should produce per-product sales_count with projectId", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const perProductSales = result.metrics.filter(
        (m) => m.metricType === "sales_count" && m.projectId
      );

      // 4 entries: 2 products x 2 days
      expect(perProductSales).toHaveLength(4);

      const subFeb1 = perProductSales.find(
        (m) => m.projectId === "prod_sub" && m.date === "2026-02-01"
      );
      expect(subFeb1?.value).toBe(1);
    });

    // ── Account-level totals ─────────────────────────────────────────────

    it("should produce account-level total revenue (no projectId)", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const totalRevenue = result.metrics.filter(
        (m) => m.metricType === "revenue" && !m.projectId
      );

      // Feb 1: $29.99 + $49.99 = $79.98
      // Feb 2: $29.99 + $49.99 = $79.98
      expect(totalRevenue).toHaveLength(2);

      const feb1 = totalRevenue.find((m) => m.date === "2026-02-01");
      expect(feb1?.value).toBeCloseTo(79.98);
    });

    // ── Subscription vs one-time split ───────────────────────────────────

    it("should produce subscription_revenue metric", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      // Account-level subscription_revenue (always emitted, even if 0)
      const subRevenueAccountLevel = result.metrics.filter(
        (m) => m.metricType === "subscription_revenue" && !m.projectId
      );

      // Feb 1: $29.99, Feb 2: $29.99 (one per day with sales)
      expect(subRevenueAccountLevel).toHaveLength(2);
      expect(subRevenueAccountLevel[0].value).toBeCloseTo(29.99);
      expect(subRevenueAccountLevel[0].currency).toBe("USD");

      // Per-product subscription_revenue also emitted
      const subRevenueProduct = result.metrics.filter(
        (m) => m.metricType === "subscription_revenue" && m.projectId
      );
      expect(subRevenueProduct.length).toBeGreaterThan(0);
      expect(subRevenueProduct[0].metadata?.product_type).toBe("subscription");
    });

    it("should produce one_time_revenue metric", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      // Account-level one_time_revenue (always emitted, even if 0)
      const otRevenueAccountLevel = result.metrics.filter(
        (m) => m.metricType === "one_time_revenue" && !m.projectId
      );

      // Feb 1: $49.99, Feb 2: $49.99 (one per day with sales)
      expect(otRevenueAccountLevel).toHaveLength(2);
      expect(otRevenueAccountLevel[0].value).toBeCloseTo(49.99);

      // Per-product one_time_revenue also emitted
      const otRevenueProduct = result.metrics.filter(
        (m) => m.metricType === "one_time_revenue" && m.projectId
      );
      expect(otRevenueProduct.length).toBeGreaterThan(0);
      expect(otRevenueProduct[0].metadata?.product_type).toBe("one_time");
    });

    // ── Exclusions ───────────────────────────────────────────────────────

    it("should exclude refunded and chargedback sales from all metrics", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      // No Feb 3 revenue in any metric (both sales on that day are excluded)
      const feb3Metrics = result.metrics.filter(
        (m) => m.date === "2026-02-03"
      );
      expect(feb3Metrics).toHaveLength(0);
    });

    // ── Products ─────────────────────────────────────────────────────────

    it("should count published products", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const productMetrics = result.metrics.filter(
        (m) => m.metricType === "products_count"
      );

      expect(productMetrics).toHaveLength(1);
      expect(productMetrics[0].value).toBe(2); // deleted one excluded
    });

    // ── Subscribers ──────────────────────────────────────────────────────

    it("should produce per-product active_subscriptions with projectId", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const perProductSubs = result.metrics.filter(
        (m) => m.metricType === "active_subscriptions" && m.projectId
      );

      // Only prod_sub is a membership product
      expect(perProductSubs).toHaveLength(1);
      expect(perProductSubs[0].projectId).toBe("prod_sub");
      // 2 alive + 1 pending_cancellation = 3
      expect(perProductSubs[0].value).toBe(3);
      expect(perProductSubs[0].metadata?.product_name).toBe(
        "Premium Membership"
      );
    });

    it("should count new customers from unique emails on non-recurring sales", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const newCust = result.metrics.filter(
        (m) => m.metricType === "new_customers"
      );

      // Feb 1: alice (sub initial) + bob (ebook) = 2 unique emails
      // Feb 2: carol (ebook) = 1 (alice's recurring charge excluded)
      // Feb 3: all excluded (refunded + chargedback)
      expect(newCust).toHaveLength(2);

      const feb1 = newCust.find((m) => m.date === "2026-02-01");
      expect(feb1?.value).toBe(2);

      const feb2 = newCust.find((m) => m.date === "2026-02-02");
      expect(feb2?.value).toBe(1);
    });

    it("should produce account-level total active_subscriptions", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const totalSubs = result.metrics.filter(
        (m) => m.metricType === "active_subscriptions" && !m.projectId
      );

      expect(totalSubs).toHaveLength(1);
      expect(totalSubs[0].value).toBe(3);
    });

    it("should compute MRR from active subscribers and product prices", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const mrrMetrics = result.metrics.filter(
        (m) => m.metricType === "mrr"
      );

      // One per-product MRR + one account-level total
      expect(mrrMetrics.length).toBeGreaterThanOrEqual(2);
      const perProduct = mrrMetrics.find((m) => m.projectId);
      expect(perProduct).toBeDefined();
      // prod_sub: 3 active subscribers, each with a latest sale of $9.99/monthly
      // MRR = $9.99 * 3 = $29.97 (derived from each subscriber's actual charge)
      const total = mrrMetrics.find((m) => !m.projectId);
      expect(total?.value).toBeCloseTo(29.97);
      expect(total?.currency).toBe("USD");
    });

    it("should compute MRR with mixed recurrences (monthly + yearly)", async () => {
      // Override subscribers: 1 monthly at $9.99, 1 yearly at $120
      const mixedSubscribers = [
        createMockSubscriber({
          status: "alive",
          recurrence: "monthly",
          purchase_ids: ["sale_monthly"],
        }),
        createMockSubscriber({
          status: "alive",
          recurrence: "yearly",
          purchase_ids: ["sale_yearly"],
        }),
      ];
      const mixedSalePrices: Record<string, { price: number; subscription_duration: string }> = {
        sale_monthly: { price: 999, subscription_duration: "monthly" },
        sale_yearly: { price: 12000, subscription_duration: "yearly" },
      };

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request) => {
          const urlStr = url.toString();
          const saleMatch = urlStr.match(/\/v2\/sales\/([^/?]+)/);
          if (saleMatch && !urlStr.includes("after=")) {
            const sid = decodeURIComponent(saleMatch[1]);
            const s = mixedSalePrices[sid];
            if (s) {
              return new Response(
                JSON.stringify({ success: true, sale: { id: sid, ...s } }),
                { status: 200, headers: { "Content-Type": "application/json" } }
              );
            }
            return new Response("Not found", { status: 404 });
          }
          if (urlStr.includes("/v2/sales")) {
            return new Response(
              JSON.stringify({ success: true, sales: mockSales }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (urlStr.includes("/v2/products/") && urlStr.includes("/subscribers")) {
            return new Response(
              JSON.stringify({ success: true, subscribers: mixedSubscribers }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (urlStr.includes("/v2/products")) {
            return new Response(
              JSON.stringify({ success: true, products: mockProducts }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response("Not found", { status: 404 });
        })
      );

      const result = await gumroadFetcher.sync(mockAccount, new Date("2026-01-01"));
      const totalMRR = result.metrics.find(
        (m) => m.metricType === "mrr" && !m.projectId
      );
      // $9.99/mo + $120/yr (= $10/mo) = $19.99/mo
      expect(totalMRR?.value).toBeCloseTo(19.99);
    });

    it("should return 0 MRR when sale fetch fails for subscriber with purchase_ids", async () => {
      // Subscribers with purchase_ids that will 404 — should NOT fall back to tier pricing
      // because the real price might be discounted or free; inflating to tier price is wrong.
      const subsWithBadSales = [
        createMockSubscriber({
          status: "alive",
          recurrence: "monthly",
          purchase_ids: ["nonexistent_sale"],
        }),
      ];

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request) => {
          const urlStr = url.toString();
          const saleMatch = urlStr.match(/\/v2\/sales\/([^/?]+)/);
          if (saleMatch && !urlStr.includes("after=")) {
            // All individual sale fetches fail
            return new Response("Not found", { status: 404 });
          }
          if (urlStr.includes("/v2/sales")) {
            return new Response(
              JSON.stringify({ success: true, sales: [] }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (urlStr.includes("/v2/products/") && urlStr.includes("/subscribers")) {
            return new Response(
              JSON.stringify({ success: true, subscribers: subsWithBadSales }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (urlStr.includes("/v2/products")) {
            return new Response(
              JSON.stringify({ success: true, products: mockProducts }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response("Not found", { status: 404 });
        })
      );

      const result = await gumroadFetcher.sync(mockAccount, new Date("2026-01-01"));
      const totalMRR = result.metrics.find(
        (m) => m.metricType === "mrr" && !m.projectId
      );
      // Sale fetch failed — return 0 rather than inflating with tier price
      expect(totalMRR?.value).toBe(0);
    });

    it("should fall back to tier variant prices when subscriber has no purchase_ids", async () => {
      // Subscribers WITHOUT purchase_ids — tier pricing fallback is appropriate here
      const subsWithoutPurchases = [
        createMockSubscriber({
          status: "alive",
          recurrence: "monthly",
        }),
      ];
      // Remove purchase_ids to simulate missing data
      delete (subsWithoutPurchases[0] as any).purchase_ids;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request) => {
          const urlStr = url.toString();
          if (urlStr.includes("/v2/sales")) {
            return new Response(
              JSON.stringify({ success: true, sales: [] }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (urlStr.includes("/v2/products/") && urlStr.includes("/subscribers")) {
            return new Response(
              JSON.stringify({ success: true, subscribers: subsWithoutPurchases }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (urlStr.includes("/v2/products")) {
            return new Response(
              JSON.stringify({ success: true, products: mockProducts }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response("Not found", { status: 404 });
        })
      );

      const result = await gumroadFetcher.sync(mockAccount, new Date("2026-01-01"));
      const totalMRR = result.metrics.find(
        (m) => m.metricType === "mrr" && !m.projectId
      );
      // Falls back to tier price: $9.99/mo (from variant recurrence_prices)
      expect(totalMRR?.value).toBeCloseTo(9.99);
    });

    it("should fall back to product.price for simple (non-tiered) subscriptions", async () => {
      // Simple subscription product: not tiered, has subscription_duration + price
      const simpleSubProduct = {
        ...createMockProduct({
          id: "prod_simple_sub",
          name: "Simple Newsletter",
          published: true,
          is_tiered_membership: false,
        }),
        price: 499,
        subscription_duration: "monthly",
      };
      const simpleProducts = [simpleSubProduct];
      const simpleSubs = [
        {
          id: "sub_simple_1",
          product_id: "prod_simple_sub",
          status: "alive",
          created_at: "2026-01-15T10:00:00Z",
          recurrence: "monthly",
          purchase_ids: [] as string[], // no purchase_ids
        },
      ];

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request) => {
          const urlStr = url.toString();
          if (urlStr.includes("/v2/sales")) {
            return new Response(
              JSON.stringify({ success: true, sales: [] }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (urlStr.includes("/v2/products/") && urlStr.includes("/subscribers")) {
            return new Response(
              JSON.stringify({ success: true, subscribers: simpleSubs }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (urlStr.includes("/v2/products")) {
            return new Response(
              JSON.stringify({ success: true, products: simpleProducts }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response("Not found", { status: 404 });
        })
      );

      const result = await gumroadFetcher.sync(mockAccount, new Date("2026-01-01"));
      const totalMRR = result.metrics.find(
        (m) => m.metricType === "mrr" && !m.projectId
      );
      // Falls back to product.price: $4.99/mo
      expect(totalMRR?.value).toBeCloseTo(4.99);
    });

    it("should handle free/comp subscriptions (sale price = 0)", async () => {
      const freeSubs = [
        createMockSubscriber({
          status: "alive",
          recurrence: "monthly",
          purchase_ids: ["sale_free"],
        }),
      ];
      const freeSalePrices: Record<string, { price: number; subscription_duration: string }> = {
        sale_free: { price: 0, subscription_duration: "monthly" },
      };

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request) => {
          const urlStr = url.toString();
          const saleMatch = urlStr.match(/\/v2\/sales\/([^/?]+)/);
          if (saleMatch && !urlStr.includes("after=")) {
            const sid = decodeURIComponent(saleMatch[1]);
            const s = freeSalePrices[sid];
            if (s) {
              return new Response(
                JSON.stringify({ success: true, sale: { id: sid, ...s } }),
                { status: 200, headers: { "Content-Type": "application/json" } }
              );
            }
            return new Response("Not found", { status: 404 });
          }
          if (urlStr.includes("/v2/sales")) {
            return new Response(
              JSON.stringify({ success: true, sales: [] }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (urlStr.includes("/v2/products/") && urlStr.includes("/subscribers")) {
            return new Response(
              JSON.stringify({ success: true, subscribers: freeSubs }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (urlStr.includes("/v2/products")) {
            return new Response(
              JSON.stringify({ success: true, products: mockProducts }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response("Not found", { status: 404 });
        })
      );

      const result = await gumroadFetcher.sync(mockAccount, new Date("2026-01-01"));
      const totalMRR = result.metrics.find(
        (m) => m.metricType === "mrr" && !m.projectId
      );
      // Free subscription: MRR = $0
      expect(totalMRR?.value).toBe(0);
    });

    it("should handle subscribers with no purchase_ids", async () => {
      const noPurchaseSubs = [
        createMockSubscriber({
          status: "alive",
          recurrence: "monthly",
          // no purchase_ids
        }),
      ];
      // Remove purchase_ids to simulate missing data
      delete (noPurchaseSubs[0] as any).purchase_ids;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request) => {
          const urlStr = url.toString();
          if (urlStr.includes("/v2/sales")) {
            return new Response(
              JSON.stringify({ success: true, sales: [] }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (urlStr.includes("/v2/products/") && urlStr.includes("/subscribers")) {
            return new Response(
              JSON.stringify({ success: true, subscribers: noPurchaseSubs }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (urlStr.includes("/v2/products")) {
            return new Response(
              JSON.stringify({ success: true, products: mockProducts }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response("Not found", { status: 404 });
        })
      );

      const result = await gumroadFetcher.sync(mockAccount, new Date("2026-01-01"));
      const totalMRR = result.metrics.find(
        (m) => m.metricType === "mrr" && !m.projectId
      );
      // No purchase_ids → falls back to tier variant price: $9.99/mo
      expect(totalMRR?.value).toBeCloseTo(9.99);
    });

    it("should use the lowest tier price when subscriber tier is unknown", async () => {
      const tieredProduct = createMockProduct({
        id: "prod_tiered",
        name: "Tiered Membership",
        published: true,
        is_tiered_membership: true,
      });
      tieredProduct.variants = [
        {
          title: "Tier",
          options: [
            {
              name: "Starter",
              price_difference: 0,
              is_pay_what_you_want: false,
              recurrence_prices: {
                monthly: { price_cents: 1000, suggested_price_cents: null },
              },
            },
            {
              name: "Pro",
              price_difference: 0,
              is_pay_what_you_want: false,
              recurrence_prices: {
                monthly: { price_cents: 2000, suggested_price_cents: null },
              },
            },
            {
              name: "Elite",
              price_difference: 0,
              is_pay_what_you_want: false,
              recurrence_prices: {
                monthly: { price_cents: 3000, suggested_price_cents: null },
              },
            },
          ],
        },
      ];

      const tieredSubs = [
        { ...createMockSubscriber({ status: "alive", recurrence: "monthly" }), product_id: "prod_tiered" },
        { ...createMockSubscriber({ status: "alive", recurrence: "monthly" }), product_id: "prod_tiered" },
      ];
      delete (tieredSubs[0] as any).purchase_ids;
      delete (tieredSubs[1] as any).purchase_ids;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request) => {
          const urlStr = url.toString();
          if (urlStr.includes("/v2/sales")) {
            return new Response(
              JSON.stringify({ success: true, sales: [] }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (urlStr.includes("/v2/products/") && urlStr.includes("/subscribers")) {
            return new Response(
              JSON.stringify({ success: true, subscribers: tieredSubs }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          if (urlStr.includes("/v2/products")) {
            return new Response(
              JSON.stringify({ success: true, products: [tieredProduct] }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return new Response("Not found", { status: 404 });
        })
      );

      const result = await gumroadFetcher.sync(mockAccount, new Date("2026-01-01"));
      const totalMRR = result.metrics.find(
        (m) => m.metricType === "mrr" && !m.projectId
      );
      // Unknown tier → use lowest tier price ($10) per subscriber
      expect(totalMRR?.value).toBeCloseTo(20);
    });

    // ── Sync steps ───────────────────────────────────────────────────────

    it("should report sync steps with durations", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      expect(result.steps).toBeDefined();
      expect(result.steps!.length).toBe(3);

      const stepKeys = result.steps!.map((s) => s.key);
      expect(stepKeys).toContain("fetch_products");
      expect(stepKeys).toContain("fetch_sales");
      expect(stepKeys).toContain("fetch_subscribers");

      for (const step of result.steps!) {
        expect(step.durationMs).toBeDefined();
        expect(step.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it("should only fetch subscribers for membership products", async () => {
      await gumroadFetcher.sync(mockAccount, new Date("2026-01-01"));

      const fetchCalls = vi.mocked(fetch).mock.calls;
      const subscriberCalls = fetchCalls.filter((call) =>
        call[0].toString().includes("/subscribers")
      );

      // Only prod_sub is a membership product
      expect(subscriberCalls).toHaveLength(1);
      expect(subscriberCalls[0][0].toString()).toContain("prod_sub");
    });

    // ── Partial failures ─────────────────────────────────────────────────

    it("should handle partial failures gracefully", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request) => {
          const urlStr = url.toString();

          if (urlStr.includes("/v2/sales")) {
            return new Response("Internal Server Error", { status: 500 });
          }

          if (
            urlStr.includes("/v2/products/") &&
            urlStr.includes("/subscribers")
          ) {
            return new Response(
              JSON.stringify({ success: true, subscribers: mockSubscribers }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          if (urlStr.includes("/v2/products")) {
            return new Response(
              JSON.stringify({ success: true, products: mockProducts }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          return new Response("Not found", { status: 404 });
        })
      );

      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      expect(result.success).toBe(true);
      expect(result.error).toBe("Some sync steps failed");

      const salesStep = result.steps!.find((s) => s.key === "fetch_sales");
      expect(salesStep?.status).toBe("error");

      const productsStep = result.steps!.find(
        (s) => s.key === "fetch_products"
      );
      expect(productsStep?.status).toBe("success");
    });

    // ── Record counts ────────────────────────────────────────────────────

    it("should count total records processed", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      // 6 sales + 3 products + 5 subscribers = 14
      expect(result.recordsProcessed).toBe(14);
    });
  });

  describe("validateCredentials", () => {
    it("should return true for valid credentials", async () => {
      const result = await gumroadFetcher.validateCredentials({
        access_token: "valid_token",
      });

      expect(result).toBe(true);
    });

    it("should return false for invalid credentials", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          return new Response("Unauthorized", { status: 401 });
        })
      );

      const result = await gumroadFetcher.validateCredentials({
        access_token: "invalid_token",
      });

      expect(result).toBe(false);
    });
  });
});
