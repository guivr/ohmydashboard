import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { metrics, accounts } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc, inArray, notInArray } from "drizzle-orm";
import { validateDateString, validateAccountId } from "@/lib/security";

const VALID_AGGREGATIONS = ["daily", "total"] as const;

/**
 * GET /api/metrics
 * Query account-level metrics (no per-product data — use /api/metrics/products for that).
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

  // ── Input validation ──
  if (aggregation && !VALID_AGGREGATIONS.includes(aggregation as typeof VALID_AGGREGATIONS[number])) {
    return NextResponse.json(
      { error: `Invalid aggregation. Must be one of: ${VALID_AGGREGATIONS.join(", ")}` },
      { status: 400 }
    );
  }

  if (accountId) {
    const err = validateAccountId(accountId);
    if (err) return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (accountIds) {
    const ids = accountIds.split(",").filter(Boolean);
    for (const id of ids) {
      const err = validateAccountId(id);
      if (err) return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }

  if (from) {
    const err = validateDateString("from", from);
    if (err) return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (to) {
    const err = validateDateString("to", to);
    if (err) return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const db = getDb();

  const stockMetricTypes = [
    "mrr",
    "active_subscriptions",
    "active_trials",
    "active_users",
    "products_count",
  ];

  // Build filter conditions — always exclude per-product metrics at this endpoint
  const baseConditions = [];
  baseConditions.push(sql`${metrics.projectId} IS NULL`);

  if (accountIds) {
    const ids = accountIds.split(",").filter(Boolean);
    if (ids.length > 0) {
      baseConditions.push(inArray(metrics.accountId, ids));
    }
  } else if (accountId) {
    baseConditions.push(eq(metrics.accountId, accountId));
  }
  if (metricType) baseConditions.push(eq(metrics.metricType, metricType));

  const dateConditions = [];
  if (from) dateConditions.push(gte(metrics.date, from));
  if (to) dateConditions.push(lte(metrics.date, to));

  const conditions = [...baseConditions, ...dateConditions];

  // For stock metrics (MRR, active_subscriptions, etc.), use the latest snapshot
  // up to the range end (ignore range start).
  const stockConditions = to
    ? [...baseConditions, lte(metrics.date, to)]
    : [...baseConditions];

  if (aggregation === "total") {
    // If a specific metricType is requested, handle stock vs flow differently.
    if (metricType) {
      if (stockMetricTypes.includes(metricType)) {
        const latestStock = db
          .select({
            accountId: metrics.accountId,
            metricType: metrics.metricType,
            maxDate: sql<string>`MAX(${metrics.date})`.as("max_date"),
          })
          .from(metrics)
          .where(and(...stockConditions))
          .groupBy(metrics.accountId, metrics.metricType)
          .as("latest_stock");

        const result = db
          .select({
            metricType: metrics.metricType,
            total: sql<number>`SUM(${metrics.value})`,
            currency: metrics.currency,
            count: sql<number>`COUNT(*)`,
          })
          .from(metrics)
          .innerJoin(
            latestStock,
            and(
              eq(metrics.accountId, latestStock.accountId),
              eq(metrics.metricType, latestStock.metricType),
              eq(metrics.date, latestStock.maxDate)
            )
          )
          .where(sql`${metrics.projectId} IS NULL`)
          .groupBy(metrics.metricType, metrics.currency)
          .all();

        return NextResponse.json(result);
      }

      const result = db
        .select({
          metricType: metrics.metricType,
          total: sql<number>`SUM(${metrics.value})`,
          currency: metrics.currency,
          count: sql<number>`COUNT(*)`,
        })
        .from(metrics)
        .where(and(...conditions))
        .groupBy(metrics.metricType, metrics.currency)
        .all();

      return NextResponse.json(result);
    }

    // Mixed totals: sum flow metrics, use latest value per account for stock metrics.
    const flowTotals = db
      .select({
        metricType: metrics.metricType,
        total: sql<number>`SUM(${metrics.value})`,
        currency: metrics.currency,
        count: sql<number>`COUNT(*)`,
      })
      .from(metrics)
      .where(and(...conditions, notInArray(metrics.metricType, stockMetricTypes)))
      .groupBy(metrics.metricType, metrics.currency)
      .all();

    const latestStock = db
      .select({
        accountId: metrics.accountId,
        metricType: metrics.metricType,
        maxDate: sql<string>`MAX(${metrics.date})`.as("max_date"),
      })
      .from(metrics)
      .where(and(...stockConditions, inArray(metrics.metricType, stockMetricTypes)))
      .groupBy(metrics.accountId, metrics.metricType)
      .as("latest_stock");

    const stockTotals = db
      .select({
        metricType: metrics.metricType,
        total: sql<number>`SUM(${metrics.value})`,
        currency: metrics.currency,
        count: sql<number>`COUNT(*)`,
      })
      .from(metrics)
      .innerJoin(
        latestStock,
        and(
          eq(metrics.accountId, latestStock.accountId),
          eq(metrics.metricType, latestStock.metricType),
          eq(metrics.date, latestStock.maxDate)
        )
      )
      .where(sql`${metrics.projectId} IS NULL`)
      .groupBy(metrics.metricType, metrics.currency)
      .all();

    return NextResponse.json([...flowTotals, ...stockTotals]);
  }

  // Daily metrics
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
    .where(and(...conditions))
    .orderBy(desc(metrics.date))
    .all();

  // Batch account label lookup (single query instead of N+1)
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
    accounts: accountLabels,
  });
}
