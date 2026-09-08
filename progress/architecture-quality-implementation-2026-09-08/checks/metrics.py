"""Reproduce descriptive before/after counts; line counts are not quality scores."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BASELINE = json.loads((ROOT / 'progress/architecture-quality-2026-09-08/checks/metrics.json').read_text())

def component(path):
    lines = (ROOT / path).read_text().splitlines()
    script_end = lines.index('</script>')
    return {
        'file': path, 'total_lines': len(lines), 'script_content_lines': script_end - 1,
        'state_call_occurrences': sum(line.count('$state(') + line.count('$state<') + line.count('$state.raw') for line in lines),
    }

long_lines = []
for path in sorted((ROOT / 'crates').glob('*/src/**/*.rs')):
    if path.name == 'tests.rs':
        continue
    production = path.read_text().split('#[cfg(test)]', 1)[0]
    for number, line in enumerate(production.splitlines(), 1):
        if len(line) > 180:
            long_lines.append({'file': str(path.relative_to(ROOT)), 'line': number, 'length': len(line)})

log = (Path(__file__).parent / 'final-gate.txt').read_text()
browser = (Path(__file__).parent / 'browser-final.txt').read_text()
metrics = {
    'baseline_revision': BASELINE['revision'],
    'before': { 'components': BASELINE['svelte_components'][:2], 'rust_lines_over_180': sum(row['lines_over_180_characters'] for row in BASELINE['rust_long_lines']) },
    'after': {
        'components': [component('apps/web/src/App.svelte'), component('apps/web/src/features/editor/Editor.svelte')],
        'rust_lines_over_180': len(long_lines), 'long_lines': long_lines,
        'feature_directories': sorted(path.name for path in (ROOT / 'apps/web/src/features').iterdir() if path.is_dir()),
    },
    'verification': {
        'integrated_gate_passed': 'PASS local automated checks.' in log,
        'rust_tests_passed': sum(int(value) for value in re.findall(r'test result: ok\. (\d+) passed;', log)),
        'javascript_tests_passed': int(re.search(r'ℹ pass (\d+)', log)[1]),
        'python_tests_passed': sum(int(value) for value in re.findall(r'Ran (\d+) tests', log)),
        'browser_regressions': next((json.loads(line)['browserSuites'] for line in browser.splitlines() if line.startswith('{"browserSuites"')), []),
    },
}
Path(__file__).with_suffix('.json').write_text(json.dumps(metrics, indent=2) + '\n')
print(json.dumps({key: value for key, value in metrics.items() if key != 'after'}, indent=2))
print(json.dumps({'after': metrics['after']['components'], 'rust_lines_over_180': len(long_lines)}, indent=2))
