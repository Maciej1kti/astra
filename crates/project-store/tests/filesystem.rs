use project_store::{
    StoreError,
    document::{Kind, version},
    filesystem::{Directory, ProjectStore, WritePoint},
};
use std::{fs, os::unix::fs::symlink};

#[test]
fn conditional_create_replace_and_exclusive_lease() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let store = ProjectStore::open(&root, true).unwrap();
    assert!(ProjectStore::open(&root, false).is_err());
    let (directory, name) = store
        .location(Kind::Card, "22222222-2222-4222-8222-222222222222", true)
        .unwrap();
    directory.replace(&name, b"before", None).unwrap();
    assert!(matches!(
        directory.replace(&name, b"overwrite", None),
        Err(StoreError::Conflict)
    ));
    assert!(matches!(
        directory.replace(&name, b"overwrite", Some("r1.stale")),
        Err(StoreError::Conflict)
    ));
    assert_eq!(directory.read(&name).unwrap().unwrap(), b"before");
    directory
        .replace(&name, b"after", Some(&version(b"before")))
        .unwrap();
    assert_eq!(directory.read(&name).unwrap().unwrap(), b"after");
    drop(store);
    assert!(ProjectStore::open(&root, false).is_ok());
}

#[test]
fn symlinks_hardlinks_traversal_and_replaced_leases_are_rejected() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let store = ProjectStore::open(&root, true).unwrap();
    let directory = &store.directory;
    fs::write(root.join("outside"), b"private").unwrap();
    symlink(root.join("outside"), directory.path().join("escape")).unwrap();
    assert!(directory.read("escape").is_err());
    fs::hard_link(root.join("outside"), directory.path().join("hardlink")).unwrap();
    assert!(directory.read("hardlink").is_err());
    for name in ["../outside", "/etc/passwd", ".", "..", "a/b"] {
        assert!(directory.read(name).is_err());
    }
    fs::remove_file(directory.path().join(".local/writer.lock")).unwrap();
    fs::write(directory.path().join(".local/writer.lock"), b"new").unwrap();
    assert!(
        store
            .location(Kind::Project, "11111111-1111-4111-8111-111111111111", false)
            .is_err()
    );
}

#[test]
fn detached_directory_cannot_receive_a_write() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    fs::create_dir(root.join("approved")).unwrap();
    let dir = Directory::open(&root.join("approved")).unwrap();
    fs::rename(root.join("approved"), root.join("moved")).unwrap();
    fs::create_dir(root.join("approved")).unwrap();
    assert!(dir.replace("card", b"data", None).is_err());
    assert!(!root.join("moved/card").exists());
}

#[test]
fn failure_after_rename_keeps_the_new_source_for_recovery() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let dir = Directory::open(&root).unwrap();
    dir.replace("card", b"before", None).unwrap();
    let result = dir.replace_with("card", b"after", Some(&version(b"before")), |point| {
        if point == WritePoint::Renamed {
            Err(StoreError::Invalid("INJECTED_FAILURE"))
        } else {
            Ok(())
        }
    });
    assert!(result.is_err());
    assert_eq!(dir.read("card").unwrap().unwrap(), b"after");
    dir.resync("card").unwrap();
}

#[test]
fn project_directory_must_not_be_a_symlink() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    fs::create_dir(root.join("outside")).unwrap();
    symlink(root.join("outside"), root.join(".project")).unwrap();
    assert!(ProjectStore::open(&root, true).is_err());
}
