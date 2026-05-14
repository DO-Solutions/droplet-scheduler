import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Type exports (unchanged public API)
// ---------------------------------------------------------------------------

export type Setting = { key: string; value: string; updated_at: number };

export type Schedule = {
  id: number;
  name: string | null;
  delete_day: number;
  delete_hour: number;
  delete_minute: number;
  recreate_day: number;
  recreate_hour: number;
  recreate_minute: number;
  timezone: string;
  active: number;
  created_at: number;
  updated_at: number;
};

export type ScheduleDroplet = {
  id: number;
  schedule_id: number;
  droplet_id: number;
  droplet_name: string;
  region: string;
  size: string;
  tags: string;
  image_id: number | null;
  image_name: string | null;
  current_snapshot_id: string | null;
  last_deleted_at: number | null;
  last_recreated_at: number | null;
  state: string;
};

export type Snapshot = {
  id: number;
  droplet_id: number;
  droplet_name: string;
  snapshot_do_id: string;
  snapshot_name: string;
  region: string;
  size: string;
  created_at: number;
  delete_after: number | null;
  deleted: number;
};

export type Report = {
  id: number;
  event_type: string;
  droplet_id: number;
  droplet_name: string;
  snapshot_do_id: string | null;
  snapshot_name: string | null;
  schedule_id: number | null;
  status: string;
  details: string | null;
  health_check_result: string | null;
  timestamp: number;
};

// ---------------------------------------------------------------------------
// Schema strings (one per dialect)
// ---------------------------------------------------------------------------

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS droplet_cache (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, ip TEXT, region TEXT NOT NULL,
  size TEXT NOT NULL, status TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
  image_id INTEGER, image_name TEXT, cached_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT,
  delete_day INTEGER NOT NULL, delete_hour INTEGER NOT NULL, delete_minute INTEGER NOT NULL,
  recreate_day INTEGER NOT NULL, recreate_hour INTEGER NOT NULL, recreate_minute INTEGER NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC', active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS schedule_droplets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  droplet_id INTEGER NOT NULL, droplet_name TEXT NOT NULL, region TEXT NOT NULL, size TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]', image_id INTEGER, image_name TEXT,
  current_snapshot_id TEXT, last_deleted_at INTEGER, last_recreated_at INTEGER,
  state TEXT NOT NULL DEFAULT 'idle'
);
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT, droplet_id INTEGER NOT NULL, droplet_name TEXT NOT NULL,
  snapshot_do_id TEXT NOT NULL UNIQUE, snapshot_name TEXT NOT NULL, region TEXT NOT NULL,
  size TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT 0,
  delete_after INTEGER, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL,
  droplet_id INTEGER NOT NULL, droplet_name TEXT NOT NULL,
  snapshot_do_id TEXT, snapshot_name TEXT, schedule_id INTEGER,
  status TEXT NOT NULL, details TEXT, health_check_result TEXT,
  timestamp INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reports_ts ON reports(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_reports_d ON reports(droplet_id);
CREATE INDEX IF NOT EXISTS idx_snaps_d ON snapshots(droplet_id);
CREATE INDEX IF NOT EXISTS idx_sd_sched ON schedule_droplets(schedule_id);
`;

const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS droplet_cache (
  id BIGINT PRIMARY KEY, name TEXT NOT NULL, ip TEXT, region TEXT NOT NULL,
  size TEXT NOT NULL, status TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
  image_id BIGINT, image_name TEXT, cached_at BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS schedules (
  id BIGSERIAL PRIMARY KEY, name TEXT,
  delete_day INTEGER NOT NULL, delete_hour INTEGER NOT NULL, delete_minute INTEGER NOT NULL,
  recreate_day INTEGER NOT NULL, recreate_hour INTEGER NOT NULL, recreate_minute INTEGER NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC', active INTEGER NOT NULL DEFAULT 1,
  created_at BIGINT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS schedule_droplets (
  id BIGSERIAL PRIMARY KEY, schedule_id BIGINT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  droplet_id BIGINT NOT NULL, droplet_name TEXT NOT NULL, region TEXT NOT NULL, size TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]', image_id BIGINT, image_name TEXT,
  current_snapshot_id TEXT, last_deleted_at BIGINT, last_recreated_at BIGINT,
  state TEXT NOT NULL DEFAULT 'idle'
);
CREATE TABLE IF NOT EXISTS snapshots (
  id BIGSERIAL PRIMARY KEY, droplet_id BIGINT NOT NULL, droplet_name TEXT NOT NULL,
  snapshot_do_id TEXT NOT NULL UNIQUE, snapshot_name TEXT NOT NULL, region TEXT NOT NULL,
  size TEXT NOT NULL, created_at BIGINT NOT NULL DEFAULT 0,
  delete_after BIGINT, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY, event_type TEXT NOT NULL,
  droplet_id BIGINT NOT NULL, droplet_name TEXT NOT NULL,
  snapshot_do_id TEXT, snapshot_name TEXT, schedule_id BIGINT,
  status TEXT NOT NULL, details TEXT, health_check_result TEXT,
  timestamp BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reports_ts ON reports(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_reports_d ON reports(droplet_id);
CREATE INDEX IF NOT EXISTS idx_snaps_d ON snapshots(droplet_id);
CREATE INDEX IF NOT EXISTS idx_sd_sched ON schedule_droplets(schedule_id);
`;

// ---------------------------------------------------------------------------
// DbAdapter — uniform async interface over SQLite or PostgreSQL
// ---------------------------------------------------------------------------

export class DbAdapter {
  private usePg: boolean;
  private pgPool: import("pg").Pool | null = null;
  private sqliteDb: import("better-sqlite3").Database | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.usePg = !!process.env.DATABASE_URL;
  }

  /** Ensure schema is created exactly once (lazy, async). */
  private ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this._init();
    }
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    if (this.usePg) {
      try {
        const { Pool } = await import("pg");
        this.pgPool = new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false },
        });
        // Run each statement individually to tolerate "already exists" errors gracefully
        const statements = PG_SCHEMA.split(";")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        for (const stmt of statements) {
          await this.pgPool.query(stmt);
        }
      } catch (err) {
        console.error(
          "[DB] PostgreSQL initialization failed; falling back to SQLite:",
          err
        );
        if (this.pgPool) {
          try {
            await this.pgPool.end();
          } catch (closeErr) {
            console.error(
              "[DB] Error while closing PostgreSQL pool during fallback:",
              closeErr
            );
          }
          this.pgPool = null;
        }
        this.usePg = false;
        await this.initSqlite(
          "PostgreSQL init failed while DATABASE_URL was set; using SQLite fallback"
        );
      }
    } else {
      await this.initSqlite();
    }
  }

  private async initSqlite(fallbackReason?: string): Promise<void> {
    const Database = (await import("better-sqlite3")).default;
    const defaultDir =
      process.env.NODE_ENV === "production"
        ? path.join("/tmp", "do-lifecycle-scheduler")
        : path.join(process.cwd(), "data");
    const DB_DIR = process.env.DATA_DIR ?? defaultDir;
    const DB_PATH = path.join(DB_DIR, "scheduler.db");
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    this.sqliteDb = new Database(DB_PATH);
    this.sqliteDb.pragma("journal_mode = WAL");
    this.sqliteDb.pragma("foreign_keys = ON");
    this.sqliteDb.exec(SQLITE_SCHEMA);
    if (fallbackReason) {
      console.warn(`[DB] ${fallbackReason}. SQLite path: ${DB_PATH}`);
    }
  }

  /** Convert $1,$2,... placeholders to ? for SQLite. */
  private toSqlite(sql: string): string {
    return sql.replace(/\$\d+/g, "?");
  }

  async all(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
    await this.ensureInit();
    if (this.usePg) {
      const res = await this.pgPool!.query(sql, params);
      return res.rows;
    } else {
      return this.sqliteDb!.prepare(this.toSqlite(sql)).all(...(params ?? [])) as Record<string, unknown>[];
    }
  }

  async get(sql: string, params?: unknown[]): Promise<Record<string, unknown> | undefined> {
    await this.ensureInit();
    if (this.usePg) {
      const res = await this.pgPool!.query(sql, params);
      return res.rows[0];
    } else {
      return this.sqliteDb!.prepare(this.toSqlite(sql)).get(...(params ?? [])) as Record<string, unknown> | undefined;
    }
  }

  async run(sql: string, params?: unknown[]): Promise<void> {
    await this.ensureInit();
    if (this.usePg) {
      await this.pgPool!.query(sql, params);
    } else {
      this.sqliteDb!.prepare(this.toSqlite(sql)).run(...(params ?? []));
    }
  }

  /** Run an INSERT and return the inserted row's id. */
  async insert(sql: string, params?: unknown[]): Promise<number> {
    await this.ensureInit();
    if (this.usePg) {
      const returning = sql.trimEnd().endsWith("RETURNING id")
        ? sql
        : sql + " RETURNING id";
      const res = await this.pgPool!.query(returning, params);
      return Number(res.rows[0].id);
    } else {
      const result = this.sqliteDb!
        .prepare(this.toSqlite(sql))
        .run(...(params ?? []));
      return result.lastInsertRowid as number;
    }
  }
}

// ---------------------------------------------------------------------------
// Global singleton
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __dbInstance: DbAdapter | undefined;
}

export async function getDb(): Promise<DbAdapter> {
  if (!global.__dbInstance) {
    global.__dbInstance = new DbAdapter();
  }
  return global.__dbInstance;
}

// ---------------------------------------------------------------------------
// Standalone helpers (maintain original public API surface)
// ---------------------------------------------------------------------------

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.get("SELECT value FROM settings WHERE key = $1", [key]);
  return (row?.value as string) ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);
  await db.run(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
    [key, value, now]
  );
}

export async function addReport(
  report: Omit<Report, "id" | "timestamp">
): Promise<number> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);
  return db.insert(
    `INSERT INTO reports (event_type, droplet_id, droplet_name, snapshot_do_id, snapshot_name, schedule_id, status, details, health_check_result, timestamp)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      report.event_type,
      report.droplet_id,
      report.droplet_name,
      report.snapshot_do_id,
      report.snapshot_name,
      report.schedule_id,
      report.status,
      report.details,
      report.health_check_result,
      now,
    ]
  );
}
