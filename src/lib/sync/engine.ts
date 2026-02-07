import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { accounts, metrics, syncLogs } from "../db/schema";
import type * as schema from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getIntegration } from "../../integrations/registry";
import type { NormalizedMetric, SyncStep } from "../../integrations/types";
import { getDb } from "../db";
import { decrypt, isEncrypted } from "../crypto";
import { generateSecureId, sanitizeErrorMessage } from "../security";

type Db = BetterSQLite3Database<typeof schema>;

/**
 * Decrypt stored credentials.
 * Handles both encrypted (new) and plaintext JSON (legacy) formats gracefully.
 */
function decryptCredentials(stored: string): Record<string, string> {
  if (isEncrypted(stored)) {
    return JSON.parse(decrypt(stored));
  }
  // Legacy: plaintext JSON — parse directly
  return JSON.parse(stored);
}

/**
 * Sync data for a specific account.
 * Fetches data from the integration's API and stores it in the database.
 *
 * @param accountId - The account to sync
 * @param db - Optional database instance (defaults to getDb(), useful for testing)
 */
export async function syncAccount(
  accountId: string,
  db?: Db
): Promise<{
  success: boolean;
  recordsProcessed: number;
  error?: string;
  steps?: SyncStep[];
}> {
  const database = db || (getDb() as unknown as Db);

  // Get the account
  const account = database
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();

  if (!account) {
    return { success: false, recordsProcessed: 0, error: "Account not found" };
  }

  if (!account.isActive) {
    return {
      success: false,
      recordsProcessed: 0,
      error: "Account is inactive",
    };
  }

  // Get the integration definition
  const integration = getIntegration(account.integrationId);
  if (!integration) {
    return {
      success: false,
      recordsProcessed: 0,
      error: `Integration "${account.integrationId}" not found`,
    };
  }

  // Create a sync log entry
  const syncLogId = generateSecureId();
  const startedAt = new Date().toISOString();

  database
    .insert(syncLogs)
    .values({
      id: syncLogId,
      accountId,
      status: "running",
      startedAt,
    })
    .run();

  try {
    // Get last successful sync date for incremental sync
    const lastSync = database
      .select()
      .from(syncLogs)
      .where(
        and(
          eq(syncLogs.accountId, accountId),
          eq(syncLogs.status, "success")
        )
      )
      .orderBy(syncLogs.startedAt)
      .limit(1)
      .get();

    const since = lastSync?.completedAt
      ? new Date(lastSync.completedAt)
      : undefined;

    // Decrypt credentials before passing to the fetcher
    const credentials = decryptCredentials(account.credentials);

    // Run the integration's fetcher
    const result = await integration.fetcher.sync(
      {
        id: account.id,
        integrationId: account.integrationId,
        label: account.label,
        credentials,
      },
      since
    );

    if (!result.success) {
      const safeError = result.error
        ? sanitizeErrorMessage(result.error)
        : "Sync failed";

      database
        .update(syncLogs)
        .set({
          status: "error",
          completedAt: new Date().toISOString(),
          error: safeError,
          recordsProcessed: 0,
        })
        .where(eq(syncLogs.id, syncLogId))
        .run();

      return {
        success: false,
        recordsProcessed: 0,
        error: safeError,
        steps: result.steps,
      };
    }

    // Store normalized metrics
    if (result.metrics.length > 0) {
      storeMetrics(database, accountId, result.metrics);
    }

    // Mark sync as successful
    database
      .update(syncLogs)
      .set({
        status: "success",
        completedAt: new Date().toISOString(),
        recordsProcessed: result.recordsProcessed,
      })
      .where(eq(syncLogs.id, syncLogId))
      .run();

    return {
      success: true,
      recordsProcessed: result.recordsProcessed,
      steps: result.steps,
    };
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "Unknown error";
    const safeError = sanitizeErrorMessage(rawMessage);

    database
      .update(syncLogs)
      .set({
        status: "error",
        completedAt: new Date().toISOString(),
        error: safeError,
      })
      .where(eq(syncLogs.id, syncLogId))
      .run();

    return {
      success: false,
      recordsProcessed: 0,
      error: safeError,
    };
  }
}

/**
 * Store normalized metrics in the database.
 * Uses upsert logic — for the same account + metric_type + date,
 * the most recent value wins.
 */
function storeMetrics(
  db: Db,
  accountId: string,
  newMetrics: NormalizedMetric[]
): void {
  const now = new Date().toISOString();

  for (const metric of newMetrics) {
    // Check if we already have this metric for this account + type + date
    const existing = db
      .select()
      .from(metrics)
      .where(
        and(
          eq(metrics.accountId, accountId),
          eq(metrics.metricType, metric.metricType),
          eq(metrics.date, metric.date)
        )
      )
      .get();

    if (existing) {
      // Update existing metric
      db.update(metrics)
        .set({
          value: metric.value,
          currency: metric.currency || null,
          metadata: JSON.stringify(metric.metadata || {}),
        })
        .where(eq(metrics.id, existing.id))
        .run();
    } else {
      // Insert new metric
      db.insert(metrics)
        .values({
          id: generateSecureId(),
          accountId,
          projectId: metric.projectId || null,
          metricType: metric.metricType,
          value: metric.value,
          currency: metric.currency || null,
          date: metric.date,
          metadata: JSON.stringify(metric.metadata || {}),
          createdAt: now,
        })
        .run();
    }
  }
}

/**
 * Sync all active accounts.
 */
export async function syncAllAccounts(
  db?: Db
): Promise<{
  results: Array<{
    accountId: string;
    label: string;
    success: boolean;
    recordsProcessed: number;
    error?: string;
    steps?: SyncStep[];
  }>;
}> {
  const database = db || (getDb() as unknown as Db);

  const activeAccounts = database
    .select()
    .from(accounts)
    .where(eq(accounts.isActive, true))
    .all();

  const results = [];

  for (const account of activeAccounts) {
    const result = await syncAccount(account.id, database);
    results.push({
      accountId: account.id,
      label: account.label,
      ...result,
    });
  }

  return { results };
}

/**
 * Get the sync status for an account (last sync log).
 */
export function getAccountSyncStatus(accountId: string, db?: Db) {
  const database = db || (getDb() as unknown as Db);

  return database
    .select()
    .from(syncLogs)
    .where(eq(syncLogs.accountId, accountId))
    .orderBy(syncLogs.startedAt)
    .limit(1)
    .get();
}
