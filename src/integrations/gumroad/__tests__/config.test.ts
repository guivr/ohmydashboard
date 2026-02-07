import { describe, it, expect } from "vitest";
import {
  GUMROAD_ID,
  GUMROAD_NAME,
  GUMROAD_COLOR,
  gumroadCredentials,
  gumroadMetricTypes,
  gumroadPermissions,
} from "../config";

describe("Gumroad Config", () => {
  it("should have correct integration identifiers", () => {
    expect(GUMROAD_ID).toBe("gumroad");
    expect(GUMROAD_NAME).toBe("Gumroad");
    expect(GUMROAD_COLOR).toBe("#FF90E8");
  });

  describe("credentials", () => {
    it("should require exactly one credential field", () => {
      expect(gumroadCredentials).toHaveLength(1);
    });

    it("should require an access_token as password", () => {
      const tokenField = gumroadCredentials[0];
      expect(tokenField.key).toBe("access_token");
      expect(tokenField.type).toBe("password");
      expect(tokenField.required).toBe(true);
    });

    it("should have a help URL pointing to Gumroad settings", () => {
      expect(gumroadCredentials[0].helpUrl).toContain("gumroad.com");
    });
  });

  describe("metric types", () => {
    it("should define all expected metric types", () => {
      const keys = gumroadMetricTypes.map((m) => m.key);
      expect(keys).toContain("revenue");
      expect(keys).toContain("subscription_revenue");
      expect(keys).toContain("one_time_revenue");
      expect(keys).toContain("sales_count");
      expect(keys).toContain("products_count");
      expect(keys).toContain("active_subscriptions");
    });

    it("should format revenue metrics as currency", () => {
      const currencyMetrics = gumroadMetricTypes.filter(
        (m) => m.format === "currency"
      );
      const currencyKeys = currencyMetrics.map((m) => m.key);
      expect(currencyKeys).toContain("revenue");
      expect(currencyKeys).toContain("subscription_revenue");
      expect(currencyKeys).toContain("one_time_revenue");
    });

    it("should format count metrics as number", () => {
      const sales = gumroadMetricTypes.find(
        (m) => m.key === "sales_count"
      );
      expect(sales?.format).toBe("number");

      const subs = gumroadMetricTypes.find(
        (m) => m.key === "active_subscriptions"
      );
      expect(subs?.format).toBe("number");
    });
  });

  describe("permissions", () => {
    it("should declare permissions for products, sales, subscribers, and user", () => {
      const resources = gumroadPermissions.map((p) => p.resource);
      expect(resources).toContain("products");
      expect(resources).toContain("sales");
      expect(resources).toContain("subscribers");
      expect(resources).toContain("user");
    });

    it("should require only read access", () => {
      for (const perm of gumroadPermissions) {
        expect(perm.access).toBe("read");
      }
    });

    it("should have a reason for every permission", () => {
      for (const perm of gumroadPermissions) {
        expect(perm.reason).toBeTruthy();
        expect(perm.reason.length).toBeGreaterThan(0);
      }
    });
  });


});
