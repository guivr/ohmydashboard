import { registerIntegration } from "../registry";
import type { IntegrationDefinition } from "../types";
import {
  GUMROAD_ID,
  GUMROAD_NAME,
  GUMROAD_DESCRIPTION,
  GUMROAD_ICON,
  GUMROAD_COLOR,
  gumroadCredentials,
  gumroadMetricTypes,
  gumroadPermissions,
} from "./config";
import { gumroadFetcher } from "./fetcher";

const gumroadIntegration: IntegrationDefinition = {
  id: GUMROAD_ID,
  name: GUMROAD_NAME,
  description: GUMROAD_DESCRIPTION,
  icon: GUMROAD_ICON,
  color: GUMROAD_COLOR,
  credentials: gumroadCredentials,
  metricTypes: gumroadMetricTypes,
  fetcher: gumroadFetcher,
  requiredPermissions: gumroadPermissions,
};

registerIntegration(gumroadIntegration);

export default gumroadIntegration;
