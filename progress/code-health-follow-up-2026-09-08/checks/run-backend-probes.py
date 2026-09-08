"""Compile the audit against existing release libraries and use temporary state."""
from pathlib import Path
import json
import subprocess
import tempfile

CHECKS = Path(__file__).resolve().parent
ROOT = CHECKS.parents[2]
DEPS = ROOT / "target/release/deps"
compilers = list((ROOT / ".tools/rustup/toolchains").glob("1.92.0-*/bin/rustc"))
compiler = str(compilers[0]) if compilers else "rustc"
libraries = ["project_application", "project_store", "serde_json", "uuid", "tempfile"]
build = subprocess.run(["scripts/cargo-local", "build", "--release", "--locked", "-p", "project-application", "--example", "benchmark", "--message-format=json"], cwd=ROOT, check=True, stdout=subprocess.PIPE, text=True)
artifacts = {}
for line in build.stdout.splitlines():
    item = json.loads(line)
    if item.get("reason") == "compiler-artifact":
        for filename in item["filenames"]:
            if filename.endswith(".rlib"):
                artifacts[item["target"]["name"]] = filename
with tempfile.TemporaryDirectory(prefix="astra-follow-up-compiler-") as temp:
    executable = Path(temp) / "audit"
    args = [compiler, "--edition=2024", "-O", str(CHECKS / "backend-probes.rs"), "-L", f"dependency={DEPS}", "-o", str(executable)]
    for name in libraries:
        library = artifacts[name]
        args += ["--extern", f"{name}={library}"]
    subprocess.run(args, check=True, cwd=ROOT)
    subprocess.run([str(executable)], check=True, cwd=ROOT)
