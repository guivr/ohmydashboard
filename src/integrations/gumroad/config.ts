import type {
  CredentialField,
  MetricTypeDefinition,
  RequiredPermission,
  WidgetDefinition,
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
      'Go to Settings > Advanced > Application, then click "Generate access token". ' +
      "Use a token with the view_sales scope for full dashboard functionality.",
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
    description: "Total revenue from successful sales",
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
    key: "active_subscribers",
    label: "Active Subscribers",
    format: "number",
    description: "Number of currently active subscribers across all membership products",
  },
];

export const gumroadWidgets: WidgetDefinition[] = [
  {
    id: "gumroad_revenue_card",
    name: "Revenue",
    description: "Total revenue from Gumroad sales",
    defaultSize: "sm",
    supportedMetricTypes: ["revenue"],
  },
  {
    id: "gumroad_sales_card",
    name: "Sales",
    description: "Number of sales",
    defaultSize: "sm",
    supportedMetricTypes: ["sales_count"],
  },
  {
    id: "gumroad_revenue_chart",
    name: "Revenue Over Time",
    description: "Revenue trend chart",
    defaultSize: "lg",
    supportedMetricTypes: ["revenue"],
  },
  {
    id: "gumroad_subscribers_card",
    name: "Active Subscribers",
    description: "Current active subscriber count",
    defaultSize: "sm",
    supportedMetricTypes: ["active_subscribers"],
  },
  {
    id: "gumroad_products_card",
    name: "Products",
    description: "Published product count",
    defaultSize: "sm",
    supportedMetricTypes: ["products_count"],
  },
];
