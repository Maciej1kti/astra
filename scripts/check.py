#!/usr/bin/env python3
"""Local G0 checks. Requires the repo venv, npm ci and the pinned Rust toolchain.

Run .venv-check/bin/python scripts/check.py. This does not claim E2E/device coverage.
"""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
STEPS = [
    [sys.executable, "scripts/generate_api_schema.py", "--check"],
    [sys.executable, "scripts/check_package.py", "--skip-manifest"],
    [sys.executable, "-m", "openapi_spec_validator", "contracts/openapi.yaml"],
    [sys.executable, "-m", "unittest", "discover", "-s", "scripts/tests"],
    ["node", "--test", "scripts/tests/markdown.test.mjs", "scripts/tests/dates.test.mjs"],
    ["npm", "run", "check"],
    ["npm", "run", "build"],
    ["scripts/cargo-local", "fmt", "--all", "--", "--check"],
    ["scripts/cargo-local", "clippy", "--workspace", "--all-targets", "--locked", "--", "-D", "warnings"],
    ["scripts/cargo-local", "test", "--workspace", "--locked"],
    ["scripts/cargo-local", "build", "--workspace", "--release", "--locked"],
]

for command in STEPS:
    print("\nRUN " + " ".join(command), flush=True)
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode:
        raise SystemExit(result.returncode)
print("\nPASS local automated checks. See progress evidence for coverage and platform limitations.")
