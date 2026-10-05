#!/usr/bin/env python3
"""Local G0 checks. Requires the repo venv, npm ci and the pinned Rust toolchain.

Run .venv-check/bin/python scripts/check.py. This does not claim E2E/device coverage.
"""
from pathlib import Path
import collections
import os
import subprocess
import sys

from check_annotations import failure_annotation

ROOT = Path(__file__).resolve().parents[1]
STEPS = [
    [sys.executable, "scripts/generate_api_schema.py", "--check"],
    [sys.executable, "scripts/check_package.py", "--skip-manifest"],
    [sys.executable, "-m", "openapi_spec_validator", "contracts/openapi.yaml"],
    [sys.executable, "-m", "unittest", "discover", "-s", "scripts/tests"],
    [sys.executable, "-m", "unittest", "discover", "-s", "integrations/omarchy", "-p", "test_*.py"],
    ["node", "--test", *[str(path.relative_to(ROOT)) for path in sorted((ROOT / "scripts/tests").glob("*.test.mjs"))]],
    ["npm", "run", "check"],
    ["node", "scripts/check-boundaries.mjs"],
    ["npm", "run", "format:check"],
    ["npm", "run", "lint"],
    ["npm", "run", "build"],
    ["npm", "run", "check:bundle"],
    ["scripts/cargo-local", "fmt", "--all", "--", "--check"],
    ["scripts/cargo-local", "clippy", "--workspace", "--all-targets", "--locked", "--", "-D", "warnings"],
    ["scripts/cargo-local", "test", "--workspace", "--locked"],
    ["scripts/cargo-local", "build", "--workspace", "--release", "--locked"],
]

def run(command):
    """Stream a step's output; in a workflow, also name its failure."""
    if not os.environ.get("GITHUB_ACTIONS"):
        return subprocess.run(command, cwd=ROOT).returncode
    lines = collections.deque(maxlen=4000)
    with subprocess.Popen(
        command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace"
    ) as process:
        for line in process.stdout:
            sys.stdout.write(line)
            lines.append(line.rstrip("\n"))
    if process.returncode:
        print(failure_annotation(command, list(lines)), flush=True)
    return process.returncode


for command in STEPS:
    print("\nRUN " + " ".join(command), flush=True)
    code = run(command)
    if code:
        raise SystemExit(code)
print("\nPASS local automated checks. See progress evidence for coverage and platform limitations.")
