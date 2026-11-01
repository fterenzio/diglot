(function (L) {
  "use strict";
  const { el } = L, M = L.Model, C = L.Convert, Studio = L.Studio;

  const ACCEPT = ".docx,.pdf,.txt,.md,.json";
  const allCodes = (conf) => [...new Set((conf ? conf.languages : []).concat(Object.keys(M.LANGS)))];

  function loadTarget() {
    try { const v = +localStorage.getItem("diglot-words"); if (v >= 20 && v <= 90) return v; } catch (e) { /* preferenza facoltativa */ }
    return 48;
  }

  function previewTable(segments, langs, limit) {
    const box = el("div", { class: "pv-table" });
    const rows = (n) => segments.slice(0, n).map((s, i) => el("div", { class: "pv-row" + (s.heading ? " head" : "") + (s.check ? " flag" : "") },
      el("span", { class: "pv-n" }, i + 1, s.cue ? el("b", null, "Slide " + s.cue) : null),
      langs.map((c) => el("div", { lang: c, class: "pv-cell" }, s.text[c] || el("em", null, "(vuoto)")))));
    const draw = (n) => {
      box.replaceChildren(el("div", { class: "pv-row pv-top" }, el("span", null), langs.map((c) => el("div", { class: "lab-t" }, M.langName(c)))), ...rows(n));
      if (segments.length > n) box.append(el("button", { class: "link", onclick: () => draw(segments.length) }, "Mostra tutte le " + segments.length + " schermate"));
    };
    draw(limit);
    return box;
  }

  function mount(host, ctx) {
    const talk = ctx.talk || null, conf = ctx.conf || null;
    let parsed = [], planned = null, result = null, jsonTalk = null;
    const opts = { target: loadTarget(), skipFront: true, langA: null, langB: null, from: null, to: null, shape: "" };

    const say = el("p", { class: "wiz-progress", role: "status" });
    const progress = (m) => { say.textContent = m; };

    function chooseView(error) {
      const box = [];
      if (error) box.push(Studio.errorBox(error));
      box.push(Studio.dropzone({
        id: ctx.inputId || "wiz-files", accept: ACCEPT, multiple: true,
        title: ctx.title || "Trascina qui il file bilingue, oppure originale e traduzione insieme",
        hint: "Word .docx, PDF, testo .txt o JSON. Un file con tabella a due colonne o paragrafi alternati si riconosce da solo; due file separati vengono allineati frase per frase.",
        onFiles: readFiles,
      }));
      box.push(say);
      host.replaceChildren(...box);
    }

    async function readFiles(files) {
      if (files.length > 2) { chooseView("Carica al massimo due file insieme: originale e traduzione."); return; }
      if (files.length === 1 && L.fileExt(files[0].name) === "json") { await readJson(files[0]); return; }
      host.replaceChildren(say);
      try {
        const list = [];
        for (const f of files) { progress("Leggo «" + f.name + "»…"); await L.yieldUI(); list.push(await C.readFile(f, progress)); }
        const scanned = list.find((p) => p.meta.scanned);
        if (scanned) { chooseView("«" + scanned.name + "» è una scansione senza testo selezionabile: non si può convertire. Passalo da un programma di riconoscimento del testo (OCR), oppure caricalo tra le slide per proiettarlo com'è."); return; }
        const empty = list.find((p) => !p.blocks.length);
        if (empty) { chooseView("In «" + empty.name + "» non ho trovato testo."); return; }
        parsed = parsed.length === 1 && list.length === 1 ? parsed.concat(list) : list;
        opts.shape = "";
        replan();
      } catch (e) { chooseView(e.message || "Non sono riuscito a leggere il file."); }
    }

    async function readJson(file) {
      try {
        const data = JSON.parse(await file.text());
        if (M.isConference(data)) { chooseView("Questo JSON è una conferenza intera: importalo dalla pagina «Conferenze»."); return; }
        jsonTalk = C.talkFromJSON(data, talk ? { from: talk.from, to: talk.to } : {});
        parsed = [{ name: file.name, front: { count: 0 } }];
        opts.from = jsonTalk.from; opts.to = jsonTalk.to;
        result = { segments: jsonTalk.segments, langs: [...new Set(jsonTalk.segments.flatMap((s) => Object.keys(s.text)))], layout: "json", flagged: 0, cues: jsonTalk.segments.filter((s) => s.cue).length, front: { count: 0 } };
        reviewView();
      } catch (e) { chooseView(e instanceof SyntaxError ? "Questo file non è un JSON valido: " + e.message : e.message); }
    }

    function replan(how) {
      planned = C.plan(parsed, how);
      opts.langA = planned.langs[0] || (conf && conf.languages[0]) || "it";
      opts.langB = planned.layout === "single" ? null : planned.langs[1] || allCodes(conf).find((c) => c !== opts.langA);
      if (opts.langB === opts.langA) opts.langB = allCodes(conf).find((c) => c !== opts.langA);
      const langs = [opts.langA, opts.langB].filter(Boolean);
      opts.from = langs[0]; opts.to = langs[1] || langs[0];
      if (talk && langs.length === 1 && (langs[0] === talk.from || langs[0] === talk.to)) { opts.from = talk.from; opts.to = talk.to; }
      else if (talk && langs.includes(talk.to)) { opts.to = talk.to; opts.from = langs.find((c) => c !== talk.to) || talk.to; }
      else if (talk && langs.includes(talk.from)) { opts.from = talk.from; opts.to = langs.find((c) => c !== talk.from) || talk.from; }
      rebuild();
    }
    function rebuild() {
      try {
        progress("Allineo il testo…");
        result = C.build(planned, { target: opts.target, skipFront: opts.skipFront, langA: opts.langA, langB: opts.langB });
        if (result.langs.length > 1) {
          if (!result.langs.includes(opts.from)) opts.from = result.langs[0];
          if (!result.langs.includes(opts.to)) opts.to = result.langs.find((c) => c !== opts.from);
        }
        reviewView();
      } catch (e) { chooseView(e.message || "Allineamento non riuscito."); }
    }

    function summary() {
      const n = result.segments.length;
      const parts = [C.LAYOUT_NAMES[result.layout] || "File JSON", result.langs.map(M.langName).join(" e "), n + " schermate"];
      if (result.cues) parts.push(result.cues + " cambi di slide");
      return parts.join(" · ");
    }

    function reviewView() {
      const langs = result.langs, pick = allCodes(conf);
      const isJson = result.layout === "json";
      const front = planned && planned.front;
      const controls = el("div", { class: "wiz-controls" });
      if (!isJson) {
        if (parsed.length === 1) {
          const shapes = [["", "Riconoscimento automatico"], ["alternate", "Un paragrafo per lingua, alternati"], ["sequence", "Prima una lingua, poi l'altra"], ["single", "Una sola lingua"]];
          controls.append(Studio.labeled("Com'è fatto il file", el("select", { class: "ed-select", id: "wiz-shape", onchange: (e) => { opts.shape = e.target.value; replan(opts.shape || undefined); } },
            shapes.map(([v, t]) => el("option", { value: v, selected: (opts.shape || "") === v }, t)))));
        }
        controls.append(
          Studio.labeled(result.layout === "single" ? "Lingua del testo" : "Prima lingua nel file", Studio.langSelect(opts.langA, (v) => { opts.langA = v; if (opts.from === planned.langs[0] || !langs.includes(opts.from)) opts.from = v; rebuild(); }, { codes: pick })),
          opts.langB ? Studio.labeled("Seconda lingua nel file", Studio.langSelect(opts.langB, (v) => { opts.langB = v; rebuild(); }, { codes: pick })) : null,
          Studio.labeled("Parole per schermata: " + opts.target, el("input", { type: "range", min: 25, max: 80, step: 1, value: opts.target, "aria-label": "Parole per schermata", onchange: (e) => { opts.target = +e.target.value; try { localStorage.setItem("diglot-words", String(opts.target)); } catch (x) { /* preferenza facoltativa */ } rebuild(); } })));
      }
      controls.append(
        Studio.labeled("Il relatore parla in", Studio.langSelect(opts.from, (v) => { opts.from = v; reviewView(); }, { codes: [...new Set(langs.concat(conf ? conf.languages : []))] })),
        Studio.labeled("Sullo schermo", Studio.langSelect(opts.to, (v) => { opts.to = v; reviewView(); }, { codes: [...new Set(langs.concat(conf ? conf.languages : []))] })));
      const parts = [
        el("div", { class: "wiz-result" },
          el("p", { class: "wiz-sum", id: "wiz-summary" }, summary()),
          result.flagged ? el("p", { class: "warn" }, result.flagged + (result.flagged === 1 ? " schermata" : " schermate") + " da controllare: le lingue non sembrano corrispondere. Sono evidenziate qui sotto.") : null,
          !isJson && front && front.count ? el("label", { class: "check" }, el("input", { type: "checkbox", checked: opts.skipFront, onchange: (e) => { opts.skipFront = e.target.checked; rebuild(); } }), " Salta l'intestazione del documento: «" + front.title + "»" + (front.author ? ", " + front.author : "")) : null,
          result.outside ? el("p", { class: "lab-h" }, result.outside + (result.outside === 1 ? " paragrafo fuori dalla tabella non viene usato." : " paragrafi fuori dalla tabella non vengono usati.")) : null,
          result.layout === "single" ? el("p", { class: "lab-h" }, "Il file ha una sola lingua. Se hai anche la traduzione, aggiungila qui sotto: viene allineata frase per frase. Altrimenti sullo schermo va questo testo.") : null,
          result.layout === "single" ? Studio.dropzone({ small: true, id: (ctx.inputId || "wiz-files") + "-2", accept: ".docx,.pdf,.txt,.md", title: "Aggiungi il file della traduzione", onFiles: (fs) => readFiles(fs.slice(0, 1)) }) : null),
        controls,
        previewTable(result.segments, langs.length ? langs : [opts.langA], 12),
        el("div", { class: "actions wiz-actions" },
          ctx.actions(api),
          el("button", { class: "link", onclick: () => { parsed = []; planned = null; result = null; jsonTalk = null; chooseView(); } }, "Scegli altri file"))];
      host.replaceChildren(...parts.filter(Boolean));
    }

    // Titolo e relatore trovati nel documento completano i campi vuoti, non sovrascrivono.
    function applyTo(t) {
      t.segments = result.segments;
      t.from = opts.from; t.to = opts.to;
      t.source = { name: parsed.map((p) => p.name).join(" + "), layout: result.layout, at: Date.now() };
      if (jsonTalk) {
        if (jsonTalk.speaker && !t.speaker) t.speaker = jsonTalk.speaker;
        if (jsonTalk.affiliation && !t.affiliation) t.affiliation = jsonTalk.affiliation;
        if (jsonTalk.title) Object.keys(jsonTalk.title).forEach((c) => { if (!t.title[c]) t.title[c] = jsonTalk.title[c]; });
        if (jsonTalk.screenLabel) t.screenLabel = jsonTalk.screenLabel;
        if (jsonTalk.passages && jsonTalk.passages.length) t.passages = jsonTalk.passages.map((p) => Object.assign({ id: L.uid("q") }, p));
        return;
      }
      const front = planned && planned.front;
      if (front && front.titleB && opts.langB && !t.title[opts.langB]) t.title[opts.langB] = front.titleB;
      if (front && front.title && !t.title[opts.langA]) t.title[opts.langA] = front.title;
      if (front && front.author && !t.speaker) t.speaker = front.author;
      if (parsed[1] && parsed[1].front && parsed[1].front.title && opts.langB && !t.title[opts.langB]) t.title[opts.langB] = parsed[1].front.title;
    }

    const api = { applyTo, get result() { return result; }, get opts() { return opts; }, get parsed() { return parsed; } };
    chooseView();
    return api;
  }

  // Aggiunge una lingua a schermate già pronte, senza toccarne la divisione.
  function mountAddLanguage(host, conf, talk, onDone) {
    const say = el("p", { class: "wiz-progress", role: "status" });
    const base = M.talkLangs(talk).find((c) => talk.segments.some((s) => s.text[c])) || talk.from;
    host.replaceChildren(Studio.dropzone({
      id: "addlang-file", accept: ".docx,.pdf,.txt,.md", title: "Trascina il file nella nuova lingua",
      hint: "Le schermate restano come sono: ognuna riceve le frasi corrispondenti.",
      onFiles: async (fs) => {
        host.replaceChildren(say);
        try {
          say.textContent = "Leggo «" + fs[0].name + "»…";
          const parsed = await C.readFile(fs[0], (m) => { say.textContent = m; });
          if (parsed.meta.scanned || !parsed.blocks.length) throw new Error("In questo file non ho trovato testo selezionabile.");
          let code = parsed.lang && !M.talkLangs(talk).includes(parsed.lang) ? parsed.lang : allCodes(conf).find((c) => !M.talkLangs(talk).includes(c));
          const blocks = parsed.front && parsed.front.count ? parsed.blocks.slice(parsed.front.count) : parsed.blocks;
          say.textContent = "Allineo le frasi…";
          await L.yieldUI();
          const draw = () => {
            const segs = L.Align.alignToExisting(talk.segments, base, code, blocks);
            const flagged = segs.filter((s) => s.check).length;
            host.replaceChildren(
              el("p", { class: "wiz-sum" }, "Nuova lingua sulle " + segs.length + " schermate" + (flagged ? ": " + flagged + " da controllare" : "")),
              Studio.labeled("Lingua del file", Studio.langSelect(code, (v) => { code = v; draw(); }, { codes: allCodes(conf).filter((c) => c === code || !M.talkLangs(talk).includes(c)) })),
              previewTable(segs, [base, code], 10),
              el("div", { class: "actions" },
                el("button", { class: "btn primary", onclick: () => onDone(segs, code) }, "Aggiungi " + M.langName(code)),
                el("button", { class: "link", onclick: () => onDone(null) }, "Annulla")));
          };
          draw();
        } catch (e) { host.replaceChildren(Studio.errorBox(e.message), el("button", { class: "link", onclick: () => onDone(null) }, "Chiudi")); }
      },
    }), el("button", { class: "link", onclick: () => onDone(null) }, "Annulla"));
  }

  // Citazioni da un documento: ogni titolo apre una citazione nuova.
  async function passagesFromFiles(files, talk, progress) {
    const list = [];
    for (const f of files.slice(0, 2)) list.push(await C.readFile(f, progress));
    if (list.some((p) => p.meta.scanned || !p.blocks.length)) throw new Error("In questo file non ho trovato testo selezionabile.");
    const res = C.build(C.plan(list), { target: 90, skipFront: false });
    const out = [];
    let cur = null;
    res.segments.forEach((s) => {
      if (s.heading || !cur) {
        cur = { id: L.uid("q"), ref: s.heading ? M.pick(s.text, res.langs[0]) : (list[0].name || "").replace(/\.[^.]+$/, ""), author: "", pages: [] };
        out.push(cur);
        if (s.heading) return;
      }
      cur.pages.push(Object.assign({}, s.text));
    });
    return out.filter((p) => p.pages.length);
  }

  L.Wizard = { mount, mountAddLanguage, passagesFromFiles, previewTable };
})(window.Diglot);
