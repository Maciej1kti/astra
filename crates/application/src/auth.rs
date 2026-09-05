use crate::{AppError, instant, journal::Journal, wire};
use rusqlite::{OptionalExtension, params};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

const DAY: i64 = 86_400_000;
pub struct Auth<'a> {
    pub journal: &'a Journal,
}
pub struct PairingStarted {
    pub view: Value,
    pub pending_token: String,
}
pub struct Claimed {
    pub view: Value,
    pub session_token: String,
}
pub struct Session {
    pub id: String,
    pub csrf: String,
    pub view: Value,
}

pub fn secret() -> Result<String, AppError> {
    let mut bytes = [0; 32];
    getrandom::fill(&mut bytes).map_err(|_| AppError::State)?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}
fn hash(secret: &str) -> Vec<u8> {
    Sha256::digest(secret.as_bytes()).to_vec()
}
pub fn csrf_matches(expected: &str, actual: &str) -> bool {
    if expected.len() != actual.len() {
        return false;
    }
    expected
        .bytes()
        .zip(actual.bytes())
        .fold(0u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}
type PairingRow = (
    String,
    String,
    String,
    String,
    String,
    Vec<u8>,
    Option<String>,
    Option<String>,
);
fn pairing_view(row: &PairingRow, now: i64, include_csrf: bool) -> Value {
    let expired = instant(now) >= row.4 && row.3 != "claimed";
    let mut view = json!({"id":row.0,"device_label":row.1,"challenge":row.2,"state":if expired{"expired"}else{&row.3},"expires_at":row.4});
    if include_csrf {
        view["pending_csrf_token"] = json!(String::from_utf8_lossy(&row.5));
    }
    view
}
impl Auth<'_> {
    pub fn start(&self, input: &Value, now: i64) -> Result<PairingStarted, AppError> {
        wire::validate("PairingCreate", input)?;
        let mut db = self.journal.db()?;
        let tx = db.transaction()?;
        let active: i64 = tx.query_row(
            "SELECT count(*) FROM pairings WHERE state IN ('pending','approved') AND expires_at>?1",
            [instant(now)],
            |r| r.get(0),
        )?;
        let recent: i64 = tx.query_row(
            "SELECT count(*) FROM pairings WHERE expires_at>?1",
            [instant(now + 240_000)],
            |r| r.get(0),
        )?;
        if active >= 10 || recent >= 5 {
            return Err(AppError::reject(429, "PAIRING_RATE_LIMIT"));
        }
        let id = Uuid::new_v4().to_string();
        let pending_token = secret()?;
        let csrf = secret()?;
        let random = secret()?;
        let challenge = format!("{} {} {}", &random[..4], &random[4..8], &random[8..12]);
        let expires = instant(now + 300_000);
        tx.execute("INSERT INTO pairings(id,pending_secret_hash,pending_csrf_secret,challenge,device_label,state,expires_at) VALUES(?1,?2,?3,?4,?5,'pending',?6)",params![id,hash(&pending_token),csrf.as_bytes(),challenge,input["device_label"].as_str().unwrap(),expires])?;
        tx.commit()?;
        Ok(PairingStarted {
            view: json!({"id":id,"device_label":input["device_label"],"challenge":challenge,"state":"pending","expires_at":expires,"pending_csrf_token":csrf}),
            pending_token,
        })
    }
    fn by_secret(db: &rusqlite::Connection, token: &str) -> Result<PairingRow, AppError> {
        if token.len() != 64 {
            return Err(AppError::reject(401, "PAIRING_COOKIE_REQUIRED"));
        }
        db.query_row("SELECT id,device_label,challenge,state,expires_at,pending_csrf_secret,claim_grace_until,last_issued_session_id FROM pairings WHERE pending_secret_hash=?1",[hash(token)],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?))).optional()?.ok_or_else(||AppError::reject(401,"PAIRING_COOKIE_REQUIRED"))
    }
    pub fn current(&self, token: &str, now: i64) -> Result<Value, AppError> {
        let db = self.journal.db()?;
        let row = Self::by_secret(&db, token)?;
        Ok(pairing_view(&row, now, true))
    }
    /// Caller must be an authenticated owner or local UID; the challenge is a
    /// comparison aid, never a bearer credential that authorizes this operation.
    pub fn decide(
        &self,
        id: &str,
        challenge: &str,
        approve: bool,
        now: i64,
    ) -> Result<Value, AppError> {
        let db = self.journal.db()?;
        let row:PairingRow=db.query_row("SELECT id,device_label,challenge,state,expires_at,pending_csrf_secret,claim_grace_until,last_issued_session_id FROM pairings WHERE id=?1",[id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?))).optional()?.ok_or_else(||AppError::reject(404,"PAIRING_NOT_FOUND"))?;
        if row.4 <= instant(now) || !matches!(row.3.as_str(), "pending" | "approved") {
            return Err(AppError::reject(409, "PAIRING_NOT_PENDING"));
        }
        if approve && !csrf_matches(&row.2, challenge) {
            return Err(AppError::reject(409, "CHALLENGE_MISMATCH"));
        }
        let state = if approve { "approved" } else { "denied" };
        db.execute(
            "UPDATE pairings SET state=?2 WHERE id=?1",
            params![id, state],
        )?;
        let mut view = pairing_view(&row, now, false);
        view["state"] = json!(state);
        Ok(view)
    }
    pub fn claim(&self, token: &str, csrf: &str, now: i64) -> Result<Claimed, AppError> {
        let mut db = self.journal.db()?;
        let tx = db.transaction()?;
        let row = Self::by_secret(&tx, token)?;
        if !csrf_matches(
            std::str::from_utf8(&row.5).map_err(|_| AppError::State)?,
            csrf,
        ) {
            return Err(AppError::reject(403, "CSRF_MISMATCH"));
        }
        let retry = row.3 == "claimed" && row.6.as_ref().is_some_and(|until| until > &instant(now));
        if !retry && (row.3 != "approved" || row.4 <= instant(now)) {
            return Err(AppError::reject(409, "PAIRING_NOT_APPROVED"));
        }
        if let Some(old) = &row.7 {
            tx.execute(
                "UPDATE sessions SET revoked_at=?2 WHERE id=?1",
                params![old, instant(now)],
            )?;
        }
        let active: i64 = tx.query_row(
            "SELECT count(*) FROM sessions WHERE revoked_at IS NULL AND expires_at>?1",
            [instant(now)],
            |r| r.get(0),
        )?;
        if active >= 100 {
            return Err(AppError::reject(409, "SESSION_LIMIT_REACHED"));
        }
        let id = Uuid::new_v4().to_string();
        let session_token = secret()?;
        let session_csrf = secret()?;
        let expires = instant(now + 30 * DAY);
        let created = instant(now);
        tx.execute("INSERT INTO sessions(id,token_hash,csrf_secret,device_label,created_at,last_seen_at,expires_at) VALUES(?1,?2,?3,?4,?5,?5,?6)",params![id,hash(&session_token),session_csrf.as_bytes(),row.1,created,expires])?;
        let grace = if retry {
            row.6.unwrap()
        } else {
            instant(now + 60_000)
        };
        tx.execute("UPDATE pairings SET state='claimed',claim_grace_until=?2,last_issued_session_id=?3 WHERE id=?1",params![row.0,grace,id])?;
        tx.commit()?;
        Ok(Claimed {
            session_token,
            view: json!({"id":id,"device_label":row.1,"created_at":created,"last_seen_at":created,"expires_at":expires,"current":true}),
        })
    }
    pub fn authenticate(&self, token: &str, now: i64) -> Result<Session, AppError> {
        if token.len() != 64 {
            return Err(AppError::reject(401, "SESSION_REQUIRED"));
        }
        let db = self.journal.db()?;
        let row:Option<(String,Vec<u8>,String,String,String,String)>=db.query_row("SELECT id,csrf_secret,device_label,created_at,last_seen_at,expires_at FROM sessions WHERE token_hash=?1 AND revoked_at IS NULL AND expires_at>?2",params![hash(token),instant(now)],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?))).optional()?;
        let (id, csrf, label, created, last, mut expires) =
            row.ok_or_else(|| AppError::reject(401, "SESSION_REQUIRED"))?;
        let created_ms = chrono::DateTime::parse_from_rfc3339(&created)
            .map_err(|_| AppError::State)?
            .timestamp_millis();
        if now >= created_ms + 90 * DAY {
            return Err(AppError::reject(401, "SESSION_EXPIRED"));
        }
        let last_ms = chrono::DateTime::parse_from_rfc3339(&last)
            .map_err(|_| AppError::State)?
            .timestamp_millis();
        let mut seen = last;
        if now - last_ms >= 60_000 {
            seen = instant(now);
            expires = instant((now + 30 * DAY).min(created_ms + 90 * DAY));
            db.execute(
                "UPDATE sessions SET last_seen_at=?2,expires_at=?3 WHERE id=?1",
                params![id, seen, expires],
            )?;
        }
        Ok(Session {
            id: id.clone(),
            csrf: String::from_utf8(csrf).map_err(|_| AppError::State)?,
            view: json!({"id":id,"device_label":label,"created_at":created,"last_seen_at":seen,"expires_at":expires,"current":true}),
        })
    }
    pub fn pairings(&self, now: i64) -> Result<Value, AppError> {
        let db = self.journal.db()?;
        let mut statement=db.prepare("SELECT id,device_label,challenge,state,expires_at,pending_csrf_secret,claim_grace_until,last_issued_session_id FROM pairings WHERE state IN ('pending','approved') AND expires_at>?1 ORDER BY expires_at DESC LIMIT 10")?;
        let items = statement
            .query_map([instant(now)], |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                ))
            })?
            .map(|row| row.map(|row| pairing_view(&row, now, false)))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(json!({"items":items}))
    }
    pub fn sessions(&self, current: Option<&str>, now: i64) -> Result<Value, AppError> {
        let db = self.journal.db()?;
        let mut statement=db.prepare("SELECT id,device_label,created_at,last_seen_at,expires_at FROM sessions WHERE revoked_at IS NULL AND expires_at>?1 ORDER BY last_seen_at DESC LIMIT 100")?;
        let items=statement.query_map([instant(now)],|r| {
            let id:String=r.get(0)?;
            Ok(json!({"current":current==Some(&id),"id":id,"device_label":r.get::<_,String>(1)?,"created_at":r.get::<_,String>(2)?,"last_seen_at":r.get::<_,String>(3)?,"expires_at":r.get::<_,String>(4)?}))
        })?.collect::<Result<Vec<_>,_>>()?;
        Ok(json!({"items":items}))
    }
    pub fn revoke(&self, id: &str, current: Option<&str>, now: i64) -> Result<Value, AppError> {
        let db = self.journal.db()?;
        let view:Value=db.query_row("SELECT device_label,created_at,last_seen_at,expires_at FROM sessions WHERE id=?1",[id],|r|Ok(json!({"id":id,"current":current==Some(id),"device_label":r.get::<_,String>(0)?,"created_at":r.get::<_,String>(1)?,"last_seen_at":r.get::<_,String>(2)?,"expires_at":r.get::<_,String>(3)?}))).optional()?.ok_or_else(||AppError::reject(404,"SESSION_NOT_FOUND"))?;
        db.execute(
            "UPDATE sessions SET revoked_at=?2 WHERE id=?1",
            params![id, instant(now)],
        )?;
        Ok(view)
    }
}
