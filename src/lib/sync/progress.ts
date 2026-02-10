import type { SyncStep } from "@/integrations/types";

export type SyncProgressStatus = "running" | "success" | "error";

export interface SyncProgress {
  accountId: string;
  status: SyncProgressStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
  recordsProcessed?: number;
  steps: SyncStep[];
}

const progressByAccount = new Map<string, SyncProgress>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
const CLEANUP_MS = 10 * 60 * 1000; // 10 minutes

function scheduleCleanup(accountId: string) {
  const existing = cleanupTimers.get(accountId);
  if (existing) clearTimeout(existing);
  cleanupTimers.set(
    accountId,
    setTimeout(() => {
      progressByAccount.delete(accountId);
      cleanupTimers.delete(accountId);
    }, CLEANUP_MS)
  );
}

export function startSyncProgress(accountId: string) {
  progressByAccount.set(accountId, {
    accountId,
    status: "running",
    startedAt: new Date().toISOString(),
    steps: [],
  });
  scheduleCleanup(accountId);
}

export function appendSyncStep(accountId: string, step: SyncStep) {
  const current = progressByAccount.get(accountId);
  if (!current) return;
  const existingIndex = current.steps.findIndex((s) => s.key === step.key);
  if (existingIndex >= 0) {
    // Update existing step in-place (e.g. "running" -> "success")
    current.steps = current.steps.map((s, i) =>
      i === existingIndex ? step : s
    );
  } else {
    current.steps = [...current.steps, step];
  }
  progressByAccount.set(accountId, current);
  scheduleCleanup(accountId);
}

export function updateSyncStep(accountId: string, key: string, update: Partial<SyncStep>) {
  const current = progressByAccount.get(accountId);
  if (!current) return;
  current.steps = current.steps.map((s) =>
    s.key === key ? { ...s, ...update } : s
  );
  progressByAccount.set(accountId, current);
  scheduleCleanup(accountId);
}

export function finalizeSyncProgress(
  accountId: string,
  result: {
    success: boolean;
    recordsProcessed: number;
    error?: string;
    completedAt: string;
    steps?: SyncStep[];
  }
) {
  const current = progressByAccount.get(accountId);
  const steps = result.steps ?? current?.steps ?? [];
  progressByAccount.set(accountId, {
    accountId,
    status: result.success ? "success" : "error",
    startedAt: current?.startedAt ?? result.completedAt,
    completedAt: result.completedAt,
    error: result.error,
    recordsProcessed: result.recordsProcessed,
    steps,
  });
  scheduleCleanup(accountId);
}

export function getSyncProgress(accountId: string) {
  return progressByAccount.get(accountId);
}
