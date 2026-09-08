#!/usr/bin/env python3
"""Assemble the human-readable specification from authoritative chapter files.
No dependencies. Run from any directory. Does not alter source chapters.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CHAPTERS = sorted((ROOT / "docs").glob("[0-9][0-9]-*.md"))
ANNEXES = [
    ("Implementation plan and gates", ROOT / "delivery/PLAN.md"),
    ("Work coordination and integration", ROOT / "delivery/AGENT-ROLES.md"),
    ("Implementation backlog", ROOT / "delivery/BACKLOG.md"),
    ("Acceptance tests", ROOT / "delivery/ACCEPTANCE.md"),
    ("Requirements and test traceability", ROOT / "delivery/TRACEABILITY.md"),
    ("Release checklist", ROOT / "delivery/RELEASE-CHECKLIST.md"),
]


def shift_headings(text: str) -> str:
    output = []
    fence: str | None = None
    for line in text.splitlines(keepends=True):
        stripped = line.lstrip()
        if stripped.startswith("```") or stripped.startswith("~~~"):
            marker = stripped[:3]
            fence = None if fence == marker else marker if fence is None else fence
        elif fence is None:
            line = re.sub(r"^(#{1,5})(?= )", r"#\1", line)
        output.append(line)
    return "".join(output)


def assemble() -> str:
    entries = []
    for number, path in enumerate(CHAPTERS):
        title = path.read_text(encoding="utf-8").splitlines()[0].lstrip("# ")
        entries.append((f"chapter-{number:02d}", title, path))
    for number, (title, path) in enumerate(ANNEXES, start=1):
        entries.append((f"annex-{number:02d}", f"Annex {number}. {title}", path))
    intro = """# Local Projects — consolidated specification

**Status:** implemented application under active verification; full release acceptance remains open.
**Platforms:** macOS Apple Silicon and Arch Linux hosts, with browser access over private HTTPS.

## How to use this document

This is a generated copy of the authoritative chapters and delivery references.
Edit the source files and run `python scripts/assemble_spec.py`; do not maintain
this document independently. The source package includes contracts, examples,
templates, acceptance scenarios and deployment references.

Implementation evidence and remaining limits live in `progress/STATE.md` and the
numbered evidence entries. The latest planning implementation is documented in
`progress/E026-planning-widgets.md`. Acceptance criteria in the retained handoff
are requirements, not proof of completion. Existing Polish references remain
until their requirements have been implemented and verified; newly authored
repository content is English.

Owner decisions recorded in `AGENTS.md` and `progress/SCOPE.md` take precedence
over older handoff wording. Built-in backup/restore and source-file migration
tooling are deferred beyond v1. All other outstanding requirements remain.

The central contract remains unchanged: `.project/` is the source of truth;
one server coordinates normal writes; the CLI and browser share the domain.
The search index is derived; operational SQLite contains durable state.
A forecast is not a persisted schedule change.

## Contents

"""
    table = "\n".join(f"- [{title}](#{anchor})" for anchor, title, _ in entries)
    body = []
    for anchor, title, path in entries:
        content = path.read_text(encoding="utf-8")
        body.append(f'\n\n---\n\n<a id="{anchor}"></a>\n\n' + shift_headings(content) + f"\n\n*Source file: `{path.relative_to(ROOT).as_posix()}`.*\n")
    return intro + table + "\n" + "".join(body)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "test-results/docs/MASTER-SPEC.md")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    text = assemble()
    args.output.write_text(text, encoding="utf-8")
    print(f"Wrote {args.output} — {len(text.split())} words, {len(text.encode('utf-8'))} bytes")


if __name__ == "__main__":
    main()
