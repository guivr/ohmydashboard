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
  updateSyncStep,
  finalizeSyncProgress,
  startSyncProgress,
} from "./progress";

type Db = BetterSQLite3Database<typeof schema>;
const RUNNING_SYNC_TTL_MS = 10 * 60 * 1000;

/**
 * In-memory lock to prevent concurrent syncs for the same account.
 * The DB-based "running" check has a TOCTOU gap — two requests can both
 * read "no running sync" before either inserts a row. This Set closes
 * that gap for the single-process case (which is the only deployment
 * model for this local-first app).
 */
const activeSyncs = new Set<string>();

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

  // ── Concurrency guard (in-memory + DB) ──
  // The in-memory Set prevents the TOCTOU gap where two concurrent requests
  // both read "no running sync" from the DB before either inserts a row.
  if (activeSyncs.has(accountId)) {
    return {
      success: false,
      recordsProcessed: 0,
      error: "Sync already running",
    };
  }

  // Also check the DB for stale "running" syncs from a previous process crash.
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

  // Acquire the lock before inserting the sync log row.
  activeSyncs.add(accountId);

  try {
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
        appendSyncStep(accountId, {
          key: "store_metrics",
          label: "Store metrics",
          status: "running",
          recordCount: result.metrics.length,
        });
        const storeT0 = Date.now();
        await storeMetrics(database, accountId, result.metrics);
        updateSyncStep(accountId, "store_metrics", {
          status: "success",
          durationMs: Date.now() - storeT0,
        });
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
  } finally {
    activeSyncs.delete(accountId);
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
 * Uses upsert logic — for the same account + metric_type + date + project +
 * metadata, the most recent value wins.
 *
 * When a metric has a projectId, the dedup key includes it so that
 * per-product metrics don't collide with each other or with account-level totals.
 *
 * Metadata is included in the dedup key so that metrics sub-keyed by metadata
 * (e.g. `new_customers_by_country` with `{ country: "US" }` vs `{ country: "DE" }`)
 * are stored as separate rows rather than overwriting each other.
 *
 * Performance: Uses prepared statements and a project cache to minimize
 * database round-trips. The dedup SELECT uses the idx_metrics_dedup index.
 */
/**
 * Process a batch of metrics inside a single transaction.
 */
function storeMetricsBatch(
  db: Db,
  accountId: string,
  batch: NormalizedMetric[]
): void {
  db.transaction((tx) => {
    const now = new Date().toISOString();

    // Batch-ensure all referenced projects first (single pass)
    ensureProjects(tx as unknown as Db, accountId, batch);

    for (const metric of batch) {
      const resolvedProjectId = metric.projectId || null;
      const metadataJson = JSON.stringify(metric.metadata || {});
      const isPendingMetric = metric.metadata?.pending === "true";

      // Build dedup conditions — projectId and metadata are part of the key.
      // Including metadata ensures metrics sub-keyed by metadata fields
      // (e.g. country) don't overwrite each other.
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
      conditions.push(eq(metrics.metadata, metadataJson));

      if (isPendingMetric) {
        const pendingDeleteConditions = [
          eq(metrics.accountId, accountId),
          eq(metrics.metricType, metric.metricType),
          eq(metrics.date, metric.date),
        ];
        if (resolvedProjectId) {
          pendingDeleteConditions.push(eq(metrics.projectId, resolvedProjectId));
        } else {
          pendingDeleteConditions.push(isNull(metrics.projectId));
        }
        tx.delete(metrics)
          .where(and(...pendingDeleteConditions))
          .run();
      }

      const existing = tx
        .select({ id: metrics.id })
        .from(metrics)
        .where(and(...conditions))
        .get();

      if (existing) {
        tx.update(metrics)
          .set({
            value: metric.value,
            currency: metric.currency || null,
            projectId: resolvedProjectId,
            metadata: metadataJson,
          })
          .where(eq(metrics.id, existing.id))
          .run();

        // Clean up any legacy duplicates for the same key.
        tx.delete(metrics)
          .where(
            and(
              ...conditions,
              ne(metrics.id, existing.id)
            )
          )
          .run();
      } else {
        tx.insert(metrics)
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
  });
}

const STORE_BATCH_SIZE = 100;

/**
 * Store normalized metrics in batched transactions, yielding to the event loop
 * between batches so progress polling requests can be served.
 */
async function storeMetrics(
  db: Db,
  accountId: string,
  newMetrics: NormalizedMetric[]
): Promise<void> {
  for (let i = 0; i < newMetrics.length; i += STORE_BATCH_SIZE) {
    storeMetricsBatch(db, accountId, newMetrics.slice(i, i + STORE_BATCH_SIZE));
    // Yield to the event loop so progress poll requests can be served
    if (i + STORE_BATCH_SIZE < newMetrics.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
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
