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
    ("Instrukcja startowa dla Astry", ROOT / "ASTRA-KICKOFF.md"),
    ("Plan wykonania i bramki", ROOT / "delivery/PLAN.md"),
    ("Podział pracy i integracja", ROOT / "delivery/AGENT-ROLES.md"),
    ("Backlog wykonawczy", ROOT / "delivery/BACKLOG.md"),
    ("Testy akceptacyjne", ROOT / "delivery/ACCEPTANCE.md"),
    ("Powiązanie wymagań, zadań i testów", ROOT / "delivery/TRACEABILITY.md"),
    ("Lista kontrolna wydania", ROOT / "delivery/RELEASE-CHECKLIST.md"),
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
        entries.append((f"annex-{number:02d}", f"Załącznik {number}. {title}", path))
    intro = """# Local Projects — pełna specyfikacja wykonawcza dla Astry GPT6

**Wersja:** 1.0 · **Data:** 5 września 2026 r.  
**Status:** pakiet do budowy, nie zaimplementowany produkt.  
**Platformy:** serwer macOS Apple Silicon i Arch Linux/Omarchy; pełne webowe UI na desktopie i telefonie przez prywatne HTTPS.

## Jak korzystać z tego dokumentu

To scalona kopia specyfikacji i materiałów zarządzania wykonaniem. Źródłem poszczególnych rozdziałów są wymienione pliki w pakiecie `astra-project-handoff-v1.0`. Zmiany nanosimy w źródłowych rozdziałach i odtwarzamy ten dokument skryptem `scripts/assemble_spec.py`; nie utrzymujemy dwóch niezależnych specyfikacji.

**Przekaż Astrze cały ZIP, nie tylko ten dokument.** W `contracts/` znajdują się JSON Schema, OpenAPI, katalog lokalnego IPC i początkowe schematy SQL. `examples/`, `templates/`, `tests/` i `ops/` zawierają materiały do użycia w implementacji. `delivery/PACKAGE-VALIDATION.md` opisuje rzeczywisty zakres sprawdzenia plików.

Najważniejszy kontrakt: `.project/` jest źródłem prawdy, jeden serwer koordynuje zapisy, CLI jest klientem lokalnym, a telefon ma te same funkcje edycji przez przeglądarkę. Nie budujemy MCP, worktree-managera, synchronizacji offline ani osobnego klienta iOS.

[U] oznacza wymaganie użytkownika, [B] domyślne rozstrzygnięcie wykonawcze, [S] wybór wymagający próby. Testy i budżety opisują warunki przyszłej implementacji; nie są deklaracją wyników istniejącej aplikacji.

## Spis treści

"""
    table = "\n".join(f"- [{title}](#{anchor})" for anchor, title, _ in entries)
    body = []
    for anchor, title, path in entries:
        content = path.read_text(encoding="utf-8")
        body.append(f'\n\n---\n\n<a id="{anchor}"></a>\n\n' + shift_headings(content) + f"\n\n*Plik źródłowy: `{path.relative_to(ROOT).as_posix()}`.*\n")
    return intro + table + "\n" + "".join(body)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "docs/MASTER-SPEC.md")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    text = assemble()
    args.output.write_text(text, encoding="utf-8")
    print(f"Wrote {args.output} — {len(text.split())} words, {len(text.encode('utf-8'))} bytes")


if __name__ == "__main__":
    main()
