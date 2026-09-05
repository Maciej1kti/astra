pub mod document;
pub mod filesystem;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("{0}")]
    Invalid(&'static str),
    #[error("NORMALIZATION_REQUIRED")]
    NormalizationRequired,
    #[error("VERSION_CONFLICT")]
    Conflict,
    #[error("{0}")]
    Domain(#[from] project_domain::DomainError),
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
}
impl From<rustix::io::Errno> for StoreError {
    fn from(error: rustix::io::Errno) -> Self {
        if error == rustix::io::Errno::LOOP || error == rustix::io::Errno::NOTDIR {
            return Self::Invalid("SYMLINK_OR_INVALID_DIRECTORY");
        }
        Self::Io(error.into())
    }
}
