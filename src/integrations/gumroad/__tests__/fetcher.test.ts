import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AccountConfig } from "../../types";
import { gumroadFetcher } from "../fetcher";

// ─── Mock data ───────────────────────────────────────────────────────────────

const mockSales = [
  createMockSale({ price: 2999, created_at: "2026-02-01T10:00:00Z" }),
  createMockSale({ price: 4999, created_at: "2026-02-01T14:00:00Z" }),
  createMockSale({ price: 1999, created_at: "2026-02-02T09:00:00Z" }),
  createMockSale({
    price: 999,
    created_at: "2026-02-03T12:00:00Z",
    refunded: true,
  }),
  createMockSale({
    price: 500,
    created_at: "2026-02-03T15:00:00Z",
    chargedback: true,
  }),
];

const mockProducts = [
  createMockProduct({
    id: "prod_1",
    published: true,
    is_tiered_membership: true,
  }),
  createMockProduct({
    id: "prod_2",
    published: true,
    is_tiered_membership: false,
  }),
  createMockProduct({
    id: "prod_3",
    published: false,
    deleted: true,
    is_tiered_membership: false,
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
  refunded?: boolean;
  chargedback?: boolean;
}) {
  return {
    id: `sale_${Math.random().toString(36).slice(2)}`,
    created_at: overrides.created_at,
    product_name: "Test Product",
    product_id: "prod_1",
    price: overrides.price,
    gumroad_fee: Math.round(overrides.price * 0.1),
    refunded: overrides.refunded ?? false,
    partially_refunded: false,
    chargedback: overrides.chargedback ?? false,
    currency_symbol: "$",
    subscription_duration: null,
    quantity: 1,
  };
}

function createMockProduct(overrides: {
  id: string;
  published: boolean;
  is_tiered_membership: boolean;
  deleted?: boolean;
}) {
  return {
    id: overrides.id,
    name: `Product ${overrides.id}`,
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
    product_id: "prod_1",
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

    it("should compute daily revenue from sales, excluding refunded and chargedback", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const revenueMetrics = result.metrics.filter(
        (m) => m.metricType === "revenue"
      );

      // Feb 1: $29.99 + $49.99 = $79.98
      // Feb 2: $19.99
      // Feb 3: both sales are refunded/chargedback — excluded
      expect(revenueMetrics).toHaveLength(2);

      const feb1 = revenueMetrics.find((m) => m.date === "2026-02-01");
      expect(feb1?.value).toBeCloseTo(79.98);
      expect(feb1?.currency).toBe("USD");

      const feb2 = revenueMetrics.find((m) => m.date === "2026-02-02");
      expect(feb2?.value).toBeCloseTo(19.99);
    });

    it("should compute daily sale counts, excluding refunded and chargedback", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const countMetrics = result.metrics.filter(
        (m) => m.metricType === "sales_count"
      );

      // Feb 1: 2 sales, Feb 2: 1 sale, Feb 3: 0 (both excluded)
      expect(countMetrics).toHaveLength(2);

      const feb1 = countMetrics.find((m) => m.date === "2026-02-01");
      expect(feb1?.value).toBe(2);

      const feb2 = countMetrics.find((m) => m.date === "2026-02-02");
      expect(feb2?.value).toBe(1);
    });

    it("should count published products", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const productMetrics = result.metrics.filter(
        (m) => m.metricType === "products_count"
      );

      expect(productMetrics).toHaveLength(1);
      // 2 published, 1 deleted
      expect(productMetrics[0].value).toBe(2);
    });

    it("should count active subscribers (alive + pending_cancellation)", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const subMetrics = result.metrics.filter(
        (m) => m.metricType === "active_subscribers"
      );

      expect(subMetrics).toHaveLength(1);
      // 2 alive + 1 pending_cancellation = 3 (cancelled and failed_payment excluded)
      expect(subMetrics[0].value).toBe(3);
    });

    it("should count total records processed", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      // 5 sales + 3 products + 5 subscribers = 13
      expect(result.recordsProcessed).toBe(13);
    });

    it("should have no revenue metric for days with only refunded/chargedback sales", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const revenueMetrics = result.metrics.filter(
        (m) => m.metricType === "revenue"
      );

      const feb3 = revenueMetrics.find((m) => m.date === "2026-02-03");
      expect(feb3).toBeUndefined();
    });

    it("should report sync steps with durations", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      expect(result.steps).toBeDefined();
      expect(result.steps!.length).toBe(3);

      const stepKeys = result.steps!.map((s) => s.key);
      expect(stepKeys).toContain("fetch_sales");
      expect(stepKeys).toContain("fetch_products");
      expect(stepKeys).toContain("fetch_subscribers");

      // All steps should have a durationMs
      for (const step of result.steps!) {
        expect(step.durationMs).toBeDefined();
        expect(step.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it("should only fetch subscribers for membership products", async () => {
      const result = await gumroadFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      // The fetch mock is called once for subscribers (only prod_1 is a membership)
      const fetchCalls = vi.mocked(fetch).mock.calls;
      const subscriberCalls = fetchCalls.filter((call) =>
        call[0].toString().includes("/subscribers")
      );

      // Only prod_1 is_tiered_membership=true and not deleted
      expect(subscriberCalls).toHaveLength(1);
      expect(subscriberCalls[0][0].toString()).toContain("prod_1");
    });

    it("should handle partial failures gracefully", async () => {
      // Override fetch to fail on sales but succeed on products/subscribers
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

      // Should succeed overall (partial success)
      expect(result.success).toBe(true);
      expect(result.error).toBe("Some sync steps failed");

      // Sales step should be an error
      const salesStep = result.steps!.find((s) => s.key === "fetch_sales");
      expect(salesStep?.status).toBe("error");

      // Products and subscribers steps should succeed
      const productsStep = result.steps!.find(
        (s) => s.key === "fetch_products"
      );
      expect(productsStep?.status).toBe("success");
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
