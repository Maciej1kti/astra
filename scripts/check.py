#!/usr/bin/env python3
"""Local G0 checks. Requires the repo venv, npm ci and the pinned Rust toolchain.

Run .venv-check/bin/python scripts/check.py. This does not claim E2E/device coverage.
"""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
STEPS = [
    [sys.executable, "scripts/check_package.py", "--skip-manifest"],
    [sys.executable, "-m", "openapi_spec_validator", "contracts/openapi.yaml"],
    [sys.executable, "-m", "unittest", "discover", "-s", "scripts/tests"],
    ["scripts/cargo-local", "fmt", "--all", "--", "--check"],
    ["scripts/cargo-local", "clippy", "--workspace", "--all-targets", "--locked", "--", "-D", "warnings"],
    ["scripts/cargo-local", "test", "--workspace", "--locked"],
    ["scripts/cargo-local", "build", "--workspace", "--release", "--locked"],
    ["npm", "run", "check"],
    ["npm", "run", "build"],
]

for command in STEPS:
    print("\nRUN " + " ".join(command), flush=True)
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode:
        raise SystemExit(result.returncode)
print("\nPASS G0 local checks. No server, E2E, durability or device claim.")
