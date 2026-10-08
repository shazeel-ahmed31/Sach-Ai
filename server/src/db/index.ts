import Database from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";

mkdirSync(dirname(config.databasePath), { recursive: true });

/** node:sqlite gives us a zero-native-dependency, file-backed SQL store. */
export const db = new Database.DatabaseSync(config.databasePath);

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

/**
 * Schema is applied idempotently at boot; a real deployment would move this
 * to numbered migration files.
 */
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS batches (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL DEFAULT '',
  total      INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scans (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  batch_id      TEXT REFERENCES batches(id) ON DELETE CASCADE,
  position      INTEGER,
  file_name     TEXT NOT NULL,
  file_size     INTEGER,
  duration_sec  REAL,
  width         INTEGER,
  height        INTEGER,
  thumbnail     TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  engine        TEXT CHECK (engine IN ('sach-model', 'demo') OR engine IS NULL),
  model_name    TEXT,
  faces_detected INTEGER,
  probability   INTEGER,
  verdict       TEXT,
  report_json   TEXT,
  frames_json   TEXT,
  error         TEXT,
  created_at    TEXT NOT NULL,
  completed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_scans_user_created ON scans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_batch ON scans(batch_id, position);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
`);

export type UserRow = {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
};

export type ScanRow = {
  id: string;
  user_id: string;
  batch_id: string | null;
  position: number | null;
  file_name: string;
  file_size: number | null;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  thumbnail: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  engine: "sach-model" | "demo" | null;
  model_name: string | null;
  faces_detected: number | null;
  probability: number | null;
  verdict: string | null;
  report_json: string | null;
  frames_json: string | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export type BatchRow = {
  id: string;
  user_id: string;
  label: string;
  total: number;
  created_at: string;
};
