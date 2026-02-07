import type {
  CredentialField,
  MetricTypeDefinition,
  RequiredPermission,
  WidgetDefinition,
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
    helpUrl: "https://dashboard.stripe.com/apikeys/create",
    helpText:
      'Create a restricted key with only "Read" access to Charges, Customers, and Subscriptions. ' +
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
    resource: "balance",
    label: "Balance",
    access: "read",
    reason: "Verify that your API key is valid when connecting",
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
    key: "charges_count",
    label: "Charges",
    format: "number",
    description: "Number of successful charges",
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
];

export const stripeWidgets: WidgetDefinition[] = [
  {
    id: "stripe_revenue_card",
    name: "Revenue",
    description: "Total revenue from Stripe charges",
    defaultSize: "sm",
    supportedMetricTypes: ["revenue"],
  },
  {
    id: "stripe_mrr_card",
    name: "MRR",
    description: "Monthly Recurring Revenue",
    defaultSize: "sm",
    supportedMetricTypes: ["mrr"],
  },
  {
    id: "stripe_revenue_chart",
    name: "Revenue Over Time",
    description: "Revenue trend chart",
    defaultSize: "lg",
    supportedMetricTypes: ["revenue"],
  },
  {
    id: "stripe_subscriptions_card",
    name: "Active Subscriptions",
    description: "Current active subscription count",
    defaultSize: "sm",
    supportedMetricTypes: ["active_subscriptions"],
  },
  {
    id: "stripe_customers_card",
    name: "New Customers",
    description: "New customers over time",
    defaultSize: "sm",
    supportedMetricTypes: ["new_customers"],
  },
];
