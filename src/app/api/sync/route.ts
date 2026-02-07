import { NextResponse } from "next/server";
import { syncAccount, syncAllAccounts } from "@/lib/sync/engine";
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

    const result = await syncAccount(body.accountId);
    recordSync(body.accountId);
    return NextResponse.json(result);
  }

  // Rate limit check for sync-all
  const cooldownError = checkSyncCooldown();
  if (cooldownError) {
    return NextResponse.json({ error: cooldownError }, { status: 429 });
  }

  const results = await syncAllAccounts();
  recordSync();
  return NextResponse.json(results);
}
