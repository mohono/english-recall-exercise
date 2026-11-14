# english-recall-exercise

One home for the Persian → English active-recall drills: you read a Persian sentence, say or write the
English, then reveal the original with its words or its grammar explanation.

```
python3 serve.py            # http://127.0.0.1:8080, opens the view
python3 serve.py --lan      # also for a phone on the same Wi-Fi
```

Online at **https://91-107-173-6.sslip.io/app/** (open to anyone; Caddy on the server gives it https and
proxies to serve.py on port 8080). It installs as an app (PWA) and works offline: see "Install and offline" in
`app/README.md`. The old http://91.107.173.6:8080/app/ still answers. After committing, `scripts/deploy.sh`
pushes to GitHub and updates the server.

| Collection | In `data/` | Source | Skill that adds to it |
|---|---|---|---|
| واژگان — IELTS Up Words (80 lessons) | `ielts-words/` | `sources/ielts-words/lessons/*.pdf` | `ielts-vocab-drill` |
| واژگان — خلاصه‌ها (5) | `ielts-summaries/` | made from Anki cards | none |
| TED-Ed | `teded/` | transcripts via supadata.ai, `sources/teded/` | `teded-vocab-drill` |
| گرامر — متن‌ها (5 courses × 10 texts) | `grammar-passages/` | written per session, `sources/grammar/` | `ielts-passage-drill` |
| گرامر — ساختارها (37 structures × 10) | `grammar-daily/` | the old daily pool | none |

## How it fits together

- **`app/`** is the view and the one shared engine. See `app/README.md` for keys, voice, auto mode, phone use.
- **`data/<collection>/<id>.js`** is one exercise: `DRILL({ "title", "storeKey", "source"?, "items": [ … ] });`
  with plain JSON inside. A unit has `fa`, `en` and optionally `ipa`, `newPara`, `section`, `words`, `note`
  (vocabulary) and `skeleton`, `why`, `whyKey`, `trap`, `misses`, `alt`, `rule` (grammar). There is no HTML,
  CSS or JS in an exercise. `data/collections.json` names the collections and sets their order;
  `data/index.json` is generated.
- **`scripts/drill.py`** `build` turns the block a skill writes into a data file, `check` validates one (for
  TED-Ed also against the transcript), `check --all` validates everything, `index` rebuilds the index.
  **`scripts/add_ipa.py`** adds American IPA. **`scripts/fetch.py`** picks the next TED-Ed video and fetches
  its transcript (`SUPADATA_API_KEY` in `.env`, never committed).
- **`docs/`** says how to ask for each kind of new exercise ([docs/README.md](docs/README.md)) and lists the
  working rules ([docs/rules.md](docs/rules.md)).
- **`.claude/skills/`** hold the three skills. Their content rules are the ones from the old projects; they
  write data files here.

The exercises were imported once with `scripts/import.py` from `lingemy-exercise`, `teded-exercise` and
`grammar-exercise`, which are left as they were. Do not run the import again after editing exercises here: it
overwrites them. The audio / video tools and the Anki summary tool are still in `lingemy-exercise/tools`.

Not in git: `.env`, `app/vendor/` (the offline speech model, 45 MB), `scripts/.venv/` and `scripts/.nltk_data/`
(for `add_ipa.py`; setup is in its docstring).
