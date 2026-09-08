//! Command-row rules shared by source, workspace, receipt and workflow transactions.
use super::{Command, Journal};
use crate::{AppError, Reply, command_state::CommandState, instant};
use rusqlite::{Connection, OptionalExtension, Transaction, params};

const RESULT_RETENTION_MILLIS: i64 = 7 * 86_400_000;

pub(crate) struct CommandRecord<'a> {
    pub command: &'a Command,
    pub state: CommandState,
    /// Saved labels are intentionally distinct from the logical target used by
    /// the digest: e.g. a receipt row says `receipt`, its command target `update`.
    pub target_kind: &'a str,
    pub reply: &'a Reply,
    pub received_at: i64,
}

impl Journal {
    /// Rejected rows keep their reply in `error_json`; pending rows can contain
    /// a planned result, whose presence must not promote the command state.
    pub(crate) fn command_status(
        &self,
        epoch: &str,
        request_id: &str,
    ) -> Result<Option<(CommandState, Option<Reply>)>, AppError> {
        let row: Option<(String, Option<String>, Option<String>)> = self
            .db()?
            .query_row(
                "SELECT state,result_json,error_json FROM commands WHERE epoch=?1 AND request_id=?2",
                [epoch, request_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        row.map(|(state, result, error)| {
            let state = CommandState::parse(&state)?;
            let saved = if state == CommandState::Rejected {
                error
            } else {
                result
            };
            let reply = saved
                .map(|saved| {
                    serde_json::from_str(&saved)
                        .map_err(|source| AppError::stored("command status reply", source))
                })
                .transpose()?;
            Ok((state, reply))
        })
        .transpose()
    }

    /// Join the caller's transaction; never acquire locks, commit, or write sources.
    /// The caller performs the known-command check before inserting its effects.
    pub(crate) fn insert_command(
        tx: &Transaction<'_>,
        record: CommandRecord<'_>,
    ) -> Result<(), AppError> {
        let CommandRecord {
            command,
            state,
            target_kind,
            reply,
            received_at,
        } = record;
        let reply_json = serde_json::to_string(reply)
            .map_err(|source| AppError::stored("command reply serialization", source))?;
        let rejected = state == CommandState::Rejected;
        tx.execute(
            "INSERT INTO commands (
                epoch, request_id, digest, state, target_kind, project_id, target_id,
                received_at, expires_at, result_json, error_json
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                command.epoch,
                command.request_id,
                command.digest(),
                state.as_str(),
                target_kind,
                command.target.project_id,
                command.target.id,
                instant(received_at),
                instant(received_at + RESULT_RETENTION_MILLIS),
                if rejected { None } else { Some(&reply_json) },
                if rejected { Some(&reply_json) } else { None },
            ],
        )?;
        Ok(())
    }

    /// Use the caller's connection or transaction so associated intent/job updates
    /// remain atomic with this transition. This does not change the saved reply.
    pub(crate) fn set_command_state(
        db: &Connection,
        epoch: &str,
        request_id: &str,
        state: CommandState,
    ) -> Result<(), AppError> {
        db.execute(
            "UPDATE commands SET state=?3 WHERE epoch=?1 AND request_id=?2",
            params![epoch, request_id, state.as_str()],
        )?;
        Ok(())
    }
}
