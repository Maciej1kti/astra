import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("astra_launch", pathlib.Path(__file__).parent / "astra.focus/launch.py")
launch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launch)


class WindowTests(unittest.TestCase):
    def test_existing_app_is_selected(self):
        windows = [{"class": "chrome-localhost__-Default", "title": "Local Projects", "address": "0x123"}]
        self.assertEqual(launch.matching_window(windows, "https://localhost:47832"), "0x123")

    def test_other_browser_windows_are_ignored(self):
        windows = [
            {"class": "google-chrome", "title": "Local Projects", "address": "0x123"},
            {"class": "chrome-localhost__-Default", "title": "Other app", "address": "0x124"},
            {"class": "chrome-remote__-Default", "title": "Local Projects", "address": "0x125"},
        ]
        self.assertIsNone(launch.matching_window(windows, "https://localhost:47832"))

    def test_window_address_cannot_inject_dispatch_code(self):
        windows = [{"class": "chrome-localhost__-Default", "title": "Local Projects", "address": '"; malicious()'}]
        self.assertIsNone(launch.matching_window(windows, "https://localhost:47832"))


if __name__ == "__main__":
    unittest.main()
