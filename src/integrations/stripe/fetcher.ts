import Stripe from "stripe";
import { format, subDays, startOfDay } from "date-fns";
import type { AccountConfig, DataFetcher, NormalizedMetric, SyncResult, SyncStep } from "../types";

/**
 * Create a Stripe client from account credentials.
 */
function createStripeClient(credentials: Record<string, string>): Stripe {
  return new Stripe(credentials.secret_key, {
    apiVersion: "2026-01-28.clover",
  });
}

/**
 * Fetch all charges from Stripe for a given time period.
 * Uses pagination to get all results.
 */
async function fetchCharges(
  stripe: Stripe,
  since: Date
): Promise<Stripe.Charge[]> {
  const charges: Stripe.Charge[] = [];
  const sinceTimestamp = Math.floor(since.getTime() / 1000);

  for await (const charge of stripe.charges.list({
    created: { gte: sinceTimestamp },
    limit: 100,
  })) {
    charges.push(charge);
  }

  return charges;
}

/**
 * Fetch active subscriptions from Stripe.
 */
async function fetchActiveSubscriptions(
  stripe: Stripe
): Promise<Stripe.Subscription[]> {
  const subscriptions: Stripe.Subscription[] = [];

  for await (const sub of stripe.subscriptions.list({
    status: "active",
    limit: 100,
  })) {
    subscriptions.push(sub);
  }

  return subscriptions;
}

/**
 * Fetch new customers created since a given date.
 */
async function fetchNewCustomers(
  stripe: Stripe,
  since: Date
): Promise<Stripe.Customer[]> {
  const customers: Stripe.Customer[] = [];
  const sinceTimestamp = Math.floor(since.getTime() / 1000);

  for await (const customer of stripe.customers.list({
    created: { gte: sinceTimestamp },
    limit: 100,
  })) {
    if (!customer.deleted) {
      customers.push(customer as Stripe.Customer);
    }
  }

  return customers;
}

/**
 * Group charges by day and compute daily revenue.
 */
function computeDailyRevenue(charges: Stripe.Charge[]): NormalizedMetric[] {
  const dailyMap = new Map<string, { revenue: number; count: number; refunds: number; currency: string }>();

  for (const charge of charges) {
    if (charge.status !== "succeeded") continue;

    const date = format(new Date(charge.created * 1000), "yyyy-MM-dd");
    const currency = charge.currency.toUpperCase();
    const existing = dailyMap.get(date) || { revenue: 0, count: 0, refunds: 0, currency };

    // Stripe amounts are in cents
    existing.revenue += charge.amount / 100;
    existing.count += 1;
    existing.refunds += (charge.amount_refunded || 0) / 100;
    existing.currency = currency;

    dailyMap.set(date, existing);
  }

  const metrics: NormalizedMetric[] = [];

  for (const [date, data] of dailyMap) {
    metrics.push({
      metricType: "revenue",
      value: data.revenue,
      currency: data.currency,
      date,
    });

    metrics.push({
      metricType: "charges_count",
      value: data.count,
      date,
    });

    if (data.refunds > 0) {
      metrics.push({
        metricType: "refunds",
        value: data.refunds,
        currency: data.currency,
        date,
      });
    }
  }

  return metrics;
}

/**
 * Compute MRR from active subscriptions.
 */
function computeMRR(
  subscriptions: Stripe.Subscription[],
  today: string
): NormalizedMetric[] {
  let totalMRR = 0;
  let currency = "USD";

  for (const sub of subscriptions) {
    if (sub.items.data.length > 0) {
      const item = sub.items.data[0];
      const price = item.price;

      if (price.unit_amount && price.recurring) {
        currency = price.currency.toUpperCase();
        const amount = price.unit_amount / 100;
        const quantity = item.quantity || 1;

        // Normalize to monthly
        switch (price.recurring.interval) {
          case "month":
            totalMRR += amount * quantity;
            break;
          case "year":
            totalMRR += (amount * quantity) / 12;
            break;
          case "week":
            totalMRR += amount * quantity * 4.33;
            break;
          case "day":
            totalMRR += amount * quantity * 30;
            break;
        }
      }
    }
  }

  return [
    {
      metricType: "mrr",
      value: Math.round(totalMRR * 100) / 100,
      currency,
      date: today,
    },
    {
      metricType: "active_subscriptions",
      value: subscriptions.length,
      date: today,
    },
  ];
}

/**
 * Compute daily new customer counts.
 */
function computeNewCustomers(
  customers: Stripe.Customer[],
): NormalizedMetric[] {
  const dailyMap = new Map<string, number>();

  for (const customer of customers) {
    const date = format(new Date(customer.created * 1000), "yyyy-MM-dd");
    dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
  }

  return Array.from(dailyMap).map(([date, count]) => ({
    metricType: "new_customers",
    value: count,
    date,
  }));
}

/**
 * Stripe data fetcher implementation.
 * Reports each fetch + compute phase as a discrete SyncStep for UI transparency.
 */
export const stripeFetcher: DataFetcher = {
  async sync(
    account: AccountConfig,
    since?: Date
  ): Promise<SyncResult> {
    const stripe = createStripeClient(account.credentials);
    const syncSince = since || subDays(startOfDay(new Date()), 30);
    const today = format(new Date(), "yyyy-MM-dd");

    const steps: SyncStep[] = [];
    const allMetrics: NormalizedMetric[] = [];
    let totalRecords = 0;
    let hasAnyError = false;

    // Step 1: Fetch charges
    let charges: Stripe.Charge[] = [];
    let t0 = Date.now();
    try {
      charges = await fetchCharges(stripe, syncSince);
      const revenueMetrics = computeDailyRevenue(charges);
      allMetrics.push(...revenueMetrics);
      totalRecords += charges.length;
      steps.push({
        key: "fetch_charges",
        label: "Fetch charges & revenue",
        status: "success",
        recordCount: charges.length,
        durationMs: Date.now() - t0,
      });
    } catch (error) {
      hasAnyError = true;
      steps.push({
        key: "fetch_charges",
        label: "Fetch charges & revenue",
        status: "error",
        durationMs: Date.now() - t0,
        error: error instanceof Error ? error.message : "Failed to fetch charges",
      });
    }

    // Step 2: Fetch subscriptions + compute MRR
    let subscriptions: Stripe.Subscription[] = [];
    t0 = Date.now();
    try {
      subscriptions = await fetchActiveSubscriptions(stripe);
      const subscriptionMetrics = computeMRR(subscriptions, today);
      allMetrics.push(...subscriptionMetrics);
      totalRecords += subscriptions.length;
      steps.push({
        key: "fetch_subscriptions",
        label: "Fetch subscriptions & MRR",
        status: "success",
        recordCount: subscriptions.length,
        durationMs: Date.now() - t0,
      });
    } catch (error) {
      hasAnyError = true;
      steps.push({
        key: "fetch_subscriptions",
        label: "Fetch subscriptions & MRR",
        status: "error",
        durationMs: Date.now() - t0,
        error: error instanceof Error ? error.message : "Failed to fetch subscriptions",
      });
    }

    // Step 3: Fetch customers
    t0 = Date.now();
    try {
      const customers = await fetchNewCustomers(stripe, syncSince);
      const customerMetrics = computeNewCustomers(customers);
      allMetrics.push(...customerMetrics);
      totalRecords += customers.length;
      steps.push({
        key: "fetch_customers",
        label: "Fetch new customers",
        status: "success",
        recordCount: customers.length,
        durationMs: Date.now() - t0,
      });
    } catch (error) {
      hasAnyError = true;
      steps.push({
        key: "fetch_customers",
        label: "Fetch new customers",
        status: "error",
        durationMs: Date.now() - t0,
        error: error instanceof Error ? error.message : "Failed to fetch customers",
      });
    }

    // If all steps failed, report overall failure
    const allFailed = steps.every((s) => s.status === "error");
    if (allFailed) {
      return {
        success: false,
        recordsProcessed: 0,
        metrics: [],
        steps,
        error: "All sync steps failed",
      };
    }

    return {
      success: true,
      recordsProcessed: totalRecords,
      metrics: allMetrics,
      steps,
      error: hasAnyError ? "Some sync steps failed" : undefined,
    };
  },

  async validateCredentials(
    credentials: Record<string, string>
  ): Promise<boolean> {
    try {
      const stripe = createStripeClient(credentials);
      // A simple API call to verify the key works
      await stripe.balance.retrieve();
      return true;
    } catch {
      return false;
    }
  },
};
