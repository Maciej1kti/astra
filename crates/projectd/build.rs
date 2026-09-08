use std::{env, fs, path::Path, process::Command};
fn collect(root: &Path, directory: &Path, output: &Path, entries: &mut Vec<String>) {
    let mut paths: Vec<_> = fs::read_dir(directory)
        .expect("Build the frontend with npm run build first")
        .map(|e| e.unwrap().path())
        .collect();
    paths.sort();
    for path in paths {
        assert!(!path.is_symlink(), "Frontend assets must not be symlinks");
        if path.is_dir() {
            collect(root, &path, output, entries);
            continue;
        }
        let relative = format!("/{}", path.strip_prefix(root).unwrap().display());
        let mime = match path.extension().and_then(|e| e.to_str()) {
            Some("html") => "text/html; charset=utf-8",
            Some("js") => "text/javascript; charset=utf-8",
            Some("css") => "text/css; charset=utf-8",
            Some("svg") => "image/svg+xml",
            Some("txt") => "text/plain; charset=utf-8",
            _ => "application/octet-stream",
        };
        // Compress once during the build. -n excludes source names and timestamps.
        let gzip = Command::new("gzip")
            .args(["-n", "-9", "-c"])
            .arg(&path)
            .output()
            .expect("Install gzip to build the embedded frontend assets");
        assert!(gzip.status.success(), "Frontend asset compression failed");
        let compressed = if gzip.stdout.len() < fs::metadata(&path).unwrap().len() as usize {
            let compressed = output.join(format!("asset-{}.gz", entries.len()));
            fs::write(&compressed, gzip.stdout).unwrap();
            format!("Some(include_bytes!({:?}))", compressed.to_str().unwrap())
        } else {
            "None".to_owned()
        };
        entries.push(format!(
            "Asset {{ path: {relative:?}, mime: {mime:?}, identity: include_bytes!({:?}), gzip: {compressed} }}",
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
    let output = env::var("OUT_DIR").unwrap();
    let output = Path::new(&output);
    collect(&root, &root, output, &mut entries);
    fs::write(
        output.join("assets.rs"),
        format!("static ASSETS: &[Asset] = &[{}];", entries.join(",")),
    )
    .unwrap();
}
