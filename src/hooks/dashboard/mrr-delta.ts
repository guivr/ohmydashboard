import type { RankingEntry } from "@/components/dashboard/metric-card";

function getEntryKey(entry: RankingEntry): string {
  return entry.sourceId ? `source:${entry.sourceId}` : `label:${entry.label}`;
}

export function computeMrrDeltaEntries(
  todayEntries: RankingEntry[],
  yesterdayEntries: RankingEntry[]
): RankingEntry[] {
  const yesterdayByKey = new Map<string, RankingEntry>();
  for (const entry of yesterdayEntries) {
    yesterdayByKey.set(getEntryKey(entry), entry);
  }

  const todayKeys = new Set(todayEntries.map(getEntryKey));

  const deltaEntries: RankingEntry[] = todayEntries.map((entry) => {
    const prevEntry = yesterdayByKey.get(getEntryKey(entry));
    const prevValue = prevEntry?.value ?? 0;
    const delta = entry.value - prevValue;

    const prevChildren = prevEntry?.children ?? [];
    const prevChildByKey = new Map(
      prevChildren.map((child) => [getEntryKey(child), child])
    );

    const children = entry.children?.map((child) => {
      const prevChild = prevChildByKey.get(getEntryKey(child));
      const childDelta = child.value - (prevChild?.value ?? 0);
      return { ...child, value: childDelta };
    });

    return {
      ...entry,
      value: delta,
      ...(children ? { children } : {}),
    };
  });

  for (const entry of yesterdayEntries) {
    if (!todayKeys.has(getEntryKey(entry))) {
      deltaEntries.push({
        ...entry,
        value: -entry.value,
        children: entry.children?.map((c) => ({ ...c, value: -c.value })),
      });
    }
  }

  const nonZero = deltaEntries.filter((e) => e.value !== 0);
  nonZero.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const absTotal = nonZero.reduce((sum, e) => sum + Math.abs(e.value), 0);

  return nonZero.map((entry) => ({
    ...entry,
    percentage: absTotal > 0 ? (Math.abs(entry.value) / absTotal) * 100 : 0,
    children: entry.children?.map((child) => {
      const parentAbs = Math.abs(entry.value);
      return {
        ...child,
        percentage: parentAbs > 0 ? (Math.abs(child.value) / parentAbs) * 100 : 0,
      };
    }),
  }));
}
