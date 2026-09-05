import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("check_package", Path(__file__).parents[1] / "check_package.py")
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class ProgressEvidenceTests(unittest.TestCase):
    def test_completion_requires_real_evidence(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(checker, "ROOT", Path(directory)):
            (Path(directory) / "progress").mkdir()
            for evidence in [None, [], ["progress/missing.md"], ["../outside.md"]]:
                with self.assertRaises(ValueError):
                    checker.check_progress("completed", evidence, acceptance=False)
            proof = Path(directory) / "progress/proof.txt"
            proof.write_text("")
            with self.assertRaises(ValueError):
                checker.check_progress("passed", ["progress/proof.txt"], acceptance=True)
            proof.write_text("Actual test result")
            checker.check_progress("completed", ["progress/proof.txt"], acceptance=False)
            checker.check_progress("passed", ["progress/proof.txt"], acceptance=True)

    def test_initial_and_unknown_states(self):
        checker.check_progress("not_run", None, acceptance=True)
        checker.check_progress("not_started", [], acceptance=False)
        for status in ["done-ish", "passed", ""]:
            with self.assertRaises(ValueError):
                checker.check_progress(status, [], acceptance=False)
        with self.assertRaises(ValueError):
            checker.check_progress("not_run", ["progress/proof.txt"], acceptance=True)

    def test_dependency_directories_are_not_scanned(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(checker, "ROOT", Path(directory)):
            for name in [".tools", "node_modules", "contracts"]:
                child = Path(directory) / name
                child.mkdir()
                (child / "test.json").write_text("{}")
            self.assertEqual([p.relative_to(directory).as_posix() for p in checker.package_files("*.json")], ["contracts/test.json"])
