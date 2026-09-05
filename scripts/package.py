#!/usr/bin/env python3
"""Package the tested host release binaries and instructions; does not publish."""
from pathlib import Path
import hashlib
import platform
import shutil
import tarfile
import tempfile
import subprocess
import json
import tomllib

ROOT = Path(__file__).resolve().parents[1]
version = tomllib.loads((ROOT / 'Cargo.toml').read_text())['workspace']['package']['version']
name = f'local-projects-{version}-{platform.system().lower()}-{platform.machine()}'
output = ROOT / 'dist'
output.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='local-projects-package-') as temporary:
    package = Path(temporary) / name
    (package / 'bin').mkdir(parents=True)
    for binary in ('projectd', 'projectctl'):
        shutil.copy2(ROOT / 'target/release' / binary, package / 'bin' / binary)
    for source, target in [('ops/install.py', 'install.py'), ('ops/RECOVERY.md', 'RECOVERY.md'), ('ops/PACKAGE.md', 'README.md')]:
        shutil.copy2(ROOT / source, package / target)
    notices = []
    metadata = json.loads(subprocess.check_output([str(ROOT / 'scripts/cargo-local'), 'metadata', '--locked', '--format-version', '1'], cwd=ROOT))
    dependencies = [(f"Rust: {item['name']} {item['version']} ({item.get('license') or 'see source license'})", Path(item['manifest_path']).parent) for item in metadata['packages'] if item.get('source')]
    for manifest in list((ROOT / 'node_modules').glob('*/package.json')) + list((ROOT / 'node_modules').glob('@*/*/package.json')):
        item = json.loads(manifest.read_text())
        dependencies.append((f"JavaScript: {item.get('name')} {item.get('version')} ({item.get('license', 'see source license')})", manifest.parent))
    for title, directory in dependencies:
        texts = []
        for license_file in directory.iterdir():
            if license_file.is_file() and license_file.name.lower().startswith(('license', 'licence', 'copying', 'copyright', 'notice')):
                texts.append(license_file.read_text(errors='replace'))
        notices.append(title + '\n' + '\n'.join(texts))
    (package / 'THIRD_PARTY_NOTICES.txt').write_text('Third-party dependency notices\n\n' + '\n\n'.join(notices))
    archive = output / f'{name}.tar.gz' 
    with tarfile.open(archive, 'w:gz') as stream:
        stream.add(package, arcname=name)
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix(archive.suffix + '.sha256').write_text(f'{digest}  {archive.name}\n')
    print(archive)
