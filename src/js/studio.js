(function (L) {
  "use strict";
  const { el } = L, M = L.Model, Store = L.Store;

  const Studio = {
    conf: null,
    undoStack: [],
    editing: false,
    saving: "idle",
    routeNow: null,
    pendingExternal: false,

    setUiTheme(mode) {
      document.documentElement.dataset.theme = mode;
      try { localStorage.setItem("diglot-ui-theme", mode); } catch (e) { /* preferenza facoltativa */ }
    },
    uiTheme() {
      let m = null;
      try { m = localStorage.getItem("diglot-ui-theme"); } catch (e) { m = null; }
      return m || (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    },

    async openConf(id) {
      if (Studio.conf && Studio.conf.id === id) return Studio.conf;
      await Studio.flush();
      const raw = await Store.getConference(id);
      Studio.conf = raw ? M.normalize(raw) : null;
      Studio.undoStack = [];
      if (Studio.conf) await L.Theme.loadCustomFonts(Studio.conf.theme);
      return Studio.conf;
    },
    closeConf() { Studio.conf = null; Studio.undoStack = []; },

    snapshot() {
      if (!Studio.conf) return;
      Studio.undoStack.push(JSON.stringify(Studio.conf));
      if (Studio.undoStack.length > 40) Studio.undoStack.shift();
      Studio.updateUndo();
    },
    undo() {
      const last = Studio.undoStack.pop();
      if (!last) return;
      Studio.conf = JSON.parse(last);
      Studio.editing = false;
      Studio.touch();
      Studio.render();
    },
    updateUndo() { const b = document.getElementById("top-undo"); if (b) b.disabled = !Studio.undoStack.length; },

    save: L.debounce(() => Studio.doSave(), 500),
    touch() { Studio.setSaveState("pending"); Studio.save(); },
    async doSave() {
      const conf = Studio.conf;
      if (!conf) return;
      try {
        await Store.putConference(conf);
        Studio.knownRev = Store.revision(conf.id);
        Studio.setSaveState("saved");
      } catch (e) {
        Studio.setSaveState("error");
        Studio.toast("Non riesco a salvare (" + e.name + "): lo spazio del browser potrebbe essere esaurito. Esporta la conferenza e libera spazio.", { error: true });
      }
    },
    flush() { return Promise.resolve(Studio.save.flush()); },
    setSaveState(s) {
      Studio.saving = s;
      const box = document.getElementById("top-save");
      if (!box) return;
      const when = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
      box.textContent = s === "pending" ? "Salvataggio…" : s === "saved" ? "Salvato alle " + when : s === "error" ? "Non salvato" : "";
      box.className = "save-state" + (s === "error" ? " bad" : "");
    },

    // Ogni modifica che cambia la struttura passa da qui: si può annullare e la pagina si ridisegna.
    change(fn) {
      Studio.snapshot();
      fn();
      Studio.touch();
      Studio.render();
    },

    field(opts) {
      const tag = opts.area ? "textarea" : "input";
      const node = el(tag, {
        class: "ed" + (opts.class ? " " + opts.class : ""), value: opts.value == null ? "" : opts.value, placeholder: opts.placeholder || "", type: opts.area ? null : opts.type || "text",
        "aria-label": opts.label, lang: opts.lang || null, min: opts.min, max: opts.max, step: opts.step, rows: opts.rows,
        oninput: (e) => {
          if (!Studio.editing) { Studio.snapshot(); Studio.editing = true; }
          opts.set(e.target.value);
          Studio.touch();
          if (opts.after) opts.after(e.target.value);
        },
        onblur: () => { Studio.editing = false; Studio.applyPending(); },
      });
      return node;
    },
    labeled(text, control, hint) {
      return el("label", { class: "lab" }, el("span", { class: "lab-t" }, text), control, hint ? el("span", { class: "lab-h" }, hint) : null);
    },
    langSelect(value, onChange, opts) {
      const conf = Studio.conf, codes = (opts && opts.codes) || (conf ? conf.languages : Object.keys(M.LANGS));
      const all = codes.indexOf(value) < 0 && value ? codes.concat([value]) : codes;
      return el("select", { class: "ed-select", "aria-label": (opts && opts.label) || "Lingua", onchange: (e) => onChange(e.target.value) },
        all.map((c) => el("option", { value: c, selected: c === value }, M.langName(c))));
    },

    dropzone(opts) {
      const input = el("input", { type: "file", id: opts.id || null, accept: opts.accept || null, multiple: opts.multiple || null, class: "dz-input", "aria-label": opts.title,
        onchange: (e) => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) opts.onFiles(fs); } });
      const box = el("label", { class: "dropzone" + (opts.small ? " small" : "") }, input,
        el("span", { class: "dz-title" }, opts.title), opts.hint ? el("span", { class: "dz-hint" }, opts.hint) : null);
      box.addEventListener("dragover", (e) => { e.preventDefault(); box.classList.add("over"); });
      box.addEventListener("dragleave", () => box.classList.remove("over"));
      box.addEventListener("drop", (e) => { e.preventDefault(); box.classList.remove("over"); const fs = [...e.dataTransfer.files]; if (fs.length) opts.onFiles(fs); });
      return box;
    },

    toast(message, opts) {
      opts = opts || {};
      const host = document.getElementById("toasts") || document.body.appendChild(el("div", { id: "toasts", role: "status", "aria-live": "polite" }));
      const t = el("div", { class: "toast" + (opts.error ? " bad" : "") }, el("span", null, message),
        opts.action ? el("button", { class: "link", onclick: () => { t.remove(); opts.action.run(); } }, opts.action.label) : null,
        el("button", { class: "link", "aria-label": "Chiudi l'avviso", onclick: () => t.remove() }, "Chiudi"));
      host.append(t);
      if (!opts.error) setTimeout(() => t.remove(), opts.ms || 7000);
    },

    confirm(title, text, okLabel, danger) {
      return new Promise((res) => {
        const dlg = el("dialog", { class: "dlg" },
          el("h2", null, title), el("p", null, text),
          el("div", { class: "dlg-actions" },
            el("button", { class: "btn", onclick: () => { dlg.close(); res(false); } }, "Annulla"),
            el("button", { class: "btn primary" + (danger ? " danger" : ""), onclick: () => { dlg.close(); res(true); } }, okLabel)));
        dlg.addEventListener("close", () => { dlg.remove(); res(false); });
        document.body.append(dlg);
        dlg.showModal();
      });
    },

    errorBox(message) { return el("div", { class: "notice bad", role: "alert" }, message); },

    talkSummary(talk) {
      const parts = [];
      if (talk.segments.length) parts.push(talk.segments.length + " schermate");
      const deck = M.activeDeck(talk);
      if (deck) parts.push(deck.slides.length + " slide");
      if (talk.passages.length) parts.push(talk.passages.length + (talk.passages.length === 1 ? " citazione" : " citazioni"));
      return parts.join(" · ");
    },

    playUrl(talkId, params) {
      return L.planUrl("#/play?" + new URLSearchParams(Object.assign({ c: Studio.conf.id, t: talkId }, params || {})).toString());
    },

    shell(active) {
      const conf = Studio.conf;
      const tab = (href, text, key) => el("a", { href, class: key === active ? "on" : null, "aria-current": key === active ? "page" : null }, text);
      const dark = document.documentElement.dataset.theme === "dark";
      const head = el("header", { class: "top" },
        el("a", { class: "brand", href: "#/", title: "Tutte le conferenze" }, "Diglot"),
        conf ? el("nav", { class: "top-conf", "aria-label": "Questa conferenza" },
          el("span", { class: "top-title", title: M.pick(conf.title, conf.languages[0]) }, M.pick(conf.title, conf.languages[0]) || "Conferenza senza titolo"),
          tab("#/c/" + conf.id, "Programma", "program"), tab("#/c/" + conf.id + "/grafica", "Grafica", "theme"), tab("#/c/" + conf.id + "/sala", "In sala", "room")) : el("span", { class: "top-spacer" }),
        el("div", { class: "top-tools" },
          conf ? el("span", { id: "top-save", class: "save-state", "aria-live": "polite" }) : null,
          conf ? el("button", { id: "top-undo", class: "link", disabled: !Studio.undoStack.length, onclick: () => Studio.undo(), title: "Annulla l'ultima modifica" }, "Annulla") : null,
          tab("#/converti", "Convertitore", "tools"), tab("#/aiuto", "Aiuto", "help"),
          el("button", { class: "link", title: "Aspetto di questa interfaccia", onclick: () => { Studio.setUiTheme(dark ? "light" : "dark"); Studio.render(); } }, dark ? "Chiaro" : "Scuro")));
      const main = el("main", { class: "page page-" + active });
      const app = document.getElementById("app");
      app.replaceChildren(head, main);
      return main;
    },

    // Una modifica arrivata da un'altra finestra aspetta che qui non si stia scrivendo.
    async applyPending() {
      if (!Studio.pendingExternal || Studio.editing || !Studio.conf) return;
      if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
      if (document.activeElement && document.activeElement.isContentEditable) return;
      Studio.pendingExternal = false;
      const raw = await Store.getConference(Studio.conf.id);
      if (raw) { Studio.conf = M.normalize(raw); Studio.render(); }
    },
    external(id, rev) {
      if (!Studio.conf || id !== Studio.conf.id || String(rev) === Studio.knownRev || Studio.saving === "pending") return;
      Studio.knownRev = String(rev);
      Studio.pendingExternal = true;
      Studio.applyPending();
    },

    render() { if (Studio.routeNow) Studio.routeNow(); },
    pages: {},
  };

  L.Studio = Studio;
})(window.Diglot);
