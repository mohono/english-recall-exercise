#!/usr/bin/env python3
"""Synthesize the Persian of a whole exercise into audio/<collection>/<exercise>/<sha1(fa)>.m4a.

The voices are the free Persian Piper models behind eboo's "تبدیل متن به گفتار" page
(https://www.eboo.ir/text-to-speech); its API is only OCR and audio-to-text, so no key is
used here. Models are downloaded once into ~/.cache/eboo-tts/fa/ (60 MB each).

    python3 scripts/fa-voices.py --drill teded/001-Everything-you-need-to-know-about-bird-flu
    python3 scripts/fa-voices.py --drill teded/001-… --voice mana      # ganji (default), gyro,
                                                                        # amir, reza_ibrahim,
                                                                        # ganji_adabi, mana
    python3 scripts/fa-voices.py --drill teded/001-… --force            # redo clips that exist

Needs `piper` (pip install piper-tts) and ffmpeg. An existing clip is kept, so a take you
uploaded yourself is never replaced unless you pass --force. The clips are not in git; copy
them to the server with rsync (see the end of the output).
"""
import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
MODEL_URL = "https://www.eboo.ir/js/tts/models/fa/fa_IR-{voice}-medium"
VOICES = ["ganji", "gyro", "amir", "reza_ibrahim", "ganji_adabi", "mana"]
# the same pipeline as serve.py: trim the silence, even the loudness, 24 kHz mono AAC 32 kbps
FILTER = ("highpass=f=80,"
          "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.10:detection=peak,"
          "areverse,"
          "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.10:detection=peak,"
          "areverse,"
          "loudnorm=I=-16:TP=-1.5:LRA=11")


def load_items(drill):
    src = (ROOT / "data" / f"{drill}.js").read_text(encoding="utf8").strip()
    inner = src[len("DRILL("):].rstrip().removesuffix(";") if src.startswith("DRILL(") else ""
    if not inner.endswith(")"):
        sys.exit(f"{drill}.js is not a DRILL(…) file")
    return json.loads(inner[:-1])["items"]


def ensure_model(voice, cache):
    stem = f"fa_IR-{voice}-medium"
    model = cache / f"{stem}.onnx"
    config = cache / f"{stem}.onnx.json"
    if model.is_file() and config.is_file():
        return model
    cache.mkdir(parents=True, exist_ok=True)
    print(f"downloading {stem} (about 60 MB)…", flush=True)
    for path, suffix in ((model, ".onnx"), (config, ".onnx.json")):
        with urlopen(MODEL_URL.format(voice=voice) + suffix) as r, open(path, "wb") as f:
            f.write(r.read())
    return model


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--drill", required=True, help="collection/id, e.g. teded/001-…")
    ap.add_argument("--voice", default="ganji", choices=VOICES)
    ap.add_argument("--cache", type=Path, default=Path.home() / ".cache/eboo-tts/fa")
    ap.add_argument("--force", action="store_true", help="replace clips that already exist")
    a = ap.parse_args()

    items = load_items(a.drill)
    out = ROOT / "audio" / a.drill
    out.mkdir(parents=True, exist_ok=True)
    model = ensure_model(a.voice, a.cache)
    made = kept = failed = 0
    with tempfile.TemporaryDirectory(prefix="fa-voices-") as tmp:
        tmp = Path(tmp)
        for n, item in enumerate(items):
            fa = (item.get("fa") or "").strip()
            if not fa:
                continue
            dest = out / (hashlib.sha1(fa.encode()).hexdigest()[:12] + ".m4a")
            if dest.exists() and not a.force:
                kept += 1
                continue
            wav = tmp / f"{n}.wav"
            p = subprocess.run(["piper", "-m", str(model), "-f", str(wav)],
                               input=fa + "\n", text=True, capture_output=True)
            q = None
            if p.returncode == 0:
                q = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
                                    "-vn", "-af", FILTER, "-ac", "1", "-ar", "24000",
                                    "-c:a", "aac", "-b:a", "32k", "-movflags", "+faststart",
                                    "-f", "mp4", str(dest)], capture_output=True, text=True)
            if p.returncode or q.returncode:
                failed += 1
                err = (p.stderr or q.stderr or "").strip().splitlines()[-1:]
                print(f"{n + 1}: failed — {err}", file=sys.stderr)
                continue
            made += 1
            if made % 10 == 0:
                print(f"{n + 1}/{len(items)}", flush=True)

    total = sum(1 for _ in out.glob("*.m4a"))
    print(f"{a.drill}: voice={a.voice} made={made} kept={kept} failed={failed} clips={total}")
    if made:
        print("copy to the server:\n"
              f"  rsync -a audio/{a.drill}/ root@91.107.173.6:/root/hermes/hossein/"
              f"english-recall-exercise/audio/{a.drill}/")


if __name__ == "__main__":
    main()
