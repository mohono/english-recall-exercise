# The hands-free view

Every exercise in `data/` on one page, for studying on a laptop monitor a little way off or on a phone: a
sidebar of all exercises, big text, themes, keys, an auto mode, touch and your place
remembered. An exercise is only a data file; it runs in this view on the one shared engine, `drill.html`.

**Start:** `python3 serve.py` serves the project on http://127.0.0.1:8080 and opens the view in a Chrome app
window. It continues the last exercise at the sentence you were on. (Port 8765 is left free for AnkiConnect,
which the +Anki button uses.)

**Keys:** Space/Enter/→/N next (answer first, then the next sentence) · Shift+Space/←/B previous ·
P auto mode play / pause · = / − less / more time to think · ; / ' shorter / longer wait after the answer ·
O settings · C bookmark · X (or \*) star · \+ Anki · . / , text size · V read the answer
aloud on / off · E or L sidebar · T theme · F fullscreen · ? help · Esc stop (auto off) / close.
↑ ↓ PageUp PageDown scroll a long answer.

**Reading the answer aloud:** when the English answer shows, it is read aloud automatically, however you
opened it (keys, auto mode, the page's own «نمایش پاسخ» button or Enter in the typing box). The
**🔊 Read** button in the bar (or **V**) turns this on and off. Going back to a sentence, or reopening your
place, does not read it again. Chrome lets a page speak only after one click or key press, so after starting,
click once anywhere. The voice is the same one the lesson pages use. If it doesn't start (for example a Google network voice while offline), it is tried again with a local
voice.

**Auto mode** (P, ▶ Auto): opens a sentence (the Persian is not synthesized; if it has a voice clip,
that clip plays first, see “Persian voice clips”), waits the think time
(10 s), opens the answer and reads the English aloud if 🔊 Read is on, waits a little (3 s), then goes to the next
sentence. **Repeat each sentence** (⚙, Off / +1…+5) plays extra full rounds before it moves on: one round is
Persian → think → English → wait, and the whole round starts again, not each half on its own; the answer is hidden
again at the start of every round. The big clock at the bottom right shows the step and its seconds: 💭 think, 🔊 reading, ⏭ the wait
after. The countdown only runs in quiet time: it waits while something is read aloud, while a panel (settings,
lessons, help) is open and while you type in the typing box. Any move (next, previous, a
click on a sentence) starts the time of the new step afresh, and going to another sentence stops the reading of
the old one.
P pauses it where it is; P again goes on, and an answer cut off by the pause is read again. Esc (or ■) turns auto
mode off. = / − change the think time, ; / ' the wait after the answer.
**⚙ Settings** (O): the typing box on / off, time to think, extra time per English word (for long sentences), read the
answer aloud on / off, how many times it is read (1–3), reading speed (0.75 by default, slower than the voice's
own 1; the lesson's own 🔊 buttons read at this speed too), the wait after the answer, how many extra rounds of
each sentence to play (+1…+5, or Off; Persian → English as one round), and the Persian clip. "Try the speed"
reads a sample sentence; "Defaults" puts them all back. All of them are remembered.

**Persian voice clips:** a sentence whose Persian already has a clip shows a 🔊 beside it; a sentence without
one shows nothing. The clips are made ahead of time with `scripts/fa-voices.py --drill <collection>/<id>`: it
voices every sentence with one of six Persian Piper voices (the free ones on eboo's "تبدیل متن به گفتار" page)
and leaves clips that already exist alone unless `--force` is given. There is no upload button in the app.
A clip is kept as `audio/<collection>/<exercise>/<sha1(fa)>.m4a`, named by the Persian text rather than the
sentence number, so reordering an exercise never plays the wrong voice and an edited sentence needs a new clip.
Audio is not in git; `audio/` on the server is the only copy, and `?v=<mtime>` on the URL makes a replaced clip get
fetched again. Copy it there with rsync after generating.

In auto mode the setting **“Play the Persian sentence”** (⚙) plays the clip as the sentence opens and the countdown
waits for it, then the English answer is read as before. It is on by default; on a fresh page the browser needs one
click or key before it may play sound, the same rule as the English voice.

**⭐ Starred sentences** (the Anki deck, in the app): ☆ under any sentence (or **X**) stars it, and
a small ★ marks it in its exercise. Every starred sentence is in **⭐ ستاره‌دار → جمله‌های ستاره‌دار**, first in
the sidebar: one exercise, drilled like any other (auto mode, keys, your place), in the order you
starred them, each run under the title of the exercise it came from. It keeps a copy of the sentence with its
words and grammar rows, so an edited data file does not change it. Taking the star away there dims the sentence;
it is gone the next time the exercise opens. The stars are kept on the server (`state/stars.json`, not in git),
so a star on the phone shows on the laptop too. Starred offline, it shows at once and reaches the server on the
next start or when the network is back.

**Sidebar** (☰, **E** or **L**): every exercise, grouped by collection (starred sentences, IELTS Up Words, summaries, TED-Ed,
grammar passages, grammar structures). A group opens and closes with a click on its name; the group you are in
opens by itself. Each exercise shows your place in it, or ✓ once you have seen its last answer. Click one to
switch to it, at your place in it. The » / « button at its top shrinks it to a narrow strip of numbers and
expands it again; E goes expanded → shrunk → hidden. Auto mode never goes on into the next exercise: it turns itself off at the end of the one you
are in, and P on a finished exercise starts it again from the top.

**On a phone or a narrow window:** `python3 serve.py --lan` also serves it to devices on the same Wi-Fi
and prints the address to open on the phone (without `--lan` only the laptop can reach it). The layout follows
the width:
- wider than 1250px: the full bar, as described above;
- up to 1250px: the bar keeps ☰, the title, ◀ ▶, Auto and ■; **⋯** opens a sheet with every other control
  (bookmark, star, +Anki, ⚙ settings, 🔊 Read, text size, theme, help), so nothing needs a keyboard;
- up to 700px (phone): ◀ ▶ Auto ■ become big buttons at the bottom, the sidebar becomes a drawer that
  ☰ opens over the lesson (tap an exercise and it closes), settings and help fill the screen, and the
  text starts at 18px. Swiping the lesson sideways moves too: right = next (answer first), left = previous.
- on a touch screen, **a tap anywhere on the lesson** that is not a sentence or a button is "next": the answer
  first, then the next sentence. Tapping a sentence still jumps to it.
- **while auto mode is on**, a tap on a sentence is "next" as well (on a phone the text fills the screen), so the
  whole lesson is one tap target; only the lesson's buttons (🔊, bookmark, + Anki) keep their own job. To jump to a
  sentence then, press and hold it for half a second.
- **Back** (the phone / PWA button): closes an open panel first — settings, help, the sidebar drawer, ⋯ — and
  leaves the app only when nothing is open. It does not move between sentences.

What a device cannot do is not shown on it. Opened from another device over plain http (`http://<laptop-ip>`
or the old `http://91.107.173.6:8080`): no **+ Anki**, in the
⋯ sheet or in the lesson (AnkiConnect listens on the laptop's own 127.0.0.1:8765), and no ⛶ where the browser has
no fullscreen (iPhone). The screen is not kept awake there either (that needs https too).

Your place in every exercise (the sentence, and whether its answer was open), the furthest sentence reached
(shown in the sidebar), text size, theme, the auto-mode settings and the typing box are remembered
in this browser. The screen is kept awake while the view is open.

## Install and offline

Open **https://91-107-173-6.sslip.io/app/** (the address must be https, or localhost, for any of this). Install it
with Chrome's install icon in the address bar, or "Add to Home screen" / "Install app" in the phone browser's
menu; it then opens in its own window from an icon.

On the first visit `sw.js` (the service worker) saves the view, the fonts and **every exercise** on the device
(about 15 MB) and shows "Offline ready ✓" once. After that it opens and works with no network, at your last
exercise and sentence. When online, everything is still fetched fresh (an edited or new exercise shows on the
next reload) and the saved copy is refreshed; the saved copy is used only when the network is gone or slower than
3 s. New exercises are saved on the next start.

Saved places belong to one address, so progress on the old http address does not carry over by itself. Open
`http://91.107.173.6:8080/app/export.html?to=https://91-107-173-6.sslip.io/app/` once on each device that has
progress there: it moves every saved place and setting to the new address.

## How it is built

- `sw.js` + `manifest.webmanifest` + `icons/` make it an installable, offline app (see "Install and offline").
  `sw.js` answers the fetches of `/data/` too; `hands.js` (`keepOffline`) registers it and asks it to cache every
  exercise in `data/index.json`.
- `stars.js` is the ⭐ store, loaded by the view and the engine: a copy of the list in `localStorage`
  (`lhf.stars`) and the changes not yet sent (`lhf.starQueue`), sent as add / remove ops to `/api/stars`.
  `serve.py` keeps the list in `state/stars.json`. `drill.html?d=starred/all` builds the starred exercise from
  that copy, not from a data file; the view adds it to the sidebar itself (it is not in `data/index.json`).
- `../serve.py` serves `app/` and `data/` only (not sources, scripts or `.env`), plus `/api/stars`. `data/index.json`, the list of
  collections and exercises with their titles and number of sentences, is rebuilt from the data files on every
  request, so a new exercise appears on its own.
- `drill.html` is the engine: `drill.html?d=<collection>/<id>` loads `data/<collection>/<id>.js` and shows it
  sentence by sentence (answer panel, speaker buttons, IPA, bookmark, + Anki; vocabulary rows and grammar rows).
  Every sentence box can have a typing box for your own English translation before the answer shows; it is
  never checked, stays until you move on, and never takes the keyboard by itself (⚙ turns it off).
  Fonts come from `fonts/`, not from the network.
- `index.html`, `hands.js`, `hands.css` are the view. The exercise runs in a frame from the same address, and
  `hands.js` adds `frame.css` to it (size, full width, themes) and drives the engine through
  its own elements: `span.s`, `.reveal`, `.say`, `.cp-btn`, `.anki-btn`.
- A loading cover (`#boot`) is up from the first paint, already in the saved theme, until the exercise stands at
  your place in the saved size and look; on a switch of exercise it covers only the lesson frame.
