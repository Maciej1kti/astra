"""Read a bounded Focus preview through projectd's authenticated local API."""

import http.client
import json
import socket
import sys
import time
import uuid

MAX_BYTES = 2 * 1024 * 1024
MAX_CARDS = 5


class LocalClient:
    def __init__(self, path):
        self.path = path
        self.deadline = time.monotonic() + 6

    def get(self, path):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError()
        connection = http.client.HTTPConnection("localhost", timeout=min(2, remaining))
        channel = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        channel.settimeout(min(2, remaining))
        connection.sock = channel
        try:
            channel.connect(self.path)
            connection.request("GET", path, headers={"Accept": "application/json"})
            response = connection.getresponse()
            body = response.read(MAX_BYTES + 1)
            if len(body) > MAX_BYTES:
                raise ValueError("Response too large")
            if response.status != 200:
                raise ValueError("API request failed")
            return json.loads(body)
        finally:
            connection.close()


def snapshot(client):
    focus = client.get("/api/v1/workspace/focus")
    refs = focus["items"]
    if not isinstance(refs, list):
        raise ValueError("Invalid Focus response")
    cards = []
    for ref in refs[:MAX_CARDS]:
        try:
            project_id = str(uuid.UUID(ref["project_id"]))
            card_id = str(uuid.UUID(ref["card_id"]))
            card = client.get(f"/api/v1/projects/{project_id}/cards/{card_id}")
            metadata = card["metadata"]
            cards.append({"title": str(metadata["title"])[:300],
                          "status": str(metadata.get("status", ""))[:40],
                          "available": True})
        except (OSError, ValueError, KeyError, TypeError, http.client.HTTPException):
            cards.append({"title": "Unavailable pinned card", "status": "", "available": False})
    return {"online": True, "total": len(refs), "cards": cards,
            "message": "Local API reachable"}


def main():
    try:
        if len(sys.argv) != 2 or not sys.argv[1].startswith("/"):
            raise ValueError("Configure the socket path")
        result = snapshot(LocalClient(sys.argv[1]))
    except (OSError, ValueError, KeyError, TypeError, http.client.HTTPException):
        result = {"online": False, "total": 0, "cards": [],
                  "message": "Local API unavailable. Check the server and socket setting."}
    print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
