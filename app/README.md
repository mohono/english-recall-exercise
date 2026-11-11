# The hands-free view

Every exercise in `data/` on one page, for studying on a laptop monitor a little way off or on a phone: a
sidebar of all exercises, big text, themes, keys, offline voice commands, an auto mode, touch and your place
remembered. An exercise is only a data file; it runs in this view on the one shared engine, `drill.html`.

**Start:** `python3 serve.py` serves the project on http://127.0.0.1:8766 and opens the view in a Chrome app
window. It continues the last exercise at the sentence you were on. Turn the microphone on with 🎤 or **M**;
Chrome asks for mic permission only the first time. (Port 8765 is left free for AnkiConnect, which the +Anki
button uses.)

**One-time setup:** the speech files are not in git (47 MB). Copy them from the cityTrade reader:
`mkdir -p app/vendor && cp ~/cityTrade/reader/vendor/* app/vendor/`

**Voice (English, each said on its own with a short pause around it):**
next · previous · answer / show · skip · repeat · pronounce · play / start / resume / continue ·
pause / wait / hold · stop · faster · slower · shorter · longer · settings · bookmark · save card · next lesson · previous lesson ·
bigger · smaller.
**🗣 Words** (or **G**, or say "commands") opens a list of every word the mic listens for and what saying it
does; while it is open, the row of each word it hears lights up, so you can practise them. The toast at the
bottom left shows what it heard. A word followed by `?` was ignored (not sure enough, or
run together with other speech). While the page reads an answer aloud the mic is deaf (the speakers would
otherwise give commands), so wait for it to finish, or press Esc.

**Keys:** Space/Enter/→/N next (answer first, then the next sentence) · Shift+Space/←/B previous · A answer ·
S skip · R repeat · W pronounce the next target word · P auto mode play / pause · = / − less / more time to
think · ; / ' shorter / longer wait after the answer · O auto-mode settings · C bookmark · \+ Anki · ] / [ lesson · . / , text size · V read the answer aloud
on / off · K typing box · E or L sidebar · T theme · F fullscreen · M mic · ? help · Esc stop (auto off) / close. ↑ ↓ PageUp PageDown scroll a long answer.

**Reading the answer aloud:** when the English answer shows, it is read aloud automatically, however you
opened it (voice, keys, auto mode, the page's own «نمایش پاسخ» button or Enter in the typing box). The
**🔊 Read** button in the bar (or **V**) turns this on and off. Going back to a sentence, or reopening your
place, does not read it again. Chrome lets a page speak only after one click or key press, so after starting,
click once anywhere; that one click also switches the mic on. The voice is the same one the lesson pages
use. If it doesn't start (for example a Google network voice while offline), it is tried again with a local
voice.

**Auto mode** (P, ▶ Auto, "play"): opens a sentence (the Persian is never read aloud), waits the think time
(10 s), opens the answer and reads the English aloud if 🔊 Read is on, waits a little (3 s), then goes to the next
sentence. The big clock at the bottom right shows the step and its seconds: 💭 think, 🔊 reading, ⏭ the wait
after. The countdown only runs in quiet time: it waits while something is read aloud, while a panel (settings,
lessons, help, words) is open and while you type in the typing box. Any move (next, previous, skip, repeat, a
click on a sentence) starts the time of the new step afresh, and going to another sentence stops the reading of
the old one.
"pause" / "wait" / "hold" (or P) pauses it where it is; "play" / "resume" / "continue" (or P) goes on, and an
answer cut off by the pause is read again. "stop" (or Esc, or ■) turns auto mode off. "faster" / "slower" (= / −)
change the think time, "shorter" / "longer" (; / ') the wait after the answer; both are on the bar too.
**⚙ Settings** (O, "settings"): time to think, extra time per English word (for long sentences), read the
answer aloud on / off, how many times it is read (1–3), reading speed (0.75 by default, slower than the voice's
own 1; the lesson's own 🔊 buttons read at this speed too), and the wait after the answer. "Try the speed"
reads a sample sentence; "Defaults" puts them all back. All of them are remembered.

**Sidebar** (☰, **E** or **L**): every exercise, grouped by collection (IELTS Up Words, summaries, TED-Ed,
grammar passages, grammar structures). A group opens and closes with a click on its name; the group you are in
opens by itself. Each exercise shows your place in it, or ✓ once you have seen its last answer. Click one to
switch to it, at your place in it. The » / « button at its top shrinks it to a narrow strip of numbers and
expands it again; E goes expanded → shrunk → hidden. ] / [ and "next lesson" / "previous lesson" move through
the same order. Auto mode never goes on into the next exercise: it turns itself off at the end of the one you
are in, and "play" on a finished exercise starts it again from the top.

**On a phone or a narrow window:** `python3 serve.py --lan` also serves it to devices on the same Wi-Fi
and prints the address to open on the phone (without `--lan` only the laptop can reach it). The layout follows
the width:
- wider than 1250px: the full bar, as described above;
- up to 1250px: the bar keeps ☰, the title, ◀ ▶, Auto and ■; **⋯** opens a sheet with every other control
  (answer, skip, repeat, word, bookmark, +Anki, lesson / exercise, the auto-mode times, ⚙, 🔊 Read, typing box,
  text size, theme, mic, help), so nothing needs a keyboard;
- up to 700px (phone): ◀ ▶ Auto ■ become big buttons at the bottom, the sidebar becomes a drawer that
  ☰ opens over the lesson (tap an exercise and it closes), settings, words and help fill the screen, and the
  text starts at 18px. Swiping the lesson sideways moves too: right = next (answer first), left = previous.
- on a touch screen, **a tap anywhere on the lesson** that is not a sentence or a button is "next": the answer
  first, then the next sentence. Tapping a sentence still jumps to it.
- **🎧 Earbuds** (in ⋯, on by default on a touch device): the earbud / headset buttons drive the drill.
  Play / pause turns auto mode on and pauses it, next track (usually a double tap) is "next", previous track is
  "previous"; the same controls show on the lock screen. A browser passes those buttons only to a page that is
  playing sound, so a silent sound loops while it is on (it may pause music from another app). Not yet tried on
  real earbuds.

What a device cannot do is not shown on it. Opened from another device over `http://<laptop-ip>`: no mic,
mic picker, 🗣 Words or voice help (browsers give the microphone only to https or localhost), no **+ Anki**, in the
⋯ sheet or in the lesson (AnkiConnect listens on the laptop's own 127.0.0.1:8765), and no ⛶ where the browser has
no fullscreen (iPhone). The screen is not kept awake there either (that needs https too).

Your place in every exercise (the sentence, and whether its answer was open), the furthest sentence reached
(shown in the sidebar), text size, theme, the auto-mode settings, typing box and mic choice are remembered
in this browser. The screen is kept awake while the view is open.

## How it is built

- `../serve.py` serves `app/` and `data/` only (not sources, scripts or `.env`). `data/index.json`, the list of
  collections and exercises with their titles and number of sentences, is rebuilt from the data files on every
  request, so a new exercise appears on its own.
- `drill.html` is the engine: `drill.html?d=<collection>/<id>` loads `data/<collection>/<id>.js` and shows it
  sentence by sentence (answer panel, speaker buttons, IPA, bookmark, + Anki; vocabulary rows and grammar rows).
  Fonts come from `fonts/`, not from the network.
- `index.html`, `hands.js`, `hands.css` are the view. The exercise runs in a frame from the same address, and
  `hands.js` adds `frame.css` to it (size, full width, themes, typing box hidden) and drives the engine through
  its own elements: `span.s`, `.reveal`, `.say`, `.cp-btn`, `.anki-btn`. The mic and the speech model live in
  the view, so they stay on from one exercise to the next.
- `vendor/vosk.js` (vosk-browser 0.0.8) and `vendor/vosk-model-small-en-us-0.15.tar.gz` do speech recognition
  fully offline in the page; no audio leaves the laptop. The recognizer only listens for the command words,
  plus "[unk]" for everything else. A word counts only when the recognizer is ≥ 0.85 sure of it and it has
  ≥ 0.35 s of quiet on both sides.
- "pause", "wait", "hold", "resume", "continue", "settings", "shorter" and "longer" were checked against the model (in its
  vocabulary, and each recognized at 1.00 in three edge-tts voices); "unpause" is not in its vocabulary.
- "anki" is not in the small model's vocabulary and a lone "word" is mostly heard as "[unk]", so those
  commands are "save card" and "pronounce". "back", "again", "listen", "up" and "down" are left out because
  they are common in the English answers you say aloud.
- Tested headless with Chrome's fake microphone (`--use-file-for-fake-audio-capture`), with edge-tts voices:
  every command was recognized in two voices, about 1–1.5 s after the word ends. The only misses were a
  "pronounce" said while the page was still reading the answer aloud, which is the deliberate mute.
  10 minutes of English answer sentences containing the command words (five voices), plus a minute of a
  lesson MP3 (Persian and English), ran no commands. 10 commands said in the middle of that speech, with
  under a second of pause around them, all ran.
