//! Disposable projections may be repaired after a maintenance job is durable.
//! Restart uses the existing full registry reconciliation instead of persisting this queue.
use super::Engine;
use crate::{AppError, diagnostics::record_failure, now_millis};
use std::{
    collections::BTreeMap,
    time::{Duration, Instant},
};

const RETRY_DELAY: Duration = Duration::from_secs(30);
const RETRY_BATCH: usize = 16;

struct PendingRepair {
    request_id: String,
    // None reserves a repair while its scan runs without holding the queue lock.
    due: Option<Instant>,
}

#[derive(Default)]
pub(super) struct ProjectionRepairs {
    pending: BTreeMap<String, PendingRepair>,
}

impl ProjectionRepairs {
    fn start(&mut self, project: &str, request: &str) {
        self.pending.insert(
            project.into(),
            PendingRepair {
                request_id: request.into(),
                due: None,
            },
        );
    }

    fn due(&mut self, now: Instant) -> Vec<(String, String)> {
        self.pending
            .iter_mut()
            .filter(|(_, repair)| repair.due.is_some_and(|due| due <= now))
            .take(RETRY_BATCH)
            .map(|(project, repair)| {
                repair.due = None;
                (project.clone(), repair.request_id.clone())
            })
            .collect()
    }

    fn finish(&mut self, project: &str, succeeded: bool, now: Instant) {
        if succeeded {
            self.pending.remove(project);
        } else if let Some(repair) = self.pending.get_mut(project) {
            repair.due = Some(now + RETRY_DELAY);
        }
    }
}

impl Engine {
    /// Retry a bounded batch of deferred maintenance projections. The watcher calls
    /// this even with no registered projects so failed unregister cleanup is retried.
    pub fn retry_projection_repairs(&self) -> Result<(), AppError> {
        self.retry_projection_repairs_at(Instant::now())
    }

    pub(crate) fn retry_projection_repairs_at(&self, now: Instant) -> Result<(), AppError> {
        let _gate = self
            .gate
            .read()
            .map_err(|_| AppError::LockPoisoned("workspace operation gate"))?;
        let due = self
            .projection_repairs
            .lock()
            .map_err(|_| AppError::LockPoisoned("projection repair schedule"))?
            .due(now);
        for (project, request) in due {
            self.finish_projection_repair(&project, &request, now)?;
        }
        Ok(())
    }

    /// Caller owns the workspace write gate and has released its project store guard.
    pub(crate) fn repair_completed_projection(
        &self,
        project: &str,
        request: &str,
    ) -> Result<(), AppError> {
        self.projection_repairs
            .lock()
            .map_err(|_| AppError::LockPoisoned("projection repair schedule"))?
            .start(project, request);
        self.finish_projection_repair(project, request, Instant::now())
    }

    fn finish_projection_repair(
        &self,
        project: &str,
        request: &str,
        now: Instant,
    ) -> Result<(), AppError> {
        let result = self.repair_projection(project);
        if let Err(error) = &result {
            record_failure(
                "maintenance_projection_repair",
                error,
                Some(project),
                Some(request),
            );
        }
        self.projection_repairs
            .lock()
            .map_err(|_| AppError::LockPoisoned("projection repair schedule"))?
            .finish(project, result.is_ok(), now.max(Instant::now()));
        Ok(())
    }

    /// Caller owns a workspace gate; only projections and reconciliation state change.
    fn repair_projection(&self, project: &str) -> Result<(), AppError> {
        let workspace = self.workspace()?.value;
        if let Some(registration) = workspace.projects.iter().find(|p| p.project_id == project) {
            let handle = self.store_path(&registration.path, false)?;
            let store = handle
                .lock()
                .map_err(|_| AppError::LockPoisoned("project store"))?;
            self.index.refresh(&store, project, now_millis())?;
            self.index.invalidate_workspace(now_millis())?;
            self.reconciled
                .lock()
                .map_err(|_| AppError::LockPoisoned("reconciliation schedule"))?
                .insert(project.into(), Instant::now());
        } else {
            self.reconciled
                .lock()
                .map_err(|_| AppError::LockPoisoned("reconciliation schedule"))?
                .remove(project);
            self.index.forget_project(project, now_millis())?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repairs_back_off_reserve_in_flight_work_and_bound_each_batch() {
        let mut repairs = ProjectionRepairs::default();
        let now = Instant::now();
        for n in 0..20 {
            let project = format!("project-{n:02}");
            repairs.start(&project, "request");
            repairs.finish(&project, false, now);
        }
        assert!(repairs.due(now).is_empty());
        assert!(
            repairs
                .due(now + RETRY_DELAY - Duration::from_nanos(1))
                .is_empty()
        );
        let first = repairs.due(now + RETRY_DELAY);
        assert_eq!(first.len(), RETRY_BATCH);
        let second = repairs.due(now + RETRY_DELAY);
        assert_eq!(second.len(), 4);
        assert!(repairs.due(now + RETRY_DELAY * 2).is_empty());
        repairs.finish(&first[0].0, true, now + RETRY_DELAY);
        repairs.finish(&first[1].0, false, now + RETRY_DELAY);
        assert!(repairs.due(now + RETRY_DELAY).is_empty());
        assert_eq!(repairs.due(now + RETRY_DELAY * 2), vec![first[1].clone()]);
    }
}
