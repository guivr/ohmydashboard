import { describe, it, expect, afterEach } from "vitest";
import { createTestDb } from "../index";
import { accounts, projects, metrics, syncLogs, widgetConfigs } from "../schema";
import { eq } from "drizzle-orm";

function setup() {
  const { db, sqlite } = createTestDb();
  return { db, cleanup: () => sqlite.close() };
}

describe("Database", () => {
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  describe("accounts", () => {
    it("should create and retrieve an account", () => {
      const { db, cleanup: c } = setup();
      cleanup = c;

      const now = new Date().toISOString();
      db.insert(accounts).values({
        id: "acc-1",
        integrationId: "stripe",
        label: "My SaaS Stripe",
        credentials: JSON.stringify({ api_key: "sk_test_123" }),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }).run();

      const result = db.select().from(accounts).where(eq(accounts.id, "acc-1")).all();

      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("My SaaS Stripe");
      expect(result[0].integrationId).toBe("stripe");
      expect(JSON.parse(result[0].credentials)).toEqual({ api_key: "sk_test_123" });
    });

    it("should support multiple accounts for the same integration", () => {
      const { db, cleanup: c } = setup();
      cleanup = c;

      const now = new Date().toISOString();
      db.insert(accounts).values([
        {
          id: "acc-1",
          integrationId: "stripe",
          label: "SaaS Stripe",
          credentials: JSON.stringify({ api_key: "sk_test_1" }),
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "acc-2",
          integrationId: "stripe",
          label: "E-commerce Stripe",
          credentials: JSON.stringify({ api_key: "sk_test_2" }),
          createdAt: now,
          updatedAt: now,
        },
      ]).run();

      const result = db
        .select()
        .from(accounts)
        .where(eq(accounts.integrationId, "stripe"))
        .all();

      expect(result).toHaveLength(2);
    });

    it("should deactivate an account", () => {
      const { db, cleanup: c } = setup();
      cleanup = c;

      const now = new Date().toISOString();
      db.insert(accounts).values({
        id: "acc-1",
        integrationId: "stripe",
        label: "Test",
        credentials: "{}",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }).run();

      db.update(accounts)
        .set({ isActive: false, updatedAt: new Date().toISOString() })
        .where(eq(accounts.id, "acc-1"))
        .run();

      const result = db.select().from(accounts).where(eq(accounts.id, "acc-1")).all();
      expect(result[0].isActive).toBe(false);
    });
  });

  describe("projects", () => {
    it("should create a project under an account", () => {
      const { db, cleanup: c } = setup();
      cleanup = c;

      const now = new Date().toISOString();
      db.insert(accounts).values({
        id: "acc-1",
        integrationId: "stripe",
        label: "Test",
        credentials: "{}",
        createdAt: now,
        updatedAt: now,
      }).run();

      db.insert(projects).values({
        id: "proj-1",
        accountId: "acc-1",
        label: "Pro Plan Subscriptions",
        filters: JSON.stringify({ product_id: "prod_abc" }),
        createdAt: now,
        updatedAt: now,
      }).run();

      const result = db.select().from(projects).where(eq(projects.accountId, "acc-1")).all();
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe("Pro Plan Subscriptions");
    });

    it("should cascade delete projects when account is deleted", () => {
      const { db, cleanup: c } = setup();
      cleanup = c;

      const now = new Date().toISOString();
      db.insert(accounts).values({
        id: "acc-1",
        integrationId: "stripe",
        label: "Test",
        credentials: "{}",
        createdAt: now,
        updatedAt: now,
      }).run();

      db.insert(projects).values({
        id: "proj-1",
        accountId: "acc-1",
        label: "My Project",
        createdAt: now,
        updatedAt: now,
      }).run();

      db.delete(accounts).where(eq(accounts.id, "acc-1")).run();

      const result = db.select().from(projects).all();
      expect(result).toHaveLength(0);
    });
  });

  describe("metrics", () => {
    it("should store and query metrics by account", () => {
      const { db, cleanup: c } = setup();
      cleanup = c;

      const now = new Date().toISOString();
      db.insert(accounts).values({
        id: "acc-1",
        integrationId: "stripe",
        label: "Test",
        credentials: "{}",
        createdAt: now,
        updatedAt: now,
      }).run();

      db.insert(metrics).values([
        {
          id: "m-1",
          accountId: "acc-1",
          metricType: "revenue",
          value: 100.50,
          currency: "USD",
          date: "2026-02-01",
          createdAt: now,
        },
        {
          id: "m-2",
          accountId: "acc-1",
          metricType: "revenue",
          value: 250.00,
          currency: "USD",
          date: "2026-02-02",
          createdAt: now,
        },
      ]).run();

      const result = db
        .select()
        .from(metrics)
        .where(eq(metrics.accountId, "acc-1"))
        .all();

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe(100.50);
      expect(result[1].value).toBe(250.00);
    });

    it("should store non-monetary metrics", () => {
      const { db, cleanup: c } = setup();
      cleanup = c;

      const now = new Date().toISOString();
      db.insert(accounts).values({
        id: "acc-1",
        integrationId: "x",
        label: "X Account",
        credentials: "{}",
        createdAt: now,
        updatedAt: now,
      }).run();

      db.insert(metrics).values({
        id: "m-1",
        accountId: "acc-1",
        metricType: "followers",
        value: 15234,
        date: "2026-02-07",
        createdAt: now,
      }).run();

      const result = db.select().from(metrics).where(eq(metrics.id, "m-1")).all();
      expect(result[0].currency).toBeNull();
      expect(result[0].value).toBe(15234);
    });
  });

  describe("sync_logs", () => {
    it("should track sync status for an account", () => {
      const { db, cleanup: c } = setup();
      cleanup = c;

      const now = new Date().toISOString();
      db.insert(accounts).values({
        id: "acc-1",
        integrationId: "stripe",
        label: "Test",
        credentials: "{}",
        createdAt: now,
        updatedAt: now,
      }).run();

      db.insert(syncLogs).values({
        id: "sync-1",
        accountId: "acc-1",
        status: "success",
        startedAt: now,
        completedAt: now,
        recordsProcessed: 42,
      }).run();

      const result = db.select().from(syncLogs).where(eq(syncLogs.accountId, "acc-1")).all();
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("success");
      expect(result[0].recordsProcessed).toBe(42);
    });
  });

  describe("widget_configs", () => {
    it("should create and retrieve widget configurations", () => {
      const { db, cleanup: c } = setup();
      cleanup = c;

      const now = new Date().toISOString();
      db.insert(widgetConfigs).values({
        id: "w-1",
        widgetType: "metric_card",
        title: "Total Revenue",
        config: JSON.stringify({
          metricType: "revenue",
          aggregation: "sum",
        }),
        position: 0,
        size: "sm",
        createdAt: now,
        updatedAt: now,
      }).run();

      const result = db.select().from(widgetConfigs).all();
      expect(result).toHaveLength(1);
      expect(result[0].widgetType).toBe("metric_card");
      expect(result[0].size).toBe("sm");
    });
  });
});
