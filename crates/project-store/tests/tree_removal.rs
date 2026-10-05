use project_store::tree_removal::{inventory, remove_step};
use std::fs;

#[test]
fn deletion_removes_only_the_inventoried_project_tree() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    fs::create_dir_all(root.join(".project/cards")).unwrap();
    fs::write(root.join(".project/project.json"), "project source").unwrap();
    fs::write(root.join(".project/cards/card.json"), "card source").unwrap();
    fs::write(root.join("README.md"), "repository document").unwrap();
    let observed = inventory(&root).unwrap();
    for cursor in 0..observed.entries.len() {
        remove_step(&root, &observed, cursor).unwrap();
    }
    assert!(!root.join(".project").exists());
    assert_eq!(
        fs::read_to_string(root.join("README.md")).unwrap(),
        "repository document"
    );
}

#[test]
fn changed_parent_is_rejected_even_if_file_identity_and_bytes_match() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    fs::create_dir_all(root.join(".project/cards")).unwrap();
    fs::write(root.join(".project/cards/card.json"), "card source").unwrap();
    let observed = inventory(&root).unwrap();
    fs::rename(root.join(".project/cards"), root.join("old-cards")).unwrap();
    fs::create_dir(root.join(".project/cards")).unwrap();
    fs::rename(
        root.join("old-cards/card.json"),
        root.join(".project/cards/card.json"),
    )
    .unwrap();
    assert!(remove_step(&root, &observed, 0).is_err());
    assert!(root.join(".project/cards/card.json").exists());
}

fn locked_project() -> (tempfile::TempDir, std::path::PathBuf, fs::File) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    fs::create_dir_all(root.join(".project/.local")).unwrap();
    fs::write(root.join(".project/project.json"), "project source").unwrap();
    let lock = root.join(".project/.local/writer.lock");
    fs::write(&lock, "").unwrap();
    let holder = fs::File::open(&lock).unwrap();
    rustix::fs::flock(
        &holder,
        rustix::fs::FlockOperation::NonBlockingLockExclusive,
    )
    .unwrap();
    (temp, root, holder)
}

#[test]
fn deletion_lease_outlasts_a_lock_reference_that_is_just_being_closed() {
    use project_store::tree_removal::deletion_lease;
    let (_temp, root, holder) = locked_project();
    let observed = inventory(&root).unwrap();
    // A subprocess being spawned on another thread briefly keeps the released
    // writer lock's open file alive until its exec closes it.
    let closing = std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(40));
        drop(holder);
    });
    let lease = deletion_lease(&root, &observed, 0);
    closing.join().unwrap();
    assert!(matches!(lease, Ok(Some(_))), "{lease:?}");
}

#[test]
fn deletion_lease_still_refuses_a_writer_lock_another_owner_keeps() {
    use project_store::tree_removal::deletion_lease;
    let (_temp, root, holder) = locked_project();
    let observed = inventory(&root).unwrap();
    let started = std::time::Instant::now();
    let lease = deletion_lease(&root, &observed, 0);
    assert!(
        matches!(&lease, Err(project_store::StoreError::Io(error))
            if error.kind() == std::io::ErrorKind::WouldBlock),
        "{lease:?}"
    );
    // The wait for a closing reference is short and bounded.
    assert!(started.elapsed() < std::time::Duration::from_secs(2));
    drop(holder);
}
