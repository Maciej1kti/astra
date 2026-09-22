//! Bounded, descriptor-relative inventory and removal of one project's
//! `.project` directory.
//!
//! This module deliberately does not use `remove_dir_all`.  An inventory is a
//! durable snapshot: each entry carries its identity and, for files, its
//! content digest.  `remove_step` is idempotent so a caller can persist its
//! cursor after each fsync and safely retry after a process failure.

use crate::{StoreError, document::version};
use rustix::fs::{self, AtFlags, FlockOperation, Mode, OFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::File,
    io::Read,
    path::{Component, Path, PathBuf},
};

pub const MAX_FILES: usize = 100_000;
pub const MAX_BYTES: u64 = 256 * 1024 * 1024;
pub const MAX_DEPTH: usize = 32;
pub const MAX_MANIFEST_BYTES: usize = 16 * 1024 * 1024;
const MAX_PATH_BYTES: usize = 4096;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntryKind {
    File,
    Directory,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Entry {
    /// Components relative to the project root, including `.project`.
    pub path: Vec<String>,
    pub kind: EntryKind,
    pub identity: (u64, u64),
    pub hash: Option<String>,
    pub size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Inventory {
    pub project_root_identity: (u64, u64),
    pub entries: Vec<Entry>,
    pub file_count: usize,
    pub total_bytes: u64,
    pub directories: BTreeMap<String, (u64, u64)>,
}

impl Inventory {
    /// The deletion plan validator.  It binds the complete tree inventory,
    /// identities and ordering to the exact version presented to the caller.
    pub fn version(&self) -> String {
        let bytes = serde_json::to_vec(self).expect("tree inventory serializes");
        version(&bytes)
    }

    pub fn root(&self) -> Option<&Entry> {
        self.entries.iter().find(|entry| entry.path == [".project"])
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemovalOutcome {
    Removed,
    AlreadyAbsent,
}

fn component(name: &str) -> Result<(), StoreError> {
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\0']) {
        return Err(StoreError::Invalid("UNSAFE_PATH"));
    }
    Ok(())
}

fn open_directory(path: &Path) -> Result<File, StoreError> {
    if !path.is_absolute() || path.to_str().is_none() {
        return Err(StoreError::Invalid("ABSOLUTE_UTF8_PATH_REQUIRED"));
    }
    let mut fd = fs::open(
        "/",
        OFlags::RDONLY | OFlags::DIRECTORY | OFlags::CLOEXEC,
        Mode::empty(),
    )?;
    for part in path.components() {
        match part {
            Component::RootDir => {}
            Component::Normal(name) => {
                fd = fs::openat(
                    &fd,
                    name,
                    OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                    Mode::empty(),
                )?;
            }
            _ => return Err(StoreError::Invalid("UNSAFE_PATH")),
        }
    }
    Ok(File::from(fd))
}

fn identity(file: &File) -> Result<(u64, u64), StoreError> {
    let stat = fs::fstat(file)?;
    Ok((stat.st_dev, stat.st_ino))
}

fn is_directory(parent: &File, name: &str) -> Result<bool, StoreError> {
    component(name)?;
    let stat = fs::statat(parent, name, AtFlags::SYMLINK_NOFOLLOW)?;
    match fs::FileType::from_raw_mode(stat.st_mode) {
        fs::FileType::Directory => Ok(true),
        fs::FileType::RegularFile => Ok(false),
        _ => Err(StoreError::Invalid("PROJECT_TREE_UNSUPPORTED")),
    }
}

fn read_names(parent: &File, path: &Path) -> Result<Vec<String>, StoreError> {
    let before = identity(parent)?;
    if identity(&open_directory(path)?)? != before {
        return Err(StoreError::Invalid("PROJECT_TREE_DIRECTORY_CHANGED"));
    }
    let mut names = Vec::new();
    for item in fs::Dir::read_from(parent)? {
        let item = item?;
        let name = item
            .file_name()
            .to_str()
            .map_err(|_| StoreError::Invalid("NON_UTF8_PATH"))?;
        if matches!(name, "." | "..") {
            continue;
        }
        if names.len() >= MAX_FILES {
            return Err(StoreError::Invalid("PROJECT_TREE_ENTRY_LIMIT"));
        }
        names.push(name.to_owned());
    }
    names.sort();
    if identity(&open_directory(path)?)? != before {
        return Err(StoreError::Invalid("PROJECT_TREE_DIRECTORY_CHANGED"));
    }
    Ok(names)
}

fn open_child_directory(parent: &File, name: &str) -> Result<File, StoreError> {
    component(name)?;
    Ok(File::from(fs::openat(
        parent,
        name,
        OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
        Mode::empty(),
    )?))
}

fn regular_file(parent: &File, name: &str) -> Result<File, StoreError> {
    component(name)?;
    let file = File::from(fs::openat(
        parent,
        name,
        OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
        Mode::empty(),
    )?);
    let stat = fs::fstat(&file)?;
    if fs::FileType::from_raw_mode(stat.st_mode) != fs::FileType::RegularFile || stat.st_nlink != 1
    {
        return Err(StoreError::Invalid("PROJECT_TREE_SPECIAL_FILE_OR_HARDLINK"));
    }
    Ok(file)
}

fn file_entry(parent: &File, name: &str, path: Vec<String>) -> Result<Entry, StoreError> {
    let mut file = regular_file(parent, name)?;
    let before = fs::fstat(&file)?;
    let identity = (before.st_dev, before.st_ino);
    if before.st_size < 0 || before.st_size as u64 > MAX_BYTES {
        return Err(StoreError::Invalid("PROJECT_TREE_BYTES_LIMIT"));
    }
    let mut hash = Sha256::new();
    let mut size = 0_u64;
    let mut buffer = [0_u8; 65536];
    loop {
        let count = file.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        size += count as u64;
        if size > MAX_BYTES {
            return Err(StoreError::Invalid("PROJECT_TREE_BYTES_LIMIT"));
        }
        hash.update(&buffer[..count]);
    }
    let after = fs::fstat(&file)?;
    if before.st_size != after.st_size
        || size != before.st_size as u64
        || before.st_mtime != after.st_mtime
        || before.st_mtime_nsec != after.st_mtime_nsec
        || before.st_ctime != after.st_ctime
        || before.st_ctime_nsec != after.st_ctime_nsec
    {
        return Err(StoreError::Invalid("PROJECT_TREE_CHANGED"));
    }
    Ok(Entry {
        path,
        kind: EntryKind::File,
        identity,
        hash: Some(format!(
            "r1.{}",
            hash.finalize()
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>()
        )),
        size,
    })
}

fn scan_directory(
    directory: &File,
    path: &Path,
    relative: &[String],
    depth: usize,
    entries: &mut Vec<Entry>,
    total_bytes: &mut u64,
    path_bytes: &mut usize,
) -> Result<(), StoreError> {
    if depth > MAX_DEPTH {
        return Err(StoreError::Invalid("PROJECT_TREE_DEPTH_LIMIT"));
    }
    let names = read_names(directory, path)?;
    for name in names {
        component(&name)?;
        let mut item_path = relative.to_vec();
        item_path.push(name.clone());
        let path_size = item_path.iter().map(|part| part.len() + 1).sum::<usize>();
        *path_bytes += path_size + 256;
        if path_size > MAX_PATH_BYTES || *path_bytes > MAX_MANIFEST_BYTES / 2 {
            return Err(StoreError::Invalid("PROJECT_TREE_MANIFEST_LIMIT"));
        }
        if entries.len() >= MAX_FILES {
            return Err(StoreError::Invalid("PROJECT_TREE_ENTRY_LIMIT"));
        }
        if is_directory(directory, &name)? {
            let child = open_child_directory(directory, &name)?;
            if identity(&child)?.0 != identity(directory)?.0 {
                return Err(StoreError::Invalid("PROJECT_TREE_MOUNT_POINT"));
            }
            let item = Entry {
                path: item_path.clone(),
                kind: EntryKind::Directory,
                identity: identity(&child)?,
                hash: None,
                size: 0,
            };
            entries.push(item);
            scan_directory(
                &child,
                &path.join(&name),
                &item_path,
                depth + 1,
                entries,
                total_bytes,
                path_bytes,
            )?;
        } else {
            let item = file_entry(directory, &name, item_path)?;
            *total_bytes = total_bytes
                .checked_add(item.size)
                .ok_or(StoreError::Invalid("PROJECT_TREE_BYTES_LIMIT"))?;
            if *total_bytes > MAX_BYTES {
                return Err(StoreError::Invalid("PROJECT_TREE_BYTES_LIMIT"));
            }
            entries.push(item);
        }
    }
    Ok(())
}

fn entry_depth(entry: &Entry) -> usize {
    entry.path.len()
}

/// Scan exactly `<project_root>/.project` through no-follow directory handles.
pub fn inventory(project_root: &Path) -> Result<Inventory, StoreError> {
    let root = open_directory(project_root)?;
    let project_root_identity = identity(&root)?;
    let project = open_child_directory(&root, ".project")?;
    if identity(&project)?.0 != project_root_identity.0 {
        return Err(StoreError::Invalid("PROJECT_TREE_MOUNT_POINT"));
    }
    let mut entries = vec![Entry {
        path: vec![".project".into()],
        kind: EntryKind::Directory,
        identity: identity(&project)?,
        hash: None,
        size: 0,
    }];
    let mut total_bytes = 0;
    scan_directory(
        &project,
        &project_root.join(".project"),
        &[".project".into()],
        1,
        &mut entries,
        &mut total_bytes,
        &mut 0,
    )?;
    if entries.len() > MAX_FILES {
        return Err(StoreError::Invalid("PROJECT_TREE_ENTRY_LIMIT"));
    }
    // The manifest is canonical and keeps the writer lock as the final file.
    // This lets the caller retain its existing lease until every other source
    // file has been removed.
    // The lock must be the last file, and the `.project` root the final entry.
    let mut files = entries
        .iter()
        .filter(|entry| {
            entry.kind == EntryKind::File && entry.path != [".project", ".local", "writer.lock"]
        })
        .cloned()
        .collect::<Vec<_>>();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    let lock = entries
        .iter()
        .find(|entry| entry.path == [".project", ".local", "writer.lock"])
        .cloned();
    let mut directories = entries
        .iter()
        .filter(|entry| entry.kind == EntryKind::Directory && entry.path != [".project"])
        .cloned()
        .collect::<Vec<_>>();
    directories.sort_by(|a, b| {
        entry_depth(b)
            .cmp(&entry_depth(a))
            .then_with(|| b.path.cmp(&a.path))
    });
    let project = entries
        .iter()
        .find(|entry| entry.path == [".project"])
        .cloned()
        .ok_or(StoreError::Invalid("PROJECT_TREE_ROOT_MISSING"))?;
    files.extend(lock);
    files.extend(directories);
    files.push(project);
    let file_count = files
        .iter()
        .filter(|entry| entry.kind == EntryKind::File)
        .count();
    let directories = files
        .iter()
        .filter(|entry| entry.kind == EntryKind::Directory)
        .map(|entry| (entry.path.join("/"), entry.identity))
        .collect();
    let inventory = Inventory {
        project_root_identity,
        entries: files,
        file_count,
        total_bytes,
        directories,
    };
    if serde_json::to_vec(&inventory)
        .map_err(|_| StoreError::Invalid("PROJECT_TREE_MANIFEST"))?
        .len()
        > MAX_MANIFEST_BYTES
    {
        return Err(StoreError::Invalid("PROJECT_TREE_MANIFEST_LIMIT"));
    }
    Ok(inventory)
}

fn open_parent(
    project_root: &File,
    path: &[String],
    inventory: &Inventory,
) -> Result<File, StoreError> {
    if path.len() < 2 || path[0] != ".project" {
        return Err(StoreError::Invalid("PROJECT_TREE_PATH"));
    }
    let mut directory = project_root.try_clone()?;
    let mut relative = Vec::new();
    for part in &path[..path.len() - 1] {
        directory = open_child_directory(&directory, part)?;
        relative.push(part.as_str());
        if inventory.directories.get(&relative.join("/")).copied() != Some(identity(&directory)?) {
            return Err(StoreError::Invalid("PROJECT_TREE_DIRECTORY_CHANGED"));
        }
    }
    Ok(directory)
}

fn remove_file(parent: &File, entry: &Entry) -> Result<RemovalOutcome, StoreError> {
    let name = entry
        .path
        .last()
        .ok_or(StoreError::Invalid("PROJECT_TREE_PATH"))?;
    let actual = match file_entry(parent, name, entry.path.clone()) {
        Ok(value) => value,
        Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            parent.sync_all()?;
            return Ok(RemovalOutcome::AlreadyAbsent);
        }
        Err(error) => return Err(error),
    };
    if &actual != entry {
        return Err(StoreError::Invalid("PROJECT_TREE_CHANGED"));
    }
    fs::unlinkat(parent, name, AtFlags::empty())?;
    parent.sync_all()?;
    Ok(RemovalOutcome::Removed)
}

fn remove_directory(
    parent: &File,
    entry: &Entry,
    path: &Path,
) -> Result<RemovalOutcome, StoreError> {
    let name = entry
        .path
        .last()
        .ok_or(StoreError::Invalid("PROJECT_TREE_PATH"))?;
    let child = match open_child_directory(parent, name) {
        Ok(value) => value,
        Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            parent.sync_all()?;
            return Ok(RemovalOutcome::AlreadyAbsent);
        }
        Err(error) => return Err(error),
    };
    if identity(&child)? != entry.identity {
        return Err(StoreError::Invalid("PROJECT_TREE_CHANGED"));
    }
    if !read_names(&child, path)?.is_empty() {
        return Err(StoreError::Invalid("PROJECT_TREE_CHANGED"));
    }
    fs::unlinkat(parent, name, AtFlags::REMOVEDIR)?;
    parent.sync_all()?;
    Ok(RemovalOutcome::Removed)
}

/// Remove one manifest entry at `cursor`.  Missing entries are accepted only
/// when the prior attempt already removed exactly that recorded entry.
pub fn remove_step(
    project_root: &Path,
    inventory: &Inventory,
    cursor: usize,
) -> Result<RemovalOutcome, StoreError> {
    if cursor >= inventory.entries.len() {
        return Err(StoreError::Invalid("PROJECT_TREE_CURSOR"));
    }
    let root = open_directory(project_root)?;
    if identity(&root)? != inventory.project_root_identity {
        return Err(StoreError::Invalid("PROJECT_ROOT_CHANGED"));
    }
    let entry = &inventory.entries[cursor];
    let parent = if entry.path == [".project"] {
        root.try_clone()?
    } else {
        open_parent(&root, &entry.path, inventory)?
    };
    let path = project_root.join(entry.path.iter().collect::<PathBuf>());
    match entry.kind {
        EntryKind::File => remove_file(&parent, entry),
        EntryKind::Directory => remove_directory(&parent, entry, &path),
    }
}

/// Validate a fresh or resumed deletion before the next side effect. Only the
/// current step may already be absent after unlink/fsync but before cursor commit.
pub fn validate_remaining(
    project_root: &Path,
    expected: &Inventory,
    cursor: usize,
) -> Result<(), StoreError> {
    if cursor > expected.entries.len() {
        return Err(StoreError::Invalid("PROJECT_TREE_CURSOR"));
    }
    let root = open_directory(project_root)?;
    if identity(&root)? != expected.project_root_identity {
        return Err(StoreError::Invalid("PROJECT_ROOT_CHANGED"));
    }
    let actual = match inventory(project_root) {
        Ok(value) => value,
        Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            // Inspect the .project entry itself: a missing descendant is not
            // evidence that the complete deletion is already durable.
            match fs::statat(&root, ".project", AtFlags::SYMLINK_NOFOLLOW) {
                Err(rustix::io::Errno::NOENT)
                    if cursor >= expected.entries.len().saturating_sub(1) =>
                {
                    root.sync_all()?;
                    return Ok(());
                }
                _ => return Err(StoreError::Invalid("PROJECT_TREE_CHANGED")),
            }
        }
        Err(error) => return Err(error),
    };
    let remaining = &expected.entries[cursor..];
    if actual.entries == remaining || (!remaining.is_empty() && actual.entries == remaining[1..]) {
        Ok(())
    } else {
        Err(StoreError::Invalid("PROJECT_TREE_CHANGED"))
    }
}

/// Acquire the inventoried writer lease without creating any source entry.
/// Once its removal step has executed, only the durable deletion owns recovery.
pub fn deletion_lease(
    project_root: &Path,
    inventory: &Inventory,
    cursor: usize,
) -> Result<Option<File>, StoreError> {
    let lock_index = inventory
        .entries
        .iter()
        .position(|entry| entry.path == [".project", ".local", "writer.lock"])
        .ok_or(StoreError::Invalid("PROJECT_WRITER_LOCK_MISSING"))?;
    if cursor > lock_index {
        return Ok(None);
    }
    let root = open_directory(project_root)?;
    if identity(&root)? != inventory.project_root_identity {
        return Err(StoreError::Invalid("PROJECT_ROOT_CHANGED"));
    }
    let entry = &inventory.entries[lock_index];
    let parent = open_parent(&root, &entry.path, inventory)?;
    let file = match regular_file(&parent, "writer.lock") {
        Ok(file) => file,
        Err(StoreError::Io(error))
            if error.kind() == std::io::ErrorKind::NotFound && cursor == lock_index =>
        {
            return Ok(None);
        }
        Err(error) => return Err(error),
    };
    if identity(&file)? != entry.identity {
        return Err(StoreError::Invalid("LEASE_REPLACED"));
    }
    fs::flock(&file, FlockOperation::NonBlockingLockExclusive)?;
    Ok(Some(file))
}
