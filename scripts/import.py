#!/usr/bin/env python3
"""One-time import of the exercises from the three old projects into data/.

  python3 scripts/import.py

Reads ~/Projects/lingemy-exercise (texts, summaries), ~/Projects/teded-exercise (texts) and
~/Projects/grammar-exercise (texts/0N/drill.html, daily/pool-*.js). Nothing there is changed. Existing data
files are overwritten, so run it only to (re)create the import, not after editing exercises here.
"""
import json, re, subprocess, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import drill

P = Path.home() / "Projects"
ENGINE = "/* ══════════════════════════════════════════════════════════\n   از اینجا به بعد موتور است"
FA_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")

NODE_HTML = r"""
const fs = require('fs');
const html = fs.readFileSync(process.argv[1], 'utf8');
const script = html.slice(html.indexOf('<script>') + 8);
const data = script.slice(0, script.indexOf(process.argv[2]));
const f = new Function(data + '; return { TITLE, STORE_KEY, TEXTS, SOURCE: typeof SOURCE === "undefined" ? "" : SOURCE };');
process.stdout.write(JSON.stringify(f()));
"""
NODE_POOL = r"""
const fs = require('fs');
global.window = {};
for (const p of process.argv.slice(2)) eval(fs.readFileSync(p, 'utf8'));
const html = fs.readFileSync(process.argv[1], 'utf8');
const i = html.indexOf('const SLOTS = [');
const SLOTS = eval(html.slice(i + 'const SLOTS = '.length, html.indexOf('\n];', i) + 2));
process.stdout.write(JSON.stringify({ SLOTS, POOL: window.POOL }));
"""


def node(code, *args):
    r = subprocess.run(["node", "-e", code, *map(str, args)], capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr[:1000])
    return json.loads(r.stdout)


def page(path):
    return node(NODE_HTML, path, ENGINE)


def slug(s):
    return re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-")


def put(coll, name, obj, counts):
    drill.write(drill.DATA / coll / f"{name}.js", obj)
    counts[coll] = [counts.get(coll, [0, 0])[0] + 1, counts.get(coll, [0, 0])[1] + len(obj["items"])]


def main():
    counts, src_units = {}, {}

    # IELTS Up Words: one lesson per file already
    for f in sorted((P / "lingemy-exercise/texts").glob("*.html")):
        d = page(f)
        assert len(d["TEXTS"]) == 1, f
        t = d["TEXTS"][0]
        put("ielts-words", f.stem, {"title": t["title"], "storeKey": d["STORE_KEY"], "items": t["items"]}, counts)
        src_units["ielts-words"] = src_units.get("ielts-words", 0) + len(t["items"])

    # summaries: one page with several lessons → one exercise per lesson
    for f in sorted((P / "lingemy-exercise/summaries").glob("*.html")):
        d = page(f)
        for t in d["TEXTS"]:
            m = re.match(r"درس ([۰-۹]+) — (.+)", t["title"])
            n = int(m.group(1).translate(FA_DIGITS))
            put("ielts-summaries", f"{n:02d}-{slug(m.group(2))}",
                {"title": "خلاصهٔ " + t["title"], "storeKey": f"summary-l{n:02d}", "items": t["items"]}, counts)
            src_units["ielts-summaries"] = src_units.get("ielts-summaries", 0) + len(t["items"])

    # TED-Ed: one video per file
    for f in sorted((P / "teded-exercise/texts").glob("*.html")):
        d = page(f)
        assert len(d["TEXTS"]) == 1, f
        t = d["TEXTS"][0]
        put("teded", f.stem, {"title": t["title"], "storeKey": d["STORE_KEY"], "source": d["SOURCE"], "items": t["items"]}, counts)
        src_units["teded"] = src_units.get("teded", 0) + len(t["items"])

    # grammar passages: ten texts per course file → one exercise per text
    for f in sorted((P / "grammar-exercise/texts").glob("*/drill.html")):
        c = int(f.parent.name)
        d = page(f)
        for k, t in enumerate(d["TEXTS"], 1):
            fa_c = str(c).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))
            put("grammar-passages", f"c{c}-t{k:02d}",
                {"title": f"دورهٔ {fa_c} · {t['title']}", "storeKey": f"{d['STORE_KEY']}-t{k:02d}", "items": t["items"]}, counts)
            src_units["grammar-passages"] = src_units.get("grammar-passages", 0) + len(t["items"])

    # daily grammar: the pool, grouped by structure; the structure's formula is each unit's skeleton
    daily = P / "grammar-exercise/daily"
    d = node(NODE_POOL, daily / "drill.html", *sorted(daily.glob("pool-*.js")))
    src_units["grammar-daily"] = len(d["POOL"])
    for k, s in enumerate(d["SLOTS"], 1):
        items = []
        for p in d["POOL"]:
            if p["slot"] != s["id"]:
                continue
            it = {"fa": p["fa"], "en": p["en"], "skeleton": s["formula"]}
            for key in ("why", "misses", "alt"):
                if p.get(key):
                    it[key] = p[key]
            extra = set(p) - {"id", "slot", "fa", "en", "why", "misses", "alt"}
            assert not extra, (p["id"], extra)
            items.append(it)
        title = f"{re.sub(r'<[^>]+>', '', s['fa'])} — {s['name']}"
        put("grammar-daily", f"{k:02d}-{s['id']}", {"title": title, "storeKey": f"daily-{s['id']}", "items": items}, counts)

    drill.index()
    for coll, (files, units) in counts.items():
        mark = "=" if units == src_units[coll] else "≠ MISMATCH"
        print(f"{coll:18} {files:3} exercises  {units:5} units  (source: {src_units[coll]} {mark})")


if __name__ == "__main__":
    main()
