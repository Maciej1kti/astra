use super::*;

impl Index {
    pub fn subscribe(&self) -> tokio::sync::watch::Receiver<u64> {
        self.notifications.subscribe()
    }
    pub(super) fn notify(&self) {
        self.notifications
            .send_modify(|sequence| *sequence = sequence.wrapping_add(1));
    }
    pub fn invalidate_workspace(&self, now: i64) -> Result<(), AppError> {
        let mut db = self
            .connection
            .lock()
            .map_err(|_| AppError::LockPoisoned("database connection"))?;
        let tx = db.transaction()?;
        let sequence: i64 = tx.query_row(
            "UPDATE projection_meta
SET value=CAST(value AS INTEGER)+1
WHERE key='sequence'
RETURNING CAST(value AS INTEGER)",
            [],
            |r| r.get(0),
        )?;
        tx.execute(
            "UPDATE projection_meta SET value=?1 WHERE key='workspace_sequence'",
            [sequence.to_string()],
        )?;
        tx.commit()?;
        let mut events = self
            .events
            .lock()
            .map_err(|_| AppError::LockPoisoned("invalidation replay"))?;
        events.push_back((now,json!({"kind":"resync_required","cursor":format!("{}:{sequence}",self.epoch),"reason":"workspace_changed"})));
        while events.len() > 10_000
            || events
                .front()
                .is_some_and(|(time, _)| *time < now - 600_000)
        {
            events.pop_front();
        }
        self.notify();
        Ok(())
    }
    pub fn cursor(&self) -> Result<String, AppError> {
        let db = self
            .connection
            .lock()
            .map_err(|_| AppError::LockPoisoned("database connection"))?;
        let sequence: String = db.query_row(
            "SELECT value FROM projection_meta WHERE key='sequence'",
            [],
            |r| r.get(0),
        )?;
        Ok(format!("{}:{sequence}", self.epoch))
    }
    pub fn events_since(&self, cursor: &str, now: i64) -> Result<Vec<Value>, AppError> {
        let current = self.cursor()?;
        let sequence = |cursor: &str| {
            cursor
                .rsplit_once(':')
                .and_then(|(epoch, sequence)| (epoch == self.epoch).then_some(sequence))
                .and_then(|sequence| sequence.parse::<i64>().ok())
        };
        let Some(since) = sequence(cursor) else {
            return Ok(vec![
                json!({"kind":"resync_required","cursor":current,"reason":"stream_epoch_changed"}),
            ]);
        };
        let current_sequence = sequence(&current).ok_or(AppError::State)?;
        let events = self
            .events
            .lock()
            .map_err(|_| AppError::LockPoisoned("invalidation replay"))?;
        let first = events
            .iter()
            .find(|(time, _)| *time >= now - 600_000)
            .and_then(|(_, e)| sequence(e["cursor"].as_str().unwrap()))
            .unwrap_or(current_sequence + 1);
        if since > current_sequence || since < first - 1 {
            return Ok(vec![
                json!({"kind":"resync_required","cursor":current,"reason":"replay_gap"}),
            ]);
        }
        Ok(events
            .iter()
            .filter(|(time, e)| {
                *time >= now - 600_000
                    && sequence(e["cursor"].as_str().unwrap()).is_some_and(|seq| seq > since)
            })
            .map(|(_, e)| e.clone())
            .collect())
    }
}
