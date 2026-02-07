import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AccountConfig } from "../../types";

// We need to mock Stripe before importing the fetcher
const mockCharges = [
  createMockCharge({ amount: 2999, created: dateToUnix("2026-02-01"), invoice: "in_sub1" }),
  createMockCharge({ amount: 4999, created: dateToUnix("2026-02-01"), invoice: null }),
  createMockCharge({ amount: 2999, created: dateToUnix("2026-02-02"), invoice: "in_sub2" }),
  createMockCharge({
    amount: 1000,
    created: dateToUnix("2026-02-03"),
    status: "failed",
  }),
];

const mockSubscriptions = [
  createMockSubscription({ amount: 2999, interval: "month" }),
  createMockSubscription({ amount: 9999, interval: "year" }),
];

const mockCustomers = [
  createMockCustomer({ created: dateToUnix("2026-02-01") }),
  createMockCustomer({ created: dateToUnix("2026-02-01") }),
  createMockCustomer({ created: dateToUnix("2026-02-02") }),
];

vi.mock("stripe", () => {
  return {
    default: function MockStripe() {
      return {
        charges: {
          list: () => createAsyncIterable(mockCharges),
        },
        subscriptions: {
          list: () => createAsyncIterable(mockSubscriptions),
        },
        customers: {
          list: () => createAsyncIterable(mockCustomers),
        },
        balance: {
          retrieve: () => Promise.resolve({ available: [] }),
        },
      };
    },
  };
});

function dateToUnix(dateStr: string): number {
  return Math.floor(new Date(dateStr).getTime() / 1000);
}

function createMockCharge(overrides: {
  amount: number;
  created: number;
  status?: string;
  currency?: string;
  invoice?: string | null;
}) {
  return {
    id: `ch_${Math.random().toString(36).slice(2)}`,
    amount: overrides.amount,
    amount_refunded: 0,
    created: overrides.created,
    currency: overrides.currency || "usd",
    status: overrides.status || "succeeded",
    invoice: overrides.invoice ?? null,
  };
}

function createMockSubscription(overrides: {
  amount: number;
  interval: string;
}) {
  return {
    id: `sub_${Math.random().toString(36).slice(2)}`,
    status: "active",
    items: {
      data: [
        {
          price: {
            unit_amount: overrides.amount,
            currency: "usd",
            recurring: {
              interval: overrides.interval,
            },
          },
          quantity: 1,
        },
      ],
    },
  };
}

function createMockCustomer(overrides: { created: number }) {
  return {
    id: `cus_${Math.random().toString(36).slice(2)}`,
    created: overrides.created,
    deleted: undefined,
  };
}

/**
 * Creates an async iterable (for Stripe auto-pagination).
 */
function createAsyncIterable<T>(items: T[]) {
  return {
    [Symbol.asyncIterator]: () => {
      let index = 0;
      return {
        next: async () => {
          if (index < items.length) {
            return { value: items[index++], done: false as const };
          }
          return { value: undefined, done: true as const };
        },
      };
    },
  };
}

// Import after mock setup
const { stripeFetcher } = await import("../fetcher");

const mockAccount: AccountConfig = {
  id: "acc-test",
  integrationId: "stripe",
  label: "Test Stripe Account",
  credentials: { secret_key: "sk_test_mock" },
};

describe("Stripe Fetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("sync", () => {
    it("should return successful sync result with metrics", async () => {
      const result = await stripeFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      expect(result.success).toBe(true);
      expect(result.metrics.length).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    it("should compute daily revenue from charges", async () => {
      const result = await stripeFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const revenueMetrics = result.metrics.filter(
        (m) => m.metricType === "revenue"
      );

      // We have charges on Feb 1 and Feb 2 (the failed one on Feb 3 is excluded)
      expect(revenueMetrics).toHaveLength(2);

      // Feb 1: $29.99 + $49.99 = $79.98
      const feb1 = revenueMetrics.find((m) => m.date === "2026-02-01");
      expect(feb1?.value).toBeCloseTo(79.98);
      expect(feb1?.currency).toBe("USD");

      // Feb 2: $29.99
      const feb2 = revenueMetrics.find((m) => m.date === "2026-02-02");
      expect(feb2?.value).toBeCloseTo(29.99);
    });

    it("should compute charge counts per day", async () => {
      const result = await stripeFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const countMetrics = result.metrics.filter(
        (m) => m.metricType === "charges_count"
      );

      // Feb 1 had 2 charges, Feb 2 had 1 (failed charge excluded)
      const feb1 = countMetrics.find((m) => m.date === "2026-02-01");
      expect(feb1?.value).toBe(2);

      const feb2 = countMetrics.find((m) => m.date === "2026-02-02");
      expect(feb2?.value).toBe(1);
    });

    it("should compute MRR from subscriptions", async () => {
      const result = await stripeFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const mrrMetrics = result.metrics.filter(
        (m) => m.metricType === "mrr"
      );

      expect(mrrMetrics).toHaveLength(1);

      // $29.99/month + $99.99/year = $29.99 + $8.33 = $38.32
      const mrr = mrrMetrics[0];
      expect(mrr.value).toBeCloseTo(38.32, 1);
      expect(mrr.currency).toBe("USD");
    });

    it("should count active subscriptions", async () => {
      const result = await stripeFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const subMetrics = result.metrics.filter(
        (m) => m.metricType === "active_subscriptions"
      );

      expect(subMetrics).toHaveLength(1);
      expect(subMetrics[0].value).toBe(2);
    });

    it("should compute new customer counts per day", async () => {
      const result = await stripeFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const customerMetrics = result.metrics.filter(
        (m) => m.metricType === "new_customers"
      );

      // Feb 1 had 2 new customers, Feb 2 had 1
      const feb1 = customerMetrics.find((m) => m.date === "2026-02-01");
      expect(feb1?.value).toBe(2);

      const feb2 = customerMetrics.find((m) => m.date === "2026-02-02");
      expect(feb2?.value).toBe(1);
    });

    it("should count total records processed", async () => {
      const result = await stripeFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      // 4 charges + 2 subscriptions + 3 customers = 9
      expect(result.recordsProcessed).toBe(9);
    });

    it("should exclude failed charges from revenue", async () => {
      const result = await stripeFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const revenueMetrics = result.metrics.filter(
        (m) => m.metricType === "revenue"
      );

      // No revenue metric for Feb 3 (the failed charge day)
      const feb3 = revenueMetrics.find((m) => m.date === "2026-02-03");
      expect(feb3).toBeUndefined();
    });

    it("should classify subscription vs one-time revenue", async () => {
      const result = await stripeFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const subRevenue = result.metrics.filter(
        (m) => m.metricType === "subscription_revenue"
      );
      const oneTimeRevenue = result.metrics.filter(
        (m) => m.metricType === "one_time_revenue"
      );

      // Feb 1: charge with invoice ($29.99) is subscription, charge without ($49.99) is one-time
      const subFeb1 = subRevenue.find((m) => m.date === "2026-02-01");
      expect(subFeb1?.value).toBeCloseTo(29.99);

      const otFeb1 = oneTimeRevenue.find((m) => m.date === "2026-02-01");
      expect(otFeb1?.value).toBeCloseTo(49.99);

      // Feb 2: charge with invoice ($29.99) is subscription only
      const subFeb2 = subRevenue.find((m) => m.date === "2026-02-02");
      expect(subFeb2?.value).toBeCloseTo(29.99);

      // Feb 2: no one-time charges, so one_time_revenue is 0
      const otFeb2 = oneTimeRevenue.find((m) => m.date === "2026-02-02");
      expect(otFeb2?.value).toBe(0);
    });

    it("should produce sales_count matching charges_count", async () => {
      const result = await stripeFetcher.sync(
        mockAccount,
        new Date("2026-01-01")
      );

      const salesMetrics = result.metrics.filter(
        (m) => m.metricType === "sales_count"
      );
      const chargeMetrics = result.metrics.filter(
        (m) => m.metricType === "charges_count"
      );

      // sales_count should mirror charges_count
      expect(salesMetrics).toHaveLength(chargeMetrics.length);

      const salesFeb1 = salesMetrics.find((m) => m.date === "2026-02-01");
      expect(salesFeb1?.value).toBe(2);

      const salesFeb2 = salesMetrics.find((m) => m.date === "2026-02-02");
      expect(salesFeb2?.value).toBe(1);
    });
  });

  describe("validateCredentials", () => {
    it("should return true for valid credentials", async () => {
      const result = await stripeFetcher.validateCredentials({
        secret_key: "sk_test_valid",
      });

      expect(result).toBe(true);
    });
  });
});
