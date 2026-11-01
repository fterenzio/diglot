(function (L) {
  "use strict";
  const M = L.Model, Store = L.Store, esc = L.escTypo;
  const SAMPLE = "__sample";

  L.startPlayer = async function (route) {
    const confId = route.c;
    let talkId = route.t || "cover";
    const mode = route.mode === "regia" ? "regia" : "screen";
    const preview = route.preview === "1";  // miniatura dentro la regia o nella pagina Grafica: segue, non comanda
    const sample = talkId === SAMPLE;
    const KEY = "diglot-sync-" + confId, PREFS = "diglot-prefs-" + confId, BI = "diglot-regia-bi", POS = (t) => "diglot-pos-" + confId + "-" + t;
    const me = Math.random().toString(36).slice(2);

    function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }

    let conf = await Store.getConference(confId);
    if (!conf) {
      document.body.innerHTML = '<div class="regia-error"><p>Questa conferenza non è in questo browser. Aprila dall\'elenco o importa il suo file .diglot.</p><p><a href="' + esc(L.planUrl("#/")) + '">Vai all\'elenco delle conferenze</a></p></div>';
      return;
    }
    conf = M.normalize(conf);

    let prefs = {};
    try { prefs = JSON.parse(store(PREFS) || "{}") || {}; } catch (e) { prefs = {}; }
    const state = {
      i: 0, disc: false, pass: null,
      passMode: ["full", "full-o", "full-t", "side-o", "side-t"].indexOf(prefs.passMode) >= 0 ? prefs.passMode : "full",
      passView: prefs.passView === "sheet" ? "sheet" : "pages",
      black: false, theme: prefs.theme || conf.theme.mode || "light", scale: prefs.scale || 1,
      view: prefs.view === "sheet" ? "sheet" : "slides", lang: null, deck: null, slidesOff: false, scene: null,
    };

    let info = null, slides = [];

    function sampleInfo() {
      const real = M.talks(conf);
      const withText = real.find((x) => x.talk.segments.length) || real[0];
      const langs = conf.languages;
      const talk = M.normalizeTalk({
        id: SAMPLE, speaker: withText && withText.talk.speaker || "Nome del relatore", affiliation: withText && withText.talk.affiliation || "",
        title: withText && Object.keys(withText.talk.title).length ? withText.talk.title : { [langs[0]]: "Titolo dell'intervento", [langs[1] || langs[0]]: "Titolo nell'altra lingua" },
        from: langs[1] || langs[0], to: langs[0],
        segments: withText && withText.talk.segments.length ? withText.talk.segments.slice(0, 12) : [
          { text: { [langs[0]]: "Prova di stampa: titolo di sezione" }, p: 0, heading: true },
          { text: { [langs[0]]: "Testo di prova. Qui compare la traduzione che il pubblico legge durante l'intervento: controlla carattere, corpo, interlinea e colori da lontano, come dall'ultima fila della sala.", [langs[1] || "xx"]: "Testo di prova nella lingua del relatore." }, p: 1 },
        ],
        decks: withText ? withText.talk.decks : [], deck: withText ? withText.talk.deck : null,
        passages: [{ ref: "Citazione di prova", author: "Autore", pages: [{ [langs[0]]: "Testo di prova di una citazione proiettata accanto al discorso.", [langs[1] || "xx"]: "Testo di prova nell'altra lingua." }] }],
      }, conf);
      const day = conf.days[0] || { date: "", sessions: [] }, session = day.sessions[0] || { name: {}, talks: [] };
      return { talk, session, day };
    }
    function findTalk(id) { return id === SAMPLE ? sampleInfo() : M.find(conf, id); }

    function screenLang() { return state.lang || (info && info.talk.to) || conf.languages[0]; }
    // Se il pubblico vede la lingua del relatore (ha cambiato idea all'ultimo), in regia si legge l'altra.
    function readLang() {
      if (!info) return conf.languages[1] || conf.languages[0];
      const t = info.talk, sl = screenLang();
      if (t.from !== sl) return t.from;
      return M.talkLangs(t).find((c) => c !== sl) || sl;
    }
    function hasCues() { return !!(info && info.talk.segments.some((s) => s.cue)); }
    function deckOf(t) {
      const decks = t.decks || [];
      if (t.id === talkId && state.deck) { const d = decks.find((x) => x.id === state.deck); if (d) return d; }
      return M.activeDeck(t);
    }
    function slidesOnly() { return !!(info && !info.talk.segments.length && deckOf(info.talk)); }
    function syncSlides() { return !!(info && deckOf(info.talk) && deckOf(info.talk).slides.length && (hasCues() || slidesOnly())); }

    function materialsFor(tid) {
      const f = findTalk(tid);
      if (!f) return [];
      const t = f.talk, out = [], deck = deckOf(t), code = t.to;
      if (deck) deck.slides.forEach((s, k) => out.push({ kind: "slide", ref: M.label(code, "slide") + " " + (k + 1), author: t.speaker, img: s, pages: [{}] }));
      (t.passages || []).forEach((p) => { if (p.pages && p.pages.length) out.push({ kind: "passage", ref: p.ref, author: p.author || "", pages: p.pages }); });
      return out;
    }
    function curPass() {
      if (!state.pass) return null;
      const src = state.pass[2] || talkId, p = materialsFor(src)[state.pass[0]];
      return p ? { p, k: state.pass[0], pg: state.pass[1], page: p.pages[state.pass[1]], src } : null;
    }

    const isFull = (m) => m === "full" || m === "full-o" || m === "full-t";
    const fullLang = (m) => (m === "full-o" ? readLang() : m === "full-t" ? screenLang() : null);
    const sideLang = (m) => (m === "side-o" ? readLang() : screenLang());
    const pageText = (pg, code) => M.pick(pg, code);
    const fmtPass = (t) => esc(t).replace(/ • /g, "<br>• ");

    function slideImg(p) {
      const url = Store.cachedURL(p.img.media);
      if (!url) Store.mediaURL(p.img.media).then(() => { if (mode === "screen") { document.querySelectorAll(".stage").forEach((s) => { s.dataset.key = ""; }); render(); } });
      const w = p.img.w || 16, h = p.img.h || 9;
      return '<div class="slf" data-ratio="' + (w / h) + '" style="aspect-ratio:' + w + " / " + h + '"><img src="' + esc(url) + '" alt="' + esc(p.ref) + '"></div>';
    }
    function passHTML(p, pg, code) { return p.kind === "slide" ? slideImg(p) : fmtPass(pageText(pg, code)); }
    function sizeSlides(box, availH) {
      box.querySelectorAll(".slf").forEach((f) => {
        const cs = getComputedStyle(f.parentNode), room = f.parentNode.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        f.style.width = Math.min(availH * (+f.dataset.ratio || 16 / 9), room) + "px";
      });
    }

    function buildSlides() {
      slides = [];
      if (talkId === "cover") { slides.push({ type: "conf" }); return; }
      const t = info.talk, sl = screenLang(), rl = readLang(), deck = deckOf(t);
      slides.push({ type: "cover" });
      if (t.segments.length) {
        const cues = deck && hasCues();
        let cue = cues ? 0 : null;
        t.segments.forEach((s, k) => {
          if (cues && s.cue) cue = s.cue - 1;
          const shown = s.text[sl] || "", read = s.text[rl] || "";
          slides.push({ type: s.heading ? "section" : "text", o: read || shown, t: shown || read, missing: !shown && !!read, p: s.p, f: cue === null ? undefined : cue, seg: k, n: k + 1 });
        });
        slides.push({ type: "cover", end: true });
      } else if (deck) {
        deck.slides.forEach((s, k) => slides.push({ type: "deck", f: k, o: M.label("it", "slide") + " " + (k + 1), t: "", n: k + 1 }));
        slides.push({ type: "cover", end: true });
      }
    }

    const titleOn = (t, code) => M.pick(t.title, code);
    function screenTag() {
      const t = info.talk, sl = screenLang();
      if (t.screenLabel && sl === t.to) return t.screenLabel;
      return sl === t.from || M.talkLangs(t).length < 2 ? M.label(sl, "original") : M.label(sl, "translation");
    }

    function coverHTML(end) {
      const t = info.talk, sl = screenLang(), rl = readLang();
      const kicker = [M.dayLabel(info.day, sl), M.pick(info.session.name, sl)].filter(Boolean).join(" · ");
      const t1 = titleOn(t, sl), t2 = rl !== sl && t.title[rl] && t.title[rl] !== t1 ? t.title[rl] : "";
      return '<div class="cover">' +
        (kicker ? '<div class="kicker">' + esc(kicker) + "</div>" : "") +
        '<div class="speaker">' + esc(t.speaker) + "</div>" +
        (t.affiliation ? '<div class="affil">' + esc(t.affiliation) + "</div>" : "") +
        '<div class="rule"></div>' +
        '<div class="t1">' + esc(t1) + "</div>" +
        (t2 ? '<div class="t2">' + esc(t2) + "</div>" : "") +
        '<div class="meta">' + esc(end ? M.label(sl, "end") : t.segments.length ? screenTag() : "") + "</div></div>";
    }
    function confHTML() {
      const langs = conf.languages;
      const kicker = langs.map((c) => conf.kicker[c]).filter(Boolean).join(" · ");
      const titles = langs.map((c) => conf.title[c]).filter(Boolean);
      const where = [conf.place, M.datesLabel(conf, langs[0])].filter(Boolean).join(" · ");
      let body;
      if (conf.big) body = titles.map((x, i) => '<div class="' + (i ? "pre2" : "pre") + '">' + esc(x) + "</div>").join("") + '<div class="big">' + esc(conf.big) + "</div>";
      else body = titles.map((x, i) => '<div class="' + (i ? "pre2" : "lead") + '">' + esc(x) + "</div>").join("");
      return '<div class="cover conf">' + (kicker ? '<div class="kicker">' + esc(kicker) + "</div>" : "") + body + '<div class="rule"></div>' +
        (where ? '<div class="meta" style="margin-top:0">' + esc(where) + "</div>" : "") + "</div>";
    }

    function textBase(frac) { return window.innerHeight * frac * state.scale * (conf.theme.size || 1); }
    function fit(el, stage) {
      let size = textBase(0.05), guard = 0;
      el.style.fontSize = size + "px";
      while (el.scrollHeight > stage.clientHeight && size > 12 && guard++ < 80) { size *= 0.95; el.style.fontSize = size + "px"; }
    }
    function fitIn(el, frac, stage) {
      let size = textBase(frac), g = 0;
      el.style.fontSize = size + "px";
      while (el.scrollHeight > stage.clientHeight && size > 10 && g++ < 80) { size *= 0.95; el.style.fontSize = size + "px"; }
    }

    let sheetKey = null, sheetScrolled = false, colScrolled = {};
    function talkSheetHTML(head) {
      let html = head ? '<div class="sheet-head">' + coverHTML(false) + "</div>" : "", open = false, lastP = null;
      const close = () => { if (open) { html += "</p>"; open = false; } };
      slides.forEach((sl, i) => {
        if (sl.type !== "text" && sl.type !== "section") return;
        if (sl.type === "section") { close(); html += '<h3 class="seg" data-i="' + i + '">' + esc(sl.t) + "</h3>"; lastP = null; return; }
        if (!open || sl.p === undefined || sl.p !== lastP) { close(); html += "<p>"; open = true; }
        html += '<span class="seg" data-i="' + i + '">' + esc(sl.t) + "</span> ";
        lastP = sl.p;
      });
      close();
      html += '<div class="sheet-end">' + esc(M.label(screenLang(), "end")) + "</div>";
      return html;
    }
    function passSheetHTML(cp, code) {
      if (code) return cp.p.pages.map((pg, k) => '<p><span class="seg" data-pg="' + k + '">' + passHTML(cp.p, pg, code) + "</span></p>").join("");
      const a = readLang(), b = screenLang();
      return '<div class="prow head"><div>' + esc(M.langName(a)) + "</div><div>" + esc(M.langName(b)) + "</div></div>" + cp.p.pages.map((pg, k) =>
        '<div class="prow seg" data-pg="' + k + '"><div class="a" lang="' + a + '">' + passHTML(cp.p, pg, a) + '</div><div class="b" lang="' + b + '">' + passHTML(cp.p, pg, b) + "</div></div>").join("");
    }
    function markAndScroll(box, attr, cur, id) {
      let el = null;
      box.querySelectorAll(".seg[data-" + attr + "]").forEach((x) => {
        const v = +x.dataset[attr]; x.classList.toggle("cur", v === cur); x.classList.toggle("past", v < cur); if (v === cur) el = x;
      });
      const top = el ? el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - box.clientHeight * 0.3 : 0;
      const far = Math.abs(top - box.scrollTop) > box.clientHeight * 1.5;
      box.scrollTo({ top: Math.max(0, top), behavior: document.hidden || far || !colScrolled[id] ? "auto" : "smooth" });
      colScrolled[id] = true;
    }
    function barHTML() {
      const t = info.talk;
      return '<span class="who"><b>' + esc(t.speaker) + "</b> &nbsp;·&nbsp; " + esc(titleOn(t, screenLang())) + '</span><span class="lang">' + esc(screenTag()) + "</span>";
    }
    function setProgress(prog) { prog.style.width = (100 * state.i / Math.max(1, slides.length - 1)) + "%"; }
    function renderSheet() {
      const sheet = document.querySelector(".sheet"), bar = document.querySelector(".bar");
      const key = [talkId, screenLang(), state.scale, conf.theme.size, window.innerHeight, conf.updatedAt].join("|");
      if (sheetKey !== key) {
        sheet.innerHTML = talkSheetHTML(true);
        sheet.style.fontSize = textBase(0.038) + "px";
        sheetKey = key; sheetScrolled = false;
      }
      bar.style.visibility = "visible";
      bar.innerHTML = barHTML();
      let cur = null;
      sheet.querySelectorAll(".seg").forEach((el) => {
        const i = +el.dataset.i;
        el.classList.toggle("cur", i === state.i); el.classList.toggle("past", i < state.i);
        if (i === state.i) cur = el;
      });
      const top = cur ? cur.getBoundingClientRect().top - sheet.getBoundingClientRect().top + sheet.scrollTop - sheet.clientHeight * 0.3 : 0;
      const far = Math.abs(top - sheet.scrollTop) > sheet.clientHeight * 1.5;
      sheet.scrollTo({ top: Math.max(0, top), behavior: document.hidden || far || !sheetScrolled ? "auto" : "smooth" });
      sheetScrolled = true;
      const prog = document.querySelector(".foot i"); prog.parentNode.style.visibility = "visible";
      setProgress(prog);
    }

    function discLangs() { return conf.languages.slice(0, 2); }
    function renderSide(cp) {
      const t = info.talk, bar = document.querySelector(".bar"), stage = document.querySelector(".stage"), prog = document.querySelector(".foot i");
      const sl = slides[state.i] || slides[0], code = sideLang(state.passMode);
      const inDisc = !!state.disc, leftSheet = state.view === "sheet" && !inDisc, rightSheet = state.passView === "sheet" && cp.p.kind !== "slide";
      const isSlide = cp.p.kind === "slide";
      bar.style.visibility = "visible"; prog.parentNode.style.visibility = "visible";
      bar.innerHTML = inDisc ? '<span class="who"><b>' + esc(discLangs().map((c) => M.label(c, "discussion")).join(" · ")) + '</b></span><span class="lang">' + esc(isSlide ? M.label(code, "slide") : M.label(code, "passage")) + "</span>" : barHTML();
      const key = ["side", talkId, cp.src, isSlide, code, leftSheet, rightSheet, inDisc ? discIds().join(",") : "", state.scale, conf.theme.size, window.innerHeight, window.innerWidth, conf.updatedAt].join("|");
      if (stage.dataset.key !== key) {
        stage.dataset.key = key; colScrolled = {};
        stage.innerHTML = '<div class="side' + (isSlide ? " with-slide" : "") + '"><div class="side-talk' + (leftSheet ? " col-sheet" : "") + '"></div>' +
          '<div class="side-pass' + (rightSheet ? " col-sheet" : "") + (isSlide ? " is-slide" : "") + '" lang="' + code + '"><div class="lab"></div><div class="tx"></div></div></div>';
        const L0 = stage.querySelector(".side-talk"), R0 = stage.querySelector(".side-pass .tx");
        if (leftSheet) { L0.innerHTML = talkSheetHTML(false); L0.style.fontSize = textBase(0.036) + "px"; }
        if (rightSheet) { R0.innerHTML = passSheetHTML(cp, code); stage.querySelector(".side-pass").style.fontSize = textBase(0.03) + "px"; }
      }
      const Lc = stage.querySelector(".side-talk"), P = stage.querySelector(".side-pass");
      P.querySelector(".lab").textContent = (cp.p.author ? cp.p.author + " · " : "") + cp.p.ref + (cp.p.pages.length > 1 ? " · " + (cp.pg + 1) + "/" + cp.p.pages.length : "");
      if (inDisc) {
        Lc.className = "side-talk";
        if (!Lc.firstChild || !Lc.querySelector(".disc")) { Lc.innerHTML = discussionHTML(true); fitIn(Lc, 0.044, stage); }
      } else if (leftSheet) markAndScroll(Lc, "i", state.i, "L");
      else {
        Lc.className = "side-talk";
        Lc.innerHTML = '<div class="tx">' + (sl.type === "text" || sl.type === "section" ? esc(sl.t) : '<span class="side-title">' + esc(titleOn(t, screenLang())) + "</span>") + "</div>";
        fitIn(Lc, 0.044, stage);
      }
      if (rightSheet) markAndScroll(P.querySelector(".tx"), "pg", cp.pg, "R");
      else {
        const tx = P.querySelector(".tx"), rk = [cp.src, cp.k, cp.pg, code, Store.cachedURL(cp.p.img ? cp.p.img.media : "")].join("|");
        if (tx.dataset.rk !== rk) { tx.innerHTML = passHTML(cp.p, cp.page, code); tx.dataset.rk = rk; }
        if (isSlide) { P.style.fontSize = (window.innerHeight * 0.034) + "px"; sizeSlides(P, stage.clientHeight * 0.88); } else fitIn(P, 0.034, stage);
      }
      setProgress(prog);
    }

    function discIds() { return state.disc === true ? (talkId === "cover" ? [] : [talkId]) : (state.disc || []); }
    function discussionHTML(compact) {
      const found = discIds().map(findTalk).filter(Boolean), first = found[0] || info;
      const [l1, l2] = discLangs();
      const oneSession = found.every((f) => f.session === (first && first.session)), oneDay = found.every((f) => f.day === (first && first.day));
      const both = (m) => [...new Set([M.pick(m, l1), l2 ? M.pick(m, l2) : ""])].filter(Boolean).join(" · ");
      const kicker = !first ? both(conf.kicker) : oneSession ? [M.dayLabel(first.day, l1), both(first.session.name)].filter(Boolean).join(" · ") : oneDay ? M.dayLabel(first.day, l1) : both(conf.kicker);
      const people = found.length ? found.map((f) => {
        const t = f.talk, a = M.pick(t.title, t.from), b = M.pick(t.title, t.to);
        return '<div class="disc-p"><div class="speaker-s">' + esc(t.speaker) + '</div><div class="t1">' + esc(a) + "</div>" + (compact || a === b ? "" : '<div class="t2">' + esc(b) + "</div>") + "</div>";
      }).join("") : '<div class="disc-p"><div class="t1">' + esc(M.pick(conf.title, l1)) + (conf.big ? " " + esc(conf.big) : "") + "</div>" + (l2 && conf.title[l2] ? '<div class="t2">' + esc(conf.title[l2]) + "</div>" : "") + "</div>";
      const n = found.length, size = compact ? " side-disc" : n <= 1 ? "" : n <= 4 ? " many" : n <= 8 ? " many lots" : " many tons";
      const h1 = M.label(l1, "discussion"), h2 = l2 ? M.label(l2, "discussion") : "";
      return '<div class="cover disc' + size + '"><div class="kicker">' + esc(kicker) + '</div><div class="disc-h">' + esc(h1) + "</div>" + (h2 && h2 !== h1 ? '<div class="disc-h2">' + esc(h2) + "</div>" : "") + '<div class="rule"></div><div class="disc-list">' + people + "</div></div>";
    }
    function renderDiscussion() {
      const bar = document.querySelector(".bar"), stage = document.querySelector(".stage"), prog = document.querySelector(".foot i");
      bar.style.visibility = "hidden"; prog.parentNode.style.visibility = "hidden";
      stage.dataset.key = "";
      stage.innerHTML = discussionHTML(false);
      fitIn(stage.firstChild, 0.05, stage);
      stage.classList.toggle("disc-top", stage.firstChild.scrollHeight > stage.clientHeight * 0.92);
    }
    function renderPassage(cp) {
      const bar = document.querySelector(".bar"), stage = document.querySelector(".stage"), prog = document.querySelector(".foot i");
      const isSlide = cp.p.kind === "slide", sl = screenLang();
      bar.style.visibility = "visible"; prog.parentNode.style.visibility = "visible";
      bar.innerHTML = '<span class="who">' + (state.disc ? esc(M.label(discLangs()[0], "discussion")) + " · " : "") + (cp.p.author ? "<b>" + esc(cp.p.author) + "</b> &nbsp;·&nbsp; " : "") + esc(cp.p.ref) + '</span><span class="lang">' + esc(M.label(sl, isSlide ? "slide" : "passage")) + (cp.p.pages.length > 1 ? " · " + (cp.pg + 1) + "/" + cp.p.pages.length : "") + "</span>";
      if (isSlide) {
        const list = materialsFor(cp.src).filter((x) => x.kind === "slide").length;
        prog.style.width = (100 * (cp.k + 1) / Math.max(1, list)) + "%";
        const rk = "full|" + [cp.src, cp.k, Store.cachedURL(cp.p.img.media)].join("|");
        if (stage.dataset.key !== rk) {
          stage.dataset.key = rk;
          stage.innerHTML = '<div class="passage single slides"><div class="col"><div class="tx">' + slideImg(cp.p) + "</div></div></div>";
        }
        sizeSlides(stage.firstChild, stage.clientHeight * 0.99);
        return;
      }
      prog.style.width = (100 * (cp.pg + 1) / cp.p.pages.length) + "%";
      const one = fullLang(state.passMode);
      if (state.passView === "sheet") {
        const key = ["psheet", talkId, cp.src, cp.k, one, state.scale, conf.theme.size, window.innerHeight, window.innerWidth].join("|");
        if (stage.dataset.key !== key) {
          stage.dataset.key = key; colScrolled = {};
          stage.innerHTML = '<div class="passage-sheet col-sheet' + (one ? " single" : "") + '" lang="' + (one || "") + '">' + passSheetHTML(cp, one) + "</div>";
          stage.firstChild.style.fontSize = textBase(0.034) + "px";
        }
        markAndScroll(stage.firstChild, "pg", cp.pg, "P");
        return;
      }
      stage.dataset.key = "";
      if (one) {
        stage.innerHTML = '<div class="passage single"><div class="col b" lang="' + one + '"><div class="lab">' + esc(M.langName(one)) + '</div><div class="tx">' + passHTML(cp.p, cp.page, one) + "</div></div></div>";
        fitIn(stage.firstChild, 0.048, stage);
        return;
      }
      const a = readLang(), b = screenLang();
      stage.innerHTML = '<div class="passage"><div class="col a" lang="' + a + '"><div class="lab">' + esc(M.langName(a)) + '</div><div class="tx">' + passHTML(cp.p, cp.page, a) + '</div></div><div class="col b" lang="' + b + '"><div class="lab">' + esc(M.langName(b)) + '</div><div class="tx">' + passHTML(cp.p, cp.page, b) + "</div></div></div>";
      fitIn(stage.firstChild, 0.042, stage);
    }

    function applyDecor(scr) {
      const th = conf.theme;
      scr.classList.toggle("no-bar", !th.bar);
      scr.classList.toggle("no-progress", !th.progress);
      let logo = scr.querySelector(".logo");
      if (th.logo && th.logo.media) {
        if (!logo) { logo = document.createElement("img"); logo.alt = ""; scr.append(logo); }
        logo.className = "logo " + (th.logo.pos || "tr") + (th.logo.coverOnly ? " cover-only" : "");
        logo.style.setProperty("--logo-h", (th.logo.size || 7) + "vh");
        Store.mediaURL(th.logo.media).then((u) => { if (logo.getAttribute("src") !== u) logo.src = u; });
      } else if (logo) logo.remove();
      const bg = scr.querySelector(".cover-bg");
      if (th.coverBg && th.coverBg.media) {
        bg.style.setProperty("--cover-dim", th.coverBg.dim === undefined ? 0.7 : th.coverBg.dim);
        Store.mediaURL(th.coverBg.media).then((u) => { bg.style.backgroundImage = "url('" + u + "')"; });
      } else bg.style.backgroundImage = "none";
      scr.classList.toggle("has-bg", !!(th.coverBg && th.coverBg.media));
    }

    function renderScreen() {
      L.Theme.apply(conf.theme, state.theme);
      document.documentElement.dataset.theme = state.theme;
      const scr = document.querySelector(".screen"), sheetMode = state.view === "sheet" && talkId !== "cover" && !state.scene && slides.some((s) => s.type === "text");
      applyDecor(scr);
      scr.classList.toggle("sheet-mode", sheetMode);
      document.querySelector(".blackout").classList.toggle("on", state.black);
      const cp = curPass();
      scr.classList.toggle("disc-mode", !!state.disc && !cp);
      scr.classList.toggle("pass-mode", !!cp);
      scr.classList.toggle("side-mode", !!cp && !isFull(state.passMode));
      const sl = slides[state.i] || slides[0];
      const isCover = state.scene === "conf" || (!cp && !sheetMode && (state.disc || sl.type === "cover" || sl.type === "conf"));
      scr.classList.toggle("on-cover", !!isCover);
      if (state.scene === "conf") { const b = document.querySelector(".bar"); b.style.visibility = "hidden"; document.querySelector(".foot").style.visibility = "hidden"; const st = document.querySelector(".stage"); st.dataset.key = ""; st.innerHTML = confHTML(); return; }
      if (state.disc && !cp) { renderDiscussion(); return; }
      if (cp && !isFull(state.passMode)) { renderSide(cp); return; }
      if (cp) { renderPassage(cp); return; }
      if (sheetMode) { renderSheet(); return; }
      const bar = document.querySelector(".bar"), stage = document.querySelector(".stage"), prog = document.querySelector(".foot i");
      if (sl.type === "conf") {
        bar.style.visibility = "hidden"; stage.dataset.key = ""; stage.innerHTML = confHTML(); prog.parentNode.style.visibility = "hidden";
        return;
      }
      bar.style.visibility = sl.type === "cover" ? "hidden" : "visible";
      prog.parentNode.style.visibility = sl.type === "cover" ? "hidden" : "visible";
      bar.innerHTML = barHTML();
      stage.dataset.key = "";
      if (sl.type === "cover") { stage.innerHTML = coverHTML(sl.end); return; }
      stage.innerHTML = '<div class="text' + (sl.type === "section" ? " section" : "") + '">' + esc(sl.t) + "</div>";
      setProgress(prog);
      fit(stage.firstChild, stage);
    }

    let startTime = null, regiaScrollLock = false, screenTalk = null;
    let regiaBi = store(BI) === "1", biScrolled = false;
    let passOpen = false, passScope = null, passBuf = "", passTmo = null, passIndex = [], discOpen = false, fixOpen = false;

    function statusText(other, cpS) {
      if (other) return "Schermo su un altro intervento";
      if (state.black) return "Schermo nero";
      const what = (c) => (c.p.kind === "slide" ? "slide" : "citazione") + (isFull(state.passMode) ? " a tutto schermo" : " accanto al testo");
      if (state.disc) return "Discussione · " + (cpS ? what(cpS) : discIds().length + (discIds().length === 1 ? " relatore" : " relatori"));
      if (cpS) return what(cpS).charAt(0).toUpperCase() + what(cpS).slice(1);
      return state.view === "sheet" ? "Testo · foglio unico" : "Testo · a schermate";
    }
    const segH = (label, items, cur, fn) => '<div class="seg" role="group" aria-label="' + label + '"><span>' + label + "</span>" + items.map((m) =>
      '<button class="' + (cur === m[0] ? "on" : "") + '" aria-pressed="' + (cur === m[0]) + '" onclick="window.' + fn + "('" + m[0] + "')\">" + m[1] + "</button>").join("") + "</div>";

    function renderRegia() {
      document.documentElement.dataset.theme = state.theme;
      const sl = slides[state.i] || {}, nx = slides[state.i + 1] || {};
      const orig = (s) => {
        if (!s.type) return "Fine della scaletta";
        if (s.type === "conf") return "Copertina della conferenza";
        if (s.type === "cover") return s.end ? "Fine dell'intervento" : "Titolo dell'intervento";
        return s.o;
      };
      document.getElementById("cur-o").textContent = orig(sl);
      document.getElementById("next-o").textContent = orig(nx);
      document.getElementById("counter").textContent = state.i + " / " + (slides.length - 1);
      const miss = document.getElementById("missbar");
      miss.style.display = sl.missing ? "" : "none";
      if (sl.missing) miss.textContent = "Questa schermata non ha testo in " + M.langName(screenLang()) + ": sullo schermo va l'altra lingua.";
      const bs = document.getElementById("b-slides");
      if (bs) { bs.classList.toggle("on", !state.slidesOff); bs.setAttribute("aria-pressed", !state.slidesOff); bs.firstChild.textContent = state.slidesOff ? "Mostra slide " : "Nascondi slide "; }
      const bf = document.getElementById("b-fix");
      if (bf) bf.disabled = sl.seg === undefined;
      document.getElementById("b-black").classList.toggle("on", state.black);
      document.getElementById("b-black").setAttribute("aria-pressed", state.black);
      document.getElementById("b-disc").classList.toggle("on", !!state.disc);
      document.getElementById("b-disc").setAttribute("aria-pressed", !!state.disc);
      const other = screenTalk && screenTalk !== talkId, ob = document.getElementById("otherbar");
      ob.style.display = other ? "" : "none";
      if (other) {
        const ot = screenTalk === "cover" ? null : findTalk(screenTalk);
        ob.innerHTML = "<span>Sullo schermo c'è ancora <b>" + esc(ot ? ot.talk.speaker : screenTalk === "cover" ? "la copertina della conferenza" : screenTalk) + "</b>. Questo intervento comparirà al primo «Avanti».</span>" +
          '<button onclick="window.__send()">Porta questo intervento sullo schermo</button>';
      }
      document.getElementById("blackbar").style.display = state.black && !other ? "" : "none";
      [["sv-slides", state.view === "slides"], ["sv-sheet", state.view === "sheet"], ["rv-panels", !regiaBi], ["rv-bi", regiaBi]].forEach((x) => {
        const b = document.getElementById(x[0]); b.classList.toggle("on", x[1]); b.setAttribute("aria-pressed", x[1]);
      });
      const cpS = curPass(), st = document.getElementById("status");
      st.className = "status" + (other ? " other" : state.black ? " black" : state.disc || cpS ? " pass" : "");
      st.textContent = statusText(other, cpS);
      document.getElementById("pv-state").textContent = st.textContent;
      document.querySelector(".regia").classList.toggle("bi", regiaBi);

      const extras = document.getElementById("extras");
      if (info) {
        const langs = M.talkLangs(info.talk), decks = info.talk.decks || [];
        extras.innerHTML = (langs.length > 1 ? segH("Lingua sullo schermo", langs.map((c) => [c, esc(c.toUpperCase())]), screenLang(), "__lang") : "") +
          (decks.length > 1 ? segH("Serie di slide", decks.map((d) => [d.id, esc(d.name || "Serie") + (deckOf(info.talk).id === d.id ? " <kbd>O</kbd>" : "")]), deckOf(info.talk).id, "__deck") : "");
      }

      const cp = cpS, pb = document.getElementById("passbar");
      pb.style.display = cp ? "" : "none";
      if (cp) {
        const a = readLang(), b = screenLang(), up = (c) => esc(c.toUpperCase());
        const isSlide = cp.p.kind === "slide";
        const opts = isSlide
          ? segH("Slide", [["side-t", "Accanto al testo"], ["full", "A tutto schermo"]], isFull(state.passMode) ? "full" : "side-t", "__pm")
          : segH("Tutto schermo", [["full", up(a) + " + " + up(b)], ["full-o", "solo " + up(a)], ["full-t", "solo " + up(b)]], state.passMode, "__pm") +
            segH("Accanto al testo", [["side-o", up(a)], ["side-t", up(b)]], state.passMode, "__pm") +
            segH("Citazione", [["pages", "A pagine"], ["sheet", "Foglio unico"]], state.passView, "__pv");
        const preview = isSlide ? '<img class="thumb" alt="" src="' + esc(Store.cachedURL(cp.p.img.media)) + '">' : '<div class="pv">' + esc(pageText(cp.page, /-o$/.test(state.passMode) ? a : b)) + "</div>";
        pb.innerHTML = '<div class="pb-main"><div class="pb-title"><b>' + (isSlide ? "" : "Citazione") + "</b> " + (cp.src !== talkId && findTalk(cp.src) ? "(" + esc(findTalk(cp.src).talk.speaker) + ") " : "") + esc(cp.p.ref) + (cp.p.pages.length > 1 ? ' <span class="pg">pagina ' + (cp.pg + 1) + " di " + cp.p.pages.length + "</span>" : "") + "</div>" +
          preview + '<div class="pb-opts">' + opts + "</div>" +
          (!isFull(state.passMode) && !slidesOnly() ? '<p class="hint">«Avanti» continua il testo. ' + (syncSlides() && isSlide ? "La slide cambia da sola dove il testo lo indica. " : "") + 'A mano: <kbd>J</kbd> e <kbd>K</kbd>.</p>' : "") + "</div>" +
          '<div class="pbtn"><div class="row"><button onclick="window.__pj(-1)" title="Elemento precedente (H)">⏮</button><button onclick="window.__pf(-1)" title="Indietro (K)">◀</button><button onclick="window.__pf(1)" title="Avanti (J)">▶</button><button onclick="window.__pj(1)" title="Elemento successivo (L)">⏭</button></div>' +
          '<button class="big" onclick="window.__fx()">Togli <kbd>X</kbd></button></div>';
      }
      document.querySelectorAll("#passpanel .pi").forEach((el) => el.classList.toggle("cur", !!cp && +el.dataset.k === cp.k && el.dataset.src === cp.src));
      if (regiaBi) {
        let curRow = null;
        document.querySelectorAll("#bilingual .row").forEach((r) => {
          const i = +r.dataset.i; r.classList.toggle("cur", i === state.i); r.classList.toggle("past", i < state.i);
          if (i === state.i) curRow = r;
        });
        if (curRow && !regiaScrollLock) {
          const box = document.getElementById("bilingual");
          const top = curRow.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - box.clientHeight * 0.3;
          box.scrollTo({ top: Math.max(0, top), behavior: !biScrolled || Math.abs(top - box.scrollTop) > box.clientHeight * 1.5 ? "auto" : "smooth" });
          biScrolled = true;
        }
      }
      document.querySelectorAll(".list li").forEach((li) => li.classList.toggle("cur", +li.dataset.i === state.i));
      const cur = document.querySelector(".list li.cur"), listBox = document.getElementById("list");
      if (cur && !regiaScrollLock && !regiaBi) listBox.scrollTop = cur.offsetTop - listBox.offsetTop - listBox.clientHeight / 2;
    }

    window.__send = () => { broadcast(); render(); };
    window.__fx = () => closePass();
    window.__pall = () => { passScope = "all"; passBuf = ""; buildPassPanel(); };
    window.__tp = () => togglePassPanel();
    window.__lang = (c) => { if (c !== screenLang()) setLang(c); };
    window.__deck = (id) => setDeck(id);

    function togglePassPanel(force, scope) {
      passOpen = typeof force === "boolean" ? force : !passOpen;
      if (passOpen) { passScope = scope || null; buildPassPanel(); }
      document.querySelector(".regia").classList.toggle("passopen", passOpen);
      passBuf = ""; clearTimeout(passTmo); showPassBuf();
    }
    function showPassBuf() { const el = document.getElementById("ppnum"); if (el) el.textContent = passBuf ? "Numero " + passBuf + "…" : ""; }
    function pickPass(n) {
      passBuf = ""; clearTimeout(passTmo); showPassBuf();
      const it = passIndex[n - 1]; if (!it) return;
      if (it.speaker) { passScope = it.speaker; buildPassPanel(); return; }
      showPass(it.k, 0, it.src); togglePassPanel(false);
    }
    function passDigit(d) {
      passBuf += d; showPassBuf(); clearTimeout(passTmo);
      const n = parseInt(passBuf, 10), max = passIndex.length;
      if (n * 10 > max || n === 0) pickPass(n);
      else passTmo = setTimeout(() => pickPass(parseInt(passBuf, 10)), 1200);
    }
    function preloadMedia(src) {
      return Promise.all(materialsFor(src).filter((x) => x.kind === "slide").map((x) => Store.mediaURL(x.img.media)));
    }
    function buildPassPanel() {
      const el = document.getElementById("passpanel");
      if (passScope === "all") { buildSpeakerPanel(el); return; }
      const srcs = passScope ? [passScope] : state.disc ? discIds().filter((id) => id !== "cover") : (talkId === "cover" ? [] : [talkId]);
      if (!passScope && state.disc && srcs.indexOf(talkId) < 0 && talkId !== "cover") srcs.unshift(talkId);
      const groups = srcs.map((id) => ({ id, list: materialsFor(id), f: findTalk(id) })).filter((g) => g.list.length);
      passIndex = [];
      const total = groups.reduce((a, g) => a + g.list.length, 0);
      const title = passScope ? '<button class="ppback" onclick="window.__pall()">‹ Relatori <kbd>⌫</kbd></button> ' + esc(groups.length && groups[0].f ? groups[0].f.talk.speaker : passScope) : state.disc ? "Slide e citazioni · discussione" : "Slide e citazioni";
      let html = '<div class="pphead"><b>' + title + "</b> <span>" + total + ' elementi · clic o numero per proiettarli</span><b id="ppnum" class="ppnum" aria-live="polite"></b><button onclick="window.__tp()">Chiudi <kbd>Esc</kbd></button></div>';
      if (!total) html += '<p class="none">' + (state.disc ? "Gli interventi in discussione non hanno slide né citazioni. Maiusc+G le cerca in tutta la conferenza." : "Questo intervento non ha slide né citazioni. Le carichi dalla sua pagina, oppure Maiusc+G le cerca in tutta la conferenza.") + "</p>";
      const rl = readLang();
      groups.forEach((g) => {
        if (!passScope && (groups.length > 1 || state.disc)) html += '<div class="pgroup">' + esc(g.f ? g.f.talk.speaker : g.id) + "</div>";
        g.list.forEach((p, k) => {
          passIndex.push({ src: g.id, k });
          const preview = p.kind === "slide" ? '<img alt="" loading="lazy" data-media="' + esc(p.img.media) + '" src="' + esc(Store.cachedURL(p.img.media)) + '">' : '<div class="ex">' + esc(pageText(p.pages[0], rl).slice(0, 160)) + "…</div>";
          html += '<div class="pi" data-k="' + k + '" data-src="' + esc(g.id) + '"><div class="ref">' + passIndex.length + ". " + esc(p.ref) + (p.pages.length > 1 ? " · " + p.pages.length + " pag." : "") + "</div>" + preview + "</div>";
        });
      });
      el.innerHTML = html;
      groups.forEach((g) => preloadMedia(g.id).then(() => el.querySelectorAll("img[data-media]").forEach((im) => { if (!im.getAttribute("src")) im.src = Store.cachedURL(im.dataset.media); })));
      if (!el.dataset.wired) {
        el.dataset.wired = "1";
        el.addEventListener("click", (e) => {
          const pi = e.target.closest(".pi");
          if (pi && pi.dataset.speaker) { passScope = pi.dataset.speaker; buildPassPanel(); return; }
          if (pi) { showPass(+pi.dataset.k, 0, pi.dataset.src); togglePassPanel(false); }
        });
      }
      const cp = curPass();
      el.querySelectorAll(".pi").forEach((x) => x.classList.toggle("cur", !!cp && +x.dataset.k === cp.k && x.dataset.src === cp.src));
    }
    function buildSpeakerPanel(el) {
      passIndex = [];
      let html = '<div class="pphead"><b>Tutti i relatori</b> <span>scegli il relatore (clic o numero), poi l\'elemento</span><b id="ppnum" class="ppnum" aria-live="polite"></b><button onclick="window.__tp()">Chiudi <kbd>Esc</kbd></button></div>';
      M.talks(conf).forEach((f) => {
        const list = materialsFor(f.talk.id);
        if (!list.length) return;
        passIndex.push({ speaker: f.talk.id });
        const nS = list.filter((x) => x.kind === "slide").length, nC = list.length - nS;
        const what = [nS ? nS + " slide" : "", nC ? nC + (nC === 1 ? " citazione" : " citazioni") : ""].filter(Boolean).join(", ");
        html += '<div class="pi ps" data-speaker="' + esc(f.talk.id) + '"><div class="ref">' + passIndex.length + ". " + esc(f.talk.speaker) + '</div><div class="ex">' + what + " · " + esc(M.pick(f.session.name, conf.languages[0])) + "</div></div>";
      });
      if (!passIndex.length) html += '<p class="none">Nessun intervento ha ancora slide o citazioni.</p>';
      el.innerHTML = html;
    }
    function toggleBi() { biScrolled = false; regiaBi = !regiaBi; store(BI, regiaBi ? "1" : "0"); render(); }
    function buildBilingual() {
      const el = document.getElementById("bilingual"), t = info ? info.talk : null;
      if (!t) { el.innerHTML = ""; return; }
      let html = '<div class="row head"><div>' + esc(M.langName(readLang())) + " · testo del relatore</div><div>" + esc(M.langName(screenLang())) + " · sullo schermo</div></div>";
      slides.forEach((sl, i) => {
        let o, tr, cls = "row";
        if (sl.type === "cover") { o = sl.end ? "Fine dell'intervento" : "Titolo dell'intervento"; tr = titleOn(t, screenLang()); cls += " meta"; }
        else { o = sl.o; tr = sl.t; if (sl.type === "section") cls += " h"; }
        html += '<div class="' + cls + '" data-i="' + i + '"><span class="n">' + i + '</span><div class="o">' + slideTag(sl, i) + esc(o) + '</div><div class="t">' + esc(tr) + "</div></div>";
      });
      el.innerHTML = html;
    }
    function slideTag(sl, i) {
      return syncSlides() && sl.f !== undefined && sl.type !== "deck" && (i < 2 || slideOf(i - 1) !== sl.f) ? '<b class="slide-tag">Slide ' + (sl.f + 1) + "</b> " : "";
    }
    function buildList() {
      const ul = document.getElementById("list");
      ul.innerHTML = slides.map((s, i) => {
        const label = s.type === "text" || s.type === "section" || s.type === "deck" ? s.o : s.type === "conf" ? "Copertina della conferenza" : s.end ? "Fine dell'intervento" : "Titolo dell'intervento";
        return '<li data-i="' + i + '" class="' + (s.type === "section" ? "h" : "") + '"><span>' + i + "</span><div>" + slideTag(s, i) + esc(label) + "</div></li>";
      }).join("");
    }

    function render() { if (mode === "screen") renderScreen(); else renderRegia(); }

    // Sincronizzazione tra finestre: localStorage (evento + controllo periodico, per i browser che non inviano l'evento su file://),
    // BroadcastChannel e postMessage. Vale solo il messaggio più recente.
    let child = null, lastTs = Date.now(), bc = null;
    if (!sample) {
      try { bc = new BroadcastChannel("diglot-sync-" + confId); bc.onmessage = (e) => apply(e.data); } catch (e) { bc = null; }
    }
    function rememberPos(t, i) { store(POS(t), JSON.stringify({ i, ts: Date.now() })); }
    function broadcast() {
      if (preview) return;
      rememberPos(talkId, state.i); screenTalk = talkId;
      const msg = { t: talkId, i: state.i, disc: state.disc, pass: state.pass, passMode: state.passMode, passView: state.passView, slidesOff: state.slidesOff, lang: state.lang, deck: state.deck, black: state.black, theme: state.theme, scale: state.scale, view: state.view, ts: Math.max(Date.now(), lastTs + 1), src: me };
      lastTs = msg.ts;
      store(KEY, JSON.stringify(msg));
      try { if (bc) bc.postMessage(msg); } catch (e) { /* restano localStorage e postMessage */ }
      store(PREFS, JSON.stringify({ theme: state.theme, scale: state.scale, view: state.view, passMode: state.passMode, passView: state.passView }));
      try { if (child && !child.closed) child.postMessage({ diglot: msg }, "*"); } catch (e) { /* finestra chiusa */ }
      try { if (window.opener) window.opener.postMessage({ diglot: msg }, "*"); } catch (e) { /* finestra chiusa */ }
    }
    function gotoTalk(id, i) {
      const q = new URLSearchParams({ c: confId, t: id, i: String(i) });
      if (route.teams === "1") q.set("teams", "1");
      if (preview) q.set("preview", "1");
      location.hash = "#/play?" + q.toString();
      location.reload();
    }
    function apply(msg) {
      if (!msg || msg.src === me || !(msg.ts > lastTs)) return;
      lastTs = msg.ts;
      if (mode === "regia" && msg.t !== screenTalk) { screenTalk = msg.t; render(); }
      if (msg.t !== talkId) { if (mode === "screen") gotoTalk(msg.t, msg.i); return; }
      const relang = (msg.lang || null) !== state.lang || (msg.deck || null) !== state.deck;
      state.lang = msg.lang || null; state.deck = msg.deck || null;
      if (relang) dataChanged();
      state.i = Math.max(0, Math.min(slides.length - 1, msg.i)); state.pass = msg.pass || null; state.passMode = msg.passMode || state.passMode; state.passView = msg.passView || state.passView;
      state.slidesOff = !!msg.slidesOff; state.black = !!msg.black; state.disc = msg.disc || false; state.theme = msg.theme || state.theme; state.scale = msg.scale || state.scale; state.view = msg.view || state.view;
      if (state.pass && state.pass[2] && state.pass[2] !== talkId) preloadMedia(state.pass[2]).then(render);
      render();
    }
    if (!sample) {
      window.addEventListener("storage", (e) => { if (e.key === KEY && e.newValue) { try { apply(JSON.parse(e.newValue)); } catch (x) { /* messaggio illeggibile */ } } });
      setInterval(() => { try { const m = JSON.parse(store(KEY) || "null"); if (m) apply(m); } catch (e) { /* messaggio illeggibile */ } }, 400);
    }
    window.addEventListener("message", (e) => {
      if (!e.data) return;
      if (e.data.diglot) apply(e.data.diglot);
      if (sample && e.data.diglotTheme) {
        conf.theme = L.Theme.normalize(e.data.diglotTheme);
        state.theme = conf.theme.mode;
        L.Theme.loadCustomFonts(conf.theme).then(render);
        document.querySelectorAll(".stage").forEach((s) => { s.dataset.key = ""; });
        sheetKey = null;
        render();
      }
      if (sample && e.data.diglotScene) setScene(e.data.diglotScene);
    });

    // Una correzione fatta altrove (regia, Programma, Grafica) arriva subito anche allo schermo aperto.
    function dataChanged() {
      info = talkId === "cover" ? null : findTalk(talkId);
      if (talkId !== "cover" && !info) return;
      buildSlides();
      state.i = Math.min(state.i, slides.length - 1);
      sheetKey = null;
      if (mode === "screen") { const st = document.querySelector(".stage"); if (st) st.dataset.key = ""; }
      else if (document.getElementById("list")) { buildList(); buildBilingual(); if (passOpen) buildPassPanel(); }
      if (info) preloadMedia(talkId).then(render);
    }
    let knownRev = Store.revision(confId);
    async function reloadConf() {
      const fresh = await Store.getConference(confId);
      if (!fresh) return;
      conf = M.normalize(fresh);
      await L.Theme.loadCustomFonts(conf.theme);
      dataChanged();
      render();
    }
    if (!sample) {
      Store.onChange((id, rev) => { if (id === confId && String(rev) !== knownRev) { knownRev = String(rev); reloadConf(); } });
      setInterval(() => { const r = Store.revision(confId); if (r !== knownRev) { knownRev = r; reloadConf(); } }, 700);
    }

    function go(i) {
      const n = Math.max(0, Math.min(slides.length - 1, i));
      if (n !== state.i && startTime === null && n > 0) startTime = Date.now();
      const foreign = state.pass && state.pass[2] && state.pass[2] !== talkId, prevSlide = slideOf(state.i);
      state.i = n; state.black = false; state.disc = false;
      // La slide cambia solo dove il testo lo indica: nel frattempo restano valide le scelte della regia.
      if (syncSlides()) { if (foreign || slideOf(n) !== prevSlide) syncPass(); }
      else if (isFull(state.passMode) || foreign) state.pass = null;
      render(); broadcast();
    }
    function slideOf(i) { const f = (slides[i] || {}).f; return f === undefined ? null : f; }
    function syncPass() {
      const f = slideOf(state.i);
      state.pass = f === null || state.slidesOff ? null : [f, 0, talkId];
      state.passView = "pages";
    }
    function showPass(k, pg, src) {
      src = src || (state.pass && state.pass[2]) || talkId;
      const p = materialsFor(src)[k]; if (!p) return;
      state.pass = [k, Math.max(0, Math.min(p.pages.length - 1, pg || 0)), src]; state.black = false;
      if (p.kind === "slide" && slides[state.i] && slides[state.i].type === "cover" && !isFull(state.passMode)) state.passMode = "side-t";
      preloadMedia(src).then(render);
      render(); broadcast();
    }
    function passStep(d) { const cp = curPass(); if (!cp) return; const n = cp.pg + d; if (n < 0 || n >= cp.p.pages.length) return; showPass(cp.k, n, cp.src); }
    function passFlow(d) {
      const cp = curPass();
      if (!cp) return;
      const list = materialsFor(cp.src), n = cp.pg + d;
      if (n >= 0 && n < cp.p.pages.length) { showPass(cp.k, n, cp.src); return; }
      const k = cp.k + d; if (k < 0 || k >= list.length) return;
      showPass(k, d > 0 ? 0 : list[k].pages.length - 1, cp.src);
    }
    function passJump(d) {
      const cp = curPass(); if (!cp) return;
      const list = materialsFor(cp.src), k = cp.k + d;
      if (k < 0 || k >= list.length) return;
      showPass(k, 0, cp.src);
    }
    window.__pf = passFlow; window.__pj = passJump;
    function setPassMode(m) { state.passMode = m; render(); broadcast(); }
    window.__pm = setPassMode;
    window.__pv = (v) => { state.passView = v; render(); broadcast(); };
    function closePass() { state.pass = null; render(); broadcast(); }
    function toggleSlides() { if (!syncSlides()) return; state.slidesOff = !state.slidesOff; syncPass(); render(); broadcast(); }
    function toggleBlack() { state.black = !state.black; render(); broadcast(); }
    function setLang(code) { state.lang = code === info.talk.to ? null : code; dataChanged(); render(); broadcast(); }
    function setDeck(id) { state.deck = id; dataChanged(); render(); broadcast(); }
    function cycleDeck() {
      const decks = info ? info.talk.decks || [] : [];
      if (decks.length < 2) return;
      setDeck(decks[(decks.findIndex((d) => d.id === deckOf(info.talk).id) + 1) % decks.length].id);
    }
    function sessionTalkIds() { return info ? info.session.talks.map((t) => t.id) : []; }
    function setDisc(ids) {
      state.disc = ids && ids.length ? ids : false;
      if (state.disc) {
        state.black = false;
        if (syncSlides()) state.pass = null;  // la slide legata al testo non serve in discussione; con G se ne richiama una
      } else if (state.pass && state.pass[2] && state.pass[2] !== talkId) state.pass = null;
      if (!state.disc && syncSlides()) syncPass();
      if (passOpen) buildPassPanel();
      render(); broadcast();
    }
    function toggleDisc() {
      if (state.disc) { setDisc(false); return; }
      if (mode === "regia") openDiscDlg(); else setDisc(sessionTalkIds().length ? sessionTalkIds() : [talkId]);
    }
    function openDiscDlg() {
      const dlg = document.getElementById("discdlg"), sess = info ? info.session : null, day = info ? info.day : null, l1 = conf.languages[0];
      const rows = [], seen = {};
      const add = (t, s, checked, group) => { if (seen[t.id]) return; seen[t.id] = 1; rows.push({ t, s, checked, group }); };
      if (sess) sess.talks.forEach((t) => add(t, sess, true, "Questa sessione"));
      conf.days.forEach((d) => { if (day && d !== day) return; d.sessions.forEach((s) => s.talks.forEach((t) => add(t, s, false, day ? "Altri relatori della giornata" : "Relatori"))); });
      let html = '<div class="dd-box" role="dialog" aria-modal="true" aria-labelledby="dd-h"><h3 id="dd-h">Discussione: chi partecipa?</h3>' +
        '<p class="dd-help">Spunta i relatori (oppure premi il numero), poi <kbd>Invio</kbd> o «Mostra discussione». <kbd>Esc</kbd> annulla.</p><div class="dd-list">';
      let lastGroup = "";
      rows.forEach((r, i) => {
        if (r.group !== lastGroup) { html += '<div class="dd-group">' + r.group + "</div>"; lastGroup = r.group; }
        html += '<label class="dd-row"><span class="dd-n">' + (i + 1) + '</span><input type="checkbox" value="' + esc(r.t.id) + '"' + (r.checked ? " checked" : "") + "><span><b>" + esc(r.t.speaker) + "</b> <small>" + esc(r.s.time) + " · " + esc(M.pick(r.s.name, l1)) + "</small><em>" + esc(M.pick(r.t.title, r.t.from)) + "</em></span></label>";
      });
      html += '</div><div class="dd-actions"><button class="dd-cancel">Annulla</button><button class="dd-ok">Mostra discussione</button></div></div>';
      dlg.innerHTML = html; dlg.classList.add("on"); discOpen = true;
      dlg.querySelector(".dd-ok").onclick = confirmDisc;
      dlg.querySelector(".dd-cancel").onclick = closeDiscDlg;
      dlg.onclick = (e) => { if (e.target === dlg) closeDiscDlg(); };
      setTimeout(() => dlg.querySelector(".dd-ok").focus(), 0);
    }
    function closeDiscDlg() { const dlg = document.getElementById("discdlg"); dlg.classList.remove("on"); dlg.innerHTML = ""; discOpen = false; }
    function confirmDisc() {
      const ids = [].map.call(document.querySelectorAll("#discdlg input:checked"), (x) => x.value);
      closeDiscDlg(); setDisc(ids.length ? ids : talkId === "cover" ? false : [talkId]);
    }

    // Correzione in sala: un refuso si sistema senza uscire dalla regia, e lo schermo lo mostra subito.
    function openFix() {
      const sl = slides[state.i];
      if (!sl || sl.seg === undefined) return;
      const seg = info.talk.segments[sl.seg], rl = readLang(), scr = screenLang();
      const dlg = document.getElementById("fixdlg");
      dlg.innerHTML = '<div class="dd-box" role="dialog" aria-modal="true" aria-labelledby="fx-h"><h3 id="fx-h">Correggi la schermata ' + state.i + '</h3><p class="dd-help">La correzione va subito sullo schermo e resta nel programma. <kbd>Esc</kbd> annulla.</p>' +
        '<div class="fix-fields"><label>' + esc(M.langName(scr)) + ' · sullo schermo<textarea id="fx-t"></textarea></label><label>' + esc(M.langName(rl)) + ' · testo del relatore<textarea id="fx-o"></textarea></label></div>' +
        '<div class="dd-actions"><button class="dd-cancel">Annulla</button><button class="dd-ok">Salva la correzione</button></div></div>';
      dlg.classList.add("on"); fixOpen = true;
      const a = document.getElementById("fx-t"), b = document.getElementById("fx-o");
      a.value = seg.text[scr] || ""; b.value = seg.text[rl] || "";
      const close = () => { dlg.classList.remove("on"); dlg.innerHTML = ""; fixOpen = false; };
      dlg.querySelector(".dd-cancel").onclick = close;
      dlg.onclick = (e) => { if (e.target === dlg) close(); };
      dlg.onkeydown = (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
      dlg.querySelector(".dd-ok").onclick = async () => {
        const fresh = M.normalize(await Store.getConference(confId));
        const f = M.find(fresh, talkId);
        if (!f || !f.talk.segments[sl.seg]) { close(); return; }
        const s = f.talk.segments[sl.seg];
        s.text[scr] = a.value.trim();
        if (b.value.trim() || s.text[rl]) s.text[rl] = b.value.trim();
        delete s.check;
        await Store.putConference(fresh);
        knownRev = Store.revision(confId);
        conf = fresh;
        dataChanged();
        close();
        render();
      };
      setTimeout(() => a.focus(), 0);
    }
    function toggleTheme() { state.theme = state.theme === "dark" ? "light" : "dark"; render(); broadcast(); }
    function toggleView() { state.view = state.view === "sheet" ? "slides" : "sheet"; render(); broadcast(); }
    function scaleBy(f) { state.scale = Math.max(0.6, Math.min(1.6, state.scale * f)); sheetKey = null; render(); broadcast(); }
    function playHash(id, extra) { return "#/play?" + new URLSearchParams(Object.assign({ c: confId, t: id }, extra || {})).toString(); }
    function openRegia() {
      child = window.open(L.planUrl(playHash(talkId, { mode: "regia" })), "diglot-regia", "width=1300,height=850");
      setTimeout(broadcast, 800);
    }
    function fullscreen() {
      const d = document, el = d.documentElement;
      try {
        const r = d.fullscreenElement || d.webkitFullscreenElement ? (d.exitFullscreen || d.webkitExitFullscreen).call(d) : (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        if (r && r.catch) r.catch(() => {});
      } catch (e) { /* schermo intero non disponibile: resta la finestra */ }
    }

    let numBuf = "", numTmo = null;
    document.addEventListener("keydown", (e) => {
      if (preview) return;
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
      const k = e.key;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (fixOpen) return;
      // Chi naviga con la tastiera attiva pulsanti e link con Invio e Spazio: non devono mandare avanti il testo.
      if ((k === "Enter" || k === " ") && e.target.closest && e.target.closest("button, a, summary, select, label")) return;
      if (mode === "regia" && discOpen) {
        if (/^[0-9]$/.test(k)) { const cb = document.querySelectorAll("#discdlg input")[parseInt(k, 10) - 1]; if (cb) cb.checked = !cb.checked; e.preventDefault(); return; }
        if (k === "Enter") { e.preventDefault(); confirmDisc(); return; }
        if (k === "Escape" || k === "q" || k === "Q") { e.preventDefault(); closeDiscDlg(); return; }
        return;
      }
      if (mode === "regia" && passOpen) {
        if (/^[0-9]$/.test(k)) { e.preventDefault(); passDigit(k); return; }
        if (k === "Enter" && passBuf) { e.preventDefault(); pickPass(parseInt(passBuf, 10)); return; }
        if (k === "Escape") { e.preventDefault(); togglePassPanel(false); return; }
        if (k === "Backspace" && passScope && passScope !== "all") { e.preventDefault(); window.__pall(); return; }
      }
      if (/^[0-9]$/.test(k)) { numBuf += k; clearTimeout(numTmo); numTmo = setTimeout(() => { numBuf = ""; }, 2500); return; }
      if (k === "Enter" && numBuf) { go(parseInt(numBuf, 10)); numBuf = ""; e.preventDefault(); return; }
      numBuf = "";
      if (e.shiftKey && (k === "ArrowRight" || k === "ArrowLeft")) { e.preventDefault(); passFlow(k === "ArrowRight" ? 1 : -1); return; }
      if (e.shiftKey && (k === "ArrowDown" || k === "ArrowUp")) { e.preventDefault(); passJump(k === "ArrowDown" ? 1 : -1); return; }
      if (k === "j" || k === "J" || k === "k" || k === "K") { passFlow(k === "j" || k === "J" ? 1 : -1); return; }
      if (k === "h" || k === "H" || k === "l" || k === "L") { passJump(k === "l" || k === "L" ? 1 : -1); return; }
      const fwd = ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n", "N", "d", "D"].indexOf(k) >= 0, back = ["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p", "P", "a", "A"].indexOf(k) >= 0;
      if (state.pass && isFull(state.passMode) && !syncSlides() && (fwd || back)) { e.preventDefault(); passStep(fwd ? 1 : -1); return; }
      if (fwd) { e.preventDefault(); go(state.i + 1); }
      else if (back) { e.preventDefault(); go(state.i - 1); }
      else if (k === "x" || k === "X") closePass();
      else if ((k === "g" || k === "G") && mode === "regia") {
        if (e.shiftKey) { if (passOpen && passScope) togglePassPanel(false); else togglePassPanel(true, "all"); }
        else togglePassPanel(passOpen && passScope ? true : undefined);
      }
      else if (k === "Home") go(0);
      else if (k === "End") go(slides.length - 1);
      else if (k === "m" || k === "M") toggleSlides();
      else if (k === "o" || k === "O") cycleDeck();
      else if ((k === "e" || k === "E") && mode === "regia") { e.preventDefault(); openFix(); }
      else if (k === "b" || k === "B" || k === "." || k === "w" || k === "W") toggleBlack();
      else if (k === "t" || k === "T") toggleTheme();
      else if (k === "q" || k === "Q") toggleDisc();
      else if (k === "s" || k === "S") toggleView();
      else if ((k === "v" || k === "V") && mode === "regia") toggleBi();
      else if (k === "+" || k === "=") scaleBy(1.08);
      else if (k === "-" || k === "_") scaleBy(1 / 1.08);
      else if (k === "f" || k === "F") fullscreen();
      else if ((k === "r" || k === "R") && mode === "screen") openRegia();
    });

    function initScreen() {
      document.body.innerHTML = '<div class="screen"><div class="cover-bg"></div><div class="bar"></div><div class="stage"></div><div class="sheet"></div><div class="foot"><i></i></div></div><div class="blackout"></div>';
      const scr = document.querySelector(".screen");
      let tmo;
      document.addEventListener("mousemove", () => { scr.classList.add("show-cursor"); clearTimeout(tmo); tmo = setTimeout(() => scr.classList.remove("show-cursor"), 1500); });
      scr.addEventListener("click", (e) => {
        if (preview) return;
        const segc = e.target.closest(".seg");
        if (segc && segc.dataset.pg !== undefined && state.pass) { showPass(state.pass[0], +segc.dataset.pg); return; }
        if (segc && segc.dataset.i !== undefined) { go(+segc.dataset.i); return; }
        if (state.pass && isFull(state.passMode) && !syncSlides()) { passStep(e.clientX > window.innerWidth / 3 ? 1 : -1); return; }
        if (e.clientX > window.innerWidth / 3) go(state.i + 1); else go(state.i - 1);
      });
      window.addEventListener("resize", () => { document.querySelectorAll(".stage").forEach((s) => { s.dataset.key = ""; }); sheetKey = null; render(); });
    }

    function initRegia() {
      const t = info ? info.talk : null;
      document.title = "Regia · " + (t ? t.speaker || "Intervento" : "Copertina");
      let lastMsg = null; try { lastMsg = JSON.parse(store(KEY) || "null"); } catch (e) { lastMsg = null; }
      const pvTalk = lastMsg && lastMsg.t ? lastMsg.t : talkId;
      const who = t ? "parla in " + M.langName(t.from) + " · sullo schermo " + M.langName(t.to) : "pausa";
      document.body.innerHTML =
        '<div class="regia"><main>' +
        '<header class="rtop">' +
          '<a class="back" href="' + esc(L.planUrl("#/c/" + confId + "/sala")) + '" title="Torna alla sala">← Sala</a>' +
          "<div class=\"who\"><b>" + (t ? esc(t.speaker || "Intervento") : "Copertina") + "</b><span>" + esc(who) + "</span></div>" +
          '<button id="b-send" class="tool send" title="Porta questo intervento, a questo punto, sul proiettore">Mostra sullo schermo</button>' +
          '<div class="status" id="status" aria-live="polite"></div>' +
          '<div class="clock" id="clock"></div>' +
          '<div class="counter"><b id="counter"></b><span>schermata</span></div>' +
        "</header>" +
        '<div id="otherbar" class="otherbar" role="status"></div>' +
        '<div id="blackbar" class="blackbar" role="status">Lo schermo è nero. Premi <kbd>B</kbd> o «Avanti» per riaccenderlo.</div>' +
        '<div id="missbar" class="missbar" role="status"></div>' +
        '<div id="passbar" class="passbar"></div>' +
        '<div id="panels">' +
          '<section class="box cur"><h4>Ora il relatore legge</h4><div class="o" id="cur-o"></div></section>' +
          '<div class="transport">' +
            '<button id="b-prev" class="tbtn" title="Indietro (←, A, PagSu)">◀ Indietro</button>' +
            '<button id="b-next" class="tbtn primary" title="Avanti (→, D, Spazio, PagGiù)">Avanti ▶</button>' +
            '<label class="goto">Vai alla schermata <input id="goto" type="number" min="0" inputmode="numeric" aria-label="Numero della schermata"></label>' +
          "</div>" +
          '<section class="box next"><h4>Subito dopo</h4><div class="o" id="next-o"></div></section>' +
        "</div>" +
        '<div id="bilingual" class="bilingual"></div>' +
        '<div class="toolbar" role="toolbar" aria-label="Opzioni">' +
          '<div class="seg" role="group" aria-label="Vista della regia"><span>Regia</span><button id="rv-panels">Pannelli</button><button id="rv-bi">Testo a fronte <kbd>V</kbd></button></div>' +
          '<div class="seg" role="group" aria-label="Vista dello schermo"><span>Schermo</span><button id="sv-slides">A schermate</button><button id="sv-sheet">Foglio unico <kbd>S</kbd></button></div>' +
          '<span id="extras" style="display:contents"></span>' +
          '<button id="b-pass" class="tool">Slide e citazioni <kbd>G</kbd></button>' +
          (syncSlides() ? '<button id="b-slides" class="tool">Nascondi slide <kbd>M</kbd></button>' : "") +
          '<button id="b-disc" class="tool">Discussione <kbd>Q</kbd></button>' +
          '<button id="b-black" class="tool">Schermo nero <kbd>B</kbd></button>' +
          (t ? '<button id="b-fix" class="tool">Correggi <kbd>E</kbd></button>' : "") +
          '<button id="b-theme" class="tool" title="Chiaro o scuro (T)">Chiaro / scuro</button>' +
          '<span class="sizes"><button id="b-minus" class="tool" title="Testo più piccolo (−)">A−</button><button id="b-plus" class="tool" title="Testo più grande (+)">A+</button></span>' +
        "</div>" +
        '<details class="keys"><summary>Scorciatoie da tastiera</summary><dl>' +
          "<dt><kbd>→</kbd> <kbd>D</kbd> <kbd>Spazio</kbd> <kbd>PagGiù</kbd></dt><dd>avanti</dd><dt><kbd>←</kbd> <kbd>A</kbd> <kbd>PagSu</kbd></dt><dd>indietro</dd>" +
          "<dt>numero + <kbd>Invio</kbd></dt><dd>vai alla schermata</dd><dt><kbd>B</kbd></dt><dd>schermo nero</dd>" +
          "<dt><kbd>S</kbd></dt><dd>a schermate o foglio unico</dd><dt><kbd>V</kbd></dt><dd>testo a fronte in regia</dd>" +
          "<dt><kbd>E</kbd></dt><dd>correggi la schermata corrente</dd><dt><kbd>M</kbd></dt><dd>mostra o nascondi le slide legate al testo</dd>" +
          "<dt><kbd>G</kbd> + numero</dt><dd>elenco di slide e citazioni, proietta quella col numero</dd><dt><kbd>Maiusc</kbd>+<kbd>G</kbd></dt><dd>tutti i relatori: scegli il relatore, poi l'elemento; <kbd>⌫</kbd> torna ai relatori</dd>" +
          "<dt><kbd>J</kbd> <kbd>K</kbd></dt><dd>slide o pagina avanti e indietro</dd><dt><kbd>L</kbd> <kbd>H</kbd></dt><dd>elemento successivo e precedente</dd>" +
          "<dt><kbd>X</kbd></dt><dd>toglie slide o citazione</dd><dt><kbd>O</kbd></dt><dd>cambia serie di slide</dd>" +
          "<dt><kbd>Q</kbd></dt><dd>discussione: scegli i relatori (numeri o clic), <kbd>Invio</kbd>; di nuovo <kbd>Q</kbd> o «Avanti» per toglierla</dd><dt><kbd>T</kbd></dt><dd>chiaro o scuro</dd><dt><kbd>+</kbd> <kbd>−</kbd></dt><dd>dimensione del testo</dd>" +
        "</dl><p>Lo schermo del pubblico segue questa regia.</p></details>" +
        '</main><div id="passpanel" class="passpanel" role="dialog" aria-label="Slide e citazioni"></div><div id="discdlg" class="discdlg"></div><div id="fixdlg" class="fixdlg"></div>' +
        '<aside><div class="pv-wrap"><div class="pv-head"><span>Sullo schermo ora</span><span id="pv-state"></span></div>' +
          '<div class="pv-frame"><iframe id="pv" title="Anteprima dello schermo del pubblico" src="' + esc(L.planUrl(playHash(pvTalk, { preview: "1" }))) + '" tabindex="-1"></iframe></div></div>' +
          '<div class="search"><input id="q" type="search" placeholder="Cerca nel testo del relatore" aria-label="Cerca nel testo del relatore"></div><ul class="list" id="list"></ul></aside></div>';
      buildList();
      const ul = document.getElementById("list");
      const jump = (i) => { regiaScrollLock = true; go(i); regiaScrollLock = false; };
      ul.addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) jump(+li.dataset.i); });
      document.getElementById("bilingual").addEventListener("click", (e) => { const r = e.target.closest(".row[data-i]"); if (r) jump(+r.dataset.i); });
      document.getElementById("b-next").onclick = () => go(state.i + 1);
      document.getElementById("b-prev").onclick = () => go(state.i - 1);
      if (document.getElementById("b-slides")) document.getElementById("b-slides").onclick = toggleSlides;
      if (document.getElementById("b-fix")) document.getElementById("b-fix").onclick = openFix;
      document.getElementById("b-black").onclick = toggleBlack;
      document.getElementById("b-disc").onclick = toggleDisc;
      document.getElementById("b-theme").onclick = toggleTheme;
      document.getElementById("sv-slides").onclick = () => { if (state.view !== "slides") toggleView(); };
      document.getElementById("sv-sheet").onclick = () => { if (state.view !== "sheet") toggleView(); };
      document.getElementById("rv-panels").onclick = () => { if (regiaBi) toggleBi(); };
      document.getElementById("rv-bi").onclick = () => { if (!regiaBi) toggleBi(); };
      document.getElementById("goto").addEventListener("keydown", function (e) {
        if (e.key === "Enter") { const n = parseInt(this.value, 10); if (!isNaN(n)) go(n); this.value = ""; this.blur(); }
        if (e.key === "Escape") { this.value = ""; this.blur(); }
      });
      document.getElementById("b-pass").onclick = () => togglePassPanel();
      buildPassPanel();
      buildBilingual();
      // Dopo un clic col mouse le scorciatoie devono restare attive; da tastiera il fuoco resta dov'è.
      document.querySelector(".regia").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && e.detail > 0 && !b.closest(".fixdlg")) b.blur(); });
      document.getElementById("b-send").onclick = () => { broadcast(); render(); };
      document.getElementById("b-plus").onclick = () => scaleBy(1.08);
      document.getElementById("b-minus").onclick = () => scaleBy(1 / 1.08);
      document.getElementById("q").addEventListener("input", function () {
        const q = this.value.trim().toLowerCase();
        ul.querySelectorAll("li").forEach((li) => { li.style.display = !q || li.textContent.toLowerCase().indexOf(q) >= 0 ? "" : "none"; });
      });
      const tick = () => {
        let s = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        if (startTime) s += " · in corso da " + Math.floor((Date.now() - startTime) / 60000) + " min";
        document.getElementById("clock").textContent = s;
      };
      tick();
      setInterval(tick, 1000);
    }

    // Anteprima della pagina Grafica: mostra una scena alla volta, senza toccare ciò che è in sala.
    function setScene(scene) {
      state.scene = null; state.disc = false; state.pass = null; state.view = "slides"; state.passMode = "side-t";
      const firstText = slides.findIndex((s) => s.type === "text"), firstHead = slides.findIndex((s) => s.type === "section");
      if (scene === "conf") state.scene = "conf";
      else if (scene === "cover") state.i = 0;
      else if (scene === "section") state.i = firstHead > 0 ? firstHead : Math.max(firstText, 0);
      else if (scene === "text") state.i = Math.max(firstText, 0);
      else if (scene === "sheet") { state.i = Math.max(firstText, 0); state.view = "sheet"; }
      else if (scene === "side") {
        state.i = Math.max(firstText, 0);
        const m = materialsFor(SAMPLE);
        if (m.length) state.pass = [0, 0, SAMPLE];
        preloadMedia(SAMPLE).then(render);
      } else if (scene === "disc") state.disc = [SAMPLE];
      else if (scene === "end") state.i = slides.length - 1;
      document.querySelectorAll(".stage").forEach((s) => { s.dataset.key = ""; });
      render();
    }
    if (sample) window.__scene = setScene;

    window.addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });

    await L.Theme.loadCustomFonts(conf.theme);
    if (talkId !== "cover") {
      info = findTalk(talkId);
      if (!info) { document.body.innerHTML = '<p class="regia-error">Questo intervento non è più nel programma. <a href="' + esc(L.planUrl("#/c/" + confId)) + '">Torna al programma</a></p>'; return; }
      document.title = (info.talk.speaker || "Intervento") + " · " + screenLang().toUpperCase();
      if (mode === "screen") document.documentElement.lang = screenLang();
    } else document.title = "Copertina · " + (M.pick(conf.title, conf.languages[0]) || "Diglot");
    if (route.teams === "1" && mode === "screen") document.title = "Diglot · Schermo per Teams";
    if (info && info.talk.segments.length && deckOf(info.talk) && hasCues() && !/^side/.test(state.passMode)) state.passMode = "side-t";
    if (slidesOnly()) state.passMode = "full";
    buildSlides();
    const startI = parseInt(route.i || "", 10);
    if (!isNaN(startI)) state.i = Math.max(0, Math.min(slides.length - 1, startI));
    else if (!sample) {
      try {
        const last = JSON.parse(store(KEY) || "null"), pos = JSON.parse(store(POS(talkId)) || "null");
        if (last && last.t === talkId) state.i = Math.min(slides.length - 1, last.i);
        else if (pos && typeof pos.i === "number") state.i = Math.min(slides.length - 1, pos.i);
        if (last) screenTalk = last.t;
      } catch (e) { /* posizione illeggibile: si parte dall'inizio */ }
    }
    if (route.view === "sheet" || route.view === "slides") state.view = route.view;
    if (preview && !sample) {
      try {
        const lm = JSON.parse(store(KEY) || "null");
        if (lm && lm.t === talkId) { state.i = Math.min(slides.length - 1, lm.i); state.pass = lm.pass || null; state.disc = lm.disc || false; state.passMode = lm.passMode || state.passMode; state.passView = lm.passView || state.passView; state.slidesOff = !!lm.slidesOff; state.lang = lm.lang || null; state.deck = lm.deck || null; state.black = !!lm.black; state.theme = lm.theme || state.theme; state.scale = lm.scale || state.scale; state.view = lm.view || state.view; lastTs = lm.ts; buildSlides(); }
      } catch (e) { /* si parte dall'inizio */ }
    }
    if (info) await preloadMedia(talkId);
    if (syncSlides() && !state.pass) syncPass();
    if (mode === "screen") initScreen(); else initRegia();
    if (sample) setScene(route.scene || "text");
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
    render();
  };
})(window.Diglot);
