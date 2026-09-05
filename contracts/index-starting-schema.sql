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

CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN INSERT INTO documents_fts(rowid,title,body) VALUES(new.rowid,new.title,new.body); END;
        CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN INSERT INTO documents_fts(documents_fts,rowid,title,body) VALUES('delete',old.rowid,old.title,old.body); END;
        CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE OF title,body ON documents BEGIN INSERT INTO documents_fts(documents_fts,rowid,title,body) VALUES('delete',old.rowid,old.title,old.body); INSERT INTO documents_fts(rowid,title,body) VALUES(new.rowid,new.title,new.body); END;
        CREATE TABLE IF NOT EXISTS projection_issues(project_id TEXT NOT NULL,path TEXT NOT NULL,code TEXT NOT NULL,PRIMARY KEY(project_id,path)) STRICT;

-- Measured attention queries must seek candidates instead of scanning report bodies.
CREATE INDEX IF NOT EXISTS documents_hard_due ON documents(json_extract(metadata_json,'$.due.date')) WHERE json_extract(metadata_json,'$.due.kind')='hard';
CREATE INDEX IF NOT EXISTS documents_review_date ON documents(json_extract(metadata_json,'$.review_on'));
CREATE INDEX IF NOT EXISTS documents_blocked ON documents(project_id,entity_id) WHERE entity_type='card' AND json_type(metadata_json,'$.blocked')='object';
CREATE INDEX IF NOT EXISTS documents_in_review ON documents(project_id,entity_id) WHERE entity_type='card' AND json_extract(metadata_json,'$.status')='review';
CREATE INDEX IF NOT EXISTS documents_decision_needed ON documents(project_id,entity_id) WHERE entity_type='update' AND json_extract(metadata_json,'$.kind')='decision_needed';
CREATE INDEX IF NOT EXISTS documents_report_kind ON documents(project_id,json_extract(metadata_json,'$.kind')) WHERE entity_type='update';
