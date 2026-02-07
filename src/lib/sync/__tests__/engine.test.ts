import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestDb } from "../../db";
import { accounts, metrics, syncLogs } from "../../db/schema";
import {
  registerIntegration,
  resetRegistry,
} from "../../../integrations/registry";
import { syncAccount, syncAllAccounts, getAccountSyncStatus } from "../engine";
import type { IntegrationDefinition } from "../../../integrations/types";

function createMockIntegration(
  overrides: Partial<IntegrationDefinition> & {
    syncFn?: IntegrationDefinition["fetcher"]["sync"];
  } = {}
): IntegrationDefinition {
  const { syncFn, ...rest } = overrides;
  return {
    id: "mock-integration",
    name: "Mock Integration",
    description: "A mock integration for testing",
    icon: "TestTube",
    color: "#000000",
    credentials: [{ key: "api_key", label: "API Key", type: "password" }],
    metricTypes: [
      {
        key: "revenue",
        label: "Revenue",
        format: "currency",
        description: "Revenue",
      },
    ],
    fetcher: {
      sync:
        syncFn ||
        (async () => ({
          success: true,
          recordsProcessed: 5,
          metrics: [
            {
              metricType: "revenue",
              value: 100,
              currency: "USD",
              date: "2026-02-01",
            },
            {
              metricType: "revenue",
              value: 200,
              currency: "USD",
              date: "2026-02-02",
            },
          ],
        })),
      validateCredentials: async () => true,
    },
    widgets: [],
    ...rest,
  };
}

describe("Sync Engine", () => {
  let db: ReturnType<typeof createTestDb>["db"];
  let sqlite: ReturnType<typeof createTestDb>["sqlite"];

  beforeEach(() => {
    const result = createTestDb();
    db = result.db;
    sqlite = result.sqlite;
    resetRegistry();
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("syncAccount", () => {
    it("should sync an account and store metrics", async () => {
      registerIntegration(createMockIntegration());

      const now = new Date().toISOString();
      db.insert(accounts)
        .values({
          id: "acc-1",
          integrationId: "mock-integration",
          label: "Test Account",
          credentials: JSON.stringify({ api_key: "test-key" }),
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const result = await syncAccount("acc-1", db as any);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(5);

      // Check metrics were stored
      const storedMetrics = db.select().from(metrics).all();
      expect(storedMetrics).toHaveLength(2);
      expect(storedMetrics[0].metricType).toBe("revenue");
      expect(storedMetrics[0].value).toBe(100);
    });

    it("should create sync log entries", async () => {
      registerIntegration(createMockIntegration());

      const now = new Date().toISOString();
      db.insert(accounts)
        .values({
          id: "acc-1",
          integrationId: "mock-integration",
          label: "Test Account",
          credentials: JSON.stringify({ api_key: "test-key" }),
          createdAt: now,
          updatedAt: now,
        })
        .run();

      await syncAccount("acc-1", db as any);

      const logs = db.select().from(syncLogs).all();
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe("success");
      expect(logs[0].recordsProcessed).toBe(5);
    });

    it("should return error for nonexistent account", async () => {
      const result = await syncAccount("nonexistent", db as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Account not found");
    });

    it("should return error for inactive account", async () => {
      const now = new Date().toISOString();
      db.insert(accounts)
        .values({
          id: "acc-1",
          integrationId: "mock-integration",
          label: "Inactive",
          credentials: "{}",
          isActive: false,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const result = await syncAccount("acc-1", db as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Account is inactive");
    });

    it("should return error for unknown integration", async () => {
      const now = new Date().toISOString();
      db.insert(accounts)
        .values({
          id: "acc-1",
          integrationId: "nonexistent-integration",
          label: "Test",
          credentials: "{}",
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const result = await syncAccount("acc-1", db as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should handle failed sync from fetcher", async () => {
      registerIntegration(
        createMockIntegration({
          syncFn: async () => ({
            success: false,
            recordsProcessed: 0,
            metrics: [],
            error: "API rate limit exceeded",
          }),
        })
      );

      const now = new Date().toISOString();
      db.insert(accounts)
        .values({
          id: "acc-1",
          integrationId: "mock-integration",
          label: "Test",
          credentials: JSON.stringify({ api_key: "test" }),
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const result = await syncAccount("acc-1", db as any);

      expect(result.success).toBe(false);
      expect(result.error).toBe("API rate limit exceeded");

      // Sync log should reflect the error
      const logs = db.select().from(syncLogs).all();
      expect(logs[0].status).toBe("error");
      expect(logs[0].error).toBe("API rate limit exceeded");
    });

    it("should upsert metrics (update existing for same account+type+date)", async () => {
      registerIntegration(createMockIntegration());

      const now = new Date().toISOString();
      db.insert(accounts)
        .values({
          id: "acc-1",
          integrationId: "mock-integration",
          label: "Test",
          credentials: JSON.stringify({ api_key: "test" }),
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // Sync twice — metrics should be upserted, not duplicated
      await syncAccount("acc-1", db as any);
      await syncAccount("acc-1", db as any);

      const storedMetrics = db.select().from(metrics).all();
      expect(storedMetrics).toHaveLength(2); // Still only 2, not 4
    });
  });

  describe("syncAllAccounts", () => {
    it("should sync all active accounts", async () => {
      registerIntegration(createMockIntegration());

      const now = new Date().toISOString();
      db.insert(accounts)
        .values([
          {
            id: "acc-1",
            integrationId: "mock-integration",
            label: "Account 1",
            credentials: JSON.stringify({ api_key: "key1" }),
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "acc-2",
            integrationId: "mock-integration",
            label: "Account 2",
            credentials: JSON.stringify({ api_key: "key2" }),
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "acc-3",
            integrationId: "mock-integration",
            label: "Inactive",
            credentials: JSON.stringify({ api_key: "key3" }),
            isActive: false,
            createdAt: now,
            updatedAt: now,
          },
        ])
        .run();

      const { results } = await syncAllAccounts(db as any);

      // Only active accounts are synced
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe("getAccountSyncStatus", () => {
    it("should return the last sync log for an account", async () => {
      registerIntegration(createMockIntegration());

      const now = new Date().toISOString();
      db.insert(accounts)
        .values({
          id: "acc-1",
          integrationId: "mock-integration",
          label: "Test",
          credentials: JSON.stringify({ api_key: "test" }),
          createdAt: now,
          updatedAt: now,
        })
        .run();

      await syncAccount("acc-1", db as any);

      const status = getAccountSyncStatus("acc-1", db as any);
      expect(status).toBeDefined();
      expect(status?.status).toBe("success");
    });

    it("should return undefined for account with no syncs", () => {
      const status = getAccountSyncStatus("nonexistent", db as any);
      expect(status).toBeUndefined();
    });
  });
});
