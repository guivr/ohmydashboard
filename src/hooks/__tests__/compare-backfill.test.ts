import { describe, it, expect } from "vitest";
import {
  shouldBackfillCompare,
  shouldStartBackfill,
  shouldStartRangeBackfill,
} from "../compare-backfill";

describe("shouldBackfillCompare", () => {
  it("returns true when any flow metric has no previous data", () => {
    expect(
      shouldBackfillCompare(
        { revenue: 0, sales_count: 5, new_customers: 2 },
        ["revenue", "sales_count", "new_customers"]
      )
    ).toBe(true);
  });

  it("returns false when all flow metrics have previous data", () => {
    expect(
      shouldBackfillCompare(
        { revenue: 10, sales_count: 1, new_customers: 3 },
        ["revenue", "sales_count", "new_customers"]
      )
    ).toBe(false);
  });
});

describe("shouldStartBackfill", () => {
  it("returns false when compare is disabled", () => {
    expect(
      shouldStartBackfill({
        compareEnabled: false,
        prevFrom: "2026-01-01",
        prevTo: "2026-01-30",
        accountIds: ["acc-1"],
        prevCounts: { revenue: 0 },
        flowMetricKeys: ["revenue"],
      })
    ).toBe(false);
  });

  it("returns false when previous range is missing", () => {
    expect(
      shouldStartBackfill({
        compareEnabled: true,
        prevFrom: undefined,
        prevTo: undefined,
        accountIds: ["acc-1"],
        prevCounts: { revenue: 0 },
        flowMetricKeys: ["revenue"],
      })
    ).toBe(false);
  });

  it("returns true when flow metrics are missing and compare is enabled", () => {
    expect(
      shouldStartBackfill({
        compareEnabled: true,
        prevFrom: "2026-01-01",
        prevTo: "2026-01-30",
        accountIds: ["acc-1"],
        prevCounts: { revenue: 0 },
        flowMetricKeys: ["revenue"],
      })
    ).toBe(true);
  });
});

describe("shouldStartRangeBackfill", () => {
  it("returns false when range is missing", () => {
    expect(
      shouldStartRangeBackfill({
        from: undefined,
        to: undefined,
        accountIds: ["acc-1"],
        counts: { revenue: 0 },
        flowMetricKeys: ["revenue"],
      })
    ).toBe(false);
  });

  it("returns true when current range is missing data", () => {
    expect(
      shouldStartRangeBackfill({
        from: "2026-02-01",
        to: "2026-02-07",
        accountIds: ["acc-1"],
        counts: { revenue: 0 },
        flowMetricKeys: ["revenue"],
      })
    ).toBe(true);
  });

  it("returns false when current range has data", () => {
    expect(
      shouldStartRangeBackfill({
        from: "2026-02-01",
        to: "2026-02-07",
        accountIds: ["acc-1"],
        counts: { revenue: 5 },
        flowMetricKeys: ["revenue"],
      })
    ).toBe(false);
  });
});
