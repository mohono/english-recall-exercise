"""Serve english-recall-exercise on http://127.0.0.1:8766 and open the hands-free view in a Chrome app window.

The microphone only works on a real address (not file://), and Chrome remembers the mic permission for
127.0.0.1:8766, so it asks only the first time. Port 8765 is left free for AnkiConnect, which the +Anki
button talks to. Ctrl+C stops the server.

Usage: python3 serve.py [--no-open] [--lan] [--port N]

--lan also serves it to other devices on the same network (a phone on the Wi-Fi) and prints the address to
open there. Without it only this laptop can reach it. Voice commands stay laptop-only either way: browsers
give the microphone only to https or localhost.
"""
import functools
import shutil
import socket
import subprocess
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "scripts"))
import drill  # noqa: E402  (scripts/drill.py: the index of all exercises)

PORT = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8766
URL = f"http://127.0.0.1:{PORT}/app/"
SERVED = ("/app/", "/data/")       # the view and the exercises; sources, scripts and .env are not served


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")   # edited exercises show up on reload
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/app"):
            self.send_response(302)
            self.send_header("Location", "/app/")
            self.end_headers()
        elif "/." in path or not path.startswith(SERVED):
            self.send_error(404)
        else:
            if path == "/data/index.json":
                drill.index()                            # new exercises appear on their own
            super().do_GET()


def lan_ip():
    """This laptop's address on the local network (no packet is sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "<this-laptop's-ip>"
    finally:
        s.close()


def main():
    handler = functools.partial(Handler, directory=str(ROOT))
    lan = "--lan" in sys.argv
    try:
        server = ThreadingHTTPServer(("0.0.0.0" if lan else "127.0.0.1", PORT), handler)
    except OSError:
        print(f"Already running? Open {URL}")
        server = None
    if "--no-open" not in sys.argv:
        chrome = shutil.which("google-chrome") or shutil.which("chromium")
        if chrome:
            subprocess.Popen([chrome, f"--app={URL}", "--start-maximized"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            webbrowser.open(URL)
    if server:
        print(f"English recall drills on {URL}  (Ctrl+C to stop)")
        if lan:
            print(f"On a phone on the same Wi-Fi: http://{lan_ip()}:{PORT}/app/")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
