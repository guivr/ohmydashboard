import { describe, it, expect } from "vitest";
import {
  STRIPE_ID,
  STRIPE_NAME,
  stripeCredentials,
  stripeMetricTypes,
  stripePermissions,
} from "../config";

describe("Stripe Config", () => {
  it("should have correct integration ID", () => {
    expect(STRIPE_ID).toBe("stripe");
  });

  it("should have correct name", () => {
    expect(STRIPE_NAME).toBe("Stripe");
  });

  it("should require a secret key credential", () => {
    expect(stripeCredentials).toHaveLength(1);
    expect(stripeCredentials[0].key).toBe("secret_key");
    expect(stripeCredentials[0].type).toBe("password");
    expect(stripeCredentials[0].required).toBe(true);
  });

  it("should have help URL for credential", () => {
    expect(stripeCredentials[0].helpUrl).toContain("stripe.com");
  });

  it("should define expected metric types", () => {
    const metricKeys = stripeMetricTypes.map((m) => m.key);
    expect(metricKeys).toContain("revenue");
    expect(metricKeys).toContain("mrr");
    expect(metricKeys).toContain("active_subscriptions");
    expect(metricKeys).toContain("new_customers");
    expect(metricKeys).toContain("charges_count");
    expect(metricKeys).toContain("refunds");
  });

  it("should declare required permissions for all accessed resources", () => {
    const resources = stripePermissions.map((p) => p.resource);
    expect(resources).toContain("charges");
    expect(resources).toContain("customers");
    expect(resources).toContain("subscriptions");
    expect(resources).toContain("balance");
  });

  it("should require only read access for all permissions", () => {
    for (const perm of stripePermissions) {
      expect(perm.access).toBe("read");
    }
  });

  it("should have a reason for each permission", () => {
    for (const perm of stripePermissions) {
      expect(perm.reason.length).toBeGreaterThan(0);
    }
  });

  it("should have correct format types for metric types", () => {
    const revenue = stripeMetricTypes.find((m) => m.key === "revenue");
    expect(revenue?.format).toBe("currency");

    const subs = stripeMetricTypes.find(
      (m) => m.key === "active_subscriptions"
    );
    expect(subs?.format).toBe("number");
  });
});
