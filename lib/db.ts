import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "scheduler.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS droplet_cache (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      ip TEXT,
      region TEXT NOT NULL,
      size TEXT NOT NULL,
      status TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      image_id INTEGER,
      image_name TEXT,
      cached_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      delete_day INTEGER NOT NULL,
      delete_hour INTEGER NOT NULL,
      delete_minute INTEGER NOT NULL,
      recreate_day INTEGER NOT NULL,
      recreate_hour INTEGER NOT NULL,
      recreate_minute INTEGER NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'UTC',
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS schedule_droplets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
      droplet_id INTEGER NOT NULL,
      droplet_name TEXT NOT NULL,
      region TEXT NOT NULL,
      size TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      image_id INTEGER,
      image_name TEXT,
      current_snapshot_id TEXT,
      last_deleted_at INTEGER,
      last_recreated_at INTEGER,
      state TEXT NOT NULL DEFAULT 'idle'
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      droplet_id INTEGER NOT NULL,
      droplet_name TEXT NOT NULL,
      snapshot_do_id TEXT NOT NULL UNIQUE,
      snapshot_name TEXT NOT NULL,
      region TEXT NOT NULL,
      size TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      delete_after INTEGER,
      deleted INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      droplet_id INTEGER NOT NULL,
      droplet_name TEXT NOT NULL,
      snapshot_do_id TEXT,
      snapshot_name TEXT,
      schedule_id INTEGER,
      status TEXT NOT NULL,
      details TEXT,
      health_check_result TEXT,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_reports_timestamp ON reports(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_droplet ON reports(droplet_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_droplet ON snapshots(droplet_id);
    CREATE INDEX IF NOT EXISTS idx_schedule_droplets_schedule ON schedule_droplets(schedule_id);
  `);
}

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

export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()"
  ).run(key, value);
}

export function addReport(report: Omit<Report, "id" | "timestamp">): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO reports (event_type, droplet_id, droplet_name, snapshot_do_id, snapshot_name, schedule_id, status, details, health_check_result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      report.event_type,
      report.droplet_id,
      report.droplet_name,
      report.snapshot_do_id,
      report.snapshot_name,
      report.schedule_id,
      report.status,
      report.details,
      report.health_check_result
    );
  return result.lastInsertRowid as number;
}
