"""Deterministic JSON projection of the normative OpenAPI YAML for Rust tests/tools."""
from pathlib import Path
import json
import sys
import yaml

root = Path(__file__).resolve().parents[1]
output = root / "contracts/openapi.generated.json"
text = json.dumps(yaml.safe_load((root / "contracts/openapi.yaml").read_text()), ensure_ascii=False, indent=2) + "\n"
if "--check" in sys.argv:
    if not output.exists() or output.read_text() != text:
        raise SystemExit("OpenAPI JSON is stale: run scripts/generate_api_schema.py")
else:
    output.write_text(text)
