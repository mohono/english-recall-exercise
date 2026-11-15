"use strict";
// ⭐ Starred sentences, shared by the view (index.html) and the engine (drill.html): same address, so both see
// the same localStorage. The list itself lives on the server (serve.py, /api/stars → state/stars.json), so a star
// on the phone shows on the laptop too. Here is a copy of it ("lhf.stars") and the changes not yet sent
// ("lhf.starQueue"); a change shows at once and reaches the server when it can (offline: on the next try).
// An entry: { id: "<collection>/<id>|<English>", path, title (of the exercise it came from), unit, t }.
(function () {
  const API = new URL("/api/stars", location.href).href;
  const LIST = "lhf.stars", QUEUE = "lhf.starQueue";
  const get = (k) => { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };
  const KEEP = ["fa", "en", "ipa", "words", "note", "skeleton", "why", "whyKey", "trap", "misses", "alt", "rule"];

  function apply(list, ops) {          // every op can be applied twice with the same result
    for (const o of ops) {
      if (o.op === "add" && !list.some((e) => e.id === o.entry.id)) list.push(o.entry);
      else if (o.op === "remove") list = list.filter((e) => e.id !== o.id);
    }
    return list;
  }

  let syncing = null;
  async function sync() {              // send the waiting changes and take the server's list
    if (syncing) return syncing;
    syncing = (async () => {
      const sent = get(QUEUE);
      try {
        const res = await fetch(API, sent.length
          ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ops: sent }) }
          : { cache: "no-store" });
        if (!res.ok) throw new Error(res.status);
        const list = await res.json();
        const rest = get(QUEUE).slice(sent.length);   // changes made while this was on its way
        put(QUEUE, rest);
        put(LIST, apply(list, rest));
        window.dispatchEvent(new Event("stars"));   // this window; the others get a "storage" event
        return true;
      } catch { return false; }      // offline, or no server: the queue waits for the next try
    })();
    try { return await syncing; } finally { syncing = null; if (get(QUEUE).length && navigator.onLine) setTimeout(sync, 15000); }
  }

  const list = () => get(LIST);
  const has = (id) => list().some((e) => e.id === id);
  const idOf = (path, unit) => path + "|" + String(unit.en).replace(/<[^>]+>/g, "").trim();
  function entry(path, title, unit) {
    const u = {};
    for (const k of KEEP) if (unit[k] !== undefined) u[k] = unit[k];
    return { id: idOf(path, unit), path, title, unit: u, t: Date.now() };
  }
  function set(e, on) {                // on: star it; off: take the star away. Returns on.
    const op = on ? { op: "add", entry: e } : { op: "remove", id: e.id };
    put(LIST, apply(list(), [op]));
    put(QUEUE, [...get(QUEUE), op]);
    sync();
    return on;
  }

  window.addEventListener("online", sync);
  window.Stars = { list, has, idOf, entry, set, sync };
})();
