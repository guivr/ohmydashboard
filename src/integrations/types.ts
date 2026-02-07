/**
 * Core types for the OhMyDashboard integration plugin system.
 *
 * Every integration must implement IntegrationDefinition.
 * This contract ensures all integrations behave consistently
 * and can be discovered/loaded by the registry.
 */

// ─── Credential Configuration ───────────────────────────────────────────────

export interface CredentialField {
  /** Unique key for this credential, e.g. "api_key" */
  key: string;
  /** Human-readable label, e.g. "Stripe Secret Key" */
  label: string;
  /** Input type for the credential field */
  type: "text" | "password";
  /** Placeholder text for the input */
  placeholder?: string;
  /** URL to docs explaining how to get this credential */
  helpUrl?: string;
  /** Additional help text shown below the input field */
  helpText?: string;
  /** Whether this credential is required */
  required?: boolean;
}

// ─── Required Permissions ────────────────────────────────────────────────────

export type PermissionAccess = "read" | "write" | "none";

export interface RequiredPermission {
  /** Machine-readable resource name, e.g. "charges", "customers" */
  resource: string;
  /** Human-readable label shown in UI, e.g. "Charges" */
  label: string;
  /** What level of access is needed */
  access: PermissionAccess;
  /** Why this permission is needed */
  reason: string;
}

// ─── Account & Project Configuration ────────────────────────────────────────

export interface AccountConfig {
  /** Unique ID for this account */
  id: string;
  /** Which integration this account belongs to */
  integrationId: string;
  /** User-chosen name, e.g. "My SaaS Stripe" */
  label: string;
  /** Credential values keyed by CredentialField.key */
  credentials: Record<string, string>;
}

export interface ProjectConfig {
  /** Unique ID for this project */
  id: string;
  /** User-chosen name, e.g. "Pro Plan Subscriptions" */
  label: string;
  /** Integration-specific filter values */
  filters: Record<string, string>;
}

// ─── Sync Types ─────────────────────────────────────────────────────────────

/**
 * A discrete step performed during a sync operation.
 * Each integration reports its steps so the UI can show a
 * transparent todo-list of what was synced.
 */
export interface SyncStep {
  /** Machine-readable key, e.g. "fetch_charges" */
  key: string;
  /** Human-readable label, e.g. "Fetch charges" */
  label: string;
  /** Whether this step succeeded, failed, or was skipped */
  status: "success" | "error" | "skipped";
  /** Number of records this step produced (optional) */
  recordCount?: number;
  /** How long this step took in milliseconds */
  durationMs?: number;
  /** Error message if the step failed */
  error?: string;
}

export interface NormalizedMetric {
  /** Metric type, e.g. "revenue", "subscriber_count", "downloads" */
  metricType: string;
  /** Numeric value */
  value: number;
  /** Currency code for monetary metrics, e.g. "USD" */
  currency?: string;
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Optional project ID if this metric belongs to a specific project */
  projectId?: string;
  /** Extra context as key-value pairs */
  metadata?: Record<string, string>;
}

export interface SyncResult {
  /** Whether the sync succeeded */
  success: boolean;
  /** Number of records processed */
  recordsProcessed: number;
  /** Normalized metrics to write to the universal metrics table */
  metrics: NormalizedMetric[];
  /** Error message if sync failed */
  error?: string;
  /** Discrete steps performed during this sync, for transparency UI */
  steps?: SyncStep[];
}

export interface DataFetcher {
  /**
   * Fetch data from the external service for a specific account.
   * Should return normalized metrics that can be stored in the universal metrics table.
   *
   * @param account - The account configuration with credentials
   * @param since - Optional date to fetch data from (for incremental sync)
   */
  sync(account: AccountConfig, since?: Date): Promise<SyncResult>;

  /**
   * Validate that the credentials are correct by making a test API call.
   * Returns true if credentials are valid.
   */
  validateCredentials(credentials: Record<string, string>): Promise<boolean>;
}

// ─── Integration Definition ─────────────────────────────────────────────────

export interface IntegrationDefinition {
  /** Unique ID for this integration, e.g. "stripe" */
  id: string;
  /** Display name, e.g. "Stripe" */
  name: string;
  /** Short description of the integration */
  description: string;
  /** Icon name from Lucide icons */
  icon: string;
  /** Brand color for visual identification */
  color: string;
  /** What credentials this integration needs */
  credentials: CredentialField[];
  /** Available metric types this integration can provide */
  metricTypes: MetricTypeDefinition[];
  /** Data fetcher implementation */
  fetcher: DataFetcher;
  /**
   * Explicit list of permissions this integration requires.
   * Shown to the user before they connect so they know exactly what access is needed.
   */
  requiredPermissions?: RequiredPermission[];
}

export interface MetricTypeDefinition {
  /** Metric type key, e.g. "revenue" */
  key: string;
  /** Display name, e.g. "Revenue" */
  label: string;
  /** How to format this metric */
  format: "currency" | "number" | "percentage";
  /** Description of this metric */
  description: string;
}
