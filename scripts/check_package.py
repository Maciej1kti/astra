#!/usr/bin/env python3
"""Validate the handoff's files, examples and traceability; not the application.

Usage: python scripts/check_package.py [--report delivery/package-validation.json]
Requires Python 3.11+, PyYAML and jsonschema. No network or repo mutation.
This is deliberately not a full OpenAPI conformance checker or production parser.
"""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import plistlib
import re
import sqlite3
import sys
import tomllib
from typing import Any, Callable

try:
    import yaml
    from jsonschema import Draft202012Validator, FormatChecker, ValidationError
except ImportError as exc:
    raise SystemExit("Install scripts/requirements-validation.txt in an isolated environment first.") from exc

ROOT = Path(__file__).resolve().parents[1]
RESULTS: list[dict[str, Any]] = []
COUNTS: dict[str, int] = {}
DOMAIN: dict[str, Any] = {}
OAS: dict[str, Any] = {}
FORMAT = FormatChecker()
EXCLUDED_DIRECTORIES = {".git", ".tools", ".venv", ".venv-check", "venv", "node_modules", "target", "dist", "__pycache__"}


def package_files(pattern: str):
    for directory, children, files in os.walk(ROOT):
        children[:] = sorted(child for child in children if child not in EXCLUDED_DIRECTORIES)
        for name in sorted(files):
            path = Path(directory) / name
            if path.match(pattern):
                yield path


def run(name: str, function: Callable[[], Any]) -> None:
    try:
        detail = function()
        RESULTS.append({"check": name, "status": "passed", "detail": detail})
        print(f"PASS {name}")
    except Exception as exc:
        RESULTS.append({"check": name, "status": "failed", "detail": f"{type(exc).__name__}: {exc}"})
        print(f"FAIL {name}: {type(exc).__name__}: {exc}")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def load_json(relative: str) -> Any:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def resolve(document: Any, pointer: str) -> Any:
    require(pointer.startswith("#/"), f"Only local references accepted: {pointer}")
    out = document
    for item in pointer[2:].split("/"):
        item = item.replace("~1", "/").replace("~0", "~")
        out = out[int(item)] if isinstance(out, list) else out[item]
    return out


def visit(value: Any):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from visit(child)
    elif isinstance(value, list):
        for child in value:
            yield from visit(child)


def domain_valid(document: dict[str, Any]) -> None:
    Draft202012Validator(DOMAIN, format_checker=FORMAT).validate(document)
    metadata = document.get("metadata", {})
    schedule = metadata.get("schedule")
    if schedule:
        require(schedule["start"] <= schedule["end"], "schedule.start > schedule.end")
    if document.get("type") == "card":
        require(metadata["id"] not in metadata.get("depends_on", []), "self dependency")
    if metadata.get("created_at") and metadata.get("updated_at"):
        require(metadata["updated_at"] >= metadata["created_at"], "updated_at before created_at")
    # These are reference checks of supplied vectors, not all production limits.


class BoundedFixtureLoader(yaml.SafeLoader):
    """Strict enough to exercise the supplied small fixture set; NOT production."""


def unique_mapping(loader: BoundedFixtureLoader, node: Any, deep: bool = False) -> dict:
    result: dict[str, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        require(isinstance(key, str), "YAML key is not a string")
        require(key != "<<", "YAML merge is forbidden")
        require(key not in result, f"Duplicate YAML key {key}")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


BoundedFixtureLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)


def parse_fixture(path: Path, kind: str) -> dict[str, Any]:
    raw = path.read_bytes()
    require(len(raw) <= 1024 * 1024, "Fixture exceeds document limit")
    text = raw.decode("utf-8", errors="strict")
    require(not text.startswith("\ufeff"), "Fixture BOM not supported")
    lines = text.splitlines(keepends=True)
    require(lines and lines[0].rstrip("\r\n") == "---", "Missing opening front matter")
    close = next((n for n in range(1, len(lines)) if lines[n].rstrip("\r\n") == "---"), None)
    require(close is not None, "Missing closing front matter")
    header = "".join(lines[1:close])
    require(len(header.encode("utf-8")) <= 64 * 1024, "Header exceeds limit")
    for token in yaml.scan(header):
        require(not isinstance(token, (yaml.tokens.AliasToken, yaml.tokens.AnchorToken, yaml.tokens.TagToken)),
                "Explicit tags, anchors and aliases are forbidden")
    metadata = yaml.load(header, Loader=BoundedFixtureLoader)
    require(isinstance(metadata, dict), "Metadata must be a mapping")
    body = "".join(lines[close + 1:])
    document = {"type": kind, "metadata": metadata, "body": body}
    domain_valid(document)
    return document


def check_json_files() -> dict:
    paths = sorted(package_files("*.json"))
    for path in paths:
        json.loads(path.read_text(encoding="utf-8"))
    COUNTS["json_files"] = len(paths)
    return {"files": len(paths)}


def check_schemas() -> dict:
    global DOMAIN, OAS
    DOMAIN = load_json("contracts/domain.schema.json")
    OAS = yaml.safe_load((ROOT / "contracts/openapi.yaml").read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(DOMAIN)
    for name, schema in OAS["components"]["schemas"].items():
        Draft202012Validator.check_schema(schema)
    for tree in (DOMAIN, OAS):
        for obj in visit(tree):
            if "$ref" in obj:
                resolve(tree, obj["$ref"])
    COUNTS["domain_definitions"] = len(DOMAIN["$defs"])
    COUNTS["openapi_schemas"] = len(OAS["components"]["schemas"])
    return {"domain_definitions": COUNTS["domain_definitions"], "openapi_schemas": COUNTS["openapi_schemas"]}


def check_domain_examples() -> dict:
    paths = [ROOT / "examples" / n for n in ["project.json", "milestone.json", "update.json", "workspace.json"]]
    paths += sorted((ROOT / "examples").glob("card-*.json"))
    for path in paths:
        domain_valid(json.loads(path.read_text(encoding="utf-8")))
    COUNTS["domain_examples"] = len(paths)
    return {"examples": len(paths)}


def check_markdown_examples() -> dict:
    base = ROOT / "examples/demo-repo/.project"
    documents = [parse_fixture(base / "project.md", "project")]
    require(documents[0] == load_json("examples/project.json"), "project Markdown != JSON")
    for directory, kind in [("cards", "card"), ("milestones", "milestone"), ("updates", "update")]:
        for path in sorted((base / directory).glob("*.md")):
            document = parse_fixture(path, kind)
            require(path.stem == document["metadata"]["id"], f"Filename mismatch {path.name}")
            expected = f"examples/card-{path.stem}.json" if kind == "card" else f"examples/{kind}.json"
            require(document == load_json(expected), f"Markdown != JSON {path.name}")
            documents.append(document)
    by_type = {kind: {d["metadata"]["id"]: d for d in documents if d["type"] == kind}
               for kind in ["project", "card", "milestone", "update"]}
    for card in by_type["card"].values():
        md = card["metadata"]
        require(not md.get("milestone_id") or md["milestone_id"] in by_type["milestone"], "Missing milestone")
        for predecessor in md.get("depends_on", []):
            require(predecessor in by_type["card"], "Missing dependency")
    for update in by_type["update"].values():
        target = update["metadata"]["target"]
        require(target["id"] in by_type[target["type"]], "Missing update target")
    workspace = load_json("examples/workspace.json")
    for item in workspace["focus"]:
        require(item["project_id"] in by_type["project"] and item["card_id"] in by_type["card"], "Bad focus reference")
    COUNTS["markdown_domain_examples"] = len(documents)
    return {"roundtrips": len(documents), "cross_references": "passed"}


def apply_changes(document: dict, changes: list[dict]) -> dict:
    output = copy.deepcopy(document)
    for change in changes:
        require(change["op"] == "set", "Unknown vector operation")
        keys = [part.replace("~1", "/").replace("~0", "~") for part in change["path"][1:].split("/")]
        target = output
        for key in keys[:-1]:
            target = target[key]
        target[keys[-1]] = copy.deepcopy(change["value"])
    return output


def graph_valid(graph: dict[str, list[str]]) -> bool:
    visited: set[str] = set()
    active: set[str] = set()
    def dfs(node: str) -> bool:
        if node not in graph or node in active:
            return False
        if node in visited:
            return True
        active.add(node)
        if not all(dfs(child) for child in graph[node]):
            return False
        active.remove(node)
        visited.add(node)
        return True
    return all(dfs(node) for node in graph)


def check_vectors() -> dict:
    vectors = load_json("tests/vectors.json")
    for case in vectors["document_cases"]:
        doc = apply_changes(load_json(case["base"]), case["changes"])
        try:
            domain_valid(doc)
            actual = True
        except (ValueError, ValidationError):
            actual = False
        require(actual == case["valid"], f"Document vector {case['id']} expected {case['valid']}, got {actual}")
    for case in vectors["parser_cases"]:
        try:
            parse_fixture(ROOT / case["path"], case["type"])
            actual = True
        except (ValueError, yaml.YAMLError, ValidationError):
            actual = False
        require(actual == case["valid"], f"Parser vector {case['id']} expected {case['valid']}, got {actual}")
    for case in vectors["date_cases"]:
        try:
            start, end = dt.date.fromisoformat(case["start"]), dt.date.fromisoformat(case["end"])
            length = (end - start).days + 1
            actual = length >= 1
        except ValueError:
            actual, length = False, None
        require(actual == case["valid"], f"Date vector {case['id']}")
        require(length == case["inclusive_days"], f"Date length {case['id']}")
    for case in vectors["graph_cases"]:
        require(graph_valid(case["graph"]) == case["valid"], f"Graph vector {case['id']}")
    for case in vectors["rank_cases"]:
        low, high = int(case["low"], 16), int(case["high"], 16)
        middle = (low + high) // 2
        result = f"{middle:032x}" if low < middle < high else None
        require(result == case["midpoint"], f"Rank vector {case['id']}")
    count = sum(len(value) for key, value in vectors.items() if key.endswith("_cases"))
    COUNTS["reference_vectors"] = count
    return {key: len(value) for key, value in vectors.items() if key.endswith("_cases")}


def check_openapi_structure() -> dict:
    require(OAS.get("openapi") == "3.1.1", "Unexpected OpenAPI version")
    security = OAS["components"]["securitySchemes"]
    ids: set[str] = set()
    methods = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}
    for path, item in OAS["paths"].items():
        require(path.startswith("/"), f"Nonabsolute API path {path}")
        for method, op in item.items():
            if method not in methods:
                continue
            operation_id = op["operationId"]
            require(operation_id not in ids, f"Duplicate operationId {operation_id}")
            ids.add(operation_id)
            parameters = item.get("parameters", []) + op.get("parameters", [])
            params = [resolve(OAS, p["$ref"]) if "$ref" in p else p for p in parameters]
            templated = set(re.findall(r"\{([^}]+)\}", path))
            specified = {p["name"] for p in params if p["in"] == "path"}
            require(templated == specified, f"Path parameters mismatch {method} {path}: {templated} != {specified}")
            require(all(p.get("required") is True for p in params if p["in"] == "path"), f"Path param not required {path}")
            require(len({(p['in'], p['name']) for p in params}) == len(params), f"Duplicate parameters {operation_id}")
            for sec in op.get("security", OAS.get("security", [])):
                require(set(sec) <= set(security), f"Unknown security scheme in {operation_id}")
            require(op.get("responses"), f"Missing responses {operation_id}")
            for code, response in op["responses"].items():
                require(bool(re.fullmatch(r"[1-5](?:[0-9]{2}|XX)|default", str(code))), f"Invalid response status {code}")
                r = resolve(OAS, response["$ref"]) if "$ref" in response else response
                require("description" in r, f"Response without description {operation_id}/{code}")
    COUNTS["openapi_paths"] = len(OAS["paths"])
    COUNTS["openapi_operations"] = len(ids)
    return {"paths": len(OAS["paths"]), "operations": len(ids), "scope": "structural checks, not complete OAS conformance"}


def check_api_examples() -> dict:
    bindings = {
        "card-create.json": "CardCreate",
        "card-patch.json": "CardPatch",
        "card-move.json": "CardPatch",
        "report-create.json": "UpdateCreate",
        "focus-replace.json": "FocusReplace",
    }
    for filename, definition in bindings.items():
        schema = {"$schema": "https://json-schema.org/draft/2020-12/schema", "$ref": f"#/components/schemas/{definition}", "components": OAS["components"]}
        Draft202012Validator(schema, format_checker=FORMAT).validate(load_json(f"examples/requests/{filename}"))
    COUNTS["request_examples"] = len(bindings)
    return {"examples": len(bindings)}


def check_progress(status: str, evidence: Any, *, acceptance: bool) -> None:
    initial = "not_run" if acceptance else "not_started"
    allowed = {initial, "passed", "failed", "blocked"} if acceptance else {initial, "in_progress", "completed", "blocked"}
    require(status in allowed, f"Unknown progress status {status}")
    if status == initial:
        require(evidence is None if acceptance else evidence == [], "Initial status cannot claim evidence")
        return
    require(isinstance(evidence, list) and len(evidence) > 0, f"{status} requires evidence paths")
    for item in evidence:
        require(isinstance(item, str), "Evidence must be a relative file path")
        path = (ROOT / item).resolve()
        require(path.is_relative_to((ROOT / "progress").resolve()), "Evidence must be inside progress/")
        require(path.is_file() and path.stat().st_size > 0, f"Missing/empty evidence {item}")


def check_traceability() -> dict:
    requirements = load_json("delivery/REQUIREMENTS.json")["requirements"]
    tests = load_json("delivery/ACCEPTANCE.json")["tests"]
    tasks = load_json("delivery/BACKLOG.json")["tasks"]
    req_ids, test_ids, task_ids = ({x["id"] for x in values} for values in [requirements, tests, tasks])
    require(len(req_ids) == len(requirements) and len(test_ids) == len(tests) and len(task_ids) == len(tasks), "Duplicate delivery IDs")
    for test in tests:
        require(set(test["requirements"]) <= req_ids, f"Unknown requirement in {test['id']}")
        check_progress(test["status"], test["evidence"], acceptance=True)
    for task in tasks:
        require(set(task["requirements"]) <= req_ids, f"Unknown requirement in {task['id']}")
        require(set(task["acceptance_tests"]) <= test_ids, f"Unknown test in {task['id']}")
        require(set(task["depends_on"]) <= task_ids, f"Unknown dependency in {task['id']}")
        check_progress(task["status"], task["evidence"], acceptance=False)
    require(graph_valid({t["id"]: t["depends_on"] for t in tasks}), "Backlog has dependency cycle")
    covered = {r for test in tests for r in test["requirements"]}
    assigned = {a for task in tasks for a in task["acceptance_tests"]}
    require(covered == req_ids, f"Requirements without test: {req_ids - covered}")
    require(assigned == test_ids, f"Tests without task: {test_ids - assigned}")
    require({r for task in tasks for r in task["requirements"]} == req_ids, "Requirements without task")
    faults = load_json("tests/fault-matrix.json")["cases"]
    require(len({f["id"] for f in faults}) == len(faults), "Duplicate fault IDs")
    COUNTS.update(requirements=len(requirements), acceptance_scenarios=len(tests), tasks=len(tasks), fault_scenarios=len(faults))
    return {"requirements": len(requirements), "acceptance_scenarios": len(tests), "tasks": len(tasks), "fault_scenarios": len(faults), "cycles": False, "coverage": "complete IDs (not proof of test quality or implementation)"}


def check_sql() -> dict:
    stats = {}
    for name in ["state-starting-schema.sql", "index-starting-schema.sql"]:
        with sqlite3.connect(":memory:") as conn:
            conn.executescript((ROOT / "contracts" / name).read_text(encoding="utf-8"))
            stats[name] = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    return {"sqlite": sqlite3.sqlite_version, "tables": stats, "scope": "syntax and empty initialization only"}


def check_ops() -> dict:
    config = tomllib.loads((ROOT / "ops/server.example.toml").read_text(encoding="utf-8"))
    launch = plistlib.loads((ROOT / "ops/local.projects.projectd.plist.in").read_bytes())
    require(isinstance(launch.get("ProgramArguments"), list), "launchd ProgramArguments missing")
    require("@@" in json.dumps(config), "Expected template placeholders absent")
    require("@@" in json.dumps(launch), "Expected launchd placeholders absent")
    service = (ROOT / "ops/projectd.service.in").read_text(encoding="utf-8")
    require("[Service]" in service and "ExecStart=" in service and "@@" in service, "Invalid service template structure")
    return {"toml": "parsed", "plist": "parsed", "systemd": "basic structure only; not systemd-analyze", "installation": "not executed"}


def check_local_links() -> dict:
    checked = 0
    for path in package_files("*.md"):
        content = path.read_text(encoding="utf-8")
        for link in re.findall(r"(?<!!)\[[^\]]+\]\(([^)]+)\)", content):
            if re.match(r"[a-zA-Z][a-zA-Z0-9+.-]*:", link) or link.startswith("#"):
                continue
            target = link.split("#", 1)[0].split("?", 1)[0]
            if not target:
                continue
            require((path.parent / target).exists(), f"Missing Markdown target {path.relative_to(ROOT)} → {target}")
            checked += 1
    return {"relative_links_checked": checked}


def check_manifest() -> dict:
    manifest = ROOT / "MANIFEST.sha256"
    if not manifest.exists():
        return {"status": "not_present_yet", "note": "created during final packaging"}
    count = 0
    for line in manifest.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        digest, relative = line.split("  ", 1)
        file = ROOT / relative
        require(file.is_file(), f"Missing manifest file {relative}")
        require(hashlib.sha256(file.read_bytes()).hexdigest() == digest, f"Checksum mismatch {relative}")
        count += 1
    return {"files": count, "note": "integrity, not a digital signature"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, help="Optional JSON report path, relative to current directory.")
    parser.add_argument("--skip-manifest", action="store_true", help="Use during authoring before regenerating checksums.")
    args = parser.parse_args()
    for name, function in [
        ("JSON files", check_json_files),
        ("JSON Schema and all local references", check_schemas),
        ("Domain examples", check_domain_examples),
        ("Markdown/JSON roundtrip and cross-references", check_markdown_examples),
        ("Reference validation vectors", check_vectors),
        ("OpenAPI structure", check_openapi_structure),
        ("HTTP request examples", check_api_examples),
        ("Requirements/tests/tasks traceability", check_traceability),
        ("SQLite starting schemas", check_sql),
        ("Deployment template syntax", check_ops),
        ("Markdown relative links", check_local_links),
    ]:
        run(name, function)
    if not args.skip_manifest:
        run("Package checksums", check_manifest)
    report = {
        "package": "astra-project-handoff-v1.0",
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "scope": "handoff artifacts only; not the target application",
        "status": "passed" if all(r["status"] == "passed" for r in RESULTS) else "failed",
        "tools": {"python": sys.version.split()[0], "PyYAML": importlib.metadata.version("PyYAML"), "jsonschema": importlib.metadata.version("jsonschema"), "sqlite": sqlite3.sqlite_version},
        "counts": COUNTS,
        "checks": RESULTS,
        "not_performed": ["complete OpenAPI standards-validator run", "application build or unit/integration tests", "actual crash/durability tests", "systemd/launchd installation", "macOS, Arch or iPhone execution", "performance benchmarks", "security penetration testing"],
    }
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "counts": COUNTS}, ensure_ascii=False))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
