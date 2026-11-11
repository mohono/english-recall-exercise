# Skills and project notes

Everything needed to keep adding exercises, in one place. The skills themselves stay in `.claude/skills/`,
because that is where Claude Code looks for them; this page says what each one does and how to ask for it.
The working rules that apply to all of them are in [rules.md](rules.md).

Open Claude Code in this folder (`~/Projects/english-recall-exercise`) and say one of the phrases below.
"ادامه" on its own is ambiguous here (three skills), so name the kind of exercise.

| Say | Skill | Makes | Writes to |
|---|---|---|---|
| `ادامهٔ TED-Ed` / `continue TED-Ed` | [teded-vocab-drill](../.claude/skills/teded-vocab-drill/SKILL.md) | the newest TED-Ed video not yet done: its transcript as units, B1+ words with definitions | `data/teded/`, `sources/teded/` |
| `ادامهٔ واژگان` / `continue vocab` | [ielts-vocab-drill](../.claude/skills/ielts-vocab-drill/SKILL.md) | the next IELTS Up Words lesson from its PDF, or a missing «تمرین تکمیلی» of an earlier one | `data/ielts-words/`, `sources/ielts-words/` |
| `ادامهٔ گرامر` / `continue grammar` | [ielts-passage-drill](../.claude/skills/ielts-passage-drill/SKILL.md) | the next grammar text of the current course (ten texts per course; a new course starts with a coverage plan you approve) | `data/grammar-passages/`, `sources/grammar/` |

Each run makes **one** exercise, checks it with `scripts/drill.py check` and commits it. It shows up in the
sidebar after a page reload.

To get a particular TED-Ed video instead of the next one, paste its YouTube link and ask for a TED-Ed exercise
from it. To fix one sentence, name the exercise and the sentence; only that unit is edited.

## What every skill uses

- `scripts/drill.py build <collection> <id> "<title>" <block.js> [--source URL] [--key KEY]`: the block the
  skill writes becomes `data/<collection>/<id>.js`. It never overwrites an existing exercise.
- `scripts/drill.py check <collection>/<id> [--transcript <videoId>]` and `check --all`.
- `scripts/add_ipa.py <file>`: American IPA for every English sentence and word (setup in its docstring).
- `scripts/fetch.py next | get <videoId>`: TED-Ed only; needs `SUPADATA_API_KEY` in `.env` (not in git).
- Ledgers: `sources/ielts-words/vocab-ledger.md`, `sources/teded/video-ledger.md`,
  `sources/grammar/drill-ledger.md`. They are the memory between sessions; each skill updates its own.

## Deploy

The live copy is http://91.107.173.6:8766/app/ (server `root@91.107.173.6`, folder
`/root/hermes/hossein/english-recall-exercise`, systemd unit `english-recall.service`). "commit and deploy"
means: commit, then `scripts/deploy.sh`, which pushes, pulls on the server, restarts the service and checks
that the page answers.

## Project

See the [main README](../README.md) for the layout, the collections and how the view works, and
[app/README.md](../app/README.md) for keys, voice, auto mode and phone use.
