"""Serve english-recall-exercise on http://127.0.0.1:8080 and open the hands-free view in a Chrome app window.

The microphone only works on a real address (not file://), and Chrome remembers the mic permission for
127.0.0.1:8080, so it asks only the first time. Port 8765 is left free for AnkiConnect, which the +Anki
button talks to. Ctrl+C stops the server.

Usage: python3 serve.py [--no-open] [--lan] [--port N]

--lan also serves it to other devices on the same network (a phone on the Wi-Fi) and prints the address to
open there. Without it only this laptop can reach it. Voice commands stay laptop-only either way: browsers
give the microphone only to https or localhost.
"""
import functools
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import uuid
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "scripts"))
import drill  # noqa: E402  (scripts/drill.py: the index of all exercises)

PORT = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8080
URL = f"http://127.0.0.1:{PORT}/app/"
SERVED = ("/app/", "/data/", "/audio/")   # the view, the exercises and the recorded voice; the rest is not served
STARS = ROOT / "state" / "stars.json"   # ⭐ starred sentences of every device (not in git)
STARS_LOCK = threading.Lock()
MAX_BODY, MAX_STARS = 512 * 1024, 5000

# ── voice: one m4a per Persian sentence, recorded in app/record.html ──────────────────────────────
# Kept apart from data/ (not in git): a recording is taken, not generated, and grows with every exercise.
AUDIO = ROOT / "audio"
AUDIO_TMP = AUDIO / ".tmp"
MAX_AUDIO = 16 * 1024 * 1024          # a sentence is seconds long; 16 MB is already absurd
FFMPEG, FFPROBE = shutil.which("ffmpeg"), shutil.which("ffprobe")
DRILL_PATH = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*/[A-Za-z0-9][A-Za-z0-9._-]*$")
CLIP_HASH = re.compile(r"^[a-f0-9]{8,40}$")
AUDIO_EXT = {"audio/webm": ".webm", "video/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a",
             "audio/x-m4a": ".m4a", "audio/aac": ".aac", "audio/wav": ".wav", "audio/x-wav": ".wav",
             "audio/mpeg": ".mp3", "application/octet-stream": ".bin"}
AUDIO_FILTER = ("highpass=f=80,"
                "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.10:detection=peak,"
                "areverse,"
                "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.10:detection=peak,"
                "areverse,"
                "loudnorm=I=-16:TP=-1.5:LRA=11")


def audio_dir(name):
    """audio/<collection>/<exercise>, refusing anything that is not exactly two plain segments."""
    if not isinstance(name, str) or not DRILL_PATH.match(name):
        raise ValueError("exercise")
    p = (AUDIO / name).resolve()
    if AUDIO.resolve() not in p.parents:
        raise ValueError("path")
    return p


def clip_list(name):
    """{hash: mtime} of the sentences recorded for one exercise (the mtime is a cache-buster)."""
    p = audio_dir(name)
    out = {}
    if p.is_dir():
        for f in p.glob("*.m4a"):
            if CLIP_HASH.match(f.stem):
                out[f.stem] = int(f.stat().st_mtime * 1000)   # ms: a re-take gets a new URL
    return out


def encode(raw):
    """One canonical voice file: trimmed, 24 kHz mono, 32 kbps AAC — about 4 KB a second."""
    if not FFMPEG:
        raise RuntimeError("ffmpeg is not installed")
    AUDIO_TMP.mkdir(parents=True, exist_ok=True)
    out = AUDIO_TMP / (uuid.uuid4().hex + ".m4a")
    cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw), "-vn",
           "-af", AUDIO_FILTER, "-ac", "1", "-ar", "24000",
           "-c:a", "aac", "-b:a", "32k", "-movflags", "+faststart", "-f", "mp4", str(out)]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        if r.returncode:
            raise RuntimeError((r.stderr or "ffmpeg failed").strip()[-300:])
        dur = 0.0
        if FFPROBE:
            p = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration",
                                "-of", "default=nw=1:nk=1", str(out)],
                               capture_output=True, text=True)
            try:
                dur = float(p.stdout.strip())
            except ValueError:
                dur = 0.0
        if dur and not 0.25 <= dur <= 120:
            raise ValueError(f"duration {dur:.1f}s")
        return out, dur
    except Exception:
        out.unlink(missing_ok=True)
        raise


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

    def save_audio(self):
        """POST /api/audio?d=<collection>/<exercise>&h=<hash>: one take, transcoded and stored."""
        if not FFMPEG:
            self.send_error(503, "ffmpeg is not installed")
            return
        q = parse_qs(urlparse(self.path).query)
        name, digest = (q.get("d") or [""])[0], (q.get("h") or [""])[0]
        if not DRILL_PATH.match(name) or not CLIP_HASH.match(digest):
            self.send_error(400)
            return
        n = int(self.headers.get("Content-Length") or 0)
        if not 0 < n <= MAX_AUDIO:
            self.send_error(413 if n else 400)
            return
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        suffix = AUDIO_EXT.get(ctype)
        if not suffix:
            self.send_error(415, "Send an audio recording")
            return
        raw = AUDIO_TMP / (uuid.uuid4().hex + suffix)
        out = None
        try:
            AUDIO_TMP.mkdir(parents=True, exist_ok=True)
            raw.write_bytes(self.rfile.read(n))
            out, dur = encode(raw)
            dest = audio_dir(name) / (digest + ".m4a")
            dest.parent.mkdir(parents=True, exist_ok=True)
            os.replace(out, dest)
            out = None
            st = dest.stat()
            self.send_json({"ok": True, "hash": digest, "bytes": st.st_size,
                            "dur": round(dur, 2), "mtime": int(st.st_mtime * 1000)})
        except ValueError as e:
            self.send_error(422, str(e)[:200])
        except (OSError, RuntimeError, subprocess.SubprocessError) as e:
            self.send_error(422, str(e)[:200])
        finally:
            raw.unlink(missing_ok=True)
            if out:
                out.unlink(missing_ok=True)

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
        if path == "/api/audio":
            self.save_audio()
            return
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

    def do_DELETE(self):
        """DELETE /api/audio?d=…&h=…: forget one take (a re-record replaces it, so rarely needed)."""
        if self.path.split("?")[0] != "/api/audio":
            self.send_error(404)
            return
        q = parse_qs(urlparse(self.path).query)
        name, digest = (q.get("d") or [""])[0], (q.get("h") or [""])[0]
        if not CLIP_HASH.match(digest):
            self.send_error(400)
            return
        try:
            (audio_dir(name) / (digest + ".m4a")).unlink(missing_ok=True)
            self.send_json({"ok": True})
        except ValueError:
            self.send_error(400)

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
