#!/usr/bin/env python3
"""Build, check and index the exercises in data/.

  python3 scripts/drill.py build <collection> <id> "<title>" <block.js> [--source URL] [--key STOREKEY]
  python3 scripts/drill.py check <collection>/<id> [--transcript <videoId>]
  python3 scripts/drill.py check --all
  python3 scripts/drill.py index

An exercise is one file, data/<collection>/<id>.js:  DRILL({ "title", "storeKey", "source"?, "items": [ … ] });
The part inside DRILL( … ) is plain JSON. `build` takes the block a skill writes (a JS object literal with
`items: [ … ]`, keys unquoted or quoted) and writes that file; an existing exercise is never overwritten:
edit its file in place instead. Collections and their order are listed in data/collections.json.
"""
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
UNIT_KEYS = {"fa", "en", "ipa", "newPara", "section", "words", "note",
             "skeleton", "why", "whyKey", "trap", "misses", "alt", "rule"}


def read(path):
    s = Path(path).read_text(encoding="utf-8").strip()
    if not (s.startswith("DRILL(") and s.endswith(");")):
        raise ValueError(f"{path}: must be DRILL({{ … }});")
    return json.loads(s[len("DRILL("):-2])


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("DRILL(" + json.dumps(obj, ensure_ascii=False, indent=2) + ");\n", encoding="utf-8")


def collections():
    listed = json.loads((DATA / "collections.json").read_text(encoding="utf-8"))
    known = {c["id"] for c in listed}
    extra = sorted(d.name for d in DATA.iterdir() if d.is_dir() and d.name not in known)
    return listed + [{"id": d, "title": d} for d in extra]


def index():
    """data/index.json: every collection with its exercises, in study order (file name order)."""
    out = []
    for c in collections():
        items = []
        for f in sorted((DATA / c["id"]).glob("*.js")):
            d = read(f)
            items.append({"id": f"{c['id']}/{f.stem}", "title": d["title"], "units": len(d["items"])})
        if items:
            out.append({"id": c["id"], "title": c["title"], "items": items})
    (DATA / "index.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return out


def js_block(path):
    """Evaluate a JS object literal (what the skills write) and return it as Python data."""
    code = ("const s = require('fs').readFileSync(process.argv[1], 'utf8').trim().replace(/,\\s*$/, '');"
            "process.stdout.write(JSON.stringify(eval('(' + s + ')')));")
    r = subprocess.run(["node", "-e", code, str(path)], capture_output=True, text=True)
    if r.returncode:
        sys.exit("JS error in the block:\n" + r.stderr.strip()[:800])
    return json.loads(r.stdout)


def build(coll, name, title, block_path, source="", key=""):
    if not ID_RE.match(coll) or not ID_RE.match(name):
        sys.exit("collection and id: letters, digits, . _ - only")
    out = DATA / coll / f"{name}.js"
    if out.exists():
        sys.exit(f"{out.relative_to(ROOT)} already exists; edit it in place instead of rebuilding")
    block = js_block(block_path)
    if isinstance(block, list):
        if len(block) != 1:
            sys.exit("the block must hold exactly one exercise")
        block = block[0]
    obj = {"title": title, "storeKey": key or f"{coll}-{name}"}
    if source:
        obj["source"] = source
    obj["items"] = block["items"]
    write(out, obj)
    index()
    print(f"wrote {out.relative_to(ROOT)}: {len(obj['items'])} units")


def problems(ref, transcript=""):
    coll, _, name = ref.partition("/")
    path = DATA / coll / f"{name}.js"
    bad = []
    try:
        d = read(path)
    except (OSError, ValueError) as e:
        return [str(e)], None
    for k in ("title", "storeKey", "items"):
        if not d.get(k):
            bad.append(f"missing or empty \"{k}\"")
    items = d.get("items") or []
    for n, it in enumerate(items, 1):
        for k in ("fa", "en"):
            if not isinstance(it.get(k), str) or not it[k].strip():
                bad.append(f"unit {n}: missing \"{k}\"")
        unknown = set(it) - UNIT_KEYS
        if unknown:
            bad.append(f"unit {n}: unknown key(s) {sorted(unknown)}")
        for w in it.get("words") or []:
            if not w.get("w"):
                bad.append(f"unit {n}: a word entry without \"w\"")
    key = d.get("storeKey")
    for other in DATA.glob("*/*.js"):
        if other.resolve() != path.resolve() and f'"storeKey": "{key}"' in other.read_text(encoding="utf-8"):
            bad.append(f"storeKey {key!r} also used in {other.relative_to(DATA)}")
    if transcript:
        got = " ".join(it.get("en", "") for it in items)
        want = (ROOT / "sources/teded/transcripts" / f"{transcript}.txt").read_text(encoding="utf-8").strip()
        if got != want:
            i = next((k for k, (a, b) in enumerate(zip(got, want)) if a != b), min(len(got), len(want)))
            bad.append(f"English units differ from the transcript at char {i}:\n"
                       f"  drill:      …{got[max(0, i - 50):i + 50]!r}\n"
                       f"  transcript: …{want[max(0, i - 50):i + 50]!r}")
        if d.get("storeKey") != f"teded-{transcript}":
            bad.append(f"storeKey is {d.get('storeKey')!r}, expected 'teded-{transcript}'")
    return bad, d


def check(ref, transcript=""):
    bad, d = problems(ref, transcript)
    if bad:
        print("FAILED", ref)
        for b in bad:
            print(" -", b)
        sys.exit(1)
    words = sum(len(it.get("words") or []) for it in d["items"])
    print(f"OK: {ref}: {len(d['items'])} units, {words} word entries, key {d['storeKey']}")


def check_all():
    refs = [f"{f.parent.name}/{f.stem}" for f in sorted(DATA.glob("*/*.js"))]
    failed = 0
    for ref in refs:
        bad, _ = problems(ref)
        if bad:
            failed += 1
            print("FAILED", ref)
            for b in bad:
                print(" -", b)
    print(f"{len(refs) - failed} of {len(refs)} exercises OK")
    sys.exit(1 if failed else 0)


def opt(args, name):
    if name in args:
        i = args.index(name)
        v = args[i + 1]
        del args[i:i + 2]
        return v
    return ""


if __name__ == "__main__":
    a = sys.argv[1:]
    source, key, transcript = opt(a, "--source"), opt(a, "--key"), opt(a, "--transcript")
    if a[:1] == ["build"] and len(a) == 5:
        build(*a[1:], source=source, key=key)
    elif a == ["check", "--all"]:
        check_all()
    elif a[:1] == ["check"] and len(a) == 2:
        check(a[1], transcript)
    elif a == ["index"]:
        print(sum(len(c["items"]) for c in index()), "exercises indexed")
    else:
        sys.exit(__doc__)
