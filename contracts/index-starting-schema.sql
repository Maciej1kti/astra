-- Rebuildable projection only. No sessions/focus/read receipt source here.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS projection_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS documents (
  rowid INTEGER PRIMARY KEY,
  project_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  validity TEXT NOT NULL CHECK(validity IN ('valid','stale','invalid','unavailable')),
  UNIQUE(project_id,entity_type,entity_id)
) STRICT;
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(title,body,content='documents',content_rowid='rowid');
-- Application updates FTS in same projection transaction; tests MUST prove it.
-- Not a complete query schema: status/date/rank columns should be indexed after profiling.
CREATE INDEX IF NOT EXISTS documents_project_type ON documents(project_id,entity_type);
