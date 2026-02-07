import { registerIntegration } from "../registry";
import type { IntegrationDefinition } from "../types";
import {
  STRIPE_ID,
  STRIPE_NAME,
  STRIPE_DESCRIPTION,
  STRIPE_ICON,
  STRIPE_COLOR,
  stripeCredentials,
  stripeMetricTypes,
  stripePermissions,
  stripeWidgets,
} from "./config";
import { stripeFetcher } from "./fetcher";

const stripeIntegration: IntegrationDefinition = {
  id: STRIPE_ID,
  name: STRIPE_NAME,
  description: STRIPE_DESCRIPTION,
  icon: STRIPE_ICON,
  color: STRIPE_COLOR,
  credentials: stripeCredentials,
  metricTypes: stripeMetricTypes,
  fetcher: stripeFetcher,
  widgets: stripeWidgets,
  requiredPermissions: stripePermissions,
};

registerIntegration(stripeIntegration);

export default stripeIntegration;
