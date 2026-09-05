import importlib.util
import os
from pathlib import Path
import plistlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('installer', Path(__file__).resolve().parents[2] / 'ops/install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class InstallerTests(unittest.TestCase):
    def test_install_handles_spaces_and_generates_reviewable_service_without_starting_it(self):
        with tempfile.TemporaryDirectory(dir='/tmp') as temporary:
            root = Path(temporary).resolve()
            package = root / 'package'
            (package / 'bin').mkdir(parents=True)
            for name in ('projectd', 'projectctl'):
                (package / 'bin' / name).write_bytes(b'synthetic binary')
            prefix = root / 'prefix with spaces'
            service = installer.install(package, prefix, root / 'data', 'https://projects.test', 47831)
            self.assertEqual((prefix / 'bin/projectd').read_bytes(), b'synthetic binary')
            self.assertEqual((root / 'data').stat().st_mode & 0o777, 0o700)
            if service.suffix == '.plist':
                value = plistlib.loads(service.read_bytes())
                self.assertEqual(value['ProgramArguments'][0], str(prefix / 'bin/projectd'))
            else:
                self.assertIn('ExecStart="', service.read_text())
            self.assertFalse((root / 'data/projectd.sock').exists())
