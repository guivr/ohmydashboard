import { registerIntegration } from "../registry";
import type { IntegrationDefinition } from "../types";
import {
  REVENUECAT_ID,
  REVENUECAT_NAME,
  REVENUECAT_DESCRIPTION,
  REVENUECAT_ICON,
  REVENUECAT_COLOR,
  revenuecatCredentials,
  revenuecatMetricTypes,
  revenuecatPermissions,
} from "./config";
import { revenuecatFetcher } from "./fetcher";

const revenuecatIntegration: IntegrationDefinition = {
  id: REVENUECAT_ID,
  name: REVENUECAT_NAME,
  description: REVENUECAT_DESCRIPTION,
  icon: REVENUECAT_ICON,
  color: REVENUECAT_COLOR,
  credentials: revenuecatCredentials,
  metricTypes: revenuecatMetricTypes,
  fetcher: revenuecatFetcher,
  requiredPermissions: revenuecatPermissions,
  dateBucketing: "utc",
};

registerIntegration(revenuecatIntegration);

export default revenuecatIntegration;
