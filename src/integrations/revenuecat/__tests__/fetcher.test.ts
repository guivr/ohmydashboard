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
        })
        // Mock 7: customers_active
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("customers_active", [
                [mockDate1, 200],
                [mockDate2, 205],
                [mockDate3, 210],
              ])
            ),
        });
      // No segmented revenue fetch since options had no matching segment

      const sinceDate = new Date("2025-01-10T00:00:00Z");
      const result = await revenuecatFetcher.sync(mockAccount, sinceDate);

      expect(result.success).toBe(true);

      // Check MRR metrics (3 from chart + 1 carry-forward to today)
      const mrrMetrics = result.metrics.filter((m) => m.metricType === "mrr");
      expect(mrrMetrics).toHaveLength(4);
      expect(mrrMetrics[0].value).toBe(5000);
      expect(mrrMetrics[0].currency).toBe("USD");
      expect(mrrMetrics[0].date).toBe("2025-01-10");
      // Carry-forward: latest value (Jan 12) duplicated to today (Jan 15)
      const mrrToday = mrrMetrics.find((m) => m.date === "2025-01-15");
      expect(mrrToday?.value).toBe(5300);

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

      // Check active subscriptions (3 from chart + 1 carry-forward to today)
      const subsMetrics = result.metrics.filter((m) => m.metricType === "active_subscriptions");
      expect(subsMetrics).toHaveLength(4);
      expect(subsMetrics[0].value).toBe(100);

      // Check active trials (3 from chart + 1 carry-forward to today)
      const trialsMetrics = result.metrics.filter((m) => m.metricType === "active_trials");
      expect(trialsMetrics).toHaveLength(4);
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
        // Mock 7: customers_active
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("customers_active", [
                [mockDate1, 200],
                [mockDate2, 205],
              ])
            ),
        })
        // Mock 8: segmented revenue fetch (with segment=product_duration_type)
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
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockChartData("customers_active", [[mockDate, 200]])),
        });

      const sinceDate = new Date("2025-01-10T00:00:00Z");
      const result = await revenuecatFetcher.sync(mockAccount, sinceDate);

      expect(result.success).toBe(true);
      // Should have 2 mrr metrics (null value skipped) + 1 carry-forward to today
      expect(result.metrics.filter((m) => m.metricType === "mrr")).toHaveLength(3);
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
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(createMockChartData("customers_active", [[mockDate, 200]])),
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
      // Other charts: actives (1) + trials (1) + customers_new (1) + customers_active (1) = 4
      // Plus carry-forward for stock metrics: actives (+1) + trials (+1) + active_users (+1) = 7
      const otherCount = result.metrics.filter((m) => m.metricType !== "revenue").length;
      expect(otherCount).toBe(7);
      expect(result.steps?.some((s) => s.status === "error")).toBe(true);
    });

    it("reports error when all charts fail", async () => {
      // Mock 1: chart options (fails too — discoverRevenueSegment catches and returns null)
      mockFetch
        .mockRejectedValueOnce(new Error("Options fetch failed"))
        // Mock 2-7: all 6 chart fetches fail
        .mockRejectedValueOnce(new Error("All fetches failed"))
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
        // Mock 7: customers_active
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve(
              createMockChartData("customers_active", [[mockDate1, 200]])
            ),
        })
        // Mock 8: segmented revenue fetch FAILS
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

    // ── Country segmentation (Step 4) ─────────────────────────────────────

    describe("country segmentation", () => {
      it("fetches customers_new by country with v3 format", async () => {
        const mockDate1 = new Date("2025-01-10T00:00:00Z").getTime();
        const mockDate2 = new Date("2025-01-11T00:00:00Z").getTime();

        mockFetch
          // Mock 1: chart options for revenue (no product_duration_type)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createOptionsNoSegment()),
          })
          // Mock 2-7: standard chart data (6 charts)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("mrr", [[mockDate1, 5000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("revenue", [[mockDate1, 10000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("actives", [[mockDate1, 100]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("trials", [[mockDate1, 50]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_new", [[mockDate1, 10]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_active", [[mockDate1, 200]])),
          })
          // Mock 8: chart options for customers_new (has "country" segment)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              object: "chart_options",
              resolutions: [{ id: "0", display_name: "day" }],
              segments: [
                { id: "country", display_name: "Country" },
                { id: "store", display_name: "Store" },
              ],
              filters: [],
            }),
          })
          // Mock 9: country-segmented customers_new (v3 format)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              object: "chart_data",
              category: "customers_new",
              display_type: "line",
              display_name: "New Customers",
              description: "New customers by country",
              resolution: "day",
              segments: [
                { display_name: "Total", is_total: true },
                { display_name: "United States", is_total: false },
                { display_name: "Germany", is_total: false },
                { display_name: "Unknown", is_total: false },
              ],
              values: [
                // Total segment (index 0) — should be skipped
                { cohort: mockDate1, segment: 0, value: 10 },
                // United States (index 1)
                { cohort: mockDate1, segment: 1, value: 5 },
                // Germany (index 2)
                { cohort: mockDate1, segment: 2, value: 3 },
                // Unknown (index 3)
                { cohort: mockDate1, segment: 3, value: 2 },
                // Day 2
                { cohort: mockDate2, segment: 0, value: 7 },
                { cohort: mockDate2, segment: 1, value: 4 },
                { cohort: mockDate2, segment: 2, value: 3 },
              ],
              start_date: mockDate1,
              end_date: mockDate2,
            }),
          });

        const sinceDate = new Date("2025-01-10T00:00:00Z");
        const result = await revenuecatFetcher.sync(mockAccount, sinceDate);

        expect(result.success).toBe(true);

        const countryMetrics = result.metrics.filter(
          (m) => m.metricType === "new_customers_by_country"
        );

        // 5 data points: US day1, DE day1, Unknown day1, US day2, DE day2
        // (Total segments are skipped, zero values are skipped)
        expect(countryMetrics).toHaveLength(5);

        // Check US metrics
        const usDay1 = countryMetrics.find(
          (m) => m.metadata?.country === "US" && m.date === "2025-01-10"
        );
        expect(usDay1?.value).toBe(5);

        const usDay2 = countryMetrics.find(
          (m) => m.metadata?.country === "US" && m.date === "2025-01-11"
        );
        expect(usDay2?.value).toBe(4);

        // Check Germany metrics (display_name "Germany" → "DE")
        const deDay1 = countryMetrics.find(
          (m) => m.metadata?.country === "DE" && m.date === "2025-01-10"
        );
        expect(deDay1?.value).toBe(3);

        // Check Unknown
        const unknownDay1 = countryMetrics.find(
          (m) => m.metadata?.country === "Unknown" && m.date === "2025-01-10"
        );
        expect(unknownDay1?.value).toBe(2);

        // Verify step reported correctly
        const countryStep = result.steps?.find(
          (s) => s.key === "fetch_customers_by_country"
        );
        expect(countryStep?.status).toBe("success");
        expect(countryStep?.recordCount).toBe(5);
      });

      it("fetches customers_new by country with v2 array format", async () => {
        const mockDate1 = new Date("2025-01-10T00:00:00Z").getTime();
        // Use seconds for v2 format
        const mockDate1Sec = mockDate1 / 1000;

        mockFetch
          // Mock 1: chart options for revenue (no segment)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createOptionsNoSegment()),
          })
          // Mock 2-7: standard charts
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("mrr", [[mockDate1, 5000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("revenue", [[mockDate1, 10000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("actives", [[mockDate1, 100]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("trials", [[mockDate1, 50]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_new", [[mockDate1, 10]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_active", [[mockDate1, 200]])),
          })
          // Mock 8: chart options for customers_new
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              object: "chart_options",
              resolutions: [{ id: "0", display_name: "day" }],
              segments: [{ id: "country", display_name: "Country" }],
              filters: [],
            }),
          })
          // Mock 9: country-segmented data (v2 array format with ISO segment IDs)
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              object: "chart_data",
              category: "customers_new",
              display_type: "line",
              display_name: "New Customers",
              description: "New customers",
              resolution: "day",
              segments: [
                { id: "US", display_name: "United States" },
                { id: "BR", display_name: "Brazil" },
              ],
              // v2 format: [timestamp, seg0_val, seg1_val]
              values: [
                [mockDate1Sec, 7, 3],
              ],
              start_date: mockDate1Sec,
              end_date: mockDate1Sec,
            }),
          });

        const sinceDate = new Date("2025-01-10T00:00:00Z");
        const result = await revenuecatFetcher.sync(mockAccount, sinceDate);

        expect(result.success).toBe(true);

        const countryMetrics = result.metrics.filter(
          (m) => m.metricType === "new_customers_by_country"
        );

        expect(countryMetrics).toHaveLength(2);

        const us = countryMetrics.find((m) => m.metadata?.country === "US");
        expect(us?.value).toBe(7);
        expect(us?.date).toBe("2025-01-10");

        const br = countryMetrics.find((m) => m.metadata?.country === "BR");
        expect(br?.value).toBe(3);
      });

      it("skips zero and null values in country data", async () => {
        const mockDate1 = new Date("2025-01-10T00:00:00Z").getTime();

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createOptionsNoSegment()),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("mrr", [[mockDate1, 5000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("revenue", [[mockDate1, 10000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("actives", [[mockDate1, 100]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("trials", [[mockDate1, 50]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_new", [[mockDate1, 10]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_active", [[mockDate1, 200]])),
          })
          // Chart options for customers_new
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              object: "chart_options",
              resolutions: [{ id: "0", display_name: "day" }],
              segments: [{ id: "country", display_name: "Country" }],
              filters: [],
            }),
          })
          // v3 country data with zeros and nulls
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              object: "chart_data",
              category: "customers_new",
              display_type: "line",
              display_name: "New Customers",
              description: "New customers",
              resolution: "day",
              segments: [
                { display_name: "United States", is_total: false },
                { display_name: "Japan", is_total: false },
                { display_name: "France", is_total: false },
              ],
              values: [
                { cohort: mockDate1, segment: 0, value: 5 },
                { cohort: mockDate1, segment: 1, value: 0 },       // zero → skipped
                { cohort: mockDate1, segment: 2, value: null },     // null → skipped
              ],
              start_date: mockDate1,
              end_date: mockDate1,
            }),
          });

        const sinceDate = new Date("2025-01-10T00:00:00Z");
        const result = await revenuecatFetcher.sync(mockAccount, sinceDate);

        const countryMetrics = result.metrics.filter(
          (m) => m.metricType === "new_customers_by_country"
        );

        // Only US should appear (Japan=0 and France=null skipped)
        expect(countryMetrics).toHaveLength(1);
        expect(countryMetrics[0].metadata?.country).toBe("US");
        expect(countryMetrics[0].value).toBe(5);
      });

      it("skips country step when country segment is not available", async () => {
        const mockDate1 = new Date("2025-01-10T00:00:00Z").getTime();

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createOptionsNoSegment()),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("mrr", [[mockDate1, 5000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("revenue", [[mockDate1, 10000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("actives", [[mockDate1, 100]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("trials", [[mockDate1, 50]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_new", [[mockDate1, 10]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_active", [[mockDate1, 200]])),
          })
          // Chart options for customers_new — no "country" segment
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              object: "chart_options",
              resolutions: [{ id: "0", display_name: "day" }],
              segments: [
                { id: "store", display_name: "Store" },
              ],
              filters: [],
            }),
          });

        const sinceDate = new Date("2025-01-10T00:00:00Z");
        const result = await revenuecatFetcher.sync(mockAccount, sinceDate);

        expect(result.success).toBe(true);

        const countryMetrics = result.metrics.filter(
          (m) => m.metricType === "new_customers_by_country"
        );
        expect(countryMetrics).toHaveLength(0);

        const countryStep = result.steps?.find(
          (s) => s.key === "fetch_customers_by_country"
        );
        expect(countryStep?.status).toBe("skipped");
        expect(countryStep?.error).toContain("Country segment not available");
      });

      it("reports error step when country fetch fails", async () => {
        const mockDate1 = new Date("2025-01-10T00:00:00Z").getTime();

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createOptionsNoSegment()),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("mrr", [[mockDate1, 5000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("revenue", [[mockDate1, 10000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("actives", [[mockDate1, 100]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("trials", [[mockDate1, 50]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_new", [[mockDate1, 10]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_active", [[mockDate1, 200]])),
          })
          // Chart options fetch for customers_new fails
          .mockRejectedValueOnce(new Error("Rate limited"));

        const sinceDate = new Date("2025-01-10T00:00:00Z");
        const result = await revenuecatFetcher.sync(mockAccount, sinceDate);

        // Overall sync still succeeds (country is optional)
        expect(result.success).toBe(true);

        const countryStep = result.steps?.find(
          (s) => s.key === "fetch_customers_by_country"
        );
        expect(countryStep?.status).toBe("error");
        expect(countryStep?.error).toContain("Rate limited");
      });

      it("skips country step when segmented data has empty segments", async () => {
        const mockDate1 = new Date("2025-01-10T00:00:00Z").getTime();

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createOptionsNoSegment()),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("mrr", [[mockDate1, 5000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("revenue", [[mockDate1, 10000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("actives", [[mockDate1, 100]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("trials", [[mockDate1, 50]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_new", [[mockDate1, 10]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_active", [[mockDate1, 200]])),
          })
          // Chart options — has "country" segment
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              object: "chart_options",
              resolutions: [{ id: "0", display_name: "day" }],
              segments: [{ id: "country", display_name: "Country" }],
              filters: [],
            }),
          })
          // Segmented data returns empty segments array
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              object: "chart_data",
              category: "customers_new",
              display_type: "line",
              display_name: "New Customers",
              description: "New customers",
              resolution: "day",
              segments: [],
              values: [],
              start_date: mockDate1,
              end_date: mockDate1,
            }),
          });

        const sinceDate = new Date("2025-01-10T00:00:00Z");
        const result = await revenuecatFetcher.sync(mockAccount, sinceDate);

        expect(result.success).toBe(true);

        const countryMetrics = result.metrics.filter(
          (m) => m.metricType === "new_customers_by_country"
        );
        expect(countryMetrics).toHaveLength(0);

        const countryStep = result.steps?.find(
          (s) => s.key === "fetch_customers_by_country"
        );
        expect(countryStep?.status).toBe("skipped");
        expect(countryStep?.error).toContain("No country segments");
      });

      it("resolves non-standard country names from RevenueCat", async () => {
        const mockDate1 = new Date("2025-01-10T00:00:00Z").getTime();

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createOptionsNoSegment()),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("mrr", [[mockDate1, 5000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("revenue", [[mockDate1, 10000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("actives", [[mockDate1, 100]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("trials", [[mockDate1, 50]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_new", [[mockDate1, 10]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_active", [[mockDate1, 200]])),
          })
          // Chart options for customers_new
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              object: "chart_options",
              resolutions: [{ id: "0", display_name: "day" }],
              segments: [{ id: "country", display_name: "Country" }],
              filters: [],
            }),
          })
          // v3 country data with non-standard names that need manual overrides
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              object: "chart_data",
              category: "customers_new",
              display_type: "line",
              display_name: "New Customers",
              description: "New customers",
              resolution: "day",
              segments: [
                { display_name: "Korea, Republic of", is_total: false },
                { display_name: "Viet Nam", is_total: false },
                { display_name: "Czechia", is_total: false },
              ],
              values: [
                { cohort: mockDate1, segment: 0, value: 10 },
                { cohort: mockDate1, segment: 1, value: 5 },
                { cohort: mockDate1, segment: 2, value: 3 },
              ],
              start_date: mockDate1,
              end_date: mockDate1,
            }),
          });

        const sinceDate = new Date("2025-01-10T00:00:00Z");
        const result = await revenuecatFetcher.sync(mockAccount, sinceDate);

        const countryMetrics = result.metrics.filter(
          (m) => m.metricType === "new_customers_by_country"
        );

        expect(countryMetrics).toHaveLength(3);

        // "Korea, Republic of" → "KR"
        expect(countryMetrics.find((m) => m.metadata?.country === "KR")?.value).toBe(10);

        // "Viet Nam" → "VN"
        expect(countryMetrics.find((m) => m.metadata?.country === "VN")?.value).toBe(5);

        // "Czechia" → "CZ"
        expect(countryMetrics.find((m) => m.metadata?.country === "CZ")?.value).toBe(3);
      });

      it("handles v3 timestamps in seconds", async () => {
        // v3 format can use timestamps in seconds (< 1 trillion)
        const mockDate1Sec = Math.floor(new Date("2025-01-10T00:00:00Z").getTime() / 1000);
        const mockDate1Ms = new Date("2025-01-10T00:00:00Z").getTime();

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createOptionsNoSegment()),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("mrr", [[mockDate1Ms, 5000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("revenue", [[mockDate1Ms, 10000]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("actives", [[mockDate1Ms, 100]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("trials", [[mockDate1Ms, 50]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_new", [[mockDate1Ms, 10]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(createMockChartData("customers_active", [[mockDate1Ms, 200]])),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              object: "chart_options",
              resolutions: [{ id: "0", display_name: "day" }],
              segments: [{ id: "country", display_name: "Country" }],
              filters: [],
            }),
          })
          // v3 data with timestamp in seconds
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
              object: "chart_data",
              category: "customers_new",
              display_type: "line",
              display_name: "New Customers",
              description: "New customers",
              resolution: "day",
              segments: [
                { display_name: "United Kingdom", is_total: false },
              ],
              values: [
                { cohort: mockDate1Sec, segment: 0, value: 8 },
              ],
              start_date: mockDate1Sec,
              end_date: mockDate1Sec,
            }),
          });

        const sinceDate = new Date("2025-01-10T00:00:00Z");
        const result = await revenuecatFetcher.sync(mockAccount, sinceDate);

        const countryMetrics = result.metrics.filter(
          (m) => m.metricType === "new_customers_by_country"
        );

        expect(countryMetrics).toHaveLength(1);
        // Intl.DisplayNames maps "United Kingdom" → "GB" on most runtimes,
        // but some Node versions return "UK". Either is acceptable.
        expect(["GB", "UK"]).toContain(countryMetrics[0].metadata?.country);
        expect(countryMetrics[0].date).toBe("2025-01-10");
        expect(countryMetrics[0].value).toBe(8);
      });
    });
  });
});
