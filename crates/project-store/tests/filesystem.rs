use project_store::{
    StoreError,
    document::{Kind, version},
    filesystem::{DeletePoint, Directory, ProjectStore, WritePoint},
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
fn every_resource_lookup_rejects_replaced_lease_or_project_directory() {
    let id = "11111111-1111-4111-8111-111111111111";
    for kind in [Kind::Project, Kind::Card, Kind::Milestone, Kind::Update] {
        for replace_project in [false, true] {
            let temp = tempfile::tempdir().unwrap();
            let root = temp.path().canonicalize().unwrap();
            let store = ProjectStore::open(&root, true).unwrap();
            store.location(kind, id, true).unwrap();
            if replace_project {
                fs::rename(root.join(".project"), root.join("detached")).unwrap();
                fs::create_dir_all(root.join(".project/.local")).unwrap();
                fs::write(root.join(".project/.local/writer.lock"), b"replacement").unwrap();
            } else {
                fs::remove_file(root.join(".project/.local/writer.lock")).unwrap();
                fs::write(root.join(".project/.local/writer.lock"), b"replacement").unwrap();
            }
            assert!(store.location(kind, id, true).is_err());
            if let Some(collection) = kind.directory()
                && replace_project
            {
                assert!(!root.join(".project").join(collection).exists());
            }
        }
    }
}

#[test]
fn collection_reader_rejects_replacement_after_an_earlier_read() {
    let id = "11111111-1111-4111-8111-111111111111";
    for kind in [Kind::Card, Kind::Milestone, Kind::Update] {
        for replacement in ["lease", "collection", "project", "reparented children"] {
            let temp = tempfile::tempdir().unwrap();
            let root = temp.path().canonicalize().unwrap();
            let store = ProjectStore::open(&root, true).unwrap();
            let (directory, name) = store.location(kind, id, true).unwrap();
            directory.replace(&name, b"before", None).unwrap();
            let reader = store.collection_reader(kind).unwrap();
            assert_eq!(reader.read(id).unwrap().unwrap(), b"before");
            let collection = kind.directory().unwrap();
            match replacement {
                "lease" => {
                    fs::remove_file(root.join(".project/.local/writer.lock")).unwrap();
                    fs::write(root.join(".project/.local/writer.lock"), b"new").unwrap();
                }
                "collection" => {
                    fs::rename(directory.path(), root.join("detached")).unwrap();
                    fs::create_dir(root.join(".project").join(collection)).unwrap();
                }
                "project" => {
                    fs::rename(root.join(".project"), root.join("detached")).unwrap();
                    fs::create_dir_all(root.join(".project/.local")).unwrap();
                    fs::write(root.join(".project/.local/writer.lock"), b"new").unwrap();
                }
                "reparented children" => {
                    fs::rename(root.join(".project"), root.join("detached")).unwrap();
                    fs::create_dir(root.join(".project")).unwrap();
                    for name in [".local", collection] {
                        fs::rename(
                            root.join("detached").join(name),
                            root.join(".project").join(name),
                        )
                        .unwrap();
                    }
                }
                _ => unreachable!(),
            }
            assert!(reader.read(id).is_err(), "{kind:?}: {replacement}");
            assert!(reader.names().is_err(), "{kind:?}: {replacement}");
        }
    }
}

#[test]
fn collection_reader_rejects_changed_lease_directory_after_an_earlier_read() {
    let id = "11111111-1111-4111-8111-111111111111";
    for kind in [Kind::Card, Kind::Milestone, Kind::Update] {
        for change in ["symlink", "replacement", "hardlink"] {
            let temp = tempfile::tempdir().unwrap();
            let root = temp.path().canonicalize().unwrap();
            let store = ProjectStore::open(&root, true).unwrap();
            let (directory, name) = store.location(kind, id, true).unwrap();
            directory.replace(&name, b"before", None).unwrap();
            let reader = store.collection_reader(kind).unwrap();
            assert_eq!(reader.read(id).unwrap().unwrap(), b"before");
            let local = root.join(".project/.local");
            let moved = root.join(".project/previous-local");
            fs::rename(&local, &moved).unwrap();
            if change == "symlink" {
                // A symlink can expose the very same locked inode. It is still
                // forbidden as a component of the current lease path.
                symlink(&moved, &local).unwrap();
            } else {
                fs::create_dir(&local).unwrap();
                if change == "hardlink" {
                    fs::hard_link(moved.join("writer.lock"), local.join("writer.lock")).unwrap();
                } else {
                    fs::write(local.join("writer.lock"), b"replacement").unwrap();
                }
            }
            assert!(reader.read(id).is_err(), "{kind:?}: {change}");
            assert_eq!(fs::read(directory.path().join(name)).unwrap(), b"before");
        }
    }
}

#[test]
fn collection_reader_observes_current_bytes_and_retains_file_guards() {
    use project_store::document::MAX_DOCUMENT;
    let id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let store = ProjectStore::open(&root, true).unwrap();
    let (directory, name) = store.location(Kind::Card, id, true).unwrap();
    directory.replace(&name, b"before", None).unwrap();
    let reader = store.collection_reader(Kind::Card).unwrap();
    assert_eq!(
        reader.names().unwrap().as_slice(),
        std::slice::from_ref(&name)
    );
    assert_eq!(reader.read(id).unwrap().unwrap(), b"before");
    directory
        .replace(&name, b"after", Some(&version(b"before")))
        .unwrap();
    assert_eq!(reader.read(id).unwrap().unwrap(), b"after");
    for invalid in [
        "../outside",
        "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
        "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
    ] {
        assert!(reader.read(invalid).is_err());
    }
    fs::remove_file(directory.path().join(&name)).unwrap();
    assert!(reader.read(id).unwrap().is_none());
    let outside = root.join("outside");
    fs::write(&outside, b"private").unwrap();
    symlink(&outside, directory.path().join(&name)).unwrap();
    assert!(reader.read(id).is_err());
    fs::remove_file(directory.path().join(&name)).unwrap();
    fs::hard_link(&outside, directory.path().join(&name)).unwrap();
    assert!(reader.read(id).is_err());
    fs::remove_file(directory.path().join(&name)).unwrap();
    fs::write(directory.path().join(&name), vec![b'x'; MAX_DOCUMENT + 1]).unwrap();
    assert!(reader.read(id).is_err());
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
fn conditional_delete_unlinks_and_syncs_the_parent_directory() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let dir = Directory::open(&root).unwrap();
    dir.replace("card", b"before", None).unwrap();
    let mut points = Vec::new();
    dir.remove_with("card", &version(b"before"), |point| {
        points.push(point);
        Ok(())
    })
    .unwrap();
    assert_eq!(
        points,
        [DeletePoint::Unlinked, DeletePoint::DirectorySynced]
    );
    assert_eq!(dir.read("card").unwrap(), None);
    assert!(matches!(
        dir.remove_with("card", &version(b"before"), |_| Ok(())),
        Err(StoreError::Conflict)
    ));
}

#[test]
fn conditional_delete_rejects_an_observed_version_change() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    let dir = Directory::open(&root).unwrap();
    dir.replace("card", b"before", None).unwrap();
    assert!(matches!(
        dir.remove_with("card", &version(b"other"), |_| Ok(())),
        Err(StoreError::Conflict)
    ));
    assert_eq!(dir.read("card").unwrap().unwrap(), b"before");
}

#[test]
fn project_directory_must_not_be_a_symlink() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    fs::create_dir(root.join("outside")).unwrap();
    symlink(root.join("outside"), root.join(".project")).unwrap();
    assert!(ProjectStore::open(&root, true).is_err());
}
