export function buildSourceId(accountId: string, projectId?: string | null): string {
  return `${accountId}::${projectId ?? ""}`;
}

export function parseSourceId(sourceId: string): { accountId: string; projectId?: string | null } {
  const [accountId, projectId] = sourceId.split("::");
  return {
    accountId,
    projectId: projectId ? projectId : null,
  };
}
