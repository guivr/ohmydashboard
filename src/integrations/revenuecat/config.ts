import type {
  CredentialField,
  MetricTypeDefinition,
  RequiredPermission,
} from "../types";

export const REVENUECAT_ID = "revenuecat";
export const REVENUECAT_NAME = "RevenueCat";
export const REVENUECAT_DESCRIPTION =
  "Connect your RevenueCat project to track in-app subscription metrics including MRR, active subscriptions, revenue, and customer counts.";
export const REVENUECAT_ICON = "BarChart3";
export const REVENUECAT_COLOR = "#F25C54";

export const revenuecatCredentials: CredentialField[] = [
  {
    key: "secret_api_key",
    label: "Secret API Key",
    type: "password",
    placeholder: "sk_...",
    helpUrl: "https://app.revenuecat.com/overview",
    helpText:
      "1. First, select your project from the project dropdown in the top-left of your RevenueCat dashboard " +
      "(the URL will change to include your project ID)\n" +
      "2. Go to Project Settings → API Keys\n" +
      "3. Click 'New' to create a Secret API Key\n" +
      "4. Expand the 'Charts metrics permissions' section\n" +
      "5. Set 'Overview Configuration' to 'Read only'\n" +
      "6. Set 'Charts Configuration' to 'Read only'\n" +
      "7. Copy the key here\n\n" +
      "The key is tied to the selected project.",
    required: true,
  },
  {
    key: "project_id",
    label: "Project ID",
    type: "text",
    placeholder: "e.g., abc123def456",
    helpUrl: "https://app.revenuecat.com/overview",
    helpText:
      "Your RevenueCat project ID appears in the URL when you select a project from the dropdown. " +
      "For example, if your URL shows /projects/abc123def456/overview, your project ID is abc123def456.",
    required: true,
  },
];

export const revenuecatPermissions: RequiredPermission[] = [
  {
    resource: "charts_metrics:charts",
    label: "Charts Metrics - Charts",
    access: "read",
    reason: "Required to fetch historical chart data (MRR, revenue, active subscriptions, etc.). In your API key settings, expand 'Charts metrics permissions' and set 'Charts Configuration' to 'Read only'.",
  },
];

export const revenuecatMetricTypes: MetricTypeDefinition[] = [
  {
    key: "mrr",
    label: "MRR",
    format: "currency",
    description: "Monthly Recurring Revenue from active subscriptions",
  },
  {
    key: "revenue",
    label: "Revenue",
    format: "currency",
    description: "Total revenue tracked in RevenueCat",
  },
  {
    key: "active_subscriptions",
    label: "Active Subscriptions",
    format: "number",
    description: "Number of currently active subscriptions (paid or in grace period)",
  },
  {
    key: "active_trials",
    label: "Active Trials",
    format: "number",
    description: "Number of users currently in a free trial",
  },
  {
    key: "new_customers",
    label: "New Customers",
    format: "number",
    description: "New unique customers seen for the first time",
  },
  {
    key: "active_users",
    label: "Active Users",
    format: "number",
    description: "Number of unique users with activity in the last 28 days",
  },
  {
    key: "sales_count",
    label: "Sales",
    format: "number",
    description: "Number of completed transactions. Derived from the RevenueCat revenue chart's transaction measure (v3 API).",
  },
  {
    key: "subscription_revenue",
    label: "Subscription Revenue",
    format: "currency",
    description: "Revenue from subscription purchases. Only emitted when the RevenueCat Charts API supports product-type segmentation on the revenue chart.",
  },
  {
    key: "one_time_revenue",
    label: "One-Time Revenue",
    format: "currency",
    description: "Revenue from consumable, non-consumable, and other non-subscription purchases. Only emitted when the RevenueCat Charts API supports product-type segmentation on the revenue chart.",
  },
];
