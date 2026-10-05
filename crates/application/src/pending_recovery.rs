//! Interrupted source intents are retried between writes, not only at startup.
//!
//! A writer completes its own journal's intents before it refuses a write, but
//! a project shared by several profiles is also refused while another profile's
//! journal holds one. The host therefore runs this pass for every ready engine.
use crate::{
    AppError,
    engine::{Engine, lock_store},
    now_millis,
    writer::Writer,
};
use std::collections::BTreeSet;

impl Engine {
    /// Complete this journal's interrupted source intents with the startup
    /// rules: a matching `after` is finished, a matching `before` is resumed
    /// when its references still match, and anything else becomes
    /// `needs_review` without touching source bytes. Existing `needs_review`
    /// intents, workflows and project deletion are left alone. Returns the
    /// number of intents that were committed.
    pub fn recover_pending(&self) -> Result<usize, AppError> {
        // Nothing to do is the ordinary case; decide it without any gate.
        let interrupted = self.interrupted_projects()?;
        if interrupted.is_empty() {
            return Ok(0);
        }
        // Lock order: workspace gate, store registry, project store, journal,
        // index. A write in flight holds its project store, so this pass waits
        // for it and then finds its intent resolved.
        let _gate = self.shared_gate()?;
        let workspace = self.workspace()?.value;
        let mut recovered = 0;
        for registration in &workspace.projects {
            let id = &registration.project_id;
            if !interrupted.contains(id) {
                continue;
            }
            let result = self
                .store_path(&registration.path, false)
                .and_then(|handle| {
                    let mut store = lock_store(&handle)?;
                    let now = now_millis();
                    let count = Writer {
                        journal: &self.journal,
                    }
                    .recover_with_guard(
                        &mut store,
                        id,
                        now,
                        crate::source_deletion::recoverable,
                    )?;
                    if count > 0 && self.index.refresh(&store, id, now).is_err() {
                        // The sources are committed; only the projection is behind.
                        let _ = self.index.mark_unavailable(id, "PROJECTION_DEGRADED", now);
                    }
                    Ok(count)
                });
            match result {
                Ok(count) => recovered += count,
                Err(error) => {
                    crate::diagnostics::record_failure("pending_recovery", &error, Some(id), None);
                }
            }
        }
        Ok(recovered)
    }

    /// Projects with a source intent this journal may retry. Project deletion
    /// keeps its own startup recovery, and a reviewed intent is never retried.
    fn interrupted_projects(&self) -> Result<BTreeSet<String>, AppError> {
        let db = self.journal.db()?;
        let mut statement = db.prepare(
            "SELECT DISTINCT c.project_id
             FROM commands c
             JOIN write_intents w USING(epoch,request_id)
             WHERE c.state IN ('prepared','blocked') AND w.resolved=0
               AND NOT (w.intent_kind='delete' AND c.target_kind='project')",
        )?;
        let projects = statement
            .query_map([], |row| row.get(0))?
            .collect::<Result<_, _>>()?;
        Ok(projects)
    }
}
