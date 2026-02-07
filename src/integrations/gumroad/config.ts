import type {
  CredentialField,
  MetricTypeDefinition,
  RequiredPermission,
} from "../types";

export const GUMROAD_ID = "gumroad";
export const GUMROAD_NAME = "Gumroad";
export const GUMROAD_DESCRIPTION =
  "Connect your Gumroad account to track sales, revenue, and subscribers.";
export const GUMROAD_ICON = "ShoppingBag";
export const GUMROAD_COLOR = "#FF90E8";

export const gumroadCredentials: CredentialField[] = [
  {
    key: "access_token",
    label: "Access Token",
    type: "password",
    placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    helpUrl: "https://app.gumroad.com/settings/advanced#application-form",
    helpText:
      "On the Application page, click the \"Generate access token\" button and paste the token here. " +
      "You do NOT need the Application ID or Application Secret — only the generated access token.",
    required: true,
  },
];

export const gumroadPermissions: RequiredPermission[] = [
  {
    resource: "products",
    label: "Products",
    access: "read",
    reason: "List your products and their sales totals",
  },
  {
    resource: "sales",
    label: "Sales",
    access: "read",
    reason:
      "Fetch individual sales to compute daily revenue, sale counts, and refund data",
  },
  {
    resource: "subscribers",
    label: "Subscribers",
    access: "read",
    reason: "Count active subscribers for membership products",
  },
  {
    resource: "user",
    label: "Profile",
    access: "read",
    reason: "Verify that your access token is valid when connecting",
  },
];

export const gumroadMetricTypes: MetricTypeDefinition[] = [
  {
    key: "revenue",
    label: "Revenue",
    format: "currency",
    description: "Total revenue from successful sales (all products)",
  },
  {
    key: "subscription_revenue",
    label: "Subscription Revenue",
    format: "currency",
    description: "Revenue from subscription/membership products",
  },
  {
    key: "one_time_revenue",
    label: "One-Time Revenue",
    format: "currency",
    description: "Revenue from one-time purchase products",
  },
  {
    key: "sales_count",
    label: "Sales",
    format: "number",
    description: "Number of successful sales",
  },
  {
    key: "products_count",
    label: "Products",
    format: "number",
    description: "Number of published products",
  },
  {
    key: "active_subscriptions",
    label: "Active Subscribers",
    format: "number",
    description: "Number of currently active subscribers across all membership products",
  },
];


