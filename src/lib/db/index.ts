import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), ".ohmydashboard");
const DB_PATH = path.join(DB_DIR, "data.db");

function ensureDbDirectory() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

function createConnection(dbPath?: string) {
  const resolvedPath = dbPath ?? DB_PATH;

  // For non-memory databases, ensure directory exists
  if (resolvedPath !== ":memory:") {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const sqlite = new Database(resolvedPath);

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  return sqlite;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database.Database | null = null;

/**
 * Get the singleton database instance.
 * Creates the database and runs migrations on first call.
 */
export function getDb(dbPath?: string) {
  if (!_db) {
    if (!dbPath) {
      ensureDbDirectory();
    }
    _sqlite = createConnection(dbPath);
    _db = drizzle(_sqlite, { schema });
    initializeDatabase(_sqlite);
  }
  return _db;
}

/**
 * Create a fresh database instance (useful for testing).
 */
export function createTestDb() {
  const sqlite = createConnection(":memory:");
  const db = drizzle(sqlite, { schema });
  initializeDatabase(sqlite);
  return { db, sqlite };
}

/**
 * Close the database connection.
 */
export function closeDb() {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
  }
}

/**
 * Initialize the database schema.
 * Creates all tables if they don't exist.
 */
function initializeDatabase(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      integration_id TEXT NOT NULL,
      label TEXT NOT NULL,
      credentials TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      filters TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('success', 'error', 'running')),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      error TEXT,
      records_processed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS metrics (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      metric_type TEXT NOT NULL,
      value REAL NOT NULL,
      currency TEXT,
      date TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS widget_configs (
      id TEXT PRIMARY KEY,
      widget_type TEXT NOT NULL,
      title TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      position INTEGER NOT NULL DEFAULT 0,
      size TEXT NOT NULL DEFAULT 'md' CHECK(size IN ('sm', 'md', 'lg', 'xl')),
      is_visible INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_account_id ON metrics(account_id);
    CREATE INDEX IF NOT EXISTS idx_metrics_date ON metrics(date);
    CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(metric_type);
    CREATE INDEX IF NOT EXISTS idx_metrics_account_date ON metrics(account_id, date);
    CREATE INDEX IF NOT EXISTS idx_metrics_dedup ON metrics(account_id, metric_type, date, project_id);
    CREATE INDEX IF NOT EXISTS idx_metrics_project_id ON metrics(project_id);
    CREATE INDEX IF NOT EXISTS idx_sync_logs_account ON sync_logs(account_id);
    CREATE INDEX IF NOT EXISTS idx_sync_logs_account_status ON sync_logs(account_id, status, started_at);
    CREATE INDEX IF NOT EXISTS idx_projects_account ON projects(account_id);
  `);
}
