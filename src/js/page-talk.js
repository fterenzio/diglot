(function (L) {
  "use strict";
  const { el } = L, M = L.Model, T = L.Text, Store = L.Store, Studio = L.Studio;

  const CHECK_TEXT = { manca: "manca il testo in una lingua", lunghezza: "lunghezze molto diverse tra le lingue" };

  function neighbours(conf, id) {
    const all = M.talks(conf), i = all.findIndex((x) => x.talk.id === id);
    return { prev: all[i - 1] ? all[i - 1].talk : null, next: all[i + 1] ? all[i + 1].talk : null };
  }

  function cutNear(text, ratio) {
    const at = text.length * ratio;
    const pts = T.cutPoints(text).map((p) => p.at);
    let acc = 0;
    T.sentences(text).forEach((s) => { const k = text.indexOf(s, acc); if (k >= 0) { acc = k + s.length; pts.push(acc); } });
    let best = -1, d = Infinity;
    pts.forEach((p) => { if (p > 0 && p < text.length && Math.abs(p - at) < d) { d = Math.abs(p - at); best = p; } });
    if (best < 0) { const sp = text.indexOf(" ", Math.floor(at)); best = sp > 0 ? sp : text.length; }
    return best;
  }

  function editorRows(conf, talk, list, langs, state) {
    const segs = talk.segments;
    let lastCue = null;
    const inherited = segs.map((s) => { if (s.cue) lastCue = s.cue; return lastCue; });
    list.replaceChildren();
    const frag = document.createDocumentFragment();
    frag.append(el("div", { class: "seg-row seg-top", style: "--cols:" + langs.length }, el("span"), langs.map((c) => el("div", { class: "lab-t" }, M.langName(c) + (c === talk.from ? " · relatore" : "") + (c === talk.to ? " · schermo" : ""))), el("span")));
    segs.forEach((s, i) => {
      if (state.onlyFlagged && !s.check) return;
      const row = el("div", { class: "seg-row" + (s.heading ? " head" : "") + (s.check ? " flag" : ""), style: "--cols:" + langs.length, dataset: { i } },
        el("div", { class: "seg-n" }, i + 1),
        langs.map((c) => {
          const cell = el("div", { class: "cell", lang: c, role: "textbox", "aria-label": "Schermata " + (i + 1) + ", " + M.langName(c), "aria-multiline": "true", spellcheck: "true", dataset: { lang: c }, tabindex: "0" });
          cell.textContent = s.text[c] || "";
          try { cell.contentEditable = "plaintext-only"; } catch (e) { cell.contentEditable = "true"; }
          return cell;
        }),
        el("div", { class: "seg-tools" },
          el("label", { class: "cue-field", title: "Da questa schermata in poi sullo schermo va questa slide" }, "Slide", el("input", { type: "number", min: "1", value: s.cue || "", placeholder: inherited[i] || "", "aria-label": "Slide da qui in poi", dataset: { act: "cue" } })),
          el("button", { class: "link", dataset: { act: "split" }, title: "Divide la schermata nel punto del cursore (Ctrl+Invio)" }, "Dividi"),
          i < segs.length - 1 ? el("button", { class: "link", dataset: { act: "merge" }, title: "Unisce con la schermata successiva" }, "Unisci") : null,
          i > 0 ? el("button", { class: "link", dataset: { act: "up" }, title: "Sposta la prima frase della colonna attiva alla schermata sopra" }, "Frase su") : null,
          i < segs.length - 1 ? el("button", { class: "link", dataset: { act: "down" }, title: "Sposta l'ultima frase della colonna attiva alla schermata sotto" }, "Frase giù") : null,
          el("button", { class: "link", dataset: { act: "head" }, "aria-pressed": !!s.heading }, s.heading ? "Non è un titolo" : "È un titolo"),
          el("button", { class: "link danger", dataset: { act: "del" } }, "Togli"),
          s.check ? el("span", { class: "flag-note" }, "Da controllare: " + (CHECK_TEXT[s.check] || s.check) + " ", el("button", { class: "link", dataset: { act: "ok" } }, "Va bene")) : null));
      frag.append(row);
    });
    list.append(frag);
    if (state.onlyFlagged && !segs.some((s) => s.check)) list.append(el("p", { class: "empty-lead" }, "Nessuna schermata da controllare."));
  }

  function textTab(box, conf, talk) {
    if (!talk.segments.length) {
      box.replaceChildren();
      const wiz = el("div", { class: "wizard" });
      box.append(el("p", { class: "tab-lead" }, "Carica il testo di questo intervento. Di solito è il documento bilingue preparato con DeepL, oppure il testo originale e la traduzione in due file: il programma li divide in schermate da leggere e li tiene allineati."), wiz);
      L.Wizard.mount(wiz, { conf, talk, inputId: "text-files", actions: (api) => [
        el("button", { class: "btn primary", id: "wiz-apply", onclick: () => Studio.change(() => api.applyTo(talk)) }, "Usa questo testo"),
      ] });
      return;
    }
    const state = { onlyFlagged: false };
    const langs = [talk.from, talk.to].filter((c, i, a) => a.indexOf(c) === i).concat(M.talkLangs(talk).filter((c) => c !== talk.from && c !== talk.to));
    const list = el("div", { class: "seg-list" });
    const panel = el("div", { class: "seg-panel" });
    const flagged = talk.segments.filter((s) => s.check).length;
    const words = talk.segments.reduce((n, s) => n + L.words(s.text[talk.to] || s.text[talk.from]), 0);
    let target = (() => { try { return +localStorage.getItem("diglot-words") || 48; } catch (e) { return 48; } })();

    const hide = () => panel.replaceChildren();
    const openReplace = () => {
      const wiz = el("div", { class: "wizard" });
      panel.replaceChildren(el("div", { class: "panel-head" }, el("h3", null, "Sostituisci il testo"), el("button", { class: "link", onclick: hide }, "Chiudi")), wiz);
      L.Wizard.mount(wiz, { conf, talk, inputId: "text-files", title: "Trascina qui il nuovo file (bilingue), oppure originale e traduzione insieme", actions: (api) => [
        el("button", { class: "btn primary", id: "wiz-apply", onclick: () => { Studio.change(() => api.applyTo(talk)); Studio.toast("Testo sostituito.", { action: { label: "Annulla", run: () => Studio.undo() } }); } }, "Sostituisci il testo"),
      ] });
    };
    const openAdd = () => {
      const wiz = el("div", { class: "wizard" });
      panel.replaceChildren(el("div", { class: "panel-head" }, el("h3", null, "Aggiungi una lingua")), wiz);
      L.Wizard.mountAddLanguage(wiz, conf, talk, (segs) => { if (segs) Studio.change(() => { talk.segments = segs; }); else hide(); });
    };
    const openFind = () => {
      const find = el("input", { class: "ed box", placeholder: "Testo da cercare", "aria-label": "Testo da cercare", oninput: count, id: "find-q" });
      const repl = el("input", { class: "ed box", placeholder: "Sostituisci con", "aria-label": "Sostituisci con", id: "find-r" });
      let code = talk.to;
      const howMany = el("span", { class: "lab-h", role: "status" });
      function count() {
        const q = find.value;
        if (!q) { howMany.textContent = ""; return 0; }
        const n = talk.segments.reduce((a, s) => a + ((s.text[code] || "").split(q).length - 1), 0);
        howMany.textContent = n + (n === 1 ? " occorrenza" : " occorrenze");
        return n;
      }
      panel.replaceChildren(el("div", { class: "panel-head" }, el("h3", null, "Trova e sostituisci"), el("button", { class: "link", onclick: hide }, "Chiudi")),
        el("div", { class: "find-line" }, find, repl, Studio.langSelect(code, (v) => { code = v; count(); }, { codes: langs }), howMany,
          el("button", { class: "btn", id: "find-go", onclick: () => {
            const q = find.value;
            if (!q || !count()) return;
            const r = repl.value;
            Studio.change(() => talk.segments.forEach((s) => { if (s.text[code]) s.text[code] = s.text[code].split(q).join(r); }));
            Studio.toast("Sostituzioni fatte.", { action: { label: "Annulla", run: () => Studio.undo() } });
          } }, "Sostituisci tutto")));
      find.focus();
    };
    const openReflow = () => {
      const label = el("span", null, "Parole per schermata: " + target);
      panel.replaceChildren(el("div", { class: "panel-head" }, el("h3", null, "Ricalcola le schermate"), el("button", { class: "link", onclick: hide }, "Chiudi")),
        el("p", { class: "lab-h" }, "Ridivide il testo già allineato senza cambiare le parole. Le divisioni fatte a mano si perdono."),
        el("label", { class: "lab" }, label, el("input", { type: "range", min: 25, max: 80, value: target, oninput: (e) => { target = +e.target.value; label.textContent = "Parole per schermata: " + target; } })),
        el("button", { class: "btn", id: "reflow-go", onclick: () => {
          try { localStorage.setItem("diglot-words", String(target)); } catch (e) { /* preferenza facoltativa */ }
          Studio.change(() => { talk.segments = L.Align.reflow(talk.segments, talk.from, talk.to, { target }); });
          Studio.toast("Schermate ricalcolate.", { action: { label: "Annulla", run: () => Studio.undo() } });
        } }, "Ricalcola"));
    };

    box.replaceChildren(
      el("div", { class: "seg-bar" },
        el("p", { class: "seg-stat" }, talk.segments.length + " schermate · " + words + " parole" + (talk.source ? " · da " + talk.source.name : "")),
        el("div", { class: "actions" },
          flagged ? el("button", { class: "btn", id: "only-flagged", "aria-pressed": "false", onclick: (e) => { state.onlyFlagged = !state.onlyFlagged; e.target.setAttribute("aria-pressed", state.onlyFlagged); e.target.textContent = state.onlyFlagged ? "Mostra tutte" : flagged + " da controllare"; editorRows(conf, talk, list, langs, state); } }, flagged + " da controllare") : null,
          el("button", { class: "link", id: "open-find", onclick: openFind }, "Trova e sostituisci"),
          el("button", { class: "link", id: "open-reflow", onclick: openReflow }, "Ricalcola"),
          el("button", { class: "link", id: "open-add", onclick: openAdd }, "Aggiungi una lingua"),
          el("button", { class: "link", id: "open-replace", onclick: openReplace }, "Sostituisci il testo"),
          el("button", { class: "link", id: "dl-json", onclick: () => {
            L.download(new Blob([JSON.stringify(L.Convert.talkToJSON(talk), null, 1)], { type: "application/json" }), L.slug(talk.speaker || "intervento") + ".json");
          } }, "Scarica JSON"),
          el("button", { class: "link", onclick: () => printSheet(talk) }, "Stampa o PDF"))),
      panel, list);
    editorRows(conf, talk, list, langs, state);

    let caret = null;
    const remember = (cell) => {
      const sel = window.getSelection();
      let offset = 0;
      if (sel && sel.rangeCount && cell.contains(sel.focusNode)) {
        const r = sel.getRangeAt(0).cloneRange();
        r.selectNodeContents(cell);
        r.setEnd(sel.focusNode, sel.focusOffset);
        offset = r.toString().length;
      }
      caret = { i: +cell.closest(".seg-row").dataset.i, lang: cell.dataset.lang, offset };
    };
    const rerender = (focusI) => {
      const y = window.scrollY;
      editorRows(conf, talk, list, langs, state);
      window.scrollTo(0, y);
      if (focusI !== undefined) { const c = list.querySelector('.seg-row[data-i="' + focusI + '"] .cell'); if (c) c.focus(); }
    };
    const commit = (fn, focusI) => { Studio.snapshot(); fn(); Studio.touch(); rerender(focusI); };

    function split(i) {
      const s = talk.segments[i];
      const lang = caret && caret.i === i ? caret.lang : talk.to;
      const src = s.text[lang] || "";
      const at = caret && caret.i === i && caret.offset > 0 && caret.offset < src.length ? caret.offset : cutNear(src, 0.5);
      const ratio = at / Math.max(1, src.length);
      const a = { text: {}, p: s.p }, b = { text: {}, p: s.p };
      if (s.cue) a.cue = s.cue;
      Object.keys(s.text).forEach((c) => {
        const t = s.text[c] || "", k = c === lang ? at : cutNear(t, ratio);
        a.text[c] = t.slice(0, k).trim(); b.text[c] = t.slice(k).trim();
      });
      commit(() => talk.segments.splice(i, 1, a, b), i + 1);
    }
    function merge(i) {
      const a = talk.segments[i], b = talk.segments[i + 1];
      if (!b) return;
      commit(() => {
        new Set(Object.keys(a.text).concat(Object.keys(b.text))).forEach((c) => { a.text[c] = [a.text[c], b.text[c]].filter(Boolean).join(" "); });
        if (!a.cue && b.cue) a.cue = b.cue;
        delete a.check;
        talk.segments.splice(i + 1, 1);
      }, i);
    }
    function moveSentence(i, dir) {
      const lang = caret && caret.i === i ? caret.lang : talk.to;
      const s = talk.segments[i], other = talk.segments[i + dir];
      if (!other) return;
      const parts = T.sentences(s.text[lang] || "");
      if (!parts.length) return;
      commit(() => {
        if (dir < 0) { const first = parts.shift(); other.text[lang] = [other.text[lang], first].filter(Boolean).join(" "); }
        else { const last = parts.pop(); other.text[lang] = [last, other.text[lang]].filter(Boolean).join(" "); }
        s.text[lang] = parts.join(" ");
        delete s.check; delete other.check;
      }, i);
    }

    list.addEventListener("focusin", (e) => { if (e.target.classList.contains("cell")) remember(e.target); });
    list.addEventListener("keyup", (e) => { if (e.target.classList.contains("cell")) remember(e.target); });
    list.addEventListener("mouseup", (e) => { const c = e.target.closest(".cell"); if (c) remember(c); });
    list.addEventListener("input", (e) => {
      const cell = e.target.closest(".cell");
      if (cell) {
        const i = +cell.closest(".seg-row").dataset.i;
        if (!Studio.editing) { Studio.snapshot(); Studio.editing = true; }
        talk.segments[i].text[cell.dataset.lang] = cell.textContent.replace(/\n/g, " ");
        Studio.touch();
        return;
      }
      if (e.target.dataset.act === "cue") {
        const i = +e.target.closest(".seg-row").dataset.i, v = parseInt(e.target.value, 10);
        if (!Studio.editing) { Studio.snapshot(); Studio.editing = true; }
        if (v > 0) talk.segments[i].cue = v; else delete talk.segments[i].cue;
        Studio.touch();
      }
    });
    list.addEventListener("focusout", () => { Studio.editing = false; Studio.applyPending(); });
    list.addEventListener("keydown", (e) => {
      const cell = e.target.closest(".cell");
      if (!cell) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) { remember(cell); split(+cell.closest(".seg-row").dataset.i); }
      }
      if (e.key === "Escape") cell.blur();
    });
    list.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      const i = +b.closest(".seg-row").dataset.i, s = talk.segments[i];
      switch (b.dataset.act) {
        case "split": split(i); break;
        case "merge": merge(i); break;
        case "up": moveSentence(i, -1); break;
        case "down": moveSentence(i, 1); break;
        case "head": commit(() => { if (s.heading) delete s.heading; else s.heading = true; }, i); break;
        case "ok": commit(() => { delete s.check; }, i); break;
        case "del":
          commit(() => talk.segments.splice(i, 1));
          Studio.toast("Schermata tolta.", { action: { label: "Annulla", run: () => Studio.undo() } });
          break;
        default: break;
      }
    });
  }

  function printSheet(talk) {
    const old = document.getElementById("print-sheet");
    if (old) old.remove();
    const code = talk.to;
    const sheet = el("div", { id: "print-sheet", lang: code },
      el("h1", null, M.pick(talk.title, code)), el("p", { class: "by" }, talk.speaker),
      (() => {
        const out = [];
        let p = null, last = null;
        talk.segments.forEach((s) => {
          const text = s.text[code] || "";
          if (s.heading) { out.push(el("h2", null, text)); p = null; return; }
          if (!p || s.p !== last) { p = el("p"); out.push(p); }
          p.append(text + " ");
          last = s.p;
        });
        return out;
      })());
    document.body.append(sheet);
    window.print();
  }

  function slidesTab(box, conf, talk) {
    const status = el("p", { class: "wiz-progress", role: "status" });
    const cues = talk.segments.filter((s) => s.cue).map((s) => s.cue);
    const upload = Studio.dropzone({
      id: "deck-files", accept: ".pdf,.pptx,.png,.jpg,.jpeg,.webp,.svg,.gif", multiple: true,
      title: talk.decks.length ? "Trascina qui un'altra serie di slide" : "Trascina qui le slide",
      hint: "PDF: la copia più fedele, ogni pagina è una slide. PowerPoint .pptx: disegnato qui dentro, i grafici vanno esportati in PDF. Immagini: una per slide, in ordine di nome.",
      onFiles: async (files) => {
        try {
          status.textContent = "Leggo le slide…";
          const deck = await L.Decks.importFiles(files, conf, (m) => { status.textContent = m; });
          status.textContent = "";
          Studio.change(() => { talk.decks.push(deck); if (!talk.deck) talk.deck = deck.id; });
          if (deck.warnings.length) Studio.toast((deck.warnings.length === 1 ? "Un avviso" : deck.warnings.length + " avvisi") + " su questa serie: guarda sopra le slide.");
        } catch (e) { status.textContent = ""; box.prepend(Studio.errorBox(e.message || "Non sono riuscito a leggere le slide.")); }
      },
    });
    const guide = !talk.decks.length ? null : cues.length
      ? el("p", { class: "tab-lead ok" }, "Le slide cambiano da sole seguendo il testo: " + cues.length + " cambi indicati, fino alla slide " + Math.max.apply(null, cues) + ".")
      : el("p", { class: "tab-lead" }, talk.segments.length ? "Il testo non indica quando cambiare slide, quindi in regia si mandano a mano con J e K. Per farle cambiare da sole scrivi il numero nella colonna Slide del testo, oppure metti [Slide 3] nel documento prima di caricarlo." : "Senza testo, sullo schermo vanno solo le slide, una dopo l'altra.");
    const active = M.activeDeck(talk);
    box.replaceChildren(guide || "", upload, status, ...talk.decks.map((deck) => {
      const grid = el("div", { class: "thumbs" });
      deck.slides.forEach((s, i) => {
        const im = el("img", { alt: "Slide " + (i + 1), loading: "lazy" });
        Store.mediaURL(s.media).then((u) => { im.src = u; });
        grid.append(el("figure", { class: "thumb" }, im, el("figcaption", null, el("span", null, i + 1),
          el("button", { class: "link danger", "aria-label": "Togli la slide " + (i + 1), onclick: () => {
            Studio.change(() => deck.slides.splice(i, 1));
            Studio.toast("Slide tolta. I numeri delle slide successive scalano.", { action: { label: "Annulla", run: () => Studio.undo() } });
          } }, "Togli"))));
      });
      return el("section", { class: "deck" },
        el("div", { class: "deck-head" },
          Studio.field({ class: "t-deck", value: deck.name, label: "Nome della serie", set: (v) => { deck.name = v; } }),
          el("span", { class: "lab-h" }, deck.slides.length + " slide · " + ({ pdf: "da PDF", pptx: "da PowerPoint", images: "da immagini" }[deck.source] || "")),
          talk.decks.length > 1 ? (deck === active ? el("span", { class: "ok" }, "Serie proiettata") : el("button", { class: "link", onclick: () => Studio.change(() => { talk.deck = deck.id; }) }, "Proietta questa serie")) : null,
          el("button", { class: "link danger", onclick: () => {
            Studio.change(() => { talk.decks = talk.decks.filter((d) => d !== deck); if (talk.deck === deck.id) talk.deck = talk.decks[0] ? talk.decks[0].id : null; });
            Studio.toast("Serie di slide tolta.", { action: { label: "Annulla", run: () => Studio.undo() } });
          } }, "Togli la serie")),
        deck.warnings && deck.warnings.length ? el("div", { class: "notice" }, el("p", null, "Alcuni elementi non si possono disegnare senza PowerPoint. Se ti servono, esporta le slide in PDF e carica quello:"), el("ul", null, deck.warnings.map((w) => el("li", null, w)))) : null,
        grid);
    }));
  }

  function quotesTab(box, conf, talk) {
    const langs = [talk.from, talk.to].filter((c, i, a) => a.indexOf(c) === i);
    const status = el("p", { class: "wiz-progress", role: "status" });
    box.replaceChildren(
      el("p", { class: "tab-lead" }, "I passi che il relatore cita: in regia si richiamano con G e vanno sullo schermo accanto al testo o a tutto schermo, in una lingua o in due."),
      Studio.dropzone({ small: true, id: "quote-files", accept: ".docx,.pdf,.txt,.md", multiple: true, title: "Importa le citazioni da un file", hint: "Stesso metodo dei testi: file bilingue, oppure originale e traduzione. Ogni titolo nel documento apre una citazione.",
        onFiles: async (files) => {
          try {
            status.textContent = "Leggo le citazioni…";
            const found = await L.Wizard.passagesFromFiles(files, talk, (m) => { status.textContent = m; });
            status.textContent = "";
            if (!found.length) throw new Error("Nel file non ho trovato testo da usare come citazione.");
            Studio.change(() => { talk.passages = talk.passages.concat(found); });
            Studio.toast(found.length + (found.length === 1 ? " citazione aggiunta." : " citazioni aggiunte."), { action: { label: "Annulla", run: () => Studio.undo() } });
          } catch (e) { status.textContent = ""; box.prepend(Studio.errorBox(e.message)); }
        } }),
      status,
      talk.passages.length ? "" : el("p", { class: "empty-lead" }, "Nessuna citazione per questo intervento."),
      ...talk.passages.map((p, pi) => el("article", { class: "quote" },
        el("div", { class: "quote-head" },
          Studio.field({ class: "t-ref", value: p.ref, placeholder: "Riferimento, per esempio: Opera, p. 12", label: "Riferimento", set: (v) => { p.ref = v; } }),
          Studio.field({ class: "t-affil", value: p.author, placeholder: "Autore", label: "Autore", set: (v) => { p.author = v; } }),
          el("button", { class: "link danger", onclick: () => {
            Studio.change(() => talk.passages.splice(pi, 1));
            Studio.toast("Citazione tolta.", { action: { label: "Annulla", run: () => Studio.undo() } });
          } }, "Togli")),
        p.pages.map((pg, k) => el("div", { class: "quote-page", style: "--cols:" + langs.length },
          langs.map((c) => Studio.field({ area: true, rows: 4, class: "box", value: pg[c], lang: c, label: "Pagina " + (k + 1) + " in " + M.langName(c), placeholder: M.langName(c), set: (v) => { pg[c] = v; } })),
          p.pages.length > 1 ? el("button", { class: "link danger", onclick: () => Studio.change(() => p.pages.splice(k, 1)) }, "Togli la pagina") : null)),
        el("button", { class: "link", onclick: () => Studio.change(() => p.pages.push({})) }, "Aggiungi una pagina"))),
      el("button", { class: "btn", id: "add-quote", onclick: () => Studio.change(() => talk.passages.push({ id: L.uid("q"), ref: "", author: "", pages: [{}] })) }, "Aggiungi una citazione"));
  }

  Studio.pages.talk = async function (confId, talkId, tab) {
    const conf = await Studio.openConf(confId);
    if (!conf) { location.hash = "#/"; return; }
    const found = M.find(conf, talkId);
    if (!found) { location.hash = "#/c/" + confId; return; }
    const talk = found.talk, current = tab || "testo";
    const main = Studio.shell("talk");
    document.title = (talk.speaker || "Intervento") + " · Diglot";
    const code = conf.languages[0];
    const near = neighbours(conf, talkId);
    const tabLink = (key, text) => el("a", { href: "#/c/" + confId + "/t/" + talkId + "/" + key, class: current === key ? "on" : null, "aria-current": current === key ? "page" : null }, text);
    const deck = M.activeDeck(talk);
    const body = el("div", { class: "tab-body" });
    main.append(
      el("div", { class: "talk-head" },
        el("div", { class: "crumbs" },
          el("a", { href: "#/c/" + confId }, "← Programma"),
          near.prev ? el("a", { href: "#/c/" + confId + "/t/" + near.prev.id + "/" + current }, "Precedente: " + (near.prev.speaker || "senza nome")) : null,
          near.next ? el("a", { href: "#/c/" + confId + "/t/" + near.next.id + "/" + current }, "Successivo: " + (near.next.speaker || "senza nome")) : null),
        el("h1", null, talk.speaker || "Intervento senza nome"),
        el("p", { class: "talk-sub" }, M.pick(talk.title, code) || "Titolo da scrivere nel programma"),
        el("p", { class: "talk-where" }, [M.dayLabel(found.day, code), found.session.time, M.pick(found.session.name, code), M.langName(talk.from) + " → " + M.langName(talk.to)].filter(Boolean).join(" · ")),
        el("div", { class: "actions" },
          el("a", { class: "btn primary", id: "try-screen", href: Studio.playUrl(talkId), target: "diglot-screen" }, "Prova lo schermo"),
          el("a", { class: "btn", id: "try-regia", href: Studio.playUrl(talkId, { mode: "regia" }), target: "diglot-regia" }, "Prova la regia"))),
      el("nav", { class: "tabs", "aria-label": "Materiali dell'intervento" },
        tabLink("testo", "Testo" + (talk.segments.length ? " (" + talk.segments.length + ")" : "")),
        tabLink("slide", "Slide" + (deck ? " (" + deck.slides.length + ")" : "")),
        tabLink("citazioni", "Citazioni" + (talk.passages.length ? " (" + talk.passages.length + ")" : ""))),
      body);
    if (current === "slide") slidesTab(body, conf, talk);
    else if (current === "citazioni") quotesTab(body, conf, talk);
    else textTab(body, conf, talk);
    Studio.setSaveState(Studio.saving === "pending" ? "pending" : "idle");
  };
})(window.Diglot);
