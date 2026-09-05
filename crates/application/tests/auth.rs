use project_application::{
    AppError,
    auth::{Auth, csrf_matches},
    journal::Journal,
    now_millis, wire,
};
use serde_json::json;
use std::os::unix::fs::PermissionsExt;

#[test]
fn pairing_requires_owner_approval_cookie_and_csrf_and_claim_retry_rotates() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::set_permissions(temp.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    let journal = Journal::open(&temp.path().canonicalize().unwrap()).unwrap();
    let auth = Auth { journal: &journal };
    let now = now_millis();
    let start = auth
        .start(&json!({"device_label":"Test browser"}), now)
        .unwrap();
    wire::validate("Pairing", &start.view).unwrap();
    let csrf = start.view["pending_csrf_token"].as_str().unwrap();
    let id = start.view["id"].as_str().unwrap();
    let challenge = start.view["challenge"].as_str().unwrap();
    assert!(auth.claim(&start.pending_token, csrf, now).is_err());
    assert!(auth.decide(id, "wrong challenge", true, now).is_err());
    auth.decide(id, challenge, true, now).unwrap();
    assert!(auth.claim(&start.pending_token, "wrong csrf", now).is_err());
    assert!(auth.current(&"a".repeat(64), now).is_err());
    let first = auth.claim(&start.pending_token, csrf, now).unwrap();
    wire::validate("Session", &first.view).unwrap();
    let first_session = auth.authenticate(&first.session_token, now).unwrap();
    assert_eq!(first_session.id, first.view["id"]);
    let retry = auth
        .claim(&start.pending_token, csrf, now + 10_000)
        .unwrap();
    assert_ne!(first.session_token, retry.session_token);
    assert!(
        auth.authenticate(&first.session_token, now + 10_000)
            .is_err()
    );
    let session = auth
        .authenticate(&retry.session_token, now + 10_000)
        .unwrap();
    assert!(csrf_matches(&session.csrf, &session.csrf));
    assert!(!csrf_matches(&session.csrf, "invalid"));
    assert!(
        auth.claim(&start.pending_token, csrf, now + 61_000)
            .is_err(),
        "retry must not extend grace"
    );
    auth.revoke(&session.id, Some(&session.id), now + 11_000)
        .unwrap();
    assert!(
        auth.authenticate(&retry.session_token, now + 11_000)
            .is_err()
    );
    let db = journal.db().unwrap();
    let hashes: Vec<Vec<u8>> = db
        .prepare("SELECT token_hash FROM sessions")
        .unwrap()
        .query_map([], |r| r.get(0))
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap();
    assert!(
        hashes
            .iter()
            .all(|h| h.len() == 32 && h.as_slice() != retry.session_token.as_bytes())
    );
}

#[test]
fn rate_limits_and_expiration_are_enforced() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::set_permissions(temp.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    let journal = Journal::open(&temp.path().canonicalize().unwrap()).unwrap();
    let auth = Auth { journal: &journal };
    let now = now_millis();
    for _ in 0..5 {
        auth.start(&json!({"device_label":"Browser"}), now).unwrap();
    }
    assert!(
        matches!(auth.start(&json!({"device_label":"Browser"}),now),Err(AppError::Rejected(reply)) if reply.http_status==429)
    );
    let late = auth
        .start(&json!({"device_label":"Later browser"}), now + 61_000)
        .unwrap();
    assert_eq!(
        auth.current(&late.pending_token, now + 362_000).unwrap()["state"],
        "expired"
    );
    assert!(
        auth.decide(
            late.view["id"].as_str().unwrap(),
            late.view["challenge"].as_str().unwrap(),
            true,
            now + 362_000
        )
        .is_err()
    );
    wire::validate("PairingPage", &auth.pairings(now).unwrap()).unwrap();
}

#[test]
fn session_idle_and_absolute_expiration_survive_restart() {
    let temp = tempfile::tempdir().unwrap();
    std::fs::set_permissions(temp.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    let path = temp.path().canonicalize().unwrap();
    let journal = Journal::open(&path).unwrap();
    let auth = Auth { journal: &journal };
    let now = now_millis();
    let day = 86_400_000;
    let pending = auth
        .start(&json!({"device_label":"Long lived browser"}), now)
        .unwrap();
    auth.decide(
        pending.view["id"].as_str().unwrap(),
        pending.view["challenge"].as_str().unwrap(),
        true,
        now,
    )
    .unwrap();
    let claimed = auth
        .claim(
            &pending.pending_token,
            pending.view["pending_csrf_token"].as_str().unwrap(),
            now,
        )
        .unwrap();
    drop(journal);
    let journal = Journal::open(&path).unwrap();
    let auth = Auth { journal: &journal };
    for days in [20, 40, 60, 80, 89] {
        assert!(
            auth.authenticate(&claimed.session_token, now + days * day)
                .is_ok()
        );
    }
    assert!(
        auth.authenticate(&claimed.session_token, now + 90 * day)
            .is_err()
    );
    wire::validate("Sessions", &auth.sessions(None, now + 90 * day).unwrap()).unwrap();
}
