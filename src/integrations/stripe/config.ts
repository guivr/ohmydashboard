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


