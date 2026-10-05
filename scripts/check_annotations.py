"""Workflow annotations for a failed local-gate step, readable without its log."""
import re

LIMIT = 3000
_FAILING = re.compile(r"FAILED|panicked|^error|failed|not ok|✖|AssertionError|left:|right:")


def _escape(text, properties=False):
    text = text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    return text.replace(":", "%3A").replace(",", "%2C") if properties else text


def failure_annotation(command, lines):
    """One `::error` command naming the step and the output that explains it."""
    detail = "\n".join(lines).rstrip()
    if len(detail) > LIMIT:
        # Failing lines first, then the end of the output.
        failing = "\n".join(line for line in lines if _FAILING.search(line))[: LIMIT // 2]
        tail = detail[len(failing) - LIMIT :]
        detail = f"{failing}\n…{tail}" if failing else f"…{tail}"
    title = _escape("Check failed: " + " ".join(command), properties=True)
    return f"::error title={title}::{_escape(detail)}"
