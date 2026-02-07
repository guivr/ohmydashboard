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
  // Subscription product sales
  createMockSale({
    price: 2999,
    created_at: "2026-02-01T10:00:00Z",
    product_id: "prod_sub",
    product_name: "Premium Membership",
    subscription_duration: "monthly",
  }),
  createMockSale({
    price: 2999,
    created_at: "2026-02-02T11:00:00Z",
    product_id: "prod_sub",
    product_name: "Premium Membership",
    subscription_duration: "monthly",
  }),
  // One-time product sales
  createMockSale({
    price: 4999,
    created_at: "2026-02-01T14:00:00Z",
    product_id: "prod_ebook",
    product_name: "UI Design eBook",
  }),
  createMockSale({
    price: 4999,
    created_at: "2026-02-02T09:00:00Z",
    product_id: "prod_ebook",
    product_name: "UI Design eBook",
  }),
  // Refunded sale — should be excluded
  createMockSale({
    price: 999,
    created_at: "2026-02-03T12:00:00Z",
    product_id: "prod_ebook",
    product_name: "UI Design eBook",
    refunded: true,
  }),
  // Chargedback sale — should be excluded
  createMockSale({
    price: 500,
    created_at: "2026-02-03T15:00:00Z",
    product_id: "prod_sub",
    product_name: "Premium Membership",
    chargedback: true,
  }),
];

const mockSubscribers = [
  createMockSubscriber({ status: "alive" }),
  createMockSubscriber({ status: "alive" }),
  createMockSubscriber({ status: "pending_cancellation" }),
  createMockSubscriber({ status: "cancelled" }),
  createMockSubscriber({ status: "failed_payment" }),
];

// ─── Mock fetch ──────────────────────────────────────────────────────────────

function createFetchMock() {
  return vi.fn(async (url: string | URL | Request) => {
    const urlStr = url.toString();

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
    price: 999,
    currency: "usd",
    sales_count: "10",
    sales_usd_cents: "9990",
    is_tiered_membership: overrides.is_tiered_membership,
    subscription_duration: overrides.is_tiered_membership ? "monthly" : null,
  };
}

function createMockSubscriber(overrides: { status: string }) {
  return {
    id: `sub_${Math.random().toString(36).slice(2)}`,
    product_id: "prod_sub",
    status: overrides.status,
    created_at: "2026-01-15T10:00:00Z",
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

      const subRevenue = result.metrics.filter(
        (m) => m.metricType === "subscription_revenue"
      );

      // Feb 1: $29.99, Feb 2: $29.99
      expect(subRevenue).toHaveLength(2);
      expect(subRevenue[0].value).toBeCloseTo(29.99);
      expect(subRevenue[0].currency).toBe("USD");
    });

    it("should produce one_time_revenue metric", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const otRevenue = result.metrics.filter(
        (m) => m.metricType === "one_time_revenue"
      );

      // Feb 1: $49.99, Feb 2: $49.99
      expect(otRevenue).toHaveLength(2);
      expect(otRevenue[0].value).toBeCloseTo(49.99);
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

    it("should produce per-product active_subscribers with projectId", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const perProductSubs = result.metrics.filter(
        (m) => m.metricType === "active_subscribers" && m.projectId
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

    it("should produce account-level total active_subscribers", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const totalSubs = result.metrics.filter(
        (m) => m.metricType === "active_subscribers" && !m.projectId
      );

      expect(totalSubs).toHaveLength(1);
      expect(totalSubs[0].value).toBe(3);
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
