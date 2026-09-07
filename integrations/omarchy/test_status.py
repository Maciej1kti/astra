"""Behavior checks for partial Focus results and the bounded local reader."""
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("astra_status", pathlib.Path(__file__).parent / "astra.focus/status.py")
status = importlib.util.module_from_spec(spec)
spec.loader.exec_module(status)

PROJECT = "11111111-1111-4111-8111-111111111111"
CARD = "22222222-2222-4222-8222-222222222222"


class Client:
    def __init__(self, refs, fail=False):
        self.refs, self.fail, self.paths = refs, fail, []

    def get(self, path):
        self.paths.append(path)
        if path.endswith("/focus"):
            return {"items": self.refs}
        if self.fail:
            raise FileNotFoundError()
        return {"metadata": {"title": "<b>Not markup</b> $(not-a-command)", "status": "active"}}


class FocusTests(unittest.TestCase):
    def test_empty_focus_is_online(self):
        self.assertTrue(status.snapshot(Client([]))["online"])

    def test_limits_detail_requests_and_preserves_total(self):
        client = Client([{"project_id": PROJECT, "card_id": CARD}] * 20)
        result = status.snapshot(client)
        self.assertEqual(result["total"], 20)
        self.assertEqual(len(result["cards"]), 5)
        self.assertEqual(len(client.paths), 6)
        self.assertEqual(result["cards"][0]["title"], "<b>Not markup</b> $(not-a-command)")

    def test_missing_card_does_not_hide_other_pins_or_claim_server_down(self):
        result = status.snapshot(Client([{"project_id": PROJECT, "card_id": CARD}], fail=True))
        self.assertTrue(result["online"])
        self.assertFalse(result["cards"][0]["available"])

    def test_invalid_ids_never_become_api_paths(self):
        client = Client([{"project_id": "../../local", "card_id": CARD}])
        self.assertFalse(status.snapshot(client)["cards"][0]["available"])
        self.assertEqual(client.paths, ["/api/v1/workspace/focus"])

    def test_unavailable_socket_is_an_error(self):
        with self.assertRaises(OSError):
            status.snapshot(status.LocalClient("/nonexistent/astra-test.sock"))


if __name__ == "__main__":
    unittest.main()
