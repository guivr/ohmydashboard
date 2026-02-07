import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { revenuecatFetcher } from "../fetcher";
import type { AccountConfig } from "../../types";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("RevenueCat Fetcher", () => {
  const mockAccount: AccountConfig = {
    id: "test-account-123",
    integrationId: "revenuecat",
    label: "Test RevenueCat",
    credentials: {
      secret_api_key: "sk_test_1234567890",
      project_id: "abc123def456",
    },
  };

  // Helper to create mock chart data (non-segmented)
  const createMockChartData = (chartName: string, values: Array<[number, number]>) => ({
    object: "chart_data" as const,
    category: chartName,
    display_type: "line",
    display_name: chartName,
    description: `Chart for ${chartName}`,
    resolution: "day" as const,
    values,
    start_date: values[0]?.[0] || Date.now(),
    end_date: values[values.length - 1]?.[0] || Date.now(),
    yaxis_currency: chartName === "mrr" || chartName === "revenue" ? "USD" : undefined,
  });

  // Helper to create segmented chart data (multi-column values)
  const createSegmentedChartData = (
    chartName: string,
    segments: Array<{ id: string; display_name: string }>,
    values: Array<(number | null)[]>
  ) => ({
    object: "chart_data" as const,
    category: chartName,
    display_type: "line",
    display_name: chartName,
    description: `Chart for ${chartName}`,
    resolution: "day" as const,
    values,
    segments,
    start_date: values[0]?.[0] || Date.now(),
    end_date: values[values.length - 1]?.[0] || Date.now(),
    yaxis_currency: "USD",
  });

  // Helper for chart options response (no product-type segment available)
  const createOptionsNoSegment = () => ({
    object: "chart_options" as const,
    resolutions: [{ id: "0", display_name: "day" }],
    segments: [
      { id: "country", display_name: "Country" },
      { id: "store", display_name: "Store" },
    ],
    filters: [],
  });

  // Helper for chart options response (product_duration_type segment available)
  const createOptionsWithSegment = () => ({
    object: "chart_options" as const,
    resolutions: [{ id: "0", display_name: "day" }],
    segments: [
      { id: "country", display_name: "Country" },
      { id: "product_duration_type", display_name: "Product Duration" },
      { id: "store", display_name: "Store" },
    ],
    filters: [],
  });

  beforeEach(() => {
    mockFetch.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("validateCredentials", () => {
    it("returns true when API call succeeds", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve(
            createMockChartData("mrr", [[1735689600000, 5000]])
          ),
      });

      const result = await revenuecatFetcher.validateCredentials(mockAccount.credentials);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/charts/mrr"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer sk_test_1234567890",
          }),
        })
      );
    });

    it("returns false when API call fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: () => Promise.resolve("Invalid API key"),
      });

      const result = await revenuecatFetcher.validateCredentials(mockAccount.credentials);
      expect(result).toBe(false);
    });

    it("returns false on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await revenuecatFetcher.validateCredentials(mockAccount.credentials);
      expect(result).toBe(false);
    });
  });

  describe("sync", () => {
    it("fetches and normalizes chart data (no segment — no sub/ot revenue emitted)", async () => {
      const mockDate1 = new Date("2025-01-10T00:00:00Z").getTime();
      const mockDate2 = new Date("2025-01-11T00:00:00Z").getTime();
      const mockDate3 = new Date("2025-01-12T00:00:00Z").getTime();

      // Mock 1: chart options (no product_duration_type segment)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createOptionsNoSegment()),
        })
        // Mock 2-6: chart data for mrr, revenue, actives, trials, customers_new
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("mrr", [
                [mockDate1, 5000],
                [mockDate2, 5200],
                [mockDate3, 5300],
              ])
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("revenue", [
                [mockDate1, 10000],
                [mockDate2, 10500],
                [mockDate3, 11000],
              ])
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("actives", [
                [mockDate1, 100],
                [mockDate2, 102],
                [mockDate3, 105],
              ])
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("trials", [
                [mockDate1, 50],
                [mockDate2, 48],
                [mockDate3, 45],
              ])
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("customers_new", [
                [mockDate1, 10],
                [mockDate2, 12],
                [mockDate3, 8],
              ])
            ),
        });
      // customers_active is in REALTIME_ONLY_CHARTS — skipped (no mock needed)
      // No segmented revenue fetch since options had no matching segment

      const sinceDate = new Date("2025-01-10T00:00:00Z");
      const result = await revenuecatFetcher.sync(mockAccount, sinceDate);

      expect(result.success).toBe(true);

      // Check MRR metrics
      const mrrMetrics = result.metrics.filter((m) => m.metricType === "mrr");
      expect(mrrMetrics).toHaveLength(3);
      expect(mrrMetrics[0].value).toBe(5000);
      expect(mrrMetrics[0].currency).toBe("USD");
      expect(mrrMetrics[0].date).toBe("2025-01-10");

      // Revenue zero-fills from Jan 10 to Jan 15 = 6 days (3 actual + 3 zero-filled)
      const revenueMetrics = result.metrics.filter((m) => m.metricType === "revenue");
      expect(revenueMetrics).toHaveLength(6);
      expect(revenueMetrics[0].value).toBe(10000);
      expect(revenueMetrics[0].currency).toBe("USD");

      // No subscription_revenue or one_time_revenue when segment is not available
      const subRevMetrics = result.metrics.filter((m) => m.metricType === "subscription_revenue");
      expect(subRevMetrics).toHaveLength(0);
      const otRevMetrics = result.metrics.filter((m) => m.metricType === "one_time_revenue");
      expect(otRevMetrics).toHaveLength(0);

      // Check active subscriptions
      const subsMetrics = result.metrics.filter((m) => m.metricType === "active_subscriptions");
      expect(subsMetrics).toHaveLength(3);
      expect(subsMetrics[0].value).toBe(100);

      // Check active trials
      const trialsMetrics = result.metrics.filter((m) => m.metricType === "active_trials");
      expect(trialsMetrics).toHaveLength(3);
      expect(trialsMetrics[0].value).toBe(50);
    });

    it("splits revenue by product type when segment is available", async () => {
      const mockDate1 = new Date("2025-01-10T00:00:00Z").getTime();
      const mockDate2 = new Date("2025-01-11T00:00:00Z").getTime();

      // Mock 1: chart options (product_duration_type segment available!)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createOptionsWithSegment()),
        })
        // Mock 2: mrr chart
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("mrr", [
                [mockDate1, 5000],
                [mockDate2, 5200],
              ])
            ),
        })
        // Mock 3: revenue chart (unsegmented, for total revenue)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("revenue", [
                [mockDate1, 15000],
                [mockDate2, 16000],
              ])
            ),
        })
        // Mock 4: actives
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("actives", [
                [mockDate1, 100],
                [mockDate2, 102],
              ])
            ),
        })
        // Mock 5: trials
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("trials", [
                [mockDate1, 50],
                [mockDate2, 48],
              ])
            ),
        })
        // Mock 6: customers_new
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("customers_new", [
                [mockDate1, 10],
                [mockDate2, 12],
              ])
            ),
        })
        // Mock 7: segmented revenue fetch (with segment=product_duration_type)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createSegmentedChartData(
                "revenue",
                [
                  { id: "subscription", display_name: "Subscription" },
                  { id: "one_time", display_name: "One-Time" },
                ],
                // [timestamp, subscription_val, one_time_val]
                [
                  [mockDate1, 12000, 3000],
                  [mockDate2, 13000, 3000],
                ]
              )
            ),
        });

      const sinceDate = new Date("2025-01-10T00:00:00Z");
      const result = await revenuecatFetcher.sync(mockAccount, sinceDate);

      expect(result.success).toBe(true);

      // Total revenue still present (unsegmented)
      const revenueMetrics = result.metrics.filter((m) => m.metricType === "revenue");
      expect(revenueMetrics.length).toBeGreaterThanOrEqual(2);

      // Subscription revenue from segmented data
      // Zero-filled from Jan 10-15 = 6 days for both sub and one-time
      const subRevMetrics = result.metrics.filter((m) => m.metricType === "subscription_revenue");
      expect(subRevMetrics).toHaveLength(6);
      // First day (Jan 10): subscription = 12000
      const jan10Sub = subRevMetrics.find((m) => m.date === "2025-01-10");
      expect(jan10Sub?.value).toBe(12000);
      expect(jan10Sub?.currency).toBe("USD");

      // One-time revenue from segmented data
      const otRevMetrics = result.metrics.filter((m) => m.metricType === "one_time_revenue");
      expect(otRevMetrics).toHaveLength(6);
      const jan10OT = otRevMetrics.find((m) => m.date === "2025-01-10");
      expect(jan10OT?.value).toBe(3000);

      // Zero-filled days should have 0
      const jan14Sub = subRevMetrics.find((m) => m.date === "2025-01-14");
      expect(jan14Sub?.value).toBe(0);
      const jan14OT = otRevMetrics.find((m) => m.date === "2025-01-14");
      expect(jan14OT?.value).toBe(0);

      // Verify the segmented fetch URL included the segment parameter
      const segmentedCall = mockFetch.mock.calls.find(
        (call) => call[0].includes("/charts/revenue") && call[0].includes("segment=")
      );
      expect(segmentedCall?.[0]).toContain("segment=product_duration_type");
    });

    it("handles null values in chart data", async () => {
      const mockDate = new Date("2025-01-10T00:00:00Z").getTime();

      mockFetch
        // Mock 1: chart options (no segment)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createOptionsNoSegment()),
        })
        // Mock 2-6: chart data
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("mrr", [
                [mockDate, 5000],
                [mockDate + 86400000, null as unknown as number],
                [mockDate + 172800000, 5300],
              ])
            ),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockChartData("revenue", [[mockDate, 10000]])),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockChartData("actives", [[mockDate, 100]])),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockChartData("trials", [[mockDate, 50]])),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockChartData("customers_new", [[mockDate, 10]])),
        });

      const sinceDate = new Date("2025-01-10T00:00:00Z");
      const result = await revenuecatFetcher.sync(mockAccount, sinceDate);

      expect(result.success).toBe(true);
      // Should have 2 mrr metrics (null value skipped)
      expect(result.metrics.filter((m) => m.metricType === "mrr")).toHaveLength(2);
    });

    it("continues with other charts if one fails", async () => {
      const mockDate = new Date("2025-01-10T00:00:00Z").getTime();

      mockFetch
        // Mock 1: chart options (no segment)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createOptionsNoSegment()),
        })
        // Mock 2: mrr fetch fails
        .mockRejectedValueOnce(new Error("MRR fetch failed"))
        // Mock 3-5: remaining charts succeed
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockChartData("revenue", [[mockDate, 10000]])),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockChartData("actives", [[mockDate, 100]])),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockChartData("trials", [[mockDate, 50]])),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockChartData("customers_new", [[mockDate, 10]])),
        });

      const sinceDate = new Date("2025-01-10T00:00:00Z");
      const result = await revenuecatFetcher.sync(mockAccount, sinceDate);

      expect(result.success).toBe(true);
      // Revenue zero-fills from Jan 10-15 = 6 days
      const revenueCount = result.metrics.filter((m) => m.metricType === "revenue").length;
      expect(revenueCount).toBe(6);
      // No subscription_revenue or one_time_revenue (no segment available)
      expect(result.metrics.filter((m) => m.metricType === "subscription_revenue")).toHaveLength(0);
      expect(result.metrics.filter((m) => m.metricType === "one_time_revenue")).toHaveLength(0);
      // Other charts: actives + trials + customers_new = 3
      const otherCount = result.metrics.filter((m) => m.metricType !== "revenue").length;
      expect(otherCount).toBe(3);
      expect(result.steps?.some((s) => s.status === "error")).toBe(true);
    });

    it("reports error when all charts fail", async () => {
      // Mock 1: chart options (fails too — discoverRevenueSegment catches and returns null)
      mockFetch
        .mockRejectedValueOnce(new Error("Options fetch failed"))
        // Mock 2-6: all 5 chart fetches fail (customers_active skipped)
        .mockRejectedValueOnce(new Error("All fetches failed"))
        .mockRejectedValueOnce(new Error("All fetches failed"))
        .mockRejectedValueOnce(new Error("All fetches failed"))
        .mockRejectedValueOnce(new Error("All fetches failed"))
        .mockRejectedValueOnce(new Error("All fetches failed"));

      const result = await revenuecatFetcher.sync(mockAccount);

      expect(result.success).toBe(false);
      expect(result.metrics).toHaveLength(0);
      expect(result.error).toContain("All chart fetches failed");
    });

    it("reports error on missing credentials", async () => {
      const accountWithoutCreds: AccountConfig = {
        ...mockAccount,
        credentials: {},
      };

      const result = await revenuecatFetcher.sync(accountWithoutCreds);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Missing required credentials");
    });

    it("uses since date when provided", async () => {
      const mockDate = new Date("2025-01-10T00:00:00Z").getTime();
      const sinceDate = new Date("2025-01-01T00:00:00Z");

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(createMockChartData("mrr", [[mockDate, 5000]])),
      });

      await revenuecatFetcher.sync(mockAccount, sinceDate);

      // Check that the chart URL includes the since date (skip the options call)
      const mrrCall = mockFetch.mock.calls.find(
        (call) => call[0].includes("/charts/mrr") && !call[0].includes("/options")
      );
      expect(mrrCall?.[0]).toContain("start_date=2025-01-01");
    });

    it("emits no sub/ot revenue when segmented fetch fails", async () => {
      const mockDate1 = new Date("2025-01-10T00:00:00Z").getTime();

      // Mock 1: chart options (segment available)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createOptionsWithSegment()),
        })
        // Mock 2: mrr
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("mrr", [[mockDate1, 5000]])
            ),
        })
        // Mock 3: revenue
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("revenue", [[mockDate1, 10000]])
            ),
        })
        // Mock 4: actives
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("actives", [[mockDate1, 100]])
            ),
        })
        // Mock 5: trials
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("trials", [[mockDate1, 50]])
            ),
        })
        // Mock 6: customers_new
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("customers_new", [[mockDate1, 10]])
            ),
        })
        // Mock 7: segmented revenue fetch FAILS
        .mockRejectedValueOnce(new Error("Segmented fetch failed"));

      const sinceDate = new Date("2025-01-10T00:00:00Z");
      const result = await revenuecatFetcher.sync(mockAccount, sinceDate);

      expect(result.success).toBe(true);

      // No subscription_revenue or one_time_revenue emitted — we don't guess
      const subRevMetrics = result.metrics.filter((m) => m.metricType === "subscription_revenue");
      expect(subRevMetrics).toHaveLength(0);
      const otRevMetrics = result.metrics.filter((m) => m.metricType === "one_time_revenue");
      expect(otRevMetrics).toHaveLength(0);

      // Total revenue still present
      const revenueMetrics = result.metrics.filter((m) => m.metricType === "revenue");
      expect(revenueMetrics.length).toBeGreaterThan(0);

      // Should have an error step for the segmented fetch
      const splitStep = result.steps?.find((s) => s.key === "split_revenue_segmented");
      expect(splitStep?.status).toBe("error");
    });
  });
});
