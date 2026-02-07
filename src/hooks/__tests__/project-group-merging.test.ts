import { describe, it, expect } from "vitest";
import {
  buildGroupLookup,
  applyProjectGroupMerging,
  type GroupLookup,
} from "../use-dashboard-data";
import type { RankingEntry } from "@/components/dashboard/metric-card";
import type {
  ProjectGroupResponse,
  ProductMetricsResponse,
} from "../use-metrics";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeGroup(
  id: string,
  name: string,
  members: Array<{
    accountId: string;
    projectId: string | null;
    integrationId: string;
  }>
): ProjectGroupResponse {
  return {
    id,
    name,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    members: members.map((m, i) => ({
      id: `pgm-${id}-${i}`,
      accountId: m.accountId,
      projectId: m.projectId,
      accountLabel: `Account ${m.accountId}`,
      projectLabel: m.projectId ? `Project ${m.projectId}` : null,
      integrationId: m.integrationId,
    })),
  };
}

function makeRanking(
  label: string,
  integrationName: string,
  value: number
): RankingEntry {
  return { label, integrationName, value, percentage: 0 };
}

function makeProductMetrics(
  projectMap: Record<string, { label: string; accountId: string }>
): ProductMetricsResponse {
  return {
    metrics: [],
    projects: projectMap,
    accounts: {},
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("buildGroupLookup", () => {
  it("should create memberToGroup mapping from project groups", () => {
    const accountIntegrationMap = new Map([
      ["acc-1", "Stripe"],
      ["acc-2", "Gumroad"],
    ]);

    const groups = [
      makeGroup("grp-1", "CSS Pro", [
        { accountId: "acc-1", projectId: "proj-1", integrationId: "stripe" },
        { accountId: "acc-2", projectId: "proj-2", integrationId: "gumroad" },
      ]),
    ];

    const lookup = buildGroupLookup(groups, accountIntegrationMap);

    expect(lookup.memberToGroup.get("acc-1:proj-1")).toBe("grp-1");
    expect(lookup.memberToGroup.get("acc-2:proj-2")).toBe("grp-1");
    expect(lookup.groupInfo.get("grp-1")).toEqual({
      name: "CSS Pro",
      integrationNames: ["Stripe", "Gumroad"],
    });
  });

  it("should handle account-level members (no projectId)", () => {
    const accountIntegrationMap = new Map([["acc-1", "Stripe"]]);

    const groups = [
      makeGroup("grp-1", "All Stripe", [
        { accountId: "acc-1", projectId: null, integrationId: "stripe" },
      ]),
    ];

    const lookup = buildGroupLookup(groups, accountIntegrationMap);

    expect(lookup.memberToGroup.get("acc-1:")).toBe("grp-1");
  });

  it("should return empty lookup when no groups exist", () => {
    const lookup = buildGroupLookup([], new Map());

    expect(lookup.memberToGroup.size).toBe(0);
    expect(lookup.groupInfo.size).toBe(0);
  });
});

describe("applyProjectGroupMerging", () => {
  it("should merge ranking entries that belong to the same group (product-level)", () => {
    const accountIntegrationMap = new Map([
      ["acc-1", "Stripe"],
      ["acc-2", "Gumroad"],
    ]);

    const groups = [
      makeGroup("grp-1", "CSS Pro", [
        { accountId: "acc-1", projectId: "proj-1", integrationId: "stripe" },
        { accountId: "acc-2", projectId: "proj-2", integrationId: "gumroad" },
      ]),
    ];

    const lookup = buildGroupLookup(groups, accountIntegrationMap);

    const rankings: Record<string, RankingEntry[]> = {
      revenue: [
        makeRanking("CSS Pro (Stripe)", "Stripe", 500),
        makeRanking("CSS Pro (Gumroad)", "Gumroad", 300),
        makeRanking("Other Product", "Stripe", 200),
      ],
    };

    const productMetrics = makeProductMetrics({
      "proj-1": { label: "CSS Pro (Stripe)", accountId: "acc-1" },
      "proj-2": { label: "CSS Pro (Gumroad)", accountId: "acc-2" },
    });

    const result = applyProjectGroupMerging(rankings, lookup, productMetrics);

    expect(result.revenue).toHaveLength(2);
    // Merged group should be first (800 > 200)
    expect(result.revenue[0].label).toBe("CSS Pro");
    expect(result.revenue[0].value).toBe(800);
    expect(result.revenue[0].integrationNames).toEqual(["Stripe", "Gumroad"]);
    // Children should contain the original entries sorted by value
    expect(result.revenue[0].children).toHaveLength(2);
    expect(result.revenue[0].children![0].label).toBe("CSS Pro (Stripe)");
    expect(result.revenue[0].children![0].value).toBe(500);
    expect(result.revenue[0].children![0].integrationName).toBe("Stripe");
    expect(result.revenue[0].children![1].label).toBe("CSS Pro (Gumroad)");
    expect(result.revenue[0].children![1].value).toBe(300);
    // Children percentages are relative to the group total (800)
    expect(result.revenue[0].children![0].percentage).toBeCloseTo(62.5);
    expect(result.revenue[0].children![1].percentage).toBeCloseTo(37.5);
    // Other product unchanged, no children
    expect(result.revenue[1].label).toBe("Other Product");
    expect(result.revenue[1].value).toBe(200);
    expect(result.revenue[1].children).toBeUndefined();
  });

  it("should merge account-level entries via accountLabels", () => {
    const accountIntegrationMap = new Map([
      ["acc-1", "Stripe"],
      ["acc-2", "RevenueCat"],
    ]);

    // Group uses account-level members (projectId: null)
    const groups = [
      makeGroup("grp-1", "Drawings Alive", [
        { accountId: "acc-1", projectId: null, integrationId: "stripe" },
        { accountId: "acc-2", projectId: null, integrationId: "revenuecat" },
      ]),
    ];

    const lookup = buildGroupLookup(groups, accountIntegrationMap);

    const rankings: Record<string, RankingEntry[]> = {
      active_subscriptions: [
        makeRanking("Drawings Alive", "Stripe", 161),
        makeRanking("Drawings Alive RC", "RevenueCat", 40),
        makeRanking("CSS Pro", "Gumroad", 50),
      ],
    };

    const accountLabels: Record<string, string> = {
      "acc-1": "Drawings Alive",
      "acc-2": "Drawings Alive RC",
    };

    const result = applyProjectGroupMerging(rankings, lookup, null, accountLabels);

    expect(result.active_subscriptions).toHaveLength(2);
    expect(result.active_subscriptions[0].label).toBe("Drawings Alive");
    expect(result.active_subscriptions[0].value).toBe(201);
    expect(result.active_subscriptions[0].integrationNames).toEqual(["Stripe", "RevenueCat"]);
    // Children for account-level merged group
    expect(result.active_subscriptions[0].children).toHaveLength(2);
    expect(result.active_subscriptions[0].children![0].label).toBe("Drawings Alive");
    expect(result.active_subscriptions[0].children![0].value).toBe(161);
    expect(result.active_subscriptions[0].children![1].label).toBe("Drawings Alive RC");
    expect(result.active_subscriptions[0].children![1].value).toBe(40);
    expect(result.active_subscriptions[1].label).toBe("CSS Pro");
    expect(result.active_subscriptions[1].value).toBe(50);
  });

  it("should merge disambiguated account labels like 'Name (Integration)'", () => {
    const accountIntegrationMap = new Map([
      ["acc-1", "Stripe"],
      ["acc-2", "RevenueCat"],
    ]);

    const groups = [
      makeGroup("grp-1", "My App", [
        { accountId: "acc-1", projectId: null, integrationId: "stripe" },
        { accountId: "acc-2", projectId: null, integrationId: "revenuecat" },
      ]),
    ];

    const lookup = buildGroupLookup(groups, accountIntegrationMap);

    // When two accounts share the same label, computeBlendedRankings
    // disambiguates them by appending " (IntegrationName)"
    const rankings: Record<string, RankingEntry[]> = {
      mrr: [
        makeRanking("My App (Stripe)", "Stripe", 500),
        makeRanking("My App (RevenueCat)", "RevenueCat", 200),
      ],
    };

    const accountLabels: Record<string, string> = {
      "acc-1": "My App",
      "acc-2": "My App",
    };

    const result = applyProjectGroupMerging(rankings, lookup, null, accountLabels);

    expect(result.mrr).toHaveLength(1);
    expect(result.mrr[0].label).toBe("My App");
    expect(result.mrr[0].value).toBe(700);
    expect(result.mrr[0].integrationNames).toEqual(["Stripe", "RevenueCat"]);
  });

  it("should recalculate percentages after merging", () => {
    const accountIntegrationMap = new Map([
      ["acc-1", "Stripe"],
      ["acc-2", "Gumroad"],
    ]);

    const groups = [
      makeGroup("grp-1", "Combined", [
        { accountId: "acc-1", projectId: "proj-1", integrationId: "stripe" },
        { accountId: "acc-2", projectId: "proj-2", integrationId: "gumroad" },
      ]),
    ];

    const lookup = buildGroupLookup(groups, accountIntegrationMap);

    const rankings: Record<string, RankingEntry[]> = {
      mrr: [
        makeRanking("Product A", "Stripe", 600),
        makeRanking("Product B", "Gumroad", 400),
      ],
    };

    const productMetrics = makeProductMetrics({
      "proj-1": { label: "Product A", accountId: "acc-1" },
      "proj-2": { label: "Product B", accountId: "acc-2" },
    });

    const result = applyProjectGroupMerging(rankings, lookup, productMetrics);

    expect(result.mrr).toHaveLength(1);
    expect(result.mrr[0].value).toBe(1000);
    expect(result.mrr[0].percentage).toBe(100);
  });

  it("should pass through rankings unchanged when no groups exist", () => {
    const lookup: GroupLookup = {
      memberToGroup: new Map(),
      groupInfo: new Map(),
    };

    const rankings: Record<string, RankingEntry[]> = {
      revenue: [
        makeRanking("Product A", "Stripe", 500),
        makeRanking("Product B", "Gumroad", 300),
      ],
    };

    const result = applyProjectGroupMerging(rankings, lookup, null);

    // Should be the same object reference (early return optimization)
    expect(result).toBe(rankings);
  });

  it("should handle entries not matching any group", () => {
    const accountIntegrationMap = new Map([
      ["acc-1", "Stripe"],
      ["acc-2", "Gumroad"],
    ]);

    const groups = [
      makeGroup("grp-1", "Grouped Product", [
        { accountId: "acc-1", projectId: "proj-1", integrationId: "stripe" },
      ]),
    ];

    const lookup = buildGroupLookup(groups, accountIntegrationMap);

    const rankings: Record<string, RankingEntry[]> = {
      revenue: [
        makeRanking("Product A", "Stripe", 500),
        makeRanking("Ungrouped Thing", "Gumroad", 300),
      ],
    };

    const productMetrics = makeProductMetrics({
      "proj-1": { label: "Product A", accountId: "acc-1" },
      "proj-3": { label: "Ungrouped Thing", accountId: "acc-2" },
    });

    const result = applyProjectGroupMerging(rankings, lookup, productMetrics);

    expect(result.revenue).toHaveLength(2);
    expect(result.revenue[0].label).toBe("Grouped Product");
    expect(result.revenue[0].value).toBe(500);
    expect(result.revenue[1].label).toBe("Ungrouped Thing");
    expect(result.revenue[1].value).toBe(300);
  });

  it("should handle multiple groups across metric types", () => {
    const accountIntegrationMap = new Map([
      ["acc-1", "Stripe"],
      ["acc-2", "Gumroad"],
      ["acc-3", "Stripe"],
    ]);

    const groups = [
      makeGroup("grp-1", "CSS Pro", [
        { accountId: "acc-1", projectId: "proj-1", integrationId: "stripe" },
        { accountId: "acc-2", projectId: "proj-2", integrationId: "gumroad" },
      ]),
      makeGroup("grp-2", "Drawing Tool", [
        { accountId: "acc-3", projectId: "proj-3", integrationId: "stripe" },
      ]),
    ];

    const lookup = buildGroupLookup(groups, accountIntegrationMap);

    const rankings: Record<string, RankingEntry[]> = {
      revenue: [
        makeRanking("CSS Stripe", "Stripe", 500),
        makeRanking("CSS Gumroad", "Gumroad", 300),
        makeRanking("Draw Stripe", "Stripe", 200),
      ],
      active_subscriptions: [
        makeRanking("CSS Stripe", "Stripe", 100),
        makeRanking("CSS Gumroad", "Gumroad", 50),
        makeRanking("Draw Stripe", "Stripe", 80),
      ],
    };

    const productMetrics = makeProductMetrics({
      "proj-1": { label: "CSS Stripe", accountId: "acc-1" },
      "proj-2": { label: "CSS Gumroad", accountId: "acc-2" },
      "proj-3": { label: "Draw Stripe", accountId: "acc-3" },
    });

    const result = applyProjectGroupMerging(rankings, lookup, productMetrics);

    // Revenue: CSS Pro (800), Drawing Tool (200)
    expect(result.revenue).toHaveLength(2);
    expect(result.revenue[0].label).toBe("CSS Pro");
    expect(result.revenue[0].value).toBe(800);
    expect(result.revenue[1].label).toBe("Drawing Tool");
    expect(result.revenue[1].value).toBe(200);

    // Active subs: CSS Pro (150), Drawing Tool (80)
    expect(result.active_subscriptions).toHaveLength(2);
    expect(result.active_subscriptions[0].label).toBe("CSS Pro");
    expect(result.active_subscriptions[0].value).toBe(150);
    expect(result.active_subscriptions[1].label).toBe("Drawing Tool");
    expect(result.active_subscriptions[1].value).toBe(80);
  });

  it("should merge mix of product-level and account-level entries in same group", () => {
    const accountIntegrationMap = new Map([
      ["acc-1", "Stripe"],
      ["acc-2", "Gumroad"],
    ]);

    // Stripe is account-level (no products), Gumroad has a product
    const groups = [
      makeGroup("grp-1", "My Product", [
        { accountId: "acc-1", projectId: null, integrationId: "stripe" },
        { accountId: "acc-2", projectId: "proj-1", integrationId: "gumroad" },
      ]),
    ];

    const lookup = buildGroupLookup(groups, accountIntegrationMap);

    const rankings: Record<string, RankingEntry[]> = {
      revenue: [
        makeRanking("My Stripe Account", "Stripe", 500),
        makeRanking("Gumroad Product", "Gumroad", 300),
      ],
    };

    const productMetrics = makeProductMetrics({
      "proj-1": { label: "Gumroad Product", accountId: "acc-2" },
    });

    const accountLabels: Record<string, string> = {
      "acc-1": "My Stripe Account",
      "acc-2": "My Gumroad Account",
    };

    const result = applyProjectGroupMerging(rankings, lookup, productMetrics, accountLabels);

    expect(result.revenue).toHaveLength(1);
    expect(result.revenue[0].label).toBe("My Product");
    expect(result.revenue[0].value).toBe(800);
    expect(result.revenue[0].integrationNames).toEqual(["Stripe", "Gumroad"]);
  });
});
