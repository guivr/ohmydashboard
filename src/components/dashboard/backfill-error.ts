export function formatBackfillErrorDetails(
  error: string | null
): string[] {
  if (!error) {
    return ["Unknown error.", "Try syncing from Settings."];
  }

  return [error, "Try syncing from Settings if this keeps happening."];
}
