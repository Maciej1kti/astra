-- Baseline roboczy dla migracji, nie gotowa warstwa aplikacji.
-- Test składni nie dowodzi atomowości systemu plików ani kompletności recovery.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS commands (
  epoch TEXT NOT NULL,
  request_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('prepared','committed','rejected','needs_review','blocked')),
  target_kind TEXT NOT NULL,
  project_id TEXT,
  target_id TEXT,
  received_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  result_json TEXT,
  error_json TEXT,
  PRIMARY KEY(epoch, request_id)
) STRICT;
CREATE TABLE IF NOT EXISTS write_intents (
  epoch TEXT NOT NULL,
  request_id TEXT NOT NULL,
  step INTEGER NOT NULL,
  approved_root TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  before_hash TEXT,
  after_hash TEXT,
  before_bytes BLOB,
  after_bytes BLOB,
  intent_kind TEXT NOT NULL CHECK(intent_kind IN ('create','replace','remove_registration','workflow_step')),
  resolved INTEGER NOT NULL DEFAULT 0 CHECK(resolved IN (0,1)),
  PRIMARY KEY(epoch,request_id,step),
  FOREIGN KEY(epoch,request_id) REFERENCES commands(epoch,request_id) ON DELETE RESTRICT
) STRICT;
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash BLOB NOT NULL UNIQUE,
  csrf_secret BLOB NOT NULL,
  device_label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
) STRICT;
CREATE TABLE IF NOT EXISTS pairings (
  id TEXT PRIMARY KEY,
  pending_secret_hash BLOB NOT NULL UNIQUE,
  pending_csrf_secret BLOB NOT NULL,
  challenge TEXT NOT NULL,
  device_label TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','approved','denied','expired','claimed')),
  expires_at TEXT NOT NULL,
  claim_grace_until TEXT,
  last_issued_session_id TEXT REFERENCES sessions(id)
) STRICT;
CREATE TABLE IF NOT EXISTS read_receipts (
  project_id TEXT NOT NULL,
  update_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY(project_id,update_id)
) STRICT;
CREATE TABLE IF NOT EXISTS history (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  epoch TEXT NOT NULL,
  request_id TEXT NOT NULL,
  before_hash TEXT,
  after_hash TEXT NOT NULL,
  before_bytes BLOB,
  after_bytes BLOB,
  recorded_at TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1))
) STRICT;
CREATE INDEX IF NOT EXISTS commands_pending ON commands(state,received_at);
CREATE INDEX IF NOT EXISTS history_target ON history(project_id,target_kind,target_id,recorded_at);
