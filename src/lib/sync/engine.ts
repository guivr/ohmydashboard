import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { accounts, metrics, projects, syncLogs } from "../db/schema";
import type * as schema from "../db/schema";
import { eq, and, isNull, desc, ne } from "drizzle-orm";
import { getIntegration } from "../../integrations/registry";
import type { NormalizedMetric, SyncStep } from "../../integrations/types";
import { getDb } from "../db";
import { decrypt, isEncrypted } from "../crypto";
import { generateSecureId, sanitizeErrorMessage } from "../security";
import {
  appendSyncStep,
  finalizeSyncProgress,
  startSyncProgress,
} from "./progress";

type Db = BetterSQLite3Database<typeof schema>;
const RUNNING_SYNC_TTL_MS = 10 * 60 * 1000;

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
 * @param options.fullSync - When true, ignore incremental cursor and fetch all data
 *   from scratch. Useful when metric types are added and old dates need backfilling.
 */
export async function syncAccount(
  accountId: string,
  db?: Db,
  options?: { fullSync?: boolean; from?: Date }
): Promise<{
  success: boolean;
  recordsProcessed: number;
  error?: string;
  steps?: SyncStep[];
  startedAt?: string;
  completedAt?: string;
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

  // Prevent overlapping syncs for the same account.
  const runningLog = database
    .select()
    .from(syncLogs)
    .where(and(eq(syncLogs.accountId, accountId), eq(syncLogs.status, "running")))
    .orderBy(desc(syncLogs.startedAt))
    .limit(1)
    .get();

  if (runningLog) {
    const startedAtMs = Date.parse(runningLog.startedAt);
    const nowMs = Date.now();
    if (!Number.isNaN(startedAtMs) && nowMs - startedAtMs < RUNNING_SYNC_TTL_MS) {
      return {
        success: false,
        recordsProcessed: 0,
        error: "Sync already running",
      };
    }

    // Mark stale running syncs as errored so a new sync can proceed.
    const completedAt = new Date().toISOString();
    database
      .update(syncLogs)
      .set({
        status: "error",
        completedAt,
        error: "Stale running sync detected",
      })
      .where(eq(syncLogs.id, runningLog.id))
      .run();
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
    startSyncProgress(accountId);
    // Get last successful sync date for incremental sync (skip if fullSync)
    let since: Date | undefined;
    if (options?.from) {
      since = options.from;
    } else if (!options?.fullSync) {
      const lastSync = database
        .select()
        .from(syncLogs)
        .where(
          and(
            eq(syncLogs.accountId, accountId),
            eq(syncLogs.status, "success")
          )
        )
        .orderBy(desc(syncLogs.startedAt))
        .limit(1)
        .get();

      since = lastSync?.completedAt
        ? new Date(lastSync.completedAt)
        : undefined;
    }

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
      since,
      (step) => appendSyncStep(accountId, step)
    );

    if (!result.success) {
      const safeError = result.error
        ? sanitizeErrorMessage(result.error)
        : "Sync failed";

      const completedAt = new Date().toISOString();

      database
        .update(syncLogs)
        .set({
          status: "error",
          completedAt,
          error: safeError,
          recordsProcessed: 0,
        })
        .where(eq(syncLogs.id, syncLogId))
        .run();

      finalizeSyncProgress(accountId, {
        success: false,
        recordsProcessed: 0,
        error: safeError,
        completedAt,
        steps: result.steps,
      });

      return {
        success: false,
        recordsProcessed: 0,
        error: safeError,
        steps: result.steps,
        startedAt,
        completedAt,
      };
    }

    // Store normalized metrics
    if (result.metrics.length > 0) {
      storeMetrics(database, accountId, result.metrics);
    }

    // Mark sync as successful
    const completedAt = new Date().toISOString();

    database
      .update(syncLogs)
      .set({
        status: "success",
        completedAt,
        recordsProcessed: result.recordsProcessed,
      })
      .where(eq(syncLogs.id, syncLogId))
      .run();

    finalizeSyncProgress(accountId, {
      success: true,
      recordsProcessed: result.recordsProcessed,
      completedAt,
      steps: result.steps,
    });

    return {
      success: true,
      recordsProcessed: result.recordsProcessed,
      steps: result.steps,
      startedAt,
      completedAt,
    };
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "Unknown error";
    const safeError = sanitizeErrorMessage(rawMessage);
    const completedAt = new Date().toISOString();

    database
      .update(syncLogs)
      .set({
        status: "error",
        completedAt,
        error: safeError,
      })
      .where(eq(syncLogs.id, syncLogId))
      .run();

    finalizeSyncProgress(accountId, {
      success: false,
      recordsProcessed: 0,
      error: safeError,
      completedAt,
    });

    return {
      success: false,
      recordsProcessed: 0,
      error: safeError,
      startedAt,
      completedAt,
    };
  }
}

/**
 * Ensure project rows exist for all referenced projectIds.
 * Uses an in-memory cache to avoid redundant queries within a single sync.
 */
function ensureProjects(
  db: Db,
  accountId: string,
  metricsWithProjects: NormalizedMetric[]
): void {
  // Collect unique projectIds with their labels
  const projectMap = new Map<string, string>();
  for (const metric of metricsWithProjects) {
    if (metric.projectId && !projectMap.has(metric.projectId)) {
      projectMap.set(metric.projectId, metric.metadata?.product_name || metric.projectId);
    }
  }

  if (projectMap.size === 0) return;

  const now = new Date().toISOString();

  // Check which projects already exist (single query)
  const existingIds = new Set(
    db.select({ id: projects.id }).from(projects).all().map((p) => p.id)
  );

  // Insert only the new ones
  for (const [projectId, label] of projectMap) {
    if (!existingIds.has(projectId)) {
      db.insert(projects)
        .values({
          id: projectId,
          accountId,
          label,
          filters: "{}",
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  }
}

/**
 * Store normalized metrics in the database.
 * Uses upsert logic — for the same account + metric_type + date + project,
 * the most recent value wins.
 *
 * When a metric has a projectId, the dedup key includes it so that
 * per-product metrics don't collide with each other or with account-level totals.
 *
 * Performance: Uses prepared statements and a project cache to minimize
 * database round-trips. The dedup SELECT uses the idx_metrics_dedup index.
 */
function storeMetrics(
  db: Db,
  accountId: string,
  newMetrics: NormalizedMetric[]
): void {
  const now = new Date().toISOString();

  // Batch-ensure all referenced projects first (single pass)
  ensureProjects(db, accountId, newMetrics);

  for (const metric of newMetrics) {
    const resolvedProjectId = metric.projectId || null;
    const metadataJson = JSON.stringify(metric.metadata || {});

    // Build dedup conditions — projectId is part of the key
    const conditions = [
      eq(metrics.accountId, accountId),
      eq(metrics.metricType, metric.metricType),
      eq(metrics.date, metric.date),
    ];
    if (resolvedProjectId) {
      conditions.push(eq(metrics.projectId, resolvedProjectId));
    } else {
      conditions.push(isNull(metrics.projectId));
    }

    const existing = db
      .select({ id: metrics.id })
      .from(metrics)
      .where(and(...conditions))
      .get();

    if (existing) {
      db.update(metrics)
        .set({
          value: metric.value,
          currency: metric.currency || null,
          projectId: resolvedProjectId,
          metadata: metadataJson,
        })
        .where(eq(metrics.id, existing.id))
        .run();

      // Clean up any legacy duplicates for the same key.
      db.delete(metrics)
        .where(
          and(
            ...conditions,
            ne(metrics.id, existing.id)
          )
        )
        .run();
    } else {
      db.insert(metrics)
        .values({
          id: generateSecureId(),
          accountId,
          projectId: resolvedProjectId,
          metricType: metric.metricType,
          value: metric.value,
          currency: metric.currency || null,
          date: metric.date,
          metadata: metadataJson,
          createdAt: now,
        })
        .run();
    }
  }
}

/**
 * Sync all active accounts.
 *
 * @param db - Optional database instance
 * @param options.fullSync - When true, all accounts do a full re-sync
 */
export async function syncAllAccounts(
  db?: Db,
  options?: { fullSync?: boolean; from?: Date }
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
    const result = await syncAccount(account.id, database, options);
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
    .orderBy(desc(syncLogs.startedAt))
    .limit(1)
    .get();
}
