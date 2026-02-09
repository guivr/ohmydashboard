import type {
  CredentialField,
  MetricTypeDefinition,
  RequiredPermission,
} from "../types";

export const STRIPE_ID = "stripe";
export const STRIPE_NAME = "Stripe";
export const STRIPE_DESCRIPTION =
  "Connect your Stripe account to track revenue, subscriptions, and charges.";
export const STRIPE_ICON = "CreditCard";
export const STRIPE_COLOR = "#635BFF";

export const stripeCredentials: CredentialField[] = [
  {
    key: "secret_key",
    label: "Restricted API Key (read-only)",
    type: "password",
    placeholder: "rk_live_... or rk_test_...",
    helpUrl:
      "https://dashboard.stripe.com/apikeys/create?name=OhMyDashboard&permissions%5B%5D=rak_charge_read&permissions%5B%5D=rak_customer_read&permissions%5B%5D=rak_subscription_read&permissions%5B%5D=rak_invoice_read&permissions%5B%5D=rak_balance_read&permissions%5B%5D=rak_balance_transaction_read",
    helpText:
      'Create a restricted key with "Read" access to Charges, Customers, Subscriptions, and Invoices. ' +
      "Invoice read access is needed to accurately classify subscription vs one-time revenue. " +
      "Never use your full secret key (sk_live_*) — a restricted key limits exposure if compromised.",
    required: true,
  },
];

export const stripePermissions: RequiredPermission[] = [
  {
    resource: "charges",
    label: "Charges",
    access: "read",
    reason: "Fetch charge data to compute daily revenue, refunds, and charge counts",
  },
  {
    resource: "customers",
    label: "Customers",
    access: "read",
    reason: "Count new customers created over time",
  },
  {
    resource: "subscriptions",
    label: "Subscriptions",
    access: "read",
    reason: "List active subscriptions to calculate MRR and subscription count",
  },
  {
    resource: "invoices",
    label: "Invoices",
    access: "read",
    reason: "Classify charges as subscription or one-time revenue via their invoice link",
  },
  {
    resource: "balance",
    label: "Balance",
    access: "read",
    reason: "Verify that your API key is valid when connecting",
  },
  {
    resource: "balance_transactions",
    label: "Balance Transactions",
    access: "read",
    reason: "Read processing fees from charge balance transactions",
  },
];

export const stripeMetricTypes: MetricTypeDefinition[] = [
  {
    key: "revenue",
    label: "Revenue",
    format: "currency",
    description: "Total revenue from successful charges",
  },
  {
    key: "subscription_revenue",
    label: "Subscription Revenue",
    format: "currency",
    description: "Revenue from charges linked to subscription invoices",
  },
  {
    key: "one_time_revenue",
    label: "One-Time Revenue",
    format: "currency",
    description: "Revenue from one-time (non-subscription) charges",
  },
  {
    key: "charges_count",
    label: "Charges",
    format: "number",
    description: "Number of successful charges",
  },
  {
    key: "sales_count",
    label: "Sales",
    format: "number",
    description: "Number of successful charges (unified with Gumroad sales_count)",
  },
  {
    key: "refunds",
    label: "Refunds",
    format: "currency",
    description: "Total refund amount",
  },
  {
    key: "active_subscriptions",
    label: "Active Subscriptions",
    format: "number",
    description: "Number of currently active subscriptions",
  },
  {
    key: "mrr",
    label: "MRR",
    format: "currency",
    description: "Monthly Recurring Revenue from active subscriptions",
  },
  {
    key: "new_customers",
    label: "New Customers",
    format: "number",
    description: "Number of new customers created",
  },
  {
    key: "platform_fees",
    label: "Platform Fees",
    format: "currency",
    description: "Stripe processing fees from balance transactions",
  },
];
