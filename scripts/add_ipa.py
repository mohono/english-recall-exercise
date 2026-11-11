#!/usr/bin/env python3
"""Add American IPA to every English sentence (en) and target word (w) of an exercise in data/.

Each unit and each word entry gets an "ipa" field right after its "en" / "w". Re-running recomputes every
ipa field, so it is safe after editing an exercise.

    scripts/.venv/bin/python scripts/add_ipa.py data/ielts-words/02-Siblings.js   # one exercise
    scripts/.venv/bin/python scripts/add_ipa.py data/teded/*.js                   # a whole collection

Pronunciations come from the CMU Pronouncing Dictionary (American English) through g2p_en,
which also tags parts of speech for homographs (read, present, record…) and predicts
words the dictionary lacks. Function words inside phrases get their weak forms (ə, ðə, tə…).

One-time setup (both folders are git-ignored):
    python3 -m venv scripts/.venv && scripts/.venv/bin/pip install g2p_en
    NLTK_ALLOW_PROXIED_URLOPEN=1 scripts/.venv/bin/python -c "import nltk; \
      [nltk.download(p, download_dir='scripts/.nltk_data') for p in ('cmudict', 'averaged_perceptron_tagger_eng')]"
"""
import contextlib, io, re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

import nltk
nltk.data.path.insert(0, str(ROOT / "scripts" / ".nltk_data"))
sys.path.insert(0, str(ROOT / "scripts"))
import drill
_download, nltk.download = nltk.download, lambda *a, **k: True   # g2p_en asks for an old tagger name on import
with contextlib.redirect_stderr(io.StringIO()):
    from g2p_en import G2p
    from g2p_en.expand import normalize_numbers
    G2P = G2p()
nltk.download = _download

VOWELS = {"AA": "ɑ", "AE": "æ", "AH": "ʌ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ", "EH": "ɛ", "ER": "ɝ",
          "EY": "eɪ", "IH": "ɪ", "IY": "i", "OW": "oʊ", "OY": "ɔɪ", "UH": "ʊ", "UW": "u"}
CONS = {"B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ", "HH": "h", "JH": "dʒ", "K": "k",
        "L": "l", "M": "m", "N": "n", "NG": "ŋ", "P": "p", "R": "r", "S": "s", "SH": "ʃ", "T": "t",
        "TH": "θ", "V": "v", "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ"}

# Consonant clusters that may begin an English syllable (for placing stress marks)
ONSETS = {(c,) for c in "P B T D K G F V TH DH S Z SH ZH HH CH JH M N L R W Y".split()} | {tuple(o.split()) for o in """
P R|P L|B R|B L|T R|D R|K R|K L|G R|G L|F R|F L|TH R|SH R|S P|S T|S K|S M|S N|S L|S W|S F
K W|T W|D W|G W|TH W|P Y|B Y|F Y|M Y|K Y|V Y|HH Y|N Y|L Y
S P R|S P L|S T R|S K R|S K W|S K Y|S P Y""".replace("\n", "|").split("|") if o.strip()}

LETTERS = {"A": "EY1", "B": "B IY1", "C": "S IY1", "D": "D IY1", "E": "IY1", "F": "EH1 F", "G": "JH IY1",
           "H": "EY1 CH", "I": "AY1", "J": "JH EY1", "K": "K EY1", "L": "EH1 L", "M": "EH1 M", "N": "EH1 N",
           "O": "OW1", "P": "P IY1", "Q": "K Y UW1", "R": "AA1 R", "S": "EH1 S", "T": "T IY1", "U": "Y UW1",
           "V": "V IY1", "W": "D AH1 B AH0 L Y UW0", "X": "EH1 K S", "Y": "W AY1", "Z": "Z IY1"}

# Words the dictionary gets wrong or lacks, keyed by lowercase spelling
OVERRIDES = {"ielts": "AY1 EH2 L T S", "ietls": "AY1 EH2 L T S", "ted": "T EH1 D", "nasa": "N AE1 S AH0",
             "fomo": "F OW1 M OW0", "toefl": "T OW1 F AH0 L", "ok": "OW2 K EY1", "od'd": "OW2 D IY1 D",
             "irsafam": "IH1 R S AH0 F AE2 M", "fulfil": "F UH0 L F IH1 L",
             "fulfilment": "F UH0 L F IH1 L M AH0 N T"}
WORDLIKE_CAPS = {"WOW", "YOUR", "I", "A"}

# Weak forms used inside a phrase (never for the last word, where the word keeps its strong form)
WEAK = {"a": "AH0", "an": "AH0 N", "the": "DH AH0", "of": "AH0 V", "to": "T AH0", "and": "AH0 N D",
        "for": "F ER0", "from": "F R AH0 M", "at": "AH0 T", "as": "AH0 Z", "than": "DH AH0 N",
        "was": "W AH0 Z", "were": "W ER0", "are": "ER0", "but": "B AH0 T", "can": "K AH0 N"}

# Labels in word entries that are not pronounced: "sibling (noun)", "fulfil (BrE/AuE)", "BFF (= …)"
LABEL = re.compile(r"\s*\((?:=[^()]*|(?:noun|verb|adjective|adverb|phrasal verb|informal|formal|BrE|AmE|AuE"
                   r"|plural|n|U|C|male|female)(?:\s*[,/]\s*(?:noun|verb|adjective|adverb|informal|BrE|AmE|AuE|U|C))*)\)")


def to_ipa(phones):
    """ARPAbet phones of one word → IPA with stress marks (none on one-syllable words)."""
    # unstressed ER before a vowel is schwa + r (correct → kəˈrɛkt); i/u before r are lax (hear → hɪr)
    fixed = []
    for i, p in enumerate(phones):
        nxt = phones[i + 1] if i + 1 < len(phones) else ""
        if p == "ER0" and nxt[-1:].isdigit():
            fixed += ["AH0", "R"]
        elif p[:2] in ("IY", "UW") and nxt == "R":
            fixed.append({"IY": "IH", "UW": "UH"}[p[:2]] + p[2:])
        else:
            fixed.append(p)
    phones = fixed
    vowel_idx = [i for i, p in enumerate(phones) if p[-1].isdigit()]
    primaries = [i for i in vowel_idx if phones[i][-1] == "1"]
    if len(primaries) > 1:   # CMU gives some words two primaries (engineer); keep only the last
        phones = [p[:-1] + "2" if i in primaries[:-1] else p for i, p in enumerate(phones)]
    marks = {}
    if len(vowel_idx) > 1:
        prev = -1
        for vi in vowel_idx:
            stress = phones[vi][-1]
            if stress in "12":
                cluster = phones[prev + 1:vi]
                k = len(cluster)
                if prev >= 0:   # longest legal onset belongs to this syllable
                    k = 0
                    for n in range(len(cluster), 0, -1):
                        # a secondary stress is usually a compound part: likewise → ˈlaɪkˌwaɪz, not ˈlaɪˌkwaɪz
                        if stress == "2" and n > 1 and cluster[-1] in ("W", "Y"):
                            continue
                        if tuple(cluster[-n:]) in ONSETS:
                            k = n
                            break
                marks[vi - k] = "ˈ" if stress == "1" else "ˌ"
            prev = vi
    out = []
    for i, p in enumerate(phones):
        out.append(marks.get(i, ""))
        if p[-1].isdigit():
            base, s = p[:-1], p[-1]
            out.append({"AH": "ə", "ER": "ɚ"}.get(base, VOWELS[base]) if s == "0" else VOWELS[base])
        else:
            out.append(CONS[p])
    return "".join(out)


def year_words(m):
    """1980s → nineteen eighties"""
    w = normalize_numbers(m.group(1))
    return re.sub(r"y$", "ies", w) if w.endswith("y") else w + "s"


def prepare(text):
    t = re.sub(r"<[^>]+>", "", text)
    t = t.replace("’", "'").replace("‘", "'")
    t = "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")
    t = re.sub(r"\bWorld War II\b", "World War two", t)
    t = re.sub(r"\bCO2\b", "C O two", t)
    t = re.sub(r"\be\.g\.", "for example", t)
    t = re.sub(r"\bi\.e\.", "that is", t)
    t = re.sub(r"\betc\.", "et cetera", t)
    t = re.sub(r"#\s*(\d)", r"number \1", t)
    t = re.sub(r"(\d)\s*%", r"\1 percent", t).replace("&", " and ")
    t = re.sub(r"\b(\d{4})s\b", year_words, t)
    t = normalize_numbers(t)
    return re.sub(r"[—–]|-(?![A-Za-z])|(?<![A-Za-z])-", " ", t)


TOKEN = re.compile(r"[A-Za-z]+(?:['-][A-Za-z]+)*|\.\.\.|[…/()]")
PREFIXES = {"re", "co", "pre", "non", "un", "mis", "sub", "anti", "multi", "semi", "inter", "de", "ex"}


def spelled(word):
    """DNA → ˌdiˌɛnˈeɪ: each letter is its own syllable, stressed on the last one."""
    m = re.fullmatch(r"([A-Z]{2,})(s?)", word)
    if not m or m.group(1) in WORDLIKE_CAPS or word.lower() in OVERRIDES:
        return None
    letters = [to_ipa(LETTERS[c].split()) for c in m.group(1)]
    return "".join("ˌ" + l for l in letters[:-1]) + "ˈ" + letters[-1] + ("z" if m.group(2) else "")


def starts_with_vowel(word):
    sp = spelled(word)
    if sp:
        return sp.lstrip("ˌˈ")[0] in "aeioɛ"
    return token_phones(word, "", False)[0][0][-1].isdigit()


def token_phones(word, tag, last):
    """Phones for each spoken part of a token: one list, or several for a hyphenated compound."""
    if "-" in word:
        parts = word.split("-")
        joined = "".join(parts).lower()
        if joined in G2P.cmu:
            return [G2P.cmu[joined][0]]
        if parts[0].lower() in PREFIXES:          # re-word, co-worker
            return [G2P.predict(joined)]
        return [word_phones(w, tag, last and i == len(parts) - 1) for i, w in enumerate(parts)]
    return [word_phones(word, tag, last)]


def word_phones(word, tag, last):
    low = word.lower()
    if low in OVERRIDES:
        return OVERRIDES[low].split()
    if not last and low in WEAK and word != "A":
        return WEAK[low].split()
    if low == "read":
        return ["R", "EH1", "D"] if tag in ("VBD", "VBN") else ["R", "IY1", "D"]
    if low in G2P.homograph2features:
        pron1, pron2, pos1 = G2P.homograph2features[low]
        return pron1 if tag.startswith(pos1) else pron2
    if low in G2P.cmu:
        return G2P.cmu[low][0]
    return G2P.predict(low)


def ipa(text, is_word=False):
    if is_word:
        text = LABEL.sub("", text)
    toks = TOKEN.findall(prepare(text))
    words = [t for t in toks if t[0].isalpha()]
    if not words:
        return ""
    tags = iter(nltk.pos_tag(words))
    single = len(words) == 1
    out = []
    for i, t in enumerate(toks):
        if not t[0].isalpha():
            out.append({"/": "|", "...": "…"}.get(t, t))
            continue
        _, tag = next(tags)
        nxt = toks[i + 1] if i + 1 < len(toks) else None
        last = single or nxt is None or not nxt[0].isalpha()
        sp = spelled(t)
        if sp:
            out.append(sp)
            continue
        parts = token_phones(t, tag, last)
        if t.lower() == "the" and not last and starts_with_vowel(nxt):
            parts = [["DH", "IY0"]]   # "the" before a vowel sound
        out.extend(to_ipa(ph) for ph in parts)
    s = " ".join(out)
    s = re.sub(r"\(\s+", "(", s)
    s = re.sub(r"\s+\)", ")", s)
    return s


def with_ipa(d, key, is_word):
    """The same dict with "ipa" placed right after `key` (dropped if there is nothing to pronounce)."""
    p = ipa(d[key], is_word=is_word)
    out = {}
    for k, v in d.items():
        if k == "ipa":
            continue
        out[k] = v
        if k == key and p:
            out["ipa"] = p
    return out


def process(path):
    d = drill.read(path)
    n = 0
    items = []
    for it in d["items"]:
        it = with_ipa(it, "en", False)
        n += 1
        if it.get("words"):
            it["words"] = [with_ipa(w, "w", True) for w in it["words"]]
            n += len(it["words"])
        items.append(it)
    d["items"] = items
    drill.write(path, d)
    return n


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--say":
        for s in sys.argv[2:]:
            print(f"{s}  →  /{ipa(s)}/")
        sys.exit()
    for f in sys.argv[1:]:
        n = process(Path(f))
        print(f"{f}: {n} fields")
