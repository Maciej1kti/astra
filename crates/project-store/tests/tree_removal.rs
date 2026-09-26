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
