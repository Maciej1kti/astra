"""Bounded audit probes; run from any directory with Python 3.

Uses an in-memory SQLite database and temporary synthetic project files only.
The Rust probe links the newest existing debug application rlib; it does not
modify or rebuild application sources. Timing is a SQL microbenchmark, not an
application release benchmark.
"""

import json
import pathlib
import sqlite3
import statistics
import subprocess
import tempfile
import time


ROOT = pathlib.Path(__file__).resolve().parents[3]
CHECKS = pathlib.Path(__file__).resolve().parent
db = sqlite3.connect(":memory:")
db.executescript((ROOT / "contracts/index-starting-schema.sql").read_text())
current = "SELECT entity_type,entity_id,source_hash,validity FROM documents WHERE project_id=?1 AND (?2 IS NULL OR entity_type||':'||entity_id IN (SELECT value FROM json_each(?2)))"
direct = "SELECT entity_type,entity_id,source_hash,validity FROM documents WHERE project_id=?1 AND entity_type=?2 AND entity_id=?3"
db.executemany(
    "INSERT INTO documents(project_id,entity_id,entity_type,relative_path,source_hash,title,body,search_text,metadata_json,observed_at,validity) VALUES('project',?,'card','','r1.hash','','','','{}','','valid')",
    ((str(number),) for number in range(50_000)),
)
print("SQL microprobe, SQLite", sqlite3.sqlite_version, flush=True)
for name, query, arguments in [
    ("current", current, ("project", json.dumps(["card:25000"]))),
    ("tuple_lookup", direct, ("project", "card", "25000")),
]:
    timings = []
    for _ in range(25):
        started = time.perf_counter()
        rows = list(db.execute(query, arguments))
        timings.append((time.perf_counter() - started) * 1000)
    print(json.dumps({
        "query": name,
        "plan": list(db.execute("EXPLAIN QUERY PLAN " + query, arguments)),
        "rows_in_project": 50_000,
        "returned_rows": len(rows),
        "samples": len(timings),
        "median_ms": round(statistics.median(timings), 6),
    }), flush=True)

libraries = list((ROOT / "target/debug/deps").glob("libproject_application-*.rlib"))
if not libraries:
    raise SystemExit("Build the application debug library before running the Rust probe.")
library = max(libraries, key=lambda path: path.stat().st_mtime_ns)
compilers = list((ROOT / ".tools/rustup/toolchains").glob("*/bin/rustc"))
compiler = str(max(compilers, key=lambda path: path.stat().st_mtime_ns)) if compilers else "rustc"
print("Rust application library:", library.relative_to(ROOT), flush=True)
with tempfile.TemporaryDirectory(prefix="astra-backend-audit-", dir="/private/tmp") as temporary:
    directory = pathlib.Path(temporary)
    executable = directory / "backend-repro"
    subprocess.run([
        compiler, "--edition=2024", str(CHECKS / "backend-repro.rs"),
        "--extern", f"project_application={library}",
        "-L", f"dependency={ROOT / 'target/debug/deps'}",
        "-o", str(executable),
    ], check=True)
    subprocess.run([str(executable), str(directory / "fixture")], check=True)
