"""Focus the matching Astra browser app, or launch it once without a shell."""

import json
import re
import subprocess
import sys
import time
from urllib.parse import urlsplit


def matching_window(windows, url):
    host = urlsplit(url).hostname
    for window in windows:
        app_class = window.get("class", "")
        # Chromium app IDs omit the port. Require Astra's title as well so
        # unrelated local web apps are not selected by hostname alone.
        if (host and app_class.startswith("chrome-" + host + "_")
                and window.get("title") == "Local Projects"
                and re.fullmatch(r"0x[0-9a-fA-F]+", window.get("address", ""))):
            return window["address"]
    return None


def find_window(url):
    output = subprocess.check_output(["hyprctl", "clients", "-j"], timeout=2)
    return matching_window(json.loads(output), url)


def main():
    url = sys.argv[1]
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("Expected an Astra HTTPS URL")
    address = find_window(url)
    if address:
        subprocess.run(["hyprctl", "dispatch", 'hl.dsp.focus({ window = "address:' + address + '" })'],
                       check=True, timeout=2)
        return
    subprocess.Popen(["omarchy", "launch", "webapp", url], start_new_session=True,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # Keep the widget's launch process busy while the browser creates its
    # window, preventing a double click from launching two browser windows.
    for _ in range(30):
        time.sleep(0.2)
        if find_window(url):
            return


if __name__ == "__main__":
    main()
