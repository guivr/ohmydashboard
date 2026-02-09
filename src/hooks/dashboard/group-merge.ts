import type { RankingEntry } from "@/components/dashboard/metric-card";
import type { ProjectGroupResponse, ProductMetricsResponse } from "../use-metrics";

/**
 * Build a lookup from (accountId, projectId | null) -> groupId
 * and a map from groupId -> group info.
 */
export interface GroupLookup {
  /** (accountId:projectId) -> groupId */
  memberToGroup: Map<string, string>;
  /** groupId -> { name, integrationNames } */
  groupInfo: Map<string, { name: string; integrationNames: string[] }>;
}

export function buildGroupLookup(
  groups: ProjectGroupResponse[],
  accountIntegrationMap: Map<string, string>
): GroupLookup {
  const memberToGroup = new Map<string, string>();
  const groupInfo = new Map<string, { name: string; integrationNames: string[] }>();

  for (const group of groups) {
    const integrationNames = new Set<string>();
    for (const member of group.members) {
      const key = `${member.accountId}:${member.projectId ?? ""}`;
      memberToGroup.set(key, group.id);
      const integName = accountIntegrationMap.get(member.accountId);
      if (integName) integrationNames.add(integName);
    }
    groupInfo.set(group.id, {
      name: group.name,
      integrationNames: Array.from(integrationNames),
    });
  }

  return { memberToGroup, groupInfo };
}

/**
 * Post-process blended rankings to merge entries that belong to the same
 * project group. Merged entries use the group name as label, sum their
 * values, and combine integration names for stacked logos.
 *
 * Entries that don't belong to any group pass through unchanged.
 */
export function applyProjectGroupMerging(
  rankings: Record<string, RankingEntry[]>,
  lookup: GroupLookup,
  productMetricsData: ProductMetricsResponse | null,
  accountLabels?: Record<string, string>
): Record<string, RankingEntry[]> {
  if (lookup.memberToGroup.size === 0) return rankings;

  // Build a reverse lookup: label -> member keys (accountId:projectId)
  // We need this because blended rankings use labels, not IDs.

  // 1. Project labels -> keys
  const labelToKeys = new Map<string, string[]>();
  if (productMetricsData && "projects" in productMetricsData) {
    for (const [projectId, info] of Object.entries(productMetricsData.projects)) {
      const key = `${info.accountId}:${projectId}`;
      const existing = labelToKeys.get(info.label) ?? [];
      existing.push(key);
      labelToKeys.set(info.label, existing);
    }
  }

  // 2. Account labels -> keys (for account-level group members)
  //    Also handle disambiguated labels like "Drawings Alive (Stripe)"
  const accountLabelToKeys = new Map<string, string[]>();
  if (accountLabels) {
    for (const [accountId, label] of Object.entries(accountLabels)) {
      const key = `${accountId}:`;
      // Plain label
      const existing = accountLabelToKeys.get(label) ?? [];
      existing.push(key);
      accountLabelToKeys.set(label, existing);
    }
  }

  const result: Record<string, RankingEntry[]> = {};

  for (const [metricType, entries] of Object.entries(rankings)) {
    const groupBuckets = new Map<
      string,
      { value: number; integrationNames: Set<string>; members: RankingEntry[] }
    >();
    const ungrouped: RankingEntry[] = [];

    for (const entry of entries) {
      // Try to find the group for this entry
      let groupId: string | undefined;

      // Check by label -> projectId mapping
      const keys = labelToKeys.get(entry.label);
      if (keys) {
        for (const key of keys) {
          const gid = lookup.memberToGroup.get(key);
          if (gid) {
            groupId = gid;
            break;
          }
        }
      }

      // Check account-level: match label against account labels
      if (!groupId) {
        const accKeys = accountLabelToKeys.get(entry.label);
        if (accKeys) {
          for (const key of accKeys) {
            const gid = lookup.memberToGroup.get(key);
            if (gid) {
              groupId = gid;
              break;
            }
          }
        }
      }

      // Handle disambiguated labels like "Drawings Alive (Stripe)"
      // Strip the integration suffix and try again
      if (!groupId) {
        const suffixMatch = entry.label.match(/^(.+?)\s*\([^)]+\)$/);
        if (suffixMatch) {
          const baseLabel = suffixMatch[1];
          // Try project labels
          const projKeys = labelToKeys.get(baseLabel);
          if (projKeys) {
            for (const key of projKeys) {
              const gid = lookup.memberToGroup.get(key);
              if (gid) {
                groupId = gid;
                break;
              }
            }
          }
          // Try account labels
          if (!groupId) {
            const accKeys = accountLabelToKeys.get(baseLabel);
            if (accKeys) {
              for (const key of accKeys) {
                const gid = lookup.memberToGroup.get(key);
                if (gid) {
                  groupId = gid;
                  break;
                }
              }
            }
          }
        }
      }

      if (groupId) {
        const bucket =
          groupBuckets.get(groupId) ??
          ({ value: 0, integrationNames: new Set<string>(), members: [] } as {
            value: number;
            integrationNames: Set<string>;
            members: RankingEntry[];
          });
        bucket.value += entry.value;
        bucket.members.push(entry);
        if (entry.integrationNames) {
          for (const n of entry.integrationNames) bucket.integrationNames.add(n);
        } else {
          bucket.integrationNames.add(entry.integrationName);
        }
        groupBuckets.set(groupId, bucket);
      } else {
        ungrouped.push(entry);
      }
    }

    // Build group entries with children
    const groupEntries: RankingEntry[] = [];
    for (const [groupId, bucket] of groupBuckets) {
      const info = lookup.groupInfo.get(groupId);
      if (!info) continue;
      const names = Array.from(bucket.integrationNames);
      // Build children with percentages relative to the group total
      const children = bucket.members
        .sort((a, b) => b.value - a.value)
        .map((m) => ({
          ...m,
          percentage: bucket.value > 0 ? (m.value / bucket.value) * 100 : 0,
        }));
      const singleSourceId = children.length === 1 ? children[0].sourceId : undefined;
      groupEntries.push({
        label: info.name,
        integrationName: names[0] ?? "Unknown",
        integrationNames: names,
        value: bucket.value,
        percentage: 0, // recalculated below
        sourceId: singleSourceId,
        children: children.length > 1 ? children : undefined,
      });
    }

    // Merge and recalculate percentages
    const merged = [...groupEntries, ...ungrouped];
    merged.sort((a, b) => b.value - a.value);
    const total = merged.reduce((sum, e) => sum + e.value, 0);
    for (const entry of merged) {
      entry.percentage = total > 0 ? (entry.value / total) * 100 : 0;
    }

    result[metricType] = merged;
  }

  return result;
}

/**
 * Merge daily breakdown entries (top-5 per day) using project group info.
 * Similar to applyProjectGroupMerging but operates on a flat array for a single date.
 */
export function mergeBreakdownEntries(
  entries: Array<{ label: string; value: number; integrationName?: string; sourceId?: string; pending?: boolean }>,
  lookup: GroupLookup,
  productMetricsData: ProductMetricsResponse | null,
  accountLabels?: Record<string, string>
): Array<{ label: string; value: number; integrationName?: string; integrationNames?: string[]; sourceId?: string; pending?: boolean }> {
  // Build same reverse lookups as in applyProjectGroupMerging
  const labelToKeys = new Map<string, string[]>();
  if (productMetricsData && "projects" in productMetricsData) {
    for (const [projectId, info] of Object.entries(productMetricsData.projects)) {
      const key = `${info.accountId}:${projectId}`;
      const existing = labelToKeys.get(info.label) ?? [];
      existing.push(key);
      labelToKeys.set(info.label, existing);
    }
  }

  const accountLabelToKeys = new Map<string, string[]>();
  if (accountLabels) {
    for (const [accountId, label] of Object.entries(accountLabels)) {
      const key = `${accountId}:`;
      const existing = accountLabelToKeys.get(label) ?? [];
      existing.push(key);
      accountLabelToKeys.set(label, existing);
    }
  }

  const groups = new Map<
    string,
    { label: string; value: number; integrationNames: Set<string>; members: typeof entries; pending?: boolean }
  >();
  const ungrouped: typeof entries = [];

  for (const entry of entries) {
    let groupId: string | undefined;

    const keys = labelToKeys.get(entry.label);
    if (keys) {
      for (const key of keys) {
        const gid = lookup.memberToGroup.get(key);
        if (gid) {
          groupId = gid;
          break;
        }
      }
    }

    if (!groupId) {
      const accKeys = accountLabelToKeys.get(entry.label);
      if (accKeys) {
        for (const key of accKeys) {
          const gid = lookup.memberToGroup.get(key);
          if (gid) {
            groupId = gid;
            break;
          }
        }
      }
    }

    if (!groupId) {
      const suffixMatch = entry.label.match(/^(.+?)\s*\([^)]+\)$/);
      if (suffixMatch) {
        const baseLabel = suffixMatch[1];
        const projKeys = labelToKeys.get(baseLabel);
        if (projKeys) {
          for (const key of projKeys) {
            const gid = lookup.memberToGroup.get(key);
            if (gid) {
              groupId = gid;
              break;
            }
          }
        }
        if (!groupId) {
          const accKeys = accountLabelToKeys.get(baseLabel);
          if (accKeys) {
            for (const key of accKeys) {
              const gid = lookup.memberToGroup.get(key);
              if (gid) {
                groupId = gid;
                break;
              }
            }
          }
        }
      }
    }

    if (groupId) {
      const info = lookup.groupInfo.get(groupId);
      if (!info) continue;
      const bucket =
        groups.get(groupId) ??
        ({
          label: info.name,
          value: 0,
          integrationNames: new Set<string>(),
          members: [],
          pending: false,
        } as {
          label: string;
          value: number;
          integrationNames: Set<string>;
          members: typeof entries;
          pending?: boolean;
        });
      bucket.value += entry.value;
      bucket.members.push(entry);
      bucket.integrationNames.add(entry.integrationName ?? "Unknown");
      if (entry.pending) bucket.pending = true;
      groups.set(groupId, bucket);
    } else {
      ungrouped.push(entry);
    }
  }

  const merged: Array<{
    label: string;
    value: number;
    integrationName?: string;
    integrationNames?: string[];
    sourceId?: string;
    pending?: boolean;
  }> = [];

  for (const bucket of groups.values()) {
    merged.push({
      label: bucket.label,
      value: bucket.value,
      integrationName: Array.from(bucket.integrationNames)[0] ?? "Unknown",
      integrationNames: Array.from(bucket.integrationNames),
      pending: bucket.pending,
    });
  }

  merged.push(...ungrouped);
  return merged;
}
