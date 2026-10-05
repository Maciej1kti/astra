import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from check_annotations import failure_annotation  # noqa: E402


class FailureAnnotation(unittest.TestCase):
    def test_names_the_step_and_keeps_failing_lines_before_the_tail(self):
        lines = ["test a::b ... ok"] * 400 + [
            "test engine::writes::flaky ... FAILED",
            "thread 'engine::writes::flaky' panicked at crates/x.rs:1:1:",
            "assertion `left == right` failed: 100% wrong",
        ] + ["test c::d ... ok"] * 400 + ["error: test failed, to rerun pass `-p x --lib`"]
        annotation = failure_annotation(["scripts/cargo-local", "test", "--workspace"], lines)
        self.assertTrue(annotation.startswith("::error title=Check failed%3A scripts/cargo-local test --workspace::"))
        self.assertIn("engine::writes::flaky ... FAILED", annotation)
        self.assertIn("100%25 wrong", annotation)
        self.assertIn("error: test failed", annotation)
        self.assertNotIn("\n", annotation)
        self.assertLess(len(annotation), 3600)

    def test_short_output_is_kept_whole(self):
        annotation = failure_annotation(["npm", "run", "check"], ["one", "two"])
        self.assertEqual(annotation, "::error title=Check failed%3A npm run check::one%0Atwo")


if __name__ == "__main__":
    unittest.main()
