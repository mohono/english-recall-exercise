"use strict";
// The hands-free view of every exercise in data/. An exercise runs in the frame on the one shared engine
// (drill.html?d=<collection>/<id>), and this shell adds the sidebar of all exercises, big text, themes, keys,
// offline voice commands (Vosk), auto mode, touch and a remembered place. It drives the engine only through
// the engine's own elements (span.s, .reveal, .say, .cp-btn, .anki-btn). The mic and the speech model live
// here, so they stay on from one exercise to the next.

/* ---------- settings ---------- */
const SIZES = [14, 16, 18, 20, 22, 24, 26, 28, 30, 33, 36, 40, 44];   // root font size of the lesson, px
const THEMES = ["light", "dark", "contrast"];
// auto mode: what each setting can be (⚙, O, "settings"); the values themselves are stored, not their place here
const THINKS = [3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60];   // s to think before the answer opens
const PER_WORD = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.75, 1];                // extra s to think per word of the English
const AFTERS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 30];            // s to wait once the answer has been read
const TIMES = [1, 2, 3];                                                // times the answer is read aloud
const RATES = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.1, 1.2];   // reading speed (1 = the voice's own)
const DEFAULTS = { think: 10, perWord: 0, after: 3, speak: true, times: 1, rate: 0.75 };
const REPEAT_GAP = 900;              // ms between two readings of the same answer
const MODEL_URL = new URL("vendor/vosk-model-small-en-us-0.15.tar.gz", location.href).href;
const MIN_CONF = 0.85;               // ignore words the recognizer is not sure about
const GAP = 0.35;                    // s of quiet needed between a command and other speech ([unk])
const TTS_TAIL = 600;                // ms the mic stays deaf after the page stops reading aloud

// voice phrase -> command. The recognizer listens only for these (plus "[unk]" for everything else).
// Left out: "back", "again", "listen", "up", "down" (common in the English answers you say aloud) and short
// words like "go" and "top" (background speech triggered them in the cityTrade reader). "anki" is not in the
// model's vocabulary and a lone "word" is mostly heard as [unk], so those two are "save card" and "pronounce".
const PHRASES = {
  "next lesson": "nextLesson", "previous lesson": "prevLesson",
  "next": "step", "previous": "prev", "answer": "answer", "show": "answer", "skip": "skip",
  "repeat": "repeat", "pronounce": "word",
  "play": "autoOn", "start": "autoOn", "resume": "autoOn", "continue": "autoOn",
  "pause": "pause", "wait": "pause", "hold": "pause", "stop": "quiet",
  "faster": "faster", "slower": "slower", "shorter": "shorterWait", "longer": "longerWait", "bigger": "bigger", "smaller": "smaller",
  "bookmark": "bookmark", "save card": "anki", "settings": "settings", "commands": "words",
};

// what saying each command does, in the order of the voice dialog (🗣 Words, G, "commands")
const DOES = {
  step: "Show the answer; when it is shown, go to the next sentence",
  answer: "Show the answer",
  skip: "Next sentence, without showing the answer",
  prev: "Previous sentence, with its answer shown",
  repeat: "Read the English sentence aloud again",
  word: "Read the next target word aloud (word 1, 2, … then again)",
  autoOn: "Start auto mode, or go on after a pause",
  pause: "Pause auto mode where it is (it waits for “play”)",
  quiet: "Stop reading aloud, and turn auto mode off",
  faster: "Auto mode: less time to think",
  slower: "Auto mode: more time to think",
  shorterWait: "Auto mode: shorter wait after the answer",
  longerWait: "Auto mode: longer wait after the answer",
  settings: "Open or close the auto-mode settings",
  bookmark: "Bookmark 🔖 this sentence, or remove the bookmark",
  anki: "Add this sentence to Anki (deck “sentences”)",
  nextLesson: "Go to the next exercise in the sidebar, at your place in it",
  prevLesson: "Go to the previous exercise in the sidebar, at your place in it",
  bigger: "Bigger text",
  smaller: "Smaller text",
  words: "Open or close this list",
};

// key -> command (Space is next, Shift+Space previous: see onKey). ↑ ↓ PageUp PageDown keep scrolling.
const KEYS = {
  Enter: "step", ArrowRight: "step", n: "step", ArrowLeft: "prev", b: "prev",
  a: "answer", s: "skip", r: "repeat", w: "word", p: "auto", "=": "faster", "-": "slower",
  c: "bookmark", "+": "anki", "]": "nextLesson", "[": "prevLesson", ".": "bigger", ",": "smaller",
  v: "speakAnswers", k: "typing", l: "side", t: "theme", f: "fullscreen", m: "mic", g: "words", o: "settings", e: "side", ";": "shorterWait", "'": "longerWait", "?": "help",
};
const MOVES = new Set(["step", "prev", "answer", "skip", "repeat", "word"]);   // these restart the auto countdown

/* ---------- stored state (per browser; everything still works without it) ---------- */
function load(key, dflt) {
  try { const v = localStorage.getItem("lhf." + key); return v === null ? dflt : JSON.parse(v); }
  catch { return dflt; }
}
function save(key, val) { try { localStorage.setItem("lhf." + key, JSON.stringify(val)); } catch { /* private window */ } }

// what this device cannot do is not offered at all (a phone that opened the laptop's address over the Wi-Fi):
// the mic (browsers give it only to https or localhost) and + Anki (AnkiConnect listens on the laptop's own 127.0.0.1)
const CAN_VOICE = !!navigator.mediaDevices?.getUserMedia;
const CAN_ANKI = ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname);
const CAN_REMOTE = "mediaSession" in navigator;      // earbud / headset buttons
const coarse = matchMedia("(pointer: coarse)");     // a touch screen is the main way in
const phone = matchMedia("(max-width: 700px)");   // bottom bar, sidebar as a drawer, dialogs full screen
let sideOpen = false;                // the exercises drawer on a phone (never stored: it opens over the lesson)

const S = {
  size: load("size", phone.matches ? 18 : 24), theme: load("theme", "light"),
  ...Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, load(k, v)])),   // auto mode, read aloud
  type: load("type", false),         // show the typing box
  remote: load("remote", coarse.matches),   // earbud / headset buttons drive the drill (🎧)
  side: load("side", true),          // the exercises sidebar (pages with more than one exercise)
  sideSmall: load("sideSmall", false),   // shrunk to a narrow strip of lesson numbers
  closed: load("closed", {}),        // sidebar groups: { collection: false } = open (closed until you open one)
  micOn: load("micOn", false), micDev: load("micDev", ""),
  last: load("last", ""),            // path of the last lesson
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const frame = $("#lesson");
let GROUPS = [];                     // data/index.json: [{ id, title, items: [{ id, title, units }] }]
let LESSONS = [];                    // every exercise in sidebar order: [{ path, title, units, group }]
let F = null;                        // the exercise in the frame: { win, doc, path, title, group, spans }
let lastActive = -1, lastShown = false, wordAt = 0;
let quietReveal = false;             // the next answer to open is not read aloud (going back, or it reads something else)

/* ---------- the engine, seen from outside ---------- */
const active = () => F ? F.spans.findIndex((s) => s.classList.contains("active")) : -1;
const panel = () => active() < 0 ? null : F.doc.querySelector(".drawer .slot");
const shown = () => { const p = panel(); return !!p && !p.querySelector(".answer").hidden; };
const place = () => load("at." + F.path, { i: 0, shown: false });
const ttsBusy = () => performance.now() < readingUntil || !!gapTimer || !!F?.win.speechSynthesis?.speaking;
// also an utterance asked for but not started yet (bounded: play() gives up on it after a few seconds)
const reading = () => ttsBusy() || (!!current && !readingUntil);

function open(i, show = false) {     // show: with its answer, not read aloud
  i = Math.max(0, Math.min(F.spans.length - 1, i));
  if (active() !== i) F.spans[i].click();           // the engine opens the drawer and brings it to the top
  if (F.doc.activeElement?.matches("textarea") && !S.type) F.doc.activeElement.blur();
  if (show) reveal(true);
}
function openPlace() {               // auto mode starts a finished lesson again from the top
  const p = place();
  if (auto && p.i >= F.spans.length - 1 && p.shown) open(0);
  else open(p.i, p.shown);
}

function reveal(silent = false) {    // read aloud (if on) by changed(), however the answer was opened
  const p = panel();
  if (!p || !p.querySelector(".answer").hidden) return;
  quietReveal = silent;
  p.querySelector(".reveal").click();
}

/* ---------- reading aloud ----------
   Done here, not by the lesson page: Chrome lets a page speak only after a click or key in it, and the
   lesson page starts afresh with every lesson, while this view stays open. Voice and rate as in the engine. */
const TTS = window.speechSynthesis;
let voice = null, local = null;      // the engine's choice (often a network voice), and an offline one
let speaking = null;                 // the lesson's 🔊 button whose text is being read
let current = null, readingUntil = 0;   // the utterance, and when its reading is over at the latest
let gapTimer = 0;                    // the pause before the same answer is read once more
function pickVoice() {
  const vs = TTS.getVoices().filter((v) => /^en[-_]US$/i.test(v.lang));
  voice = vs.find((v) => /natural|online|neural|google|aria|jenny|ava|samantha/i.test(v.name))
    || vs.find((v) => v.localService) || vs[0] || null;
  local = vs.find((v) => v.localService) || null;   // none: the browser's default voice
}
function hush() {
  TTS?.cancel();
  clearTimeout(gapTimer); gapTimer = 0;
  speaking?.classList.remove("on");
  speaking = current = null; readingUntil = 0;
}
function play(btn, retry = true, times = 1) {   // read a 🔊 button's text from the start, `times` times over
  if (!btn) return;
  if (!TTS) { toast("This browser has no speech voice"); return; }
  // before the first click or key Chrome refuses to speak, and the utterance after a refused one can hang
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
    toast("Click once (or press a key) so the page may read aloud", 5000);
    return;
  }
  F.win.speechSynthesis?.cancel();   // the lesson page's own reading, if any
  hush();
  const text = btn.dataset.say, u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; u.rate = S.rate;
  const v = retry && navigator.onLine ? voice : local;   // a network voice does not work offline
  if (v) u.voice = v;
  // the mic is deaf only while a reading really sounds: Chrome may say "speaking" for one that never starts
  u.onstart = () => { if (current === u) readingUntil = performance.now() + 2000 + 90 * text.length * 0.9 / S.rate; };
  u.onend = u.onerror = (e) => {
    if (current === u) {
      btn.classList.remove("on"); speaking = current = null; readingUntil = 0;
      if (times > 1 && !e.error) gapTimer = setTimeout(() => { gapTimer = 0; play(btn, true, times - 1); }, REPEAT_GAP);
    }
    if (e.error === "not-allowed") toast("Click once (or press a key) so the page may read aloud", 5000);
  };
  btn.classList.add("on"); speaking = btn; current = u;
  TTS.speak(u);
  setTimeout(() => {                 // not started (a network voice offline, or Chrome hanging): try once more, locally
    if (current !== u || readingUntil) return;
    hush();                          // speaking right after cancelling a pending utterance hangs too: let it settle
    if (retry) setTimeout(() => { if (!current) play(btn, false, times); }, 300); else toast("Reading aloud did not start");
  }, retry ? 1500 : 4000);
}

function step() {
  const a = active();
  if (a < 0) openPlace();
  else if (!shown()) reveal();
  else if (a + 1 < F.spans.length) open(a + 1);
  else toast(CAN_VOICE ? "End of the exercise — say “next lesson”" : "End of the exercise", 4000);
}
function prev() {
  const a = active();
  if (a < 0) openPlace();
  else if (a > 0) open(a - 1, true);
}
function skip() {
  const a = active();
  if (a < 0) openPlace();
  else if (a + 1 < F.spans.length) open(a + 1);
  else toast("End of the exercise", 3000);
}
function answer() { if (active() < 0) openPlace(); reveal(); }
function repeat() {
  const p = panel();
  if (!p) return;
  reveal(true);
  play(p.querySelector(".en-box .say"));
}
function word() {
  const p = panel();
  if (!p) return;
  reveal(true);
  const ws = [...p.querySelectorAll(".wentry")];
  if (!ws.length) { toast("No target words in this sentence"); return; }
  const k = wordAt++ % ws.length;
  ws.forEach((w, j) => w.classList.toggle("hf-cur", j === k));
  ws[k].scrollIntoView({ block: "nearest", behavior: "smooth" });
  play(ws[k].querySelector(".say"));
  toast(`Word ${k + 1} / ${ws.length}`);
}
function quiet() {
  F?.win.speechSynthesis?.cancel();
  hush();
  if (auto) { setAuto(false); toast("Auto off"); }
}
function readAnswer() {              // the open answer, as many times as set
  const btn = panel()?.querySelector(".en-box .say");
  if (btn) play(btn, true, S.times);
}
function bookmark() {
  const p = panel();
  if (!p) { toast("Open a sentence first"); return; }
  const btn = p.querySelector(".cp-btn");
  btn.click();
  toast(btn.classList.contains("on") ? "Bookmark set 🔖" : "Bookmark removed");
}
function anki() {
  if (!CAN_ANKI) { toast("Anki is only reachable on the laptop itself"); return; }
  const p = panel();
  if (!p) { toast("Open a sentence first"); return; }
  const msg = p.querySelector(".anki-msg");
  const obs = new F.win.MutationObserver(() => { if (msg.textContent) toast(msg.textContent, 7000); });
  obs.observe(msg, { childList: true, characterData: true, subtree: true });
  setTimeout(() => obs.disconnect(), 60000);
  toast("Adding to Anki…", 4000);
  p.querySelector(".anki-btn").click();
}

/* ---------- auto mode ----------
   A sentence opens → think time (+ per word) → the answer opens and is read aloud (if on, × times) → the wait
   after it → the next sentence. The countdown only runs while nothing is being read aloud, no panel is open and
   you are not typing, so the time is always quiet time to think (or to read the answer). Any move, by voice,
   key, the bar or a click in the lesson, starts the countdown of the new step afresh; a pause keeps it. */
let auto = false, paused = false, cutRead = false;   // cutRead: a pause stopped the answer being read
let left = 0, total = 0, lastTick = 0, ticker = 0;   // ms of the countdown, and its full length
const overlayOpen = () => !$("#help").hidden || !$("#words").hidden || !$("#settings").hidden
  || document.body.classList.contains("more") || phone.matches && sideOpen;
function enWords() {
  const p = panel();
  return p ? (p.querySelector(".en-box .say")?.dataset.say || "").split(/\s+/).filter(Boolean).length : 0;
}
const stepTime = () => shown() ? S.after : S.think + S.perWord * enWords();
function restart() {                 // the countdown of the step the lesson is on now
  total = left = F && active() >= 0 ? stepTime() * 1000 : 0;
  showClock();
}
function holding() {                 // why the countdown is not running now ("" = it runs)
  if (!F) return "wait";
  if (reading()) return "read";
  if (overlayOpen()) return "hold";
  const el = F.doc.activeElement;
  if (el?.matches?.("textarea") && el.value.trim()) return "typing";
  return "";
}
function tick() {
  const now = performance.now(), dt = now - lastTick;
  lastTick = now;
  if (!auto || paused) return showClock();
  const why = holding();
  if (!why && (left -= dt) <= 0) autoMove();
  showClock(why);
}
function autoMove() {
  const a = active();
  if (a < 0) openPlace();
  else if (!shown()) reveal();
  else if (a + 1 >= F.spans.length) return endOfLesson();   // auto mode never walks into the next exercise
  else open(a + 1);
  restart();                         // changed() restarts it as well, once the engine has moved
}
function endOfLesson() {
  setAuto(false);
  toast(`End of ${F.title} — auto off`, 6000);
}
function setAuto(on) {
  auto = on; paused = false; cutRead = false;
  clearInterval(ticker); ticker = 0;
  if (on) {
    const a = F ? active() : -1;
    if (F && a < 0) openPlace();
    else if (F && shown() && a === F.spans.length - 1) open(0);   // started on a finished exercise: from the top
    restart();
    lastTick = performance.now();
    ticker = setInterval(tick, 100);
  }
  showClock();
}
function pause() {                   // P, the bar button, "pause" / "wait" / "hold": keep the step and its time
  if (!auto) { quiet(); return; }    // nothing to pause: just stop reading aloud
  if (paused) return;
  const ans = panel()?.querySelector(".en-box .say");
  cutRead = !!ans && (speaking === ans || !!gapTimer);   // reading the answer, or between two readings of it
  F?.win.speechSynthesis?.cancel();
  hush();
  paused = true;
  showClock();
  toast(CAN_VOICE ? "⏸ Paused — say “play” or press P" : "⏸ Paused");
}
function play_() {                   // start auto mode, or go on after a pause
  if (!auto) { setAuto(true); toast(`▶ Auto · ${S.think}s to think`); return; }
  if (!paused) { toast("Auto is already playing"); return; }
  paused = false;
  lastTick = performance.now();
  if (cutRead && shown()) readAnswer();   // the answer was cut off: read it again
  cutRead = false;
  showClock();
  toast("▶ Playing");
}
function setThink(d) {
  S.think = stepIn(THINKS, S.think, d); save("think", S.think);
  showPace();
  if (auto && F && !shown()) restart();
  toast(`${S.think}s to think`);
}
function stepIn(list, value, d) {    // the value d places further on in list (from the nearest one)
  let i = list.indexOf(value);
  if (i < 0) i = list.reduce((b, v, j) => Math.abs(v - value) < Math.abs(list[b] - value) ? j : b, 0);
  return list[Math.max(0, Math.min(list.length - 1, i + d))];
}
function setAfter(d) {
  S.after = stepIn(AFTERS, S.after, d); save("after", S.after);
  showPace();
  if (auto && F && shown()) restart();
  toast(`${S.after}s wait after the answer`);
}
function showPace() { $("#pace").textContent = "💭" + S.think + "s"; $("#after").textContent = S.after + "s"; }

let clockText = "";
function showClock(why = auto && !paused ? holding() : "") {
  const btn = $("#auto");
  btn.textContent = !auto ? "▶ Auto" : paused ? "▶ Resume" : "⏸ Pause";
  btn.classList.toggle("on", auto && !paused);
  btn.classList.toggle("paused", paused);
  const c = $("#clock");
  c.hidden = !auto;
  document.body.classList.toggle("auto", auto);   // the toast leaves room for the clock on a phone
  if (!auto) return;
  const sec = Math.max(0, Math.ceil(left / 1000));
  const ans = !!F && shown();
  const [icon, label] = paused ? ["⏸", "paused"]
    : why === "read" ? ["🔊", "reading"]
    : why === "typing" ? ["✋", "typing"]
    : why === "hold" ? ["✋", "on hold"]
    : why === "wait" ? ["…", ""]
    : ans ? ["⏭", sec + "s"] : ["💭", sec + "s"];
  const text = icon + label;
  if (text !== clockText) {
    clockText = text;
    c.querySelector(".icon").textContent = icon;
    c.querySelector(".label").textContent = label;
  }
  c.classList.toggle("answer", ans);
  c.style.setProperty("--done", total ? (1 - left / total).toFixed(3) : 0);
}

/* ---------- look ---------- */
function applyLook() {
  document.documentElement.dataset.theme = S.theme;
  $("#speak").classList.toggle("on", S.speak);
  $("#type").classList.toggle("on", S.type);
  if (!F) return;
  const root = F.doc.documentElement;
  root.style.setProperty("--hf-size", S.size + "px");
  root.style.setProperty("--hf-k", (S.size / 16).toFixed(3));
  root.dataset.hfTheme = S.theme;
  root.classList.toggle("hf-type", S.type);
  root.classList.toggle("hf-no-anki", !CAN_ANKI);
}
function keepPlace(change) {         // change the look without losing the line you are on
  const a = active();
  const el = a >= 0 ? F.spans[a] : F.spans.find((s) => s.getBoundingClientRect().bottom > 0);
  const top = el?.getBoundingClientRect().top;
  change();
  if (el) F.win.scrollBy(0, el.getBoundingClientRect().top - top);
}
function stepSize(d) {
  const i = SIZES.findIndex((s) => s >= S.size);
  S.size = SIZES[Math.max(0, Math.min(SIZES.length - 1, (i < 0 ? SIZES.length - 1 : i) + d))];
  save("size", S.size);
  F ? keepPlace(applyLook) : applyLook();
  toast(`Text ${S.size}px`);
}
function setTheme(t) { S.theme = t; save("theme", t); applyLook(); }
function toggle(key, on, off) {
  S[key] = !S[key]; save(key, S[key]);
  F ? keepPlace(applyLook) : applyLook();
  toast(S[key] ? on : off);
}

/* ---------- exercises: the sidebar lists every one, grouped by collection ---------- */
function goLesson(path) {
  const l = LESSONS.find((x) => x.path === path) || LESSONS[0];
  if (!l) return;
  S.last = l.path; save("last", l.path);
  history.replaceState(null, "", "#" + l.path);
  F = null;
  frame.src = "drill.html?d=" + l.path;
  markSide(l.path);
}
function lessonStep(d) {             // ] [ and "next / previous lesson": through the sidebar order
  const l = LESSONS[LESSONS.findIndex((x) => x.path === S.last) + d];
  if (!l) { toast(d > 0 ? "This is the last exercise" : "This is the first exercise"); return; }
  goLesson(l.path);
  toast(l.title, 3000);
}
function prog(l) {                   // ✓ once its last answer has been seen, else your place in it
  if (load("reached." + l.path, 0) >= l.units) return `<span class="done">✓</span>`;
  const p = load("at." + l.path, null);
  return p ? `${p.i + 1} / ${l.units}` : "";
}
const FA_NUM = (n) => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
function buildSide() {
  // shrunk, an exercise is only a number: the ones in its title ("درس ۲ — Siblings" → ۲), or its place in the group
  const num = (l, k) => (l.title.match(/[۰-۹0-9]+/g) || [FA_NUM(k + 1)]).slice(0, 2).join("·");
  const q = (t) => esc(t).replace(/"/g, "&quot;");
  $("#exercises").innerHTML = `<div class="head"><h4>تمرین‌ها</h4><button type="button" id="sideSize"></button></div>` +
    GROUPS.map((g) => `<section class="grp${S.closed[g.id] === false ? "" : " closed"}" data-c="${q(g.id)}">` +
      `<div class="gh" title="${q(g.title)}"><span class="caret">▾</span><span class="gt">${esc(g.title)}</span><span class="gc">${g.items.length}</span></div>` +
      g.items.map((it, k) => `<div class="item" data-path="${q(it.id)}" title="${q(it.title)}"><span class="num">${esc(num(it, k))}</span>` +
        `<span class="title">${esc(it.title)}</span><span class="prog"></span></div>`).join("") + `</section>`).join("");
  for (const l of LESSONS) sideItem(l.path).querySelector(".prog").innerHTML = prog(l);
  showSide();
}
const sideItem = (path) => $(`#exercises .item[data-path="${CSS.escape(path)}"]`);
function showSide() {               // docked beside the lesson; on a phone a drawer over it
  const drawer = phone.matches;
  const on = LESSONS.length > 0 && (drawer ? sideOpen : S.side);
  $("#exercises").hidden = !on;
  document.body.classList.toggle("side", on && !drawer);
  document.body.classList.toggle("side-small", on && !drawer && S.sideSmall);
  $("#sideBtn").classList.toggle("on", drawer ? on : S.side);
  updateBackdrop();
  const b = $("#sideSize");
  if (b) { b.textContent = S.sideSmall ? "«" : "»"; b.title = S.sideSmall ? "Expand the sidebar (E)" : "Shrink the sidebar (E)"; }
  $("#exercises .cur")?.scrollIntoView({ block: "nearest" });
}
function sizeSide(small) {           // shrink to the strip of numbers, or expand
  S.sideSmall = small; save("sideSmall", small);
  F ? keepPlace(showSide) : showSide();
}
function setGroup(sec, open) {
  sec.classList.toggle("closed", !open);
  S.closed[sec.dataset.c] = !open; save("closed", S.closed);
}
function markSide(path) {            // the exercise you are in (its group opens), and how far you are in it
  const it = sideItem(path), l = LESSONS.find((x) => x.path === path);
  if (!it || !l) return;
  it.querySelector(".prog").innerHTML = prog(l);
  if (it.classList.contains("cur")) return;
  $("#exercises .cur")?.classList.remove("cur");
  it.classList.add("cur");
  if (it.parentElement.classList.contains("closed")) setGroup(it.parentElement, true);
  it.scrollIntoView({ block: "nearest" });
}
$("#exercises").onclick = (e) => {
  const b = e.target.closest("button");
  if (b) { b.blur(); sizeSide(!S.sideSmall); return; }
  const gh = e.target.closest(".gh");
  if (gh) { setGroup(gh.parentElement, gh.parentElement.classList.contains("closed")); return; }
  const it = e.target.closest("[data-path]");
  if (!it) return;
  showWords(false); showSettings(false); $("#help").hidden = true;
  if (it.dataset.path !== F?.path) goLesson(it.dataset.path);
  if (sideOpen) { sideOpen = false; showSide(); }
};

/* ---------- the ⋯ sheet (windows too narrow for the whole bar) and the backdrop behind sheet and drawers ---------- */
function setMore(on) {
  document.body.classList.toggle("more", on);
  $("#moreBtn").classList.toggle("on", on);
  updateBackdrop();
}
function updateBackdrop() {          // catches a tap outside: the lesson is a frame, its taps do not reach this page
  $("#backdrop").hidden = !(document.body.classList.contains("more") || phone.matches && sideOpen);
}
function closeDrawers() {
  setMore(false);
  if (sideOpen) { sideOpen = false; showSide(); }
}
$("#backdrop").onclick = closeDrawers;
phone.addEventListener("change", () => { sideOpen = false; setMore(false); F ? keepPlace(showSide) : showSide(); });

/* ---------- earbud / headset buttons (🎧): play-pause = auto mode, next / previous track = sentence ----------
   A browser passes those buttons only to a page that is playing sound, so a silent sound loops while this is on
   (it also puts play / next / previous on the phone's lock screen). */
let remoteAudio = null;
function silentWav(sec) {            // 8 kHz, 8 bit, mono, all silence
  const rate = 8000, n = rate * sec, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); v.setUint32(4, 36 + n, true); str(8, "WAVEfmt "); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, "data"); v.setUint32(40, n, true);
  new Uint8Array(buf, 44).fill(128);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}
function setRemote(on) {
  $("#remote").classList.toggle("on", on && CAN_REMOTE);
  if (!CAN_REMOTE) return;
  const acts = { play: "auto", pause: "auto", nexttrack: "step", previoustrack: "prev" };
  for (const [a, c] of Object.entries(acts)) {
    try { navigator.mediaSession.setActionHandler(a, on ? () => run(c) : null); } catch { /* not known to this browser */ }
  }
  if (!on) { remoteAudio?.pause(); return; }
  if (!remoteAudio) {
    remoteAudio = new Audio(silentWav(10));   // long enough for the phone to count it as media
    remoteAudio.loop = true;
    // something else took the sound (the voice reading an answer, a notification): take it up again
    remoteAudio.addEventListener("pause", () => setTimeout(() => { if (S.remote) remoteAudio.play().catch(() => {}); }, 800));
  }
  remoteAudio.play().catch(() => {});         // before the first tap the browser refuses: wakeRemote tries again
  remoteTitle();
}
function wakeRemote() { if (S.remote && CAN_REMOTE && (!remoteAudio || remoteAudio.paused)) setRemote(true); }
function remoteTitle() {             // what the lock screen shows
  if (!S.remote || !CAN_REMOTE || !F || !window.MediaMetadata) return;
  const at = (active() >= 0 ? active() : place().i) + 1;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: F.title, artist: `${at} / ${F.spans.length}`, album: "Lingemy" });
}

/* swipe the lesson sideways: right = next, left = previous (the way pages of a Persian text turn) */
function watchSwipes(win) {
  let x = 0, y = 0, t = 0;
  win.addEventListener("touchstart", (e) => {
    const p = e.touches[0];
    t = e.touches.length === 1 && !e.target.closest?.("textarea, button, .say") ? performance.now() : 0;
    x = p.clientX; y = p.clientY;
  }, { passive: true });
  win.addEventListener("touchmove", (e) => {           // a sideways drag is ours: not the browser's "back", not a scroll
    if (!t || !e.cancelable) return;
    const p = e.touches[0], dx = Math.abs(p.clientX - x), dy = Math.abs(p.clientY - y);
    if (dx > 12 && dx > 1.5 * dy) e.preventDefault();
  }, { passive: false });
  win.addEventListener("touchend", (e) => {
    if (!t || performance.now() - t > 700) return;
    const p = e.changedTouches[0], dx = p.clientX - x, dy = p.clientY - y;
    t = 0;
    if (Math.abs(dx) < 70 || Math.abs(dx) < 2.5 * Math.abs(dy) || String(win.getSelection())) return;
    run(dx > 0 ? "step" : "prev");
  }, { passive: true });
}

/* ---------- status: where am I, remembered place ---------- */
let statusQueued = false;
function changed() {                 // the engine opened, closed or revealed something
  if (statusQueued) return;
  statusQueued = true;
  requestAnimationFrame(() => {
    statusQueued = false;
    if (!F) return;
    const a = active(), n = F.spans.length;
    const sh = a >= 0 && shown();
    const moved = a !== lastActive || sh !== lastShown;
    if (a !== lastActive) {
      // the answer of the sentence you left must not go on (or be read again) over the new one
      if (current || gapTimer || F.win.speechSynthesis?.speaking) { F.win.speechSynthesis?.cancel(); hush(); }
      lastActive = a; wordAt = 0; quietReveal = false;
      F.doc.querySelectorAll(".wentry.hf-cur").forEach((w) => w.classList.remove("hf-cur"));
    } else if (sh && !lastShown) {   // the answer just opened: by a command, the engine's button or Enter
      if (S.speak && !quietReveal) readAnswer();
      quietReveal = false;
    }
    lastShown = sh;
    if (moved && auto) { cutRead = false; restart(); }   // however it moved: the new step's full time
    if (a >= 0) {
      save("at." + F.path, { i: a, shown: sh });
      const reached = sh ? a + 1 : a;
      if (reached > load("reached." + F.path, 0)) save("reached." + F.path, reached);
    }
    markSide(F.path);
    const at = a >= 0 ? a + 1 : place().i + 1;
    const part = `<span class="arrow"> › </span><span class="part">${esc(F.title)}</span>`;
    $("#where").innerHTML = `<span class="t"><b>${esc(F.group)}</b>${part}</span><span class="count">${at} / ${n}</span>`;
    $("#where").classList.toggle("multi", !!part);
    $("#progress div").style.width = (100 * at / n) + "%";
    remoteTitle();
  });
}

frame.addEventListener("load", () => {
  const win = frame.contentWindow, doc = win.document;
  let title;
  try { title = win.eval("TITLE"); } catch { toast("This page is not a drill"); return; }
  const path = new URLSearchParams(win.location.search).get("d") || "";
  F = { win, doc, title, path, group: LESSONS.find((l) => l.path === path)?.group || "",
    spans: [...doc.querySelectorAll("#passage .s")] };
  lastActive = -1; lastShown = false;
  const link = doc.createElement("link");
  link.rel = "stylesheet"; link.href = new URL("frame.css", location.href).href;
  doc.head.append(link);
  applyLook();
  win.addEventListener("keydown", onKey, true);
  doc.addEventListener("click", onLessonClick);
  doc.addEventListener("click", (e) => {             // the lesson's own 🔊 buttons read here too, at the speed set
    const say = e.target.closest(".say");
    if (!say || !e.isTrusted) return;
    e.stopPropagation(); e.preventDefault(); say.blur();
    onLessonClick(e);
    win.speechSynthesis?.cancel();                   // the page's own reading, if any
    if (say === speaking) hush(); else play(say);    // the one being read: a second press stops it
  }, true);
  new win.MutationObserver(changed).observe(doc.getElementById("passage"),
    { subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
  const go = () => { if (F?.win === win && active() < 0) openPlace(); changed(); };
  link.onload = go; link.onerror = go;               // open the sentence once the page has its final size
  watchSwipes(win);
  win.addEventListener("pointerdown", wakeRemote); win.addEventListener("keydown", wakeRemote);
  if (wakeAudio) { win.addEventListener("pointerdown", wakeAudio, { once: true }); win.addEventListener("keydown", wakeAudio, { once: true }); }
});

/* ---------- commands: keys, voice and the bar buttons (data-cmd) all run these ---------- */
const COMMANDS = {
  step, prev, answer, skip, repeat, word, quiet, bookmark, anki, pause,
  auto: () => (auto && !paused ? pause() : play_()),   // P and the bar button: play / pause
  autoOn: play_,
  faster: () => setThink(-1),
  slower: () => setThink(1),
  shorterWait: () => setAfter(-1),
  longerWait: () => setAfter(1),
  settings: () => showSettings($("#settings").hidden),
  nextLesson: () => lessonStep(1), prevLesson: () => lessonStep(-1),
  bigger: () => stepSize(1), smaller: () => stepSize(-1),
  speakAnswers: () => {
    toggle("speak", "🔊 Answers read aloud: on", "🔊 Answers read aloud: off");
    if (!S.speak && speaking === panel()?.querySelector(".en-box .say")) hush();   // off: stop it now
  },
  typing: () => toggle("type", "Typing box on", "Typing box off"),
  theme: () => setTheme(THEMES[(THEMES.indexOf(S.theme) + 1) % THEMES.length]),
  fullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())
    .catch(() => toast("Fullscreen not allowed here")),
  mic: () => (mic ? stopMic() : startMic()),
  remote: () => {
    S.remote = !S.remote; save("remote", S.remote);
    setRemote(S.remote);
    toast(S.remote ? "🎧 Earbud buttons on: play / pause = auto mode, next / previous = sentence" : "🎧 Earbud buttons off", 5000);
  },
  more: () => setMore(!document.body.classList.contains("more")),
  side: () => {                      // E, ▤: expanded → shrunk → hidden → expanded; on a phone the drawer, open / closed
    if (phone.matches) { sideOpen = !sideOpen; showSide(); return; }
    if (!S.side) { S.side = true; S.sideSmall = false; }
    else if (!S.sideSmall) S.sideSmall = true;
    else S.side = false;
    save("side", S.side); save("sideSmall", S.sideSmall);
    F ? keepPlace(showSide) : showSide();
    toast(!S.side ? "Sidebar hidden" : S.sideSmall ? "Sidebar shrunk" : "Sidebar expanded");
  },
  help: () => { $("#help").hidden = !$("#help").hidden; },
  words: () => showWords($("#words").hidden),
};
const NEEDS_LESSON = new Set(["step", "prev", "answer", "skip", "repeat", "word", "bookmark", "anki", "nextLesson", "prevLesson"]);

// the voice list stays open while you try the words, and the settings while you change them by key or voice
const KEEPS_SETTINGS = new Set(["settings", "faster", "slower", "shorterWait", "longerWait", "speakAnswers", "auto", "autoOn", "pause", "quiet", "bigger", "smaller", "theme"]);
const KEEPS_MORE = new Set(["more", "remote", "faster", "slower", "shorterWait", "longerWait", "bigger", "smaller", "theme", "speakAnswers", "typing"]);
function run(cmd, byVoice = false) {
  if (!KEEPS_MORE.has(cmd)) setMore(false);            // the sheet stays open while you step a value
  if (cmd !== "side" && sideOpen) { sideOpen = false; showSide(); }
  if (cmd !== "help") $("#help").hidden = true;
  if (cmd !== "words" && !byVoice) showWords(false);
  if (!KEEPS_SETTINGS.has(cmd)) showSettings(false);
  if (NEEDS_LESSON.has(cmd) && !F) return;
  COMMANDS[cmd]();
  if (auto && MOVES.has(cmd)) restart();   // e.g. "repeat": the same step, its full time again
  if (!$("#settings").hidden) buildSettings();
}

function onKey(e) {                  // keys pressed in the shell or in the lesson
  const box = e.target.matches?.("textarea, input, select");
  if (e.key === "Escape") {
    if (box) e.target.blur();
    if (overlayOpen()) { $("#help").hidden = true; closeDrawers(); showWords(false); showSettings(false); }
    else run("quiet");
    return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  // typing: only Space in an empty box means "next"; Enter and Shift+Enter stay with the engine
  if (box && !(e.key === " " && e.target.tagName === "TEXTAREA" && !e.target.value)) return;
  const cmd = e.key === " " ? (e.shiftKey ? "prev" : "step") : KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (cmd) { e.preventDefault(); e.stopPropagation(); run(cmd); }
}

function onClick(e) {                // the bar
  const btn = e.target.closest("button");
  if (!btn) return;
  btn.blur();                        // a focused button would take the next Space instead of the page
  if (btn.dataset.cmd) run(btn.dataset.cmd);
}
function onLessonClick(e) {          // a sentence or a button of the engine
  if (!e.isTrusted) return;          // our own presses of the engine's buttons (voice, keys) close nothing
  e.target.closest("button")?.blur();
  // touch: a tap anywhere that is not a sentence or a control is "next" (answer first, then the next sentence)
  const tapNext = (e.pointerType === "touch" || coarse.matches) && !overlayOpen() && !String(F.win.getSelection())
    && !e.target.closest(".s, button, a, textarea, input, select, label, .say, .toc, .jump");
  if (tapNext) { run("step"); return; }
  closeDrawers(); showWords(false); showSettings(false); $("#help").hidden = true;
  if (!S.type) setTimeout(() => { if (F?.doc.activeElement?.matches("textarea")) F.doc.activeElement.blur(); });
}

/* ---------- voice (Vosk, offline, only the phrases above) ---------- */
let model = null, mic = null, wakeAudio = null;
const GRAMMAR = JSON.stringify([...Object.keys(PHRASES), "[unk]"]);

async function openMic() {
  const audio = (dev) => ({ audio: { deviceId: dev ? { exact: dev } : undefined, channelCount: 1,
    echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  try { return await navigator.mediaDevices.getUserMedia(audio(S.micDev)); }
  catch (err) {                      // the chosen mic is gone (earbuds off): fall back to the default one
    if (!S.micDev || err.name !== "OverconstrainedError" && err.name !== "NotFoundError") throw err;
    S.micDev = ""; save("micDev", "");
    return navigator.mediaDevices.getUserMedia(audio(""));
  }
}

async function startMic() {
  if (!CAN_VOICE) {                  // browsers give the mic only to https or localhost
    toast("The microphone only works on the laptop itself (127.0.0.1), not over the network", 7000); return;
  }
  if (location.protocol === "file:") { toast("Voice needs the local server: python3 serve.py", 6000); return; }
  $("#mic").classList.add("loading");
  try {
    if (!model) { toast("Loading speech model…", 20000); model = await Vosk.createModel(MODEL_URL); }
    const stream = await openMic();
    const ctx = new AudioContext();
    const rec = new model.KaldiRecognizer(ctx.sampleRate, GRAMMAR);
    rec.setWords(true);
    rec.on("result", (m) => heard(m.result));
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    let deafUntil = 0, silence = null;
    proc.onaudioprocess = (e) => {
      // while the page reads aloud (and a moment after), the recognizer hears silence, not the speakers
      if (ttsBusy()) deafUntil = performance.now() + TTS_TAIL;
      const buf = performance.now() < deafUntil
        ? (silence ??= ctx.createBuffer(1, e.inputBuffer.length, e.inputBuffer.sampleRate)) : e.inputBuffer;
      try { rec.acceptWaveform(buf); } catch { /* recognizer gone */ }
    };
    src.connect(proc); proc.connect(ctx.destination);
    mic = { stream, ctx, rec, src, proc };
    if (ctx.state !== "running") await ctx.resume().catch(() => {});
    if (ctx.state !== "running") {   // Chrome wants a click or key before audio starts
      toast("Click anywhere (or press a key) to switch the microphone on", 8000);
      wakeAudio = () => { mic?.ctx.resume().then(() => { toast("🎤 Listening"); wordsStatus(); }); wakeAudio = null; };
      for (const w of [window, F?.win]) {
        w?.addEventListener("pointerdown", wakeAudio, { once: true }); w?.addEventListener("keydown", wakeAudio, { once: true });
      }
    } else toast("🎤 Listening — say “next”");
    S.micOn = true; save("micOn", true);
    $("#mic").classList.add("on");
    listDevices();
  } catch (err) {
    toast(err.name === "NotFoundError"
      ? "No microphone found. Turn on the laptop mic (sound card input profile) or the earbuds' headset (HFP) mode."
      : "Microphone failed: " + (err.message || err), 9000);
    console.error(err);
  } finally {
    $("#mic").classList.remove("loading");
    wordsStatus();
  }
}

function stopMic() {
  if (mic) {
    mic.stream.getTracks().forEach((t) => t.stop());
    mic.proc.disconnect(); mic.src.disconnect(); mic.ctx.close(); mic.rec.remove(); mic = null;
    toast("Microphone off");
  }
  S.micOn = false; save("micOn", false);
  $("#mic").classList.remove("on");
  wordsStatus();
}

function heard(r) {
  // a command counts only when it is said on its own: sure, and not run together with other speech
  const words = r.result || [];
  const cmds = [], said = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i].word === "[unk]") continue;
    const two = words[i + 1] && words[i + 1].word !== "[unk]" && `${words[i].word} ${words[i + 1].word}`;
    const j = two && PHRASES[two] ? i + 1 : i;
    const phrase = j > i ? two : words[i].word;
    const before = words[i - 1], after = words[j + 1];
    const alone = (!before || words[i].start - before.end >= GAP) && (!after || after.start - words[j].end >= GAP);
    const ok = PHRASES[phrase] && Math.min(words[i].conf, words[j].conf) >= MIN_CONF && alone;
    said.push(ok ? phrase : `${phrase}?`);
    if (ok) cmds.push(PHRASES[phrase]);
    i = j;
  }
  if (!said.length) return;
  console.info("[voice]", said.join(" "), "->", cmds.join(" ") || "-");
  toast("🎤 " + said.join(" ") + (cmds.length ? "" : "  (not sure — ignored)"));
  if (!$("#words").hidden) for (const c of cmds) {   // light up the row of what was heard
    const tr = $(`#words .w[data-cmd="${c}"]`);
    if (tr) { tr.classList.remove("hit"); void tr.offsetWidth; tr.classList.add("hit"); }
  }
  cmds.forEach((c) => run(c, true));
}

async function listDevices() {
  try {
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) =>
      d.kind === "audioinput" && d.deviceId && d.deviceId !== "default" &&
      !/^monitor of/i.test(d.label));                 // monitors hear the speakers, not you
    $("#micDev").innerHTML = `<option value="">Default mic</option>` +
      devs.map((d) => `<option value="${esc(d.deviceId)}">${esc(d.label || "Microphone")}</option>`).join("");
    $("#micDev").value = devs.some((d) => d.deviceId === S.micDev) ? S.micDev : "";
  } catch { /* no device list */ }
}

/* ---------- the voice dialog: every word the mic listens for, and what it does ---------- */
const KEY_NAMES = { Enter: "Enter", ArrowRight: "→", ArrowLeft: "←", "=": "=", "-": "−" };
function keysFor(cmd) {
  const extra = { step: ["Space"], prev: ["Shift+Space"], quiet: ["Esc"] }[cmd] || [];
  const own = Object.keys(KEYS).filter((k) => KEYS[k] === (cmd === "autoOn" || cmd === "pause" ? "auto" : cmd))
    .map((k) => KEY_NAMES[k] || k.toUpperCase());
  return [...extra, ...own];
}
function buildWords() {
  const said = {};
  for (const [phrase, cmd] of Object.entries(PHRASES)) (said[cmd] ??= []).push(phrase);
  const order = [...new Set([...Object.keys(DOES), ...Object.keys(said)])].filter((c) => said[c]);
  $("#wordsList").style.setProperty("--rows", Math.ceil(order.length / 2));   // two columns, top to bottom
  $("#wordsList").innerHTML = order.map((c) => `<div class="w" data-cmd="${c}">` +
    `<span class="phrase">${said[c].map((p) => `“${esc(p)}”`).join("<span class=\"or\"> or </span>")}</span>` +
    `<span>${esc(DOES[c] || c)}</span><span class="keys">${keysFor(c).map((k) => `<kbd>${esc(k)}</kbd>`).join(" ")}</span></div>`).join("");
}
function wordsStatus() {
  $("#wordsStatus").textContent = $("#mic").classList.contains("loading") ? "🎤 Loading the speech model…"
    : !mic ? "🎤 The microphone is off: press M or click 🎤 to start listening."
    : mic.ctx.state !== "running" ? "🎤 Click anywhere (or press a key) to start listening."
    : "🎤 Listening for these words now.";
}
function showWords(on) {
  $("#words").hidden = !on;
  if (on) wordsStatus();
}

/* ---------- auto-mode settings (⚙, O, "settings") ---------- */
const SETTINGS = [
  { key: "think", list: THINKS, label: "Time to think before the answer", say: (v) => `${v} s` },
  { key: "perWord", list: PER_WORD, label: "Extra time to think, per English word", say: (v) => v ? `+${v} s` : "none" },
  { key: "speak", list: [true, false], label: "Read the English answer aloud (V)", say: (v) => v ? "On" : "Off" },
  { key: "times", list: TIMES, label: "Times the answer is read", say: (v) => `${v}×` },
  { key: "rate", list: RATES, label: "Reading speed", say: (v) => `${v}×` },
  { key: "after", list: AFTERS, label: "Wait after the answer, then next", say: (v) => `${v} s` },
];
function buildSettings() {
  const n = F && active() >= 0 ? enWords() : 12;
  const think = Math.round(S.think + S.perWord * n);
  $("#setList").innerHTML = SETTINGS.map((s) => {
    const i = s.list.indexOf(S[s.key]);
    return `<div class="row"><span>${esc(s.label)}</span>` +
      `<button data-set="${s.key}" data-d="-1"${i === 0 ? " disabled" : ""}>−</button>` +
      `<b>${esc(s.say(S[s.key]))}</b>` +
      `<button data-set="${s.key}" data-d="1"${i === s.list.length - 1 ? " disabled" : ""}>+</button></div>`;
  }).join("");
  $("#setFlow").textContent = `This sentence (${n} words): ${think} s to think → answer` +
    (S.speak ? ` read aloud ${S.times > 1 ? S.times + " times" : "once"}` : " shown") +
    ` → ${S.after} s → next sentence.` + (S.speak ? "" : " (Nothing is read aloud.)");
}
function changeSetting(key, d) {
  const s = SETTINGS.find((x) => x.key === key);
  const i = s.list.indexOf(S[key]);
  S[key] = s.list[Math.max(0, Math.min(s.list.length - 1, (i < 0 ? s.list.indexOf(DEFAULTS[key]) : i) + d))];
  save(key, S[key]);
  if (key === "speak") {
    applyLook();
    if (!S.speak && speaking === panel()?.querySelector(".en-box .say")) hush();
  }
  if (key === "think" || key === "after") showPace();
  if (auto && F && (key === "think" || key === "perWord" ? !shown() : key === "after" && shown())) restart();
  buildSettings();
}
function showSettings(on) {
  $("#settings").hidden = !on;
  if (on) buildSettings();
}
$("#settings").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  b.blur();
  if (b.dataset.set) changeSetting(b.dataset.set, +b.dataset.d);
  else if (b.id === "setDefaults") {
    for (const [k, v] of Object.entries(DEFAULTS)) { S[k] = v; save(k, v); }
    applyLook(); showPace();
    if (auto && F) restart();
    buildSettings();
    toast("Settings back to the defaults");
  } else if (b.id === "setTry") play(b, true, 1);   // its own sample sentence: never the hidden answer
  else if (b.id === "setClose") showSettings(false);
});

let toastTimer = 0;
function toast(msg, ms = 1800) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

/* ---------- keep the screen on ---------- */
let wakeLock = null;
async function keepAwake() {
  if (document.visibilityState !== "visible" || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
  } catch { /* not allowed here */ }
}

/* ---------- progress handed over from another port (export.html on the old address) ---------- */
function importFromHash() {
  const m = location.hash.match(/^#lhf-import=(.*)$/);
  if (!m) return false;
  let n = 0;
  try {
    for (const [k, v] of Object.entries(JSON.parse(decodeURIComponent(m[1])))) {
      if (k.startsWith("lhf.") && typeof v === "string") { localStorage.setItem(k, v); n++; }
    }
  } catch { /* a broken link: keep what is here */ }
  history.replaceState(null, "", location.pathname);
  console.info("[import]", n, "saved settings and places");
  location.reload();                 // start again with the imported settings and places
  return true;
}

/* ---------- once: your places from the lingemy-exercise view (same browser, same address) ---------- */
function moveOldPlaces() {
  if (load("moved", false)) return;
  save("moved", true);
  const words = LESSONS.filter((l) => l.path.startsWith("ielts-words/"));
  const keep = (l, p) => {            // p: { i, shown } inside lesson l
    if (!l || !p || load("at." + l.path, null)) return;
    save("at." + l.path, { i: Math.min(p.i, l.units - 1), shown: !!p.shown });
    save("reached." + l.path, Math.max(load("reached." + l.path, 0), Math.min(l.units, p.shown ? p.i + 1 : p.i)));
  };
  for (const l of words) {            // the single lesson pages: /texts/02-Siblings.html
    const old = "/texts/" + l.path.split("/")[1] + ".html";
    keep(l, load("at." + old, null));
    const r = load("reached." + old, 0);
    if (r > load("reached." + l.path, 0)) save("reached." + l.path, Math.min(r, l.units));
  }
  const merged = "/merged/all-lessons.html";   // all lessons in one page: a place per lesson, in the same order
  for (const [ti, p] of Object.entries(load("ex." + merged, {}))) keep(words[ti], p);
  let at = load("at." + merged, null)?.i, last = load("last", "");
  if (last === merged && at != null) {
    for (const l of words) { if (at < l.units) { S.last = l.path; break; } at -= l.units; }
  } else if (last.startsWith("/texts/")) S.last = "ielts-words/" + last.slice(7, -5);
  save("last", S.last);
}

/* ---------- start ---------- */
async function init() {
  if (importFromHash()) return;
  if (!THEMES.includes(S.theme)) S.theme = "light";
  for (const s of SETTINGS) if (!s.list.includes(S[s.key])) S[s.key] = DEFAULTS[s.key];   // a stored value no longer offered
  applyLook();
  // what this device cannot do is not offered: fullscreen (iPhone), the mic over plain http from another device
  if (!document.fullscreenEnabled) $('[data-cmd="fullscreen"]').hidden = true;
  if (!CAN_VOICE) { $("#micGroup").hidden = true; S.micOn = false; document.body.classList.add("no-voice"); }
  if (!CAN_ANKI) $('#more [data-cmd="anki"]').hidden = true;
  if (!CAN_REMOTE) $("#remote").parentElement.hidden = true;
  $("#remote").classList.toggle("on", S.remote && CAN_REMOTE);
  window.addEventListener("pointerdown", wakeRemote); window.addEventListener("keydown", wakeRemote);
  showSide();
  showPace();
  showClock();
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("click", onClick);
  $("#help").onclick = () => { $("#help").hidden = true; };
  $("#words").onclick = () => showWords(false);
  buildWords();
  $("#micDev").onchange = () => {
    $("#micDev").blur();
    S.micDev = $("#micDev").value; save("micDev", S.micDev);
    if (mic) { stopMic(); startMic(); }
  };
  navigator.mediaDevices?.addEventListener?.("devicechange", listDevices);
  document.addEventListener("visibilitychange", keepAwake);
  keepAwake();
  listDevices();
  if (TTS) { pickVoice(); TTS.addEventListener?.("voiceschanged", pickVoice); }
  if (S.micOn) startMic();

  try { GROUPS = await (await fetch("../data/index.json")).json(); }
  catch { toast("Start it with: python3 serve.py", 10000); return; }
  LESSONS = GROUPS.flatMap((g) => g.items.map((it) => ({ path: it.id, title: it.title, units: it.units, group: g.title })));
  moveOldPlaces();
  buildSide();
  const want = decodeURIComponent(location.hash.slice(1));
  goLesson(LESSONS.some((l) => l.path === want) ? want : S.last);
}

init();
