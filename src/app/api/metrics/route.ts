import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { metrics, accounts } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";

/**
 * GET /api/metrics
 * Query metrics with optional filters.
 *
 * Query params:
 * - accountId: Filter by single account (legacy)
 * - accountIds: Comma-separated list of account IDs to include
 * - metricType: Filter by metric type (e.g. "revenue", "mrr")
 * - from: Start date (YYYY-MM-DD)
 * - to: End date (YYYY-MM-DD)
 * - aggregation: "daily" (default) | "total"
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId");
  const accountIds = searchParams.get("accountIds");
  const metricType = searchParams.get("metricType");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const aggregation = searchParams.get("aggregation") || "daily";

  const db = getDb();

  // Build filter conditions
  const conditions = [];
  if (accountIds) {
    // Multi-account filter: comma-separated IDs
    const ids = accountIds.split(",").filter(Boolean);
    if (ids.length > 0) {
      conditions.push(inArray(metrics.accountId, ids));
    }
  } else if (accountId) {
    // Single account filter (backward-compatible)
    conditions.push(eq(metrics.accountId, accountId));
  }
  if (metricType) conditions.push(eq(metrics.metricType, metricType));
  if (from) conditions.push(gte(metrics.date, from));
  if (to) conditions.push(lte(metrics.date, to));

  if (aggregation === "total") {
    // Return aggregated totals
    const result = db
      .select({
        metricType: metrics.metricType,
        total: sql<number>`SUM(${metrics.value})`,
        currency: metrics.currency,
        count: sql<number>`COUNT(*)`,
      })
      .from(metrics)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(metrics.metricType, metrics.currency)
      .all();

    return NextResponse.json(result);
  }

  // Return daily metrics
  const result = db
    .select({
      id: metrics.id,
      accountId: metrics.accountId,
      metricType: metrics.metricType,
      value: metrics.value,
      currency: metrics.currency,
      date: metrics.date,
      metadata: metrics.metadata,
    })
    .from(metrics)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(metrics.date))
    .all();

  // Also include account labels for context
  const resultAccountIds = [...new Set(result.map((r) => r.accountId))];
  const accountLabels: Record<string, string> = {};

  for (const id of resultAccountIds) {
    const account = db
      .select({ label: accounts.label })
      .from(accounts)
      .where(eq(accounts.id, id))
      .get();
    if (account) accountLabels[id] = account.label;
  }

  return NextResponse.json({
    metrics: result,
    accounts: accountLabels,
  });
}
