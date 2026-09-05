use std::{env, fs, path::Path};
fn collect(root: &Path, directory: &Path, entries: &mut Vec<String>) {
    let mut paths: Vec<_> = fs::read_dir(directory)
        .expect("Build the frontend with npm run build first")
        .map(|e| e.unwrap().path())
        .collect();
    paths.sort();
    for path in paths {
        assert!(!path.is_symlink(), "Frontend assets must not be symlinks");
        if path.is_dir() {
            collect(root, &path, entries);
            continue;
        }
        let relative = format!("/{}", path.strip_prefix(root).unwrap().display());
        let mime = match path.extension().and_then(|e| e.to_str()) {
            Some("html") => "text/html; charset=utf-8",
            Some("js") => "text/javascript; charset=utf-8",
            Some("css") => "text/css; charset=utf-8",
            Some("svg") => "image/svg+xml",
            _ => "application/octet-stream",
        };
        entries.push(format!(
            "({relative:?}, {mime:?}, include_bytes!({:?}))",
            path.to_str().unwrap()
        ));
    }
}
fn main() {
    let root = Path::new(&env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("../../apps/web/dist")
        .canonicalize()
        .expect("Run npm ci and npm run build before compiling projectd");
    println!("cargo:rerun-if-changed={}", root.display());
    assert!(root.join("index.html").is_file(), "Frontend index missing");
    let mut entries = Vec::new();
    collect(&root, &root, &mut entries);
    fs::write(
        Path::new(&env::var("OUT_DIR").unwrap()).join("assets.rs"),
        format!(
            "static ASSETS: &[(&str, &str, &[u8])] = &[{}];",
            entries.join(",")
        ),
    )
    .unwrap();
}
