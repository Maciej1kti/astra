//! Descriptor-relative filesystem operations. No user-controlled path is joined
//! to a trusted path without checking every component with O_NOFOLLOW.
use crate::{
    StoreError,
    document::{Kind, MAX_DOCUMENT, version},
};
use rustix::fs::{self, AtFlags, FlockOperation, Mode, OFlags, RenameFlags};
use std::{
    fs::File,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};
use uuid::Uuid;

pub struct Directory {
    file: File,
    path: PathBuf,
}
/// One path component that cannot leave or alias its directory.
pub(crate) fn component(name: &str) -> Result<(), StoreError> {
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\0']) {
        return Err(StoreError::Invalid("UNSAFE_PATH"));
    }
    Ok(())
}
/// Open an absolute UTF-8 path one component at a time, never through a link.
pub(crate) fn open_directory(path: &Path) -> Result<File, StoreError> {
    open_directory_with_ancestor(path, None)
}
fn open_directory_with_ancestor(
    path: &Path,
    ancestor: Option<&Directory>,
) -> Result<File, StoreError> {
    if !path.is_absolute() || path.to_str().is_none() {
        return Err(StoreError::Invalid("ABSOLUTE_UTF8_PATH_REQUIRED"));
    }
    let guard = match ancestor {
        Some(directory) => {
            if !path.starts_with(directory.path()) {
                return Err(StoreError::Invalid("DIRECTORY_CHANGED"));
            }
            Some((
                directory.path.components().count() - 1,
                directory.identity()?,
            ))
        }
        None => None,
    };
    let mut fd = fs::open(
        "/",
        OFlags::RDONLY | OFlags::DIRECTORY | OFlags::CLOEXEC,
        Mode::empty(),
    )?;
    for (depth, part) in path.components().enumerate() {
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
        if let Some((ancestor_depth, identity)) = guard
            && depth == ancestor_depth
        {
            let stat = fs::fstat(&fd)?;
            if (stat.st_dev as u64, stat.st_ino as u64) != identity {
                return Err(StoreError::Invalid("DIRECTORY_CHANGED"));
            }
        }
    }
    Ok(File::from(fd))
}
fn regular(file: &File) -> Result<(), StoreError> {
    let stat = fs::fstat(file)?;
    if fs::FileType::from_raw_mode(stat.st_mode) != fs::FileType::RegularFile || stat.st_nlink != 1
    {
        return Err(StoreError::Invalid("SPECIAL_FILE_OR_HARDLINK"));
    }
    Ok(())
}
pub fn sync_file(file: &File) -> Result<(), StoreError> {
    file.sync_all()?;
    #[cfg(target_os = "macos")]
    fs::fcntl_fullfsync(file)?;
    Ok(())
}
impl Directory {
    pub fn identity(&self) -> Result<(u64, u64), StoreError> {
        let stat = fs::fstat(&self.file)?;
        Ok((stat.st_dev as u64, stat.st_ino as u64))
    }
    pub fn names(&self) -> Result<Vec<String>, StoreError> {
        self.names_bounded(100_000)
    }
    pub fn names_bounded(&self, limit: usize) -> Result<Vec<String>, StoreError> {
        self.verify()?;
        let mut names = Vec::new();
        // List the held descriptor, not whatever the path names at this moment.
        for entry in fs::Dir::read_from(&self.file)? {
            let entry = entry?;
            let name = entry
                .file_name()
                .to_str()
                .map_err(|_| StoreError::Invalid("NON_UTF8_PATH"))?;
            if matches!(name, "." | "..") {
                continue;
            }
            if names.len() >= limit {
                return Err(StoreError::Invalid("DIRECTORY_ENTRY_LIMIT"));
            }
            names.push(name.to_owned());
        }
        self.verify()?;
        names.sort();
        Ok(names)
    }
    pub fn exists_regular(&self, name: &str) -> Result<bool, StoreError> {
        component(name)?;
        self.verify()?;
        let fd = match fs::openat(
            &self.file,
            name,
            OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
            Mode::empty(),
        ) {
            Ok(fd) => fd,
            Err(rustix::io::Errno::NOENT) => return Ok(false),
            Err(error) => return Err(error.into()),
        };
        regular(&File::from(fd))?;
        Ok(true)
    }
    pub fn require_private(&self) -> Result<(), StoreError> {
        let stat = fs::fstat(&self.file)?;
        if stat.st_mode & 0o077 != 0 || stat.st_uid != rustix::process::getuid().as_raw() {
            return Err(StoreError::Invalid("PRIVATE_DIRECTORY_REQUIRED"));
        }
        Ok(())
    }
    pub fn sync(&self) -> Result<(), StoreError> {
        self.verify()?;
        self.file.sync_all()?;
        Ok(())
    }
    pub fn open(path: &Path) -> Result<Self, StoreError> {
        Ok(Self {
            file: open_directory(path)?,
            path: path.to_owned(),
        })
    }
    pub fn path(&self) -> &Path {
        &self.path
    }
    /// Reject a directory replaced or moved since it was approved/opened.
    pub fn verify(&self) -> Result<(), StoreError> {
        self.verify_with_ancestor(None)
    }
    fn verify_with_ancestor(&self, ancestor: Option<&Directory>) -> Result<(), StoreError> {
        let current = fs::fstat(open_directory_with_ancestor(&self.path, ancestor)?)?;
        let held = fs::fstat(&self.file)?;
        if (current.st_dev, current.st_ino) != (held.st_dev, held.st_ino) {
            return Err(StoreError::Invalid("DIRECTORY_CHANGED"));
        }
        Ok(())
    }
    pub fn child(&self, name: &str, create: bool) -> Result<Self, StoreError> {
        component(name)?;
        self.verify()?;
        if create {
            match fs::mkdirat(&self.file, name, Mode::from_raw_mode(0o700)) {
                Ok(()) => self.file.sync_all()?,
                Err(rustix::io::Errno::EXIST) => {}
                Err(error) => return Err(error.into()),
            }
        }
        let file = File::from(fs::openat(
            &self.file,
            name,
            OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::empty(),
        )?);
        Ok(Self {
            file,
            path: self.path.join(name),
        })
    }
    pub fn read(&self, name: &str) -> Result<Option<Vec<u8>>, StoreError> {
        self.read_with_ancestor(name, None)
    }
    fn read_with_ancestor(
        &self,
        name: &str,
        ancestor: Option<&Directory>,
    ) -> Result<Option<Vec<u8>>, StoreError> {
        component(name)?;
        self.verify_with_ancestor(ancestor)?;
        let fd = match fs::openat(
            &self.file,
            name,
            OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
            Mode::empty(),
        ) {
            Ok(fd) => fd,
            Err(rustix::io::Errno::NOENT) => return Ok(None),
            Err(error) => return Err(error.into()),
        };
        let file = File::from(fd);
        regular(&file)?;
        let mut bytes = Vec::new();
        file.take(MAX_DOCUMENT as u64 + 1).read_to_end(&mut bytes)?;
        if bytes.len() > MAX_DOCUMENT {
            return Err(StoreError::Invalid("DOCUMENT_LIMIT"));
        }
        Ok(Some(bytes))
    }
    pub fn lease(&self, name: &str) -> Result<Lease, StoreError> {
        component(name)?;
        self.verify()?;
        let file = File::from(fs::openat(
            &self.file,
            name,
            OFlags::CREATE | OFlags::RDWR | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
            Mode::from_raw_mode(0o600),
        )?);
        regular(&file)?;
        fs::flock(&file, FlockOperation::NonBlockingLockExclusive)?;
        Ok(Lease {
            file,
            directory: self.path.clone(),
            name: name.to_owned(),
        })
    }
    /// Caller must hold the project/instance lease. Expected None means create,
    /// never overwrite. Directory is flushed after rename; success is durable
    /// at this layer, not yet a command-journal COMMITTED acknowledgement.
    pub fn replace(
        &self,
        name: &str,
        bytes: &[u8],
        expected: Option<&str>,
    ) -> Result<(), StoreError> {
        self.replace_with(name, bytes, expected, |_| Ok(()))
    }
    pub fn replace_with(
        &self,
        name: &str,
        bytes: &[u8],
        expected: Option<&str>,
        mut checkpoint: impl FnMut(WritePoint) -> Result<(), StoreError>,
    ) -> Result<(), StoreError> {
        component(name)?;
        if bytes.len() > MAX_DOCUMENT {
            return Err(StoreError::Invalid("DOCUMENT_LIMIT"));
        }
        self.precondition(name, expected)?;
        let temp = format!(".tmp-{}", Uuid::new_v4());
        let mut file = File::from(fs::openat(
            &self.file,
            &temp,
            OFlags::WRONLY | OFlags::CREATE | OFlags::EXCL | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::from_raw_mode(0o600),
        )?);
        let result = (|| {
            file.write_all(bytes)?;
            checkpoint(WritePoint::TempWritten)?;
            sync_file(&file)?;
            checkpoint(WritePoint::TempSynced)?;
            self.precondition(name, expected)?;
            self.verify()?;
            // Writers treat a failure before `Renamed` as leaving the target
            // untouched; nothing above this line may modify it.
            if expected.is_some() {
                fs::renameat(&self.file, &temp, &self.file, name)?;
            } else {
                fs::renameat_with(&self.file, &temp, &self.file, name, RenameFlags::NOREPLACE)?;
            }
            checkpoint(WritePoint::Renamed)?;
            self.file.sync_all()?;
            sync_file(&file)?;
            checkpoint(WritePoint::DirectorySynced)?;
            Ok(())
        })();
        // Only our random temp name; never remove the target after an uncertain write.
        let _ = fs::unlinkat(&self.file, &temp, AtFlags::empty());
        result
    }

    /// Remove a regular file only when its current bytes still match the
    /// observed version. The unlink and parent directory sync are separate
    /// durability checkpoints; callers must journal the intent before calling
    /// this method.
    pub fn remove_with(
        &self,
        name: &str,
        expected: &str,
        mut checkpoint: impl FnMut(DeletePoint) -> Result<(), StoreError>,
    ) -> Result<(), StoreError> {
        component(name)?;
        self.precondition(name, Some(expected))?;
        self.verify()?;
        // As in `replace_with`: the target is untouched until this unlink.
        fs::unlinkat(&self.file, name, AtFlags::empty())?;
        checkpoint(DeletePoint::Unlinked)?;
        self.file.sync_all()?;
        checkpoint(DeletePoint::DirectorySynced)?;
        Ok(())
    }
    fn precondition(&self, name: &str, expected: Option<&str>) -> Result<(), StoreError> {
        let actual = self.read(name)?.map(|bytes| version(&bytes));
        if actual.as_deref() != expected {
            return Err(StoreError::Conflict);
        }
        Ok(())
    }
    pub fn resync(&self, name: &str) -> Result<(), StoreError> {
        component(name)?;
        self.verify()?;
        let file = File::from(fs::openat(
            &self.file,
            name,
            OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::NONBLOCK | OFlags::CLOEXEC,
            Mode::empty(),
        )?);
        regular(&file)?;
        sync_file(&file)?;
        self.file.sync_all()?;
        sync_file(&file)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WritePoint {
    TempWritten,
    TempSynced,
    Renamed,
    DirectorySynced,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeletePoint {
    Unlinked,
    DirectorySynced,
}
pub struct Lease {
    file: File,
    directory: PathBuf,
    name: String,
}
impl Lease {
    pub fn verify(&self) -> Result<(), StoreError> {
        let dir = Directory::open(&self.directory)?;
        self.verify_at(&dir.file)
    }
    fn verify_at(&self, directory: &File) -> Result<(), StoreError> {
        let stat = fs::statat(directory, &self.name, AtFlags::SYMLINK_NOFOLLOW)?;
        let held = fs::fstat(&self.file)?;
        if (stat.st_dev, stat.st_ino) != (held.st_dev, held.st_ino) || stat.st_nlink != 1 {
            return Err(StoreError::Invalid("LEASE_REPLACED"));
        }
        Ok(())
    }
    /// Collection reads subsequently verify this project's current pathname and
    /// the collection inode before opening any source file. The held project
    /// descriptor therefore avoids a second full walk just for its lease child.
    fn verify_relative_to_project(&self, project: &Directory) -> Result<(), StoreError> {
        if self.directory != project.path.join(".local") {
            return Err(StoreError::Invalid("LEASE_REPLACED"));
        }
        let local = File::from(fs::openat(
            &project.file,
            ".local",
            OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::empty(),
        )?);
        self.verify_at(&local)
    }
}

pub struct ProjectStore {
    pub directory: Directory,
    lease: Lease,
}

/// A read batch keeps the collection descriptor, never source bytes or versions.
/// Every read still verifies the lease, current directory and individual file.
pub struct CollectionReader<'a> {
    directory: Directory,
    lease: &'a Lease,
    project: &'a Directory,
}
impl CollectionReader<'_> {
    pub fn names(&self) -> Result<Vec<String>, StoreError> {
        self.lease.verify()?;
        self.project.verify()?;
        let names = self.directory.names()?;
        self.project.verify()?;
        self.lease.verify()?;
        Ok(names)
    }
    pub fn read(&self, id: &str) -> Result<Option<Vec<u8>>, StoreError> {
        self.lease.verify_relative_to_project(self.project)?;
        resource_id(id)?;
        // Check the approved project inode while walking to the collection.
        // Moving both the lease and collection into a new parent must fail too.
        self.directory
            .read_with_ancestor(&format!("{id}.json"), Some(self.project))
    }
}
/// Collection sources are named by canonical UUIDv4; no other ID can exist.
pub fn is_resource_id(id: &str) -> bool {
    Uuid::parse_str(id).is_ok_and(|uuid| uuid.get_version_num() == 4 && uuid.to_string() == id)
}
fn resource_id(id: &str) -> Result<(), StoreError> {
    if !is_resource_id(id) {
        return Err(StoreError::Invalid("INVALID_ID"));
    }
    Ok(())
}
impl ProjectStore {
    pub fn open(project_root: &Path, create: bool) -> Result<Self, StoreError> {
        let root = Directory::open(project_root)?;
        let directory = root.child(".project", create)?;
        let local = directory.child(".local", true)?;
        local.require_private()?;
        let lease = local.lease("writer.lock")?;
        Ok(Self { directory, lease })
    }
    pub fn location(
        &self,
        kind: Kind,
        id: &str,
        create: bool,
    ) -> Result<(Directory, String), StoreError> {
        self.lease.verify()?;
        resource_id(id)?;
        match kind.directory() {
            // child() verifies this directory before opening the collection.
            Some(name) => Ok((self.directory.child(name, create)?, format!("{id}.json"))),
            None => {
                self.directory.verify()?;
                Ok((
                    Directory::open(self.directory.path())?,
                    "project.json".into(),
                ))
            }
        }
    }
    pub fn collection_reader(&self, kind: Kind) -> Result<CollectionReader<'_>, StoreError> {
        self.lease.verify()?;
        let name = kind
            .directory()
            .ok_or(StoreError::Invalid("COLLECTION_KIND_REQUIRED"))?;
        let directory = match self.directory.child(name, false) {
            Err(StoreError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
                return Err(StoreError::MissingCollection);
            }
            value => value?,
        };
        Ok(CollectionReader {
            directory,
            lease: &self.lease,
            project: &self.directory,
        })
    }
}
