import { describe, it, expect } from "vitest";
import { buildCalculationLines } from "../metric-calculation";

describe("buildCalculationLines", () => {
  it("returns stock metric calculation lines", () => {
    const lines = buildCalculationLines({
      metricKey: "mrr",
      isStock: true,
      from: "2026-02-01",
      to: "2026-02-07",
      prevFrom: "2026-01-25",
      prevTo: "2026-01-31",
      currentValue: 4723.72,
      previousValue: 1038.54,
      compareEnabled: true,
      compareAvailable: true,
    });

    expect(lines.some((l) => l.includes("latest snapshot"))).toBe(true);
    expect(lines.some((l) => l.includes("2026-02-07"))).toBe(true);
    expect(lines.some((l) => l.includes("2026-01-31"))).toBe(true);
  });

  it("returns flow metric calculation lines", () => {
    const lines = buildCalculationLines({
      metricKey: "revenue",
      isStock: false,
      from: "2026-02-01",
      to: "2026-02-07",
      prevFrom: "2026-01-25",
      prevTo: "2026-01-31",
      currentValue: 1000,
      previousValue: 900,
      compareEnabled: true,
      compareAvailable: true,
    });

    expect(lines.some((l) => l.includes("sum of daily values"))).toBe(true);
    expect(lines.some((l) => l.includes("2026-02-01"))).toBe(true);
    expect(lines.some((l) => l.includes("2026-01-31"))).toBe(true);
  });
});
