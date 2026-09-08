//! Bounded command input and resolution of the explicitly selected project.
use crate::transport::{Error, checked};
use serde_json::{Value, json};
use std::{io::Read, path::Path};

const INPUT_LIMIT: u64 = 1_100_000;

fn bounded(reader: impl Read) -> Result<Vec<u8>, Error> {
    let mut bytes = Vec::new();
    reader.take(INPUT_LIMIT + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > INPUT_LIMIT {
        return Err("Input exceeds 1.1 MB".into());
    }
    Ok(bytes)
}

/// A literal dash means stdin; paths otherwise refer to regular input files.
pub fn file(path: &Path) -> Result<Vec<u8>, Error> {
    if path == Path::new("-") {
        bounded(std::io::stdin().lock())
    } else {
        bounded(std::fs::File::open(path)?)
    }
}

pub fn json(path: &Path) -> Result<Value, Error> {
    Ok(serde_json::from_slice(&file(path)?)?)
}

pub fn body(path: Option<&Path>) -> Result<String, Error> {
    path.map(|path| Ok(String::from_utf8(file(path)?)?))
        .unwrap_or_else(|| Ok(String::new()))
}

pub async fn project_id(client: &reqwest::Client, project: Option<&Path>) -> Result<String, Error> {
    let path = project
        .ok_or("This command requires --project with an exact registered folder")?
        .canonicalize()?;
    let resolved = checked(
        client
            .post("http://localhost/local/v1/projects/resolve")
            .json(&json!({"absolute_path":path})),
    )
    .await?;
    let id = resolved["project_id"]
        .as_str()
        .ok_or("Invalid project resolution")?;
    crate::uuid4(id)?;
    Ok(id.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn input_limit_counts_bytes_and_does_not_read_an_unbounded_stream() {
        let input = vec![b'x'; INPUT_LIMIT as usize];
        assert_eq!(bounded(input.as_slice()).unwrap(), input);
        assert!(bounded(std::io::repeat(b'x')).is_err());
    }
}
