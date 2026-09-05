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
        let current = fs::fstat(open_directory(&self.path)?)?;
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
        component(name)?;
        self.verify()?;
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
pub struct Lease {
    file: File,
    directory: PathBuf,
    name: String,
}
impl Lease {
    pub fn verify(&self) -> Result<(), StoreError> {
        let dir = Directory::open(&self.directory)?;
        let stat = fs::statat(&dir.file, &self.name, AtFlags::SYMLINK_NOFOLLOW)?;
        let held = fs::fstat(&self.file)?;
        if (stat.st_dev, stat.st_ino) != (held.st_dev, held.st_ino) || stat.st_nlink != 1 {
            return Err(StoreError::Invalid("LEASE_REPLACED"));
        }
        Ok(())
    }
}

pub struct ProjectStore {
    pub directory: Directory,
    lease: Lease,
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
        self.directory.verify()?;
        let uuid = Uuid::parse_str(id).map_err(|_| StoreError::Invalid("INVALID_ID"))?;
        if uuid.get_version_num() != 4 || uuid.to_string() != id {
            return Err(StoreError::Invalid("INVALID_ID"));
        }
        match kind.directory() {
            Some(name) => Ok((self.directory.child(name, create)?, format!("{id}.md"))),
            None => Ok((Directory::open(self.directory.path())?, "project.md".into())),
        }
    }
}
