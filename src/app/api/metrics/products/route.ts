import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { metrics, projects, accounts } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";

/**
 * GET /api/metrics/products
 * Query per-product metrics (only metrics with a projectId).
 *
 * Query params:
 * - accountIds: Comma-separated list of account IDs to include
 * - projectId: Filter by specific product/project
 * - metricType: Filter by metric type
 * - from: Start date (YYYY-MM-DD)
 * - to: End date (YYYY-MM-DD)
 * - aggregation: "daily" (default) | "total"
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountIds = searchParams.get("accountIds");
  const projectId = searchParams.get("projectId");
  const metricType = searchParams.get("metricType");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const aggregation = searchParams.get("aggregation") || "daily";

  const db = getDb();

  // Only per-product metrics
  const conditions = [];
  conditions.push(sql`${metrics.projectId} IS NOT NULL`);

  if (accountIds) {
    const ids = accountIds.split(",").filter(Boolean);
    if (ids.length > 0) {
      conditions.push(inArray(metrics.accountId, ids));
    }
  }
  if (projectId) conditions.push(eq(metrics.projectId, projectId));
  if (metricType) conditions.push(eq(metrics.metricType, metricType));
  if (from) conditions.push(gte(metrics.date, from));
  if (to) conditions.push(lte(metrics.date, to));

  if (aggregation === "total") {
    const result = db
      .select({
        projectId: metrics.projectId,
        metricType: metrics.metricType,
        total: sql<number>`SUM(${metrics.value})`,
        currency: metrics.currency,
        count: sql<number>`COUNT(*)`,
      })
      .from(metrics)
      .where(and(...conditions))
      .groupBy(metrics.projectId, metrics.metricType, metrics.currency)
      .all();

    return NextResponse.json(result);
  }

  // Daily per-product metrics
  const result = db
    .select({
      id: metrics.id,
      accountId: metrics.accountId,
      projectId: metrics.projectId,
      metricType: metrics.metricType,
      value: metrics.value,
      currency: metrics.currency,
      date: metrics.date,
      metadata: metrics.metadata,
    })
    .from(metrics)
    .where(and(...conditions))
    .orderBy(desc(metrics.date))
    .all();

  // Enrich with project labels (single batch query)
  const resultProjectIds = [...new Set(result.map((r) => r.projectId).filter(Boolean))] as string[];
  const projectLabels: Record<string, { label: string; accountId: string }> = {};

  if (resultProjectIds.length > 0) {
    const projectRows = db
      .select({ id: projects.id, label: projects.label, accountId: projects.accountId })
      .from(projects)
      .where(inArray(projects.id, resultProjectIds))
      .all();
    for (const row of projectRows) {
      projectLabels[row.id] = { label: row.label, accountId: row.accountId };
    }
  }

  // Account labels for context
  const resultAccountIds = [...new Set(result.map((r) => r.accountId))];
  const accountLabels: Record<string, string> = {};

  if (resultAccountIds.length > 0) {
    const accountRows = db
      .select({ id: accounts.id, label: accounts.label })
      .from(accounts)
      .where(inArray(accounts.id, resultAccountIds))
      .all();
    for (const row of accountRows) {
      accountLabels[row.id] = row.label;
    }
  }

  return NextResponse.json({
    metrics: result,
    projects: projectLabels,
    accounts: accountLabels,
  });
}
