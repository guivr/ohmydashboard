import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ─── Core Tables ────────────────────────────────────────────────────────────

/**
 * Accounts represent a single connection to an external service.
 * A user can have multiple accounts for the same integration (e.g., 3 Stripe accounts).
 */
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), // UUID
  integrationId: text("integration_id").notNull(), // e.g. "stripe"
  label: text("label").notNull(), // User-chosen name, e.g. "My SaaS Stripe"
  credentials: text("credentials").notNull(), // JSON string of encrypted credentials
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(), // ISO string
  updatedAt: text("updated_at").notNull(), // ISO string
});

/**
 * Projects represent a subset/filter within an account.
 * e.g., a specific product within a Stripe account.
 */
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(), // UUID
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  filters: text("filters").notNull().default("{}"), // JSON string of integration-specific filters
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Sync logs track when each account was last synced and the result.
 */
export const syncLogs = sqliteTable("sync_logs", {
  id: text("id").primaryKey(), // UUID
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["success", "error", "running"] }).notNull(),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  error: text("error"),
  recordsProcessed: integer("records_processed").default(0),
});

/**
 * Universal metrics table — all integrations write normalized data here.
 * This enables cross-integration queries (e.g., total revenue across all services).
 */
export const metrics = sqliteTable("metrics", {
  id: text("id").primaryKey(), // UUID
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  metricType: text("metric_type").notNull(), // e.g. "revenue", "subscriber_count", "downloads"
  value: real("value").notNull(),
  currency: text("currency"), // e.g. "USD", null for non-monetary metrics
  date: text("date").notNull(), // ISO date string (YYYY-MM-DD)
  metadata: text("metadata").default("{}"), // JSON string for extra context
  createdAt: text("created_at").notNull(),
});

/**
 * Widget configurations — what widgets the user has on their dashboard.
 */
export const widgetConfigs = sqliteTable("widget_configs", {
  id: text("id").primaryKey(), // UUID
  widgetType: text("widget_type").notNull(), // e.g. "metric_card", "revenue_chart", "data_table"
  title: text("title").notNull(),
  config: text("config").notNull().default("{}"), // JSON string with widget-specific settings
  position: integer("position").notNull().default(0), // Order in the grid
  size: text("size", { enum: ["sm", "md", "lg", "xl"] })
    .notNull()
    .default("md"),
  isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Project groups let users merge data from multiple accounts/products
 * into a single logical project (e.g. "CSS Pro" across Gumroad + Stripe).
 */
export const projectGroups = sqliteTable("project_groups", {
  id: text("id").primaryKey(), // UUID
  name: text("name").notNull(), // User-chosen name, e.g. "CSS Pro"
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Members of a project group — each row maps an account or a specific
 * product within an account to a group.
 *
 * If projectId is NULL, the entire account is included.
 * If projectId is set, only that product's metrics are included.
 */
export const projectGroupMembers = sqliteTable("project_group_members", {
  id: text("id").primaryKey(), // UUID
  groupId: text("group_id")
    .notNull()
    .references(() => projectGroups.id, { onDelete: "cascade" }),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  createdAt: text("created_at").notNull(),
});

// ─── Type Exports ───────────────────────────────────────────────────────────

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type SyncLog = typeof syncLogs.$inferSelect;
export type NewSyncLog = typeof syncLogs.$inferInsert;
export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;
export type WidgetConfig = typeof widgetConfigs.$inferSelect;
export type NewWidgetConfig = typeof widgetConfigs.$inferInsert;
export type ProjectGroup = typeof projectGroups.$inferSelect;
export type NewProjectGroup = typeof projectGroups.$inferInsert;
export type ProjectGroupMember = typeof projectGroupMembers.$inferSelect;
export type NewProjectGroupMember = typeof projectGroupMembers.$inferInsert;
