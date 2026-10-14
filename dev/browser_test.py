"""Run dev/browser_test.html in headless Chrome against the mod and report each check."""
import functools
import http.server
import json
import re
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


WIDTHS = [(800, 600), (500, 800)]


def run(port, width, height):
    with tempfile.TemporaryDirectory() as profile:
        dom = subprocess.run([CHROME, "--headless=new", "--no-first-run", "--use-mock-keychain", "--password-store=basic", f"--user-data-dir={profile}",
                              "--virtual-time-budget=12000", f"--window-size={width},{height}", "--dump-dom", f"http://127.0.0.1:{port}/dev/browser_test.html"],
                             capture_output=True, text=True, timeout=120).stdout
    found = re.findall(r'<pre id="result"[^>]*>(.*?)</pre>', dom, re.S)
    if not found or not found[-1].strip():
        print(f"{width}px: no results, the test page did not finish")
        return 1
    results = json.loads(found[-1].replace("&quot;", '"').replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">"))
    for result in results:
        print(f"{'ok  ' if result['ok'] else 'FAIL'} {width}px {result['name']}" + (f" ({result['detail']})" if not result["ok"] and result["detail"] else ""))
    failed = sum(not result["ok"] for result in results)
    print(f"{width}px: {len(results) - failed} passed, {failed} failed")
    return failed


def main():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    failed = sum(run(server.server_address[1], width, height) for width, height in WIDTHS)
    server.shutdown()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
