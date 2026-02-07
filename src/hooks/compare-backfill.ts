export function shouldBackfillCompare(
  prevCounts: Record<string, number>,
  flowMetricKeys: string[]
): boolean {
  for (const key of flowMetricKeys) {
    if ((prevCounts[key] ?? 0) === 0) {
      return true;
    }
  }
  return false;
}

export function shouldStartBackfill(options: {
  compareEnabled: boolean;
  prevFrom?: string;
  prevTo?: string;
  accountIds: string[];
  prevCounts: Record<string, number>;
  flowMetricKeys: string[];
}): boolean {
  if (!options.compareEnabled) return false;
  if (!options.prevFrom || !options.prevTo) return false;
  if (options.accountIds.length === 0) return false;
  return shouldBackfillCompare(options.prevCounts, options.flowMetricKeys);
}

export function shouldStartRangeBackfill(options: {
  from?: string;
  to?: string;
  accountIds: string[];
  counts: Record<string, number>;
  flowMetricKeys: string[];
}): boolean {
  if (!options.from || !options.to) return false;
  if (options.accountIds.length === 0) return false;
  return shouldBackfillCompare(options.counts, options.flowMetricKeys);
}
