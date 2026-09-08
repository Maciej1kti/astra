"""Reproduce descriptive source metrics; these are not complexity scores."""
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = Path(__file__).with_suffix(".json")

components = []
for path in (ROOT / "apps/web/src").rglob("*.svelte"):
    lines = path.read_text().splitlines()
    script_end = next((i for i, line in enumerate(lines) if line == "</script>"), None)
    style_start = next((i for i, line in enumerate(lines) if line == "<style>"), None)
    style_end = next((i for i, line in enumerate(lines) if line == "</style>"), None)
    components.append({
        "file": str(path.relative_to(ROOT)),
        "total_lines": len(lines),
        "script_content_lines": script_end - 1 if script_end is not None else 0,
        "style_content_lines": style_end - style_start - 1 if style_start is not None else 0,
        "state_call_occurrences": sum(line.count("$state(") + line.count("$state<") + line.count("$state.raw") for line in lines),
    })

rust_sources = sorted((ROOT / "crates").glob("*/src/**/*.rs"))
application = sorted((ROOT / "crates/application/src").glob("*.rs"))
engine_modules = [str(path.relative_to(ROOT)) for path in application if "impl Engine {" in path.read_text()]
long_lines = []
for path in rust_sources:
    # Exclude trailing inline test modules for these lexical readability metrics.
    production = path.read_text().split("#[cfg(test)]", 1)[0]
    entries = [(index, len(line)) for index, line in enumerate(production.splitlines(), 1) if len(line) > 180]
    if entries:
        long_lines.append({
            "file": str(path.relative_to(ROOT)),
            "lines_over_180_characters": len(entries),
            "longest_line": max(entries, key=lambda item: item[1]),
        })

web_sources = [path for path in (ROOT / "apps/web/src").rglob("*") if path.suffix in {".svelte", ".ts"} and not path.name.endswith(".generated.ts")]
event_files = [str(path.relative_to(ROOT)) for path in web_sources if '"session-ended"' in path.read_text()]
command_files = [str(path.relative_to(ROOT)) for path in web_sources if re.search(r"await commandStatus\(", path.read_text())]
log = (OUTPUT.parent / "local-check.txt").read_text()

metrics = {
    "revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
    "scope": "Tracked application source; generated TypeScript excluded from web searches; trailing cfg(test) excluded from Rust long-line counts. Line metrics include comments and blanks and do not establish complexity or bugs.",
    "svelte_components": sorted(components, key=lambda item: item["total_lines"], reverse=True),
    "engine_impl_modules": engine_modules,
    "rust_long_lines": sorted(long_lines, key=lambda item: item["lines_over_180_characters"], reverse=True),
    "session_ended_event_files": sorted(event_files),
    "component_command_status_files": sorted(command_files),
    "checks": {
        "rust_passed": sum(int(value) for value in re.findall(r"test result: ok\. (\d+) passed;", log)),
        "javascript_passed": int(re.search(r"ℹ pass (\d+)", log).group(1)),
        "python_passed": sum(int(value) for value in re.findall(r"Ran (\d+) tests", log)),
        "integrated_gate_passed": "PASS local automated checks." in log,
    },
}
OUTPUT.write_text(json.dumps(metrics, indent=2) + "\n")
print(json.dumps({
    "largest_components": metrics["svelte_components"][:7],
    "engine_impl_modules": len(engine_modules),
    "session_event_files": len(event_files),
    "command_status_components": len(command_files),
    "production_rust_lines_over_180": sum(item["lines_over_180_characters"] for item in long_lines),
    "checks": metrics["checks"],
}, indent=2))
