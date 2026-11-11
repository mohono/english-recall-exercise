#!/usr/bin/env python3
"""TED-Ed drill helper: pick the next video and fetch its transcript via supadata.ai.

  python3 scripts/fetch.py next          # newest video not yet in sources/teded/video-ledger.md
  python3 scripts/fetch.py get <videoId> # write sources/teded/transcripts/<videoId>.txt
"""
import json, re, sys, time, urllib.parse, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.supadata.ai/v1"
CHANNEL = "https://www.youtube.com/@TEDEd"
TEDED = ROOT / "sources" / "teded"
LEDGER = TEDED / "video-ledger.md"


def api_key():
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("SUPADATA_API_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("SUPADATA_API_KEY missing from .env")


def call(path, **params):
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"x-api-key": api_key()})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} from {path}: {e.read().decode('utf-8', 'replace')[:300]}")


def watch_url(vid):
    return f"https://www.youtube.com/watch?v={vid}"


def processed_ids():
    if not LEDGER.exists():
        return set()
    return set(re.findall(r"`([A-Za-z0-9_-]{11})`", LEDGER.read_text(encoding="utf-8")))


def cmd_next():
    _, d = call("/youtube/channel/videos", id=CHANNEL, type="video", limit=200)
    ids = d["videoIds"]
    done = processed_ids()
    pending = [v for v in ids if v not in done]
    if not pending:
        sys.exit(f"All {len(ids)} listed videos are already in the ledger.")
    vid = pending[0]
    _, m = call("/metadata", url=watch_url(vid))
    print(json.dumps({
        "videoId": vid,
        "title": m.get("title"),
        "published": (m.get("createdAt") or "")[:10],
        "durationSec": (m.get("media") or {}).get("duration"),
        "url": watch_url(vid),
        "positionInChannel": ids.index(vid) + 1,
        "channelListed": len(ids),
        "processed": len(done),
    }, ensure_ascii=False, indent=2))


def cmd_get(vid):
    status, d = call("/transcript", url=watch_url(vid), lang="en", text="true")
    while status == 202:
        time.sleep(5)
        status, d = call(f"/transcript/{d['jobId']}")
        if d.get("status") in ("queued", "active"):
            status = 202
    text = d["content"] if isinstance(d.get("content"), str) else " ".join(c["text"] for c in d["content"])
    text = re.sub(r"\s+", " ", text).strip()
    out = TEDED / "transcripts" / f"{vid}.txt"
    out.write_text(text + "\n", encoding="utf-8")
    print(f"{out.relative_to(ROOT)}: {len(text.split())} words, lang={d.get('lang')}")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["next"]:
        cmd_next()
    elif a[:1] == ["get"] and len(a) == 2:
        cmd_get(a[1])
    else:
        sys.exit(__doc__)
