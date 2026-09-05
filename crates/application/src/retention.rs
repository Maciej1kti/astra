//! Optional history may expire; unresolved operations and the retry window may not.
use crate::{AppError, instant, journal::Journal};
use rusqlite::params;
use serde_json::{Value, json};
impl Journal {
    /// One bounded maintenance batch; subsequent passes continue any backlog.
    pub fn retain(&self, now: i64) -> Result<Value, AppError> {
        let mut db = self.db()?;
        let tx = db.transaction()?;
        tx.execute_batch("CREATE TEMP TABLE IF NOT EXISTS retention_commands(epoch TEXT,request_id TEXT,PRIMARY KEY(epoch,request_id)); DELETE FROM retention_commands;")?;
        tx.execute("INSERT INTO retention_commands SELECT c.epoch,c.request_id FROM commands c WHERE c.expires_at<?1 AND c.state IN ('committed','rejected') AND NOT EXISTS(SELECT 1 FROM write_intents w WHERE w.epoch=c.epoch AND w.request_id=c.request_id AND w.resolved=0) AND NOT EXISTS(SELECT 1 FROM workspace_intents w WHERE w.epoch=c.epoch AND w.request_id=c.request_id AND w.resolved=0) AND NOT EXISTS(SELECT 1 FROM workflow_jobs j WHERE j.epoch=c.epoch AND j.request_id=c.request_id AND j.state!='done') ORDER BY c.received_at LIMIT 500",[instant(now)])?;
        for table in [
            "write_intents",
            "intent_context",
            "workspace_intents",
            "workflow_jobs",
        ] {
            tx.execute(&format!("DELETE FROM {table} WHERE (epoch,request_id) IN (SELECT epoch,request_id FROM retention_commands)"),[])?;
        }
        let commands=tx.execute("DELETE FROM commands WHERE (epoch,request_id) IN (SELECT epoch,request_id FROM retention_commands)",[])?;
        // Uncommitted expired previews and completed workflows retain before bytes for 30 days.
        tx.execute("DELETE FROM workflow_plans WHERE id IN(SELECT p.id FROM workflow_plans p WHERE json_extract(p.plan_json,'$.expires_at')<?1 AND NOT EXISTS(SELECT 1 FROM workflow_jobs j WHERE j.plan_id=p.id) LIMIT 100)",[now-30*86_400_000])?;
        let bytes:i64=tx.query_row("SELECT COALESCE(sum(COALESCE(length(before_bytes),0)+COALESCE(length(after_bytes),0)),0) FROM history",[],|r|r.get(0))?;
        let mut total = bytes;
        let mut removed = 0;
        let rows = {
            let mut statement=tx.prepare("SELECT h.id,h.recorded_at,COALESCE(length(h.before_bytes),0)+COALESCE(length(h.after_bytes),0) FROM history h WHERE h.pinned=0 AND NOT EXISTS(SELECT 1 FROM commands c WHERE c.epoch=h.epoch AND c.request_id=h.request_id AND (c.expires_at>=?1 OR c.state NOT IN ('committed','rejected'))) ORDER BY h.recorded_at LIMIT 500")?;
            statement
                .query_map([instant(now)], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, i64>(2)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?
        };
        for (id, time, size) in rows {
            if time >= instant(now - 30 * 86_400_000) && total <= 1024 * 1024 * 1024 {
                break;
            }
            removed += tx.execute("DELETE FROM history WHERE id=?1", [id])?;
            total -= size;
        }
        tx.execute("DELETE FROM pairings WHERE id IN (SELECT id FROM pairings WHERE expires_at<?1 AND (claim_grace_until IS NULL OR claim_grace_until<?1) LIMIT 500)",[instant(now-7*86_400_000)])?;
        tx.execute("DELETE FROM sessions WHERE id IN (SELECT s.id FROM sessions s WHERE (s.expires_at<?1 OR s.revoked_at<?1) AND NOT EXISTS(SELECT 1 FROM pairings p WHERE p.last_issued_session_id=s.id) LIMIT 500)",[instant(now-7*86_400_000)])?;
        tx.execute("INSERT INTO meta(key,value) VALUES('history_retention',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![json!({"checked_at":instant(now),"history_bytes":total,"history_removed":removed,"commands_removed":commands}).to_string()])?;
        tx.commit()?;
        db.execute_batch("PRAGMA wal_checkpoint(PASSIVE);")?;
        Ok(json!({"history_bytes":total,"history_removed":removed,"commands_removed":commands}))
    }
}
