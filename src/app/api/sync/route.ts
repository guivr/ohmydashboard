import { NextResponse } from "next/server";
import { syncAccount, syncAllAccounts, getAccountSyncStatus } from "@/lib/sync/engine";
import { getSyncProgress } from "@/lib/sync/progress";
import { loadAllIntegrations } from "@/integrations/registry";
import { validateCsrf, validateAccountId } from "@/lib/security";

let loaded = false;
async function ensureLoaded() {
  if (!loaded) {
    await loadAllIntegrations();
    loaded = true;
  }
}

/**
 * Simple in-memory rate limiter for sync operations.
 * Prevents hammering external APIs.
 */
const SYNC_COOLDOWN_MS = 60_000; // 1 minute
let lastSyncAllAt = 0;
const lastSyncByAccount = new Map<string, number>();

function checkSyncCooldown(accountId?: string): string | null {
  const now = Date.now();

  if (accountId) {
    const lastSync = lastSyncByAccount.get(accountId) || 0;
    if (now - lastSync < SYNC_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil(
        (SYNC_COOLDOWN_MS - (now - lastSync)) / 1000
      );
      return `Sync cooldown: please wait ${remainingSeconds}s before syncing this account again`;
    }
  } else {
    if (now - lastSyncAllAt < SYNC_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil(
        (SYNC_COOLDOWN_MS - (now - lastSyncAllAt)) / 1000
      );
      return `Sync cooldown: please wait ${remainingSeconds}s before syncing all accounts again`;
    }
  }

  return null;
}

function recordSync(accountId?: string) {
  const now = Date.now();
  if (accountId) {
    lastSyncByAccount.set(accountId, now);
  } else {
    lastSyncAllAt = now;
  }
}

/**
 * POST /api/sync
 * Trigger a sync for a specific account or all accounts.
 *
 * Body: { accountId?: string }
 * - If accountId is provided, sync only that account.
 * - If omitted, sync all active accounts.
 */
export async function POST(request: Request) {
  // CSRF check
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  await ensureLoaded();

  const body = await request.json().catch(() => ({}));
  const fromDate =
    typeof body.from === "string" ? new Date(body.from) : undefined;
  if (fromDate && Number.isNaN(fromDate.getTime())) {
    return NextResponse.json(
      { error: "Invalid from date" },
      { status: 400 }
    );
  }

  if (body.accountId) {
    // Validate accountId
    const accountIdError = validateAccountId(body.accountId);
    if (accountIdError) {
      return NextResponse.json(
        { error: accountIdError.message },
        { status: 400 }
      );
    }

    // Rate limit check
    const cooldownError = checkSyncCooldown(body.accountId);
    if (cooldownError) {
      return NextResponse.json({ error: cooldownError }, { status: 429 });
    }

    const syncOptions = body.fullSync
      ? { fullSync: true, from: fromDate }
      : fromDate
        ? { from: fromDate }
        : undefined;
    const result = await syncAccount(body.accountId, undefined, syncOptions);
    recordSync(body.accountId);
    return NextResponse.json(result);
  }

  // Rate limit check for sync-all
  const cooldownError = checkSyncCooldown();
  if (cooldownError) {
    return NextResponse.json({ error: cooldownError }, { status: 429 });
  }

  const syncOptions = body.fullSync
    ? { fullSync: true, from: fromDate }
    : fromDate
      ? { from: fromDate }
      : undefined;
  const results = await syncAllAccounts(undefined, syncOptions);
  recordSync();
  return NextResponse.json(results);
}

/**
 * GET /api/sync?accountId=...&progress=1
 * - progress=1: returns live progress steps for an account, if available
 * - otherwise: returns latest sync log data for an account
 */
export async function GET(request: Request) {
  // CSRF check
  const csrfError = validateCsrf(request);
  if (csrfError) return csrfError;

  await ensureLoaded();

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId");
  const wantProgress = searchParams.get("progress") === "1";

  if (!accountId) {
    return NextResponse.json(
      { error: "accountId is required" },
      { status: 400 }
    );
  }

  const accountIdError = validateAccountId(accountId);
  if (accountIdError) {
    return NextResponse.json(
      { error: accountIdError.message },
      { status: 400 }
    );
  }

  if (wantProgress) {
    const progress = getSyncProgress(accountId);
    return NextResponse.json({ progress: progress || null });
  }

  const status = getAccountSyncStatus(accountId);
  if (!status) {
    return NextResponse.json({ status: null });
  }

  return NextResponse.json({ status });
}
