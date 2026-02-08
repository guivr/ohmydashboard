"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { apiGet, apiPost } from "@/lib/api-client";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  ChevronDown,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IntegrationLogo } from "@/components/integration-logo";

// --- Types ---

interface AccountToSync {
  id: string;
  label: string;
  integrationName: string;
}

interface SyncStepResult {
  key: string;
  label: string;
  status: "success" | "error" | "skipped";
  recordCount?: number;
  durationMs?: number;
  error?: string;
}

interface SyncResult {
  accountId: string;
  label: string;
  integrationName: string;
  success: boolean;
  recordsProcessed: number;
  error?: string;
  steps?: SyncStepResult[];
  startedAt?: string;
  completedAt?: string;
  lastSyncAt?: string;
}

/** Per-account status while syncing */
interface AccountSyncState {
  accountId: string;
  label: string;
  integrationName: string;
  status: "pending" | "syncing" | "done" | "error" | "cooldown";
  steps?: SyncStepResult[];
  recordsProcessed: number;
  error?: string;
  lastSyncAt?: string;
}

interface SyncStatusBarProps {
  /** List of accounts to sync, with their integration name for display */
  accounts: AccountToSync[];
  /** Called after each account syncs so the dashboard can refetch incrementally */
  onSyncComplete: () => void;
  /** If true, start syncing automatically on mount */
  autoSync?: boolean;
}

type SyncPhase =
  | { step: "idle" }
  | { step: "syncing"; currentIndex: number }
  | { step: "done"; elapsedMs: number }
  | { step: "error"; elapsedMs: number };

// --- Helpers ---

function formatElapsed(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

/** Compact duration for step-level display: "1.2s", "340ms" */
function formatStepDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatLastUpdated(iso: string): string {
  const updatedAt = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - updatedAt.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const datePart = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(updatedAt);
  const timePart = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(updatedAt);
  return `${datePart} ${timePart}`;
}

// --- Component ---

export function SyncStatusBar({
  accounts,
  onSyncComplete,
  autoSync = true,
}: SyncStatusBarProps) {
  const [phase, setPhase] = useState<SyncPhase>({ step: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const [accountStates, setAccountStates] = useState<AccountSyncState[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const hasSynced = useRef(false);
  const syncingRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const autoSyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasAccounts = accounts.length > 0;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

  const stopProgressPolling = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const runSync = useCallback(async (fullSync = false) => {
    if (syncingRef.current || accounts.length === 0) return;
    syncingRef.current = true;

    // Initialize account states as pending
    const initialStates: AccountSyncState[] = accounts.map((a) => ({
      accountId: a.id,
      label: a.label,
      integrationName: a.integrationName,
      status: "pending",
      recordsProcessed: 0,
    }));
    setAccountStates(initialStates);

    stopProgressPolling();
    progressTimerRef.current = setInterval(async () => {
      const syncingAccounts = accounts.filter(
        (account) =>
          accountStates.find((state) => state.accountId === account.id)
            ?.status === "syncing"
      );

      if (syncingAccounts.length === 0) return;

      await Promise.all(
        syncingAccounts.map(async (account) => {
          try {
            const data = await apiGet<{
              progress: {
                status: "running" | "success" | "error";
                steps?: SyncStepResult[];
              } | null;
            }>(`/api/sync?accountId=${account.id}&progress=1`);

            if (!data.progress || !data.progress.steps) return;

            setAccountStates((prev) =>
              prev.map((s) =>
                s.accountId === account.id
                  ? { ...s, steps: data.progress?.steps ?? s.steps }
                  : s
              )
            );
          } catch {
            // Ignore progress polling errors.
          }
        })
      );
    }, 800);

    // Start elapsed timer
    startTimeRef.current = Date.now();
    setElapsed(0);
    elapsedTimerRef.current = setInterval(() => {
      setElapsed(Date.now() - startTimeRef.current);
    }, 1000);

    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];

      // Mark this account as syncing
      setPhase({ step: "syncing", currentIndex: i });
      setAccountStates((prev) =>
        prev.map((s, idx) =>
          idx === i ? { ...s, status: "syncing" } : s
        )
      );

      try {
        const result = await apiPost<{
          success: boolean;
          recordsProcessed: number;
          error?: string;
          steps?: SyncStepResult[];
          startedAt?: string;
          completedAt?: string;
        }>("/api/sync", { accountId: account.id, ...(fullSync ? { fullSync: true } : {}) });

        setAccountStates((prev) =>
          prev.map((s, idx) =>
            idx === i
              ? {
                  ...s,
                  status: result.success ? "done" : "error",
                  steps: result.steps,
                  recordsProcessed: result.recordsProcessed,
                  error: result.error,
                  lastSyncAt: result.completedAt ?? result.startedAt,
                }
              : s
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Sync failed";
        const isCooldown = msg.includes("cooldown");
        let lastSyncAt: string | undefined;

        if (isCooldown) {
          try {
            const data = await apiGet<{
              status: { completedAt?: string; startedAt?: string } | null;
            }>(`/api/sync?accountId=${account.id}`);
            lastSyncAt = data.status?.completedAt ?? data.status?.startedAt;
          } catch {
            lastSyncAt = undefined;
          }
        }

        setAccountStates((prev) =>
          prev.map((s, idx) =>
            idx === i
              ? {
                  ...s,
                  status: isCooldown ? "cooldown" : "error",
                  recordsProcessed: 0,
                  error: isCooldown ? undefined : msg,
                  lastSyncAt,
                }
              : s
          )
        );
      }

      // Refetch data after each account
      onSyncComplete();
    }

    // Stop elapsed timer and capture final value
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
    stopProgressPolling();
    const totalElapsed = Date.now() - startTimeRef.current;

    // Use a callback to read the latest accountStates
    setAccountStates((current) => {
      const hasErrors = current.some((s) => s.status === "error");
      if (hasErrors) {
        setPhase({ step: "error", elapsedMs: totalElapsed });
      } else {
        setPhase({ step: "done", elapsedMs: totalElapsed });
      }
      return current;
    });

    syncingRef.current = false;
  }, [accounts, accountStates, onSyncComplete, stopProgressPolling]);

  // Auto-sync on first mount
  useEffect(() => {
    if (autoSync && hasAccounts && !hasSynced.current) {
      hasSynced.current = true;
      runSync();
    }
  }, [autoSync, hasAccounts, runSync]);

  // Auto-sync every 30 minutes while the page is open/visible
  useEffect(() => {
    if (!autoSync || !hasAccounts) return;

    if (autoSyncIntervalRef.current) {
      clearInterval(autoSyncIntervalRef.current);
      autoSyncIntervalRef.current = null;
    }

    autoSyncIntervalRef.current = setInterval(() => {
      if (document.visibilityState === "visible") {
        runSync();
      }
    }, 30 * 60 * 1000);

    return () => {
      if (autoSyncIntervalRef.current) {
        clearInterval(autoSyncIntervalRef.current);
        autoSyncIntervalRef.current = null;
      }
    };
  }, [autoSync, hasAccounts, runSync]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
      stopProgressPolling();
    };
  }, [stopProgressPolling]);

  if (!hasAccounts) return null;

  // --- Derived summary ---

  const totalRecords = accountStates.reduce(
    (s, a) => s + a.recordsProcessed,
    0
  );
  const failedCount = accountStates.filter((a) => a.status === "error").length;
  const isSyncing = phase.step === "syncing";
  const isDone = phase.step === "done" || phase.step === "error";

  const summaryText = (() => {
    if (isSyncing) {
      const current = accountStates.find((a) => a.status === "syncing");
      return current
        ? `Syncing ${current.label} (${current.integrationName})`
        : "Syncing...";
    }
    if (isDone) {
      if (totalRecords === 0 && failedCount === 0) {
        const latestSync = accountStates
          .map((a) => a.lastSyncAt)
          .filter(Boolean)
          .sort()
          .pop();
        if (latestSync) {
          return `Already up to date · Updated ${formatLastUpdated(latestSync)}`;
        }
        return "Already up to date";
      }
      if (failedCount > 0) {
        return `${failedCount} ${failedCount === 1 ? "account" : "accounts"} failed`;
      }
      // Group by integration
      const byIntegration = new Map<string, number>();
      for (const a of accountStates) {
        byIntegration.set(
          a.integrationName,
          (byIntegration.get(a.integrationName) ?? 0) + a.recordsProcessed
        );
      }
      const parts = Array.from(byIntegration)
        .filter(([, count]) => count > 0)
        .map(([name, count]) => `${count} from ${name}`);
      if (parts.length === 0) return "Already up to date";
      if (parts.length === 1) return `Synced ${parts[0]}`;
      return `Synced ${totalRecords} records (${parts.join(", ")})`;
    }
    return "";
  })();

  const isClickable = isSyncing || isDone;

  // --- Render ---

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center gap-3 text-xs">
        {/* Summary line — clickable when we have detail */}
        {(isSyncing || isDone) && (
          <button
            type="button"
            className={`flex items-center gap-1.5 text-muted-foreground ${
              isClickable
                ? "cursor-pointer rounded-md px-2 py-1 transition-colors hover:bg-muted/50"
                : ""
            }`}
            onClick={() => isClickable && setDropdownOpen((o) => !o)}
            disabled={!isClickable}
          >
            {isSyncing && (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            )}
            {phase.step === "done" && (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            )}
            {phase.step === "error" && (
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            )}

            <span>
              {summaryText}
              {isSyncing && (
                <>
                  <span className="ml-1.5 opacity-50">
                    {(phase as any).currentIndex + 1}/{accounts.length}
                  </span>
                  <span className="ml-1.5 tabular-nums opacity-40">
                    ({formatElapsed(elapsed)})
                  </span>
                </>
              )}
              {isDone && (
                <span className="ml-1.5 tabular-nums opacity-50">
                  ({formatElapsed((phase as any).elapsedMs)})
                </span>
              )}
            </span>

            {isClickable && (
              <ChevronDown
                className={`h-3 w-3 opacity-40 transition-transform ${
                  dropdownOpen ? "rotate-180" : ""
                }`}
              />
            )}
          </button>
        )}

        {/* Re-sync button */}
        {!isSyncing && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => runSync(false)}
          >
            <RefreshCw className="h-3 w-3" />
            {phase.step === "idle" ? "Sync now" : "Re-sync"}
          </Button>
        )}
      </div>

      {/* Dropdown — sync log todo list */}
      {dropdownOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-medium text-foreground">
              Sync log
            </span>
            {(() => {
              const latestSync = accountStates
                .map((a) => a.lastSyncAt)
                .filter(Boolean)
                .sort()
                .pop();
              return latestSync ? (
                <span className="text-[11px] text-muted-foreground/60">
                  {formatLastUpdated(latestSync)}
                </span>
              ) : null;
            })()}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {accountStates.map((account) => (
              <AccountSyncEntry key={account.accountId} account={account} />
            ))}
          </div>
          {/* Full re-sync option */}
          {!isSyncing && (
            <div className="border-t border-border px-3 py-2">
              <button
                type="button"
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                onClick={() => {
                  setDropdownOpen(false);
                  runSync(true);
                }}
              >
                <RefreshCw className="h-3 w-3" />
                Full re-sync
                <span className="ml-auto text-[10px] opacity-50">
                  Re-fetches all data
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Account entry in the dropdown ---

function AccountSyncEntry({ account }: { account: AccountSyncState }) {
  const {
    label,
    integrationName,
    status,
    steps,
    recordsProcessed,
    error,
    lastSyncAt,
  } = account;

  return (
    <div className="border-b border-border/50 last:border-b-0">
      {/* Account header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <IntegrationLogo integration={integrationName} size={14} />
        <span className="flex-1 truncate text-xs font-medium text-foreground">
          {label}
        </span>
        <AccountStatusIcon status={status} />
      </div>

      {/* Steps (if available) */}
      {steps && steps.length > 0 && (
        <div className="pb-2 pl-8 pr-3">
          {steps.map((step) => (
            <div
              key={step.key}
              className="flex items-start gap-2 py-0.5"
            >
              <StepStatusIcon status={step.status} />
              <span className="flex-1 text-[11px] leading-4 text-muted-foreground">
                {step.label}
                {step.recordCount != null && step.recordCount > 0 && (
                  <span className="ml-1 tabular-nums opacity-60">
                    ({step.recordCount})
                  </span>
                )}
              </span>
              {step.durationMs != null && (
                <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground/50">
                  {formatStepDuration(step.durationMs)}
                </span>
              )}
              {step.status === "error" && step.error && (
                <span className="max-w-[100px] truncate text-[10px] text-destructive">
                  {step.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Syncing state without steps yet */}
      {status === "syncing" && (!steps || steps.length === 0) && (
        <div className="flex items-center gap-2 pb-2 pl-8 pr-3">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/50" />
          <span className="text-[11px] text-muted-foreground/70">
            Fetching data...
          </span>
        </div>
      )}

      {/* Error without steps */}
      {status === "error" && (!steps || steps.length === 0) && error && (
        <div className="pb-2 pl-8 pr-3">
          <span className="text-[11px] text-destructive">{error}</span>
        </div>
      )}

      {/* Cooldown */}
      {status === "cooldown" && (
        <div className="flex items-center gap-2 pb-2 pl-8 pr-3">
          <CheckCircle2 className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-[11px] text-muted-foreground/70">
            Already up to date
            {lastSyncAt && (
              <span className="ml-1 opacity-60">
                · Updated {formatLastUpdated(lastSyncAt)}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Done with records, no steps reported */}
      {status === "done" &&
        (!steps || steps.length === 0) &&
        recordsProcessed > 0 && (
          <div className="flex items-center gap-2 pb-2 pl-8 pr-3">
            <CheckCircle2 className="h-3 w-3 text-emerald-500/70" />
            <span className="text-[11px] text-muted-foreground/70">
              {recordsProcessed} records synced
            </span>
          </div>
        )}
    </div>
  );
}

// --- Status icons ---

function AccountStatusIcon({
  status,
}: {
  status: AccountSyncState["status"];
}) {
  switch (status) {
    case "pending":
      return <Circle className="h-3.5 w-3.5 text-muted-foreground/30" />;
    case "syncing":
      return (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      );
    case "done":
    case "cooldown":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "error":
      return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  }
}

function StepStatusIcon({
  status,
}: {
  status: SyncStepResult["status"];
}) {
  switch (status) {
    case "success":
      return (
        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
      );
    case "error":
      return (
        <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
      );
    case "skipped":
      return (
        <Circle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/30" />
      );
  }
}
