import { describe, it, expect } from "vitest";
import type { RankingEntry } from "@/components/dashboard/metric-card";
import { computeMrrDeltaEntries } from "../dashboard/mrr-delta";

describe("computeMrrDeltaEntries", () => {
  it("matches children by sourceId when labels collide", () => {
    const yesterday: RankingEntry[] = [
      {
        label: "CSS Pro",
        integrationName: "Mixed",
        value: 2404.28,
        percentage: 0,
        children: [
          {
            label: "CSS Pro",
            integrationName: "Gumroad",
            value: 2213.78,
            percentage: 0,
            sourceId: "gumroad-csspro",
          },
          {
            label: "CSS Pro",
            integrationName: "Stripe",
            value: 140,
            percentage: 0,
            sourceId: "stripe-csspro",
          },
          {
            label: "CSS Pro",
            integrationName: "Gumroad",
            value: 50.5,
            percentage: 0,
            sourceId: "gumroad-main-csspro",
          },
        ],
      },
    ];

    const today: RankingEntry[] = [
      {
        label: "CSS Pro",
        integrationName: "Mixed",
        value: 2145.5,
        percentage: 0,
        children: [
          {
            label: "CSS Pro",
            integrationName: "Gumroad",
            value: 1955,
            percentage: 0,
            sourceId: "gumroad-csspro",
          },
          {
            label: "CSS Pro",
            integrationName: "Stripe",
            value: 140,
            percentage: 0,
            sourceId: "stripe-csspro",
          },
          {
            label: "CSS Pro",
            integrationName: "Gumroad",
            value: 50.5,
            percentage: 0,
            sourceId: "gumroad-main-csspro",
          },
        ],
      },
    ];

    const result = computeMrrDeltaEntries(today, yesterday);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBeCloseTo(-258.78);

    const children = result[0].children ?? [];
    const bySource = new Map(children.map((child) => [child.sourceId, child.value]));
    expect(bySource.get("gumroad-csspro")).toBeCloseTo(-258.78);
    expect(bySource.get("stripe-csspro")).toBeCloseTo(0);
    expect(bySource.get("gumroad-main-csspro")).toBeCloseTo(0);
  });
});
