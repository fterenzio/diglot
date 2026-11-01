(function (L) {
  "use strict";

  // Il nome dell'archivio resta quello storico: cambiarlo farebbe sparire le conferenze già salvate nel browser.
  const DB = "leggio", DB_VERSION = 1;
  let dbPromise = null;
  const listeners = [];
  const channel = "BroadcastChannel" in window ? new BroadcastChannel("diglot-data") : null;
  const REV = (id) => "diglot-rev-" + id;

  // Preferenze e posizioni salvate coi nomi precedenti del programma passano al nome attuale.
  try {
    for (const old of ["conferenze-", "leggio-"]) for (const k of Object.keys(localStorage)) {
      if (!k.startsWith(old)) continue;
      const key = "diglot-" + k.slice(old.length);
      if (localStorage.getItem(key) === null) localStorage.setItem(key, localStorage.getItem(k));
      localStorage.removeItem(k);
    }
  } catch (e) { /* facoltativo */ }

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((res, rej) => {
      let req;
      try { req = indexedDB.open(DB, DB_VERSION); } catch (e) { rej(e); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore("conferences", { keyPath: "id" });
        const media = db.createObjectStore("media", { keyPath: "id" });
        media.createIndex("conf", "conf");
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error("archivio bloccato da un'altra finestra"));
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then((db) => new Promise((res, rej) => {
      const t = db.transaction(store, mode), s = t.objectStore(store);
      let out;
      const r = fn(s);
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    }));
  }

  function notify(id) {
    const rev = Date.now();
    try { localStorage.setItem(REV(id), String(rev)); } catch (e) { /* solo avviso tra finestre */ }
    if (channel) channel.postMessage({ id, rev });
  }
  if (channel) channel.onmessage = (e) => listeners.forEach((fn) => fn(e.data.id, e.data.rev));

  const urls = new Map();

  const Store = {
    listConferences() { return tx("conferences", "readonly", (s) => s.getAll()).then((all) => (all || []).sort((a, b) => b.updatedAt - a.updatedAt)); },
    getConference(id) { return tx("conferences", "readonly", (s) => s.get(id)); },
    putConference(conf, opts) {
      if (!(opts && opts.keepTime)) conf.updatedAt = Date.now();
      return tx("conferences", "readwrite", (s) => s.put(conf)).then(() => { notify(conf.id); return conf; });
    },
    async deleteConference(id) {
      const ids = await Store.mediaIds(id);
      await Store.deleteMedia(ids);
      await tx("conferences", "readwrite", (s) => s.delete(id));
      try { localStorage.removeItem(REV(id)); localStorage.removeItem("diglot-sync-" + id); } catch (e) { /* facoltativo */ }
    },
    putMedia(blob, conf, name) {
      const id = L.uid("m");
      return tx("media", "readwrite", (s) => s.put({ id, conf, blob, name: name || "", type: blob.type })).then(() => id);
    },
    getMedia(id) { return tx("media", "readonly", (s) => s.get(id)); },
    mediaIds(confId) {
      return open().then((db) => new Promise((res, rej) => {
        const req = db.transaction("media").objectStore("media").index("conf").getAllKeys(confId);
        req.onsuccess = () => res(req.result || []);
        req.onerror = () => rej(req.error);
      }));
    },
    deleteMedia(ids) {
      if (!ids.length) return Promise.resolve();
      return open().then((db) => new Promise((res, rej) => {
        const t = db.transaction("media", "readwrite"), s = t.objectStore("media");
        ids.forEach((id) => { s.delete(id); if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); } });
        t.oncomplete = res; t.onerror = () => rej(t.error);
      }));
    },
    // L'URL resta valido finché la pagina è aperta; le slide lo riusano a ogni cambio.
    async mediaURL(id) {
      if (!id) return "";
      if (urls.has(id)) return urls.get(id);
      const rec = await Store.getMedia(id);
      if (!rec) return "";
      const u = URL.createObjectURL(rec.blob);
      urls.set(id, u);
      return u;
    },
    cachedURL(id) { return urls.get(id) || ""; },
    onChange(fn) { listeners.push(fn); },
    revision(id) { try { return localStorage.getItem(REV(id)) || ""; } catch (e) { return ""; } },
    async usage() {
      if (!(navigator.storage && navigator.storage.estimate)) return null;
      try { return await navigator.storage.estimate(); } catch (e) { return null; }
    },
    requestPersistence() { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); },
    // I file non più citati dal programma (slide sostituite, logo tolto) occupano spazio inutile.
    async collectGarbage(conf) {
      const used = new Set(mediaRefs(conf));
      const all = await Store.mediaIds(conf.id);
      const orphan = all.filter((id) => !used.has(id));
      await Store.deleteMedia(orphan);
      return orphan.length;
    },
  };

  function mediaRefs(conf) {
    const out = [];
    L.Model.eachTalk(conf, (t) => (t.decks || []).forEach((d) => d.slides.forEach((s) => { if (s.media) out.push(s.media); })));
    const th = conf.theme || {};
    if (th.logo && th.logo.media) out.push(th.logo.media);
    if (th.coverBg && th.coverBg.media) out.push(th.coverBg.media);
    if (th.poster && th.poster.media) out.push(th.poster.media);
    (th.fonts || []).forEach((f) => { if (f.media) out.push(f.media); });
    return out;
  }
  Store.mediaRefs = mediaRefs;

  L.Store = Store;
})(window.Diglot);
