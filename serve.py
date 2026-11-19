"""Serve english-recall-exercise on http://127.0.0.1:8080 and open the hands-free view in a Chrome app window.

Port 8765 is left free for AnkiConnect, which the +Anki button talks to. Ctrl+C stops the server.
Persian voice clips are served from audio/ (made with scripts/fa-voices.py); there is no upload endpoint.

Usage: python3 serve.py [--no-open] [--lan] [--port N]

--lan also serves it to other devices on the same network (a phone on the Wi-Fi) and prints the address to
open there. Without it only this laptop can reach it.
"""
import functools
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "scripts"))
import drill  # noqa: E402  (scripts/drill.py: the index of all exercises)

PORT = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8080
URL = f"http://127.0.0.1:{PORT}/app/"
SERVED = ("/app/", "/data/", "/audio/")   # the view, the exercises and the Persian voice clips; the rest is not served
STARS = ROOT / "state" / "stars.json"   # ⭐ starred sentences of every device (not in git)
STARS_LOCK = threading.Lock()
MAX_BODY, MAX_STARS = 512 * 1024, 5000

# ── voice: one m4a per Persian sentence, made with scripts/fa-voices.py ───────────────────────────
# Kept apart from data/ (not in git): audio/ on the server is the only copy.
AUDIO = ROOT / "audio"
DRILL_PATH = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$")
CLIP_HASH = re.compile(r"^[a-f0-9]{8,40}$")


def audio_dir(name):
    """audio/<collection>/<exercise>, refusing anything that is not exactly two plain segments."""
    if not isinstance(name, str) or not DRILL_PATH.match(name):
        raise ValueError("exercise")
    p = (AUDIO / name).resolve()
    if AUDIO.resolve() not in p.parents:
        raise ValueError("path")
    return p


def clip_list(name):
    """{hash: mtime} of the voice clips of one exercise (the mtime is a cache-buster)."""
    p = audio_dir(name)
    out = {}
    if p.is_dir():
        for f in p.glob("*.m4a"):
            if CLIP_HASH.match(f.stem):
                out[f.stem] = int(f.stat().st_mtime * 1000)   # ms: a re-take gets a new URL
    return out


def read_stars():
    try:
        return json.loads(STARS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def apply_stars(ops):
    """Apply {op: "add", entry} / {op: "remove", id} changes (each may come twice) and save the list."""
    if not isinstance(ops, list):
        raise ValueError("ops")
    with STARS_LOCK:
        stars = read_stars()
        for o in ops:
            if not isinstance(o, dict):
                raise ValueError("op")
            if o.get("op") == "add":
                e = o.get("entry")
                u = e.get("unit") if isinstance(e, dict) else None
                if not (isinstance(e.get("id"), str) and isinstance(u, dict)
                        and isinstance(u.get("fa"), str) and isinstance(u.get("en"), str)):
                    raise ValueError("entry")
                if not any(x["id"] == e["id"] for x in stars):
                    if len(stars) >= MAX_STARS:
                        raise ValueError("too many")
                    stars.append(e)
            elif o.get("op") == "remove" and isinstance(o.get("id"), str):
                stars = [x for x in stars if x["id"] != o["id"]]
            else:
                raise ValueError("op")
        STARS.parent.mkdir(exist_ok=True)
        tmp = STARS.with_suffix(".tmp")
        tmp.write_text(json.dumps(stars, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, STARS)
        return stars


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json"}

    def log_message(self, *args):
        pass

    def end_headers(self):
        if self.path.startswith("/audio/"):             # ?v=<mtime> makes each take a new URL
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-cache")   # edited exercises show up on reload
        super().end_headers()

    def send_json(self, data, code=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def list_audio(self):
        """GET /api/audio[?d=…]: the clips of one exercise, or how many every exercise has."""
        q = parse_qs(urlparse(self.path).query)
        name = (q.get("d") or [""])[0]
        try:
            if name:
                self.send_json({"clips": clip_list(name)})
                return
            counts = {}
            if AUDIO.is_dir():
                for col in sorted(AUDIO.iterdir()):
                    if not col.is_dir() or col.name.startswith("."):
                        continue
                    for ex in sorted(col.iterdir()):
                        if not ex.is_dir() or ex.name.startswith("."):
                            continue
                        n = sum(1 for f in ex.glob("*.m4a") if CLIP_HASH.match(f.stem))
                        if n:
                            counts[f"{col.name}/{ex.name}"] = n
            self.send_json({"counts": counts})
        except ValueError:
            self.send_error(400)

    def do_POST(self):
        path = self.path.split("?")[0]
        if path != "/api/stars":
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length") or 0)
        if not 0 < n <= MAX_BODY:
            self.send_error(413 if n else 400)
            return
        try:
            stars = apply_stars(json.loads(self.rfile.read(n)).get("ops"))
        except (ValueError, AttributeError, KeyError, TypeError):
            self.send_error(400)
            return
        self.send_json(stars)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/audio":
            self.list_audio()
            return
        if path == "/api/stars":
            with STARS_LOCK:
                self.send_json(read_stars())
        elif path in ("/", "/app"):
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
