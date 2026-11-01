(function (L) {
  "use strict";

  const LANGS = {
    it: { name: "Italiano", translation: "Traduzione italiana", original: "Testo originale", end: "Fine dell'intervento", discussion: "Discussione", slide: "Slide", passage: "Passo citato", conference: "Convegno", dateLocale: "it-IT", session: ["Prima sessione", "Seconda sessione", "Terza sessione", "Quarta sessione", "Quinta sessione", "Sesta sessione", "Settima sessione", "Ottava sessione"], sessionN: "Sessione" },
    de: { name: "Deutsch", translation: "Deutsche Übersetzung", original: "Originaltext", end: "Ende des Vortrags", discussion: "Diskussion", slide: "Folie", passage: "Zitierte Stelle", conference: "Tagung", dateLocale: "de-DE", session: ["Erste Sitzung", "Zweite Sitzung", "Dritte Sitzung", "Vierte Sitzung", "Fünfte Sitzung", "Sechste Sitzung", "Siebte Sitzung", "Achte Sitzung"], sessionN: "Sitzung" },
    en: { name: "English", translation: "English translation", original: "Original text", end: "End of the talk", discussion: "Discussion", slide: "Slide", passage: "Quoted passage", conference: "Conference", dateLocale: "en-GB", session: ["First session", "Second session", "Third session", "Fourth session", "Fifth session", "Sixth session", "Seventh session", "Eighth session"], sessionN: "Session" },
    fr: { name: "Français", translation: "Traduction française", original: "Texte original", end: "Fin de l'intervention", discussion: "Discussion", slide: "Diapositive", passage: "Passage cité", conference: "Colloque", dateLocale: "fr-FR", session: ["Première session", "Deuxième session", "Troisième session", "Quatrième session", "Cinquième session", "Sixième session", "Septième session", "Huitième session"], sessionN: "Session" },
    es: { name: "Español", translation: "Traducción española", original: "Texto original", end: "Fin de la ponencia", discussion: "Debate", slide: "Diapositiva", passage: "Pasaje citado", conference: "Congreso", dateLocale: "es-ES", session: ["Primera sesión", "Segunda sesión", "Tercera sesión", "Cuarta sesión", "Quinta sesión", "Sexta sesión", "Séptima sesión", "Octava sesión"], sessionN: "Sesión" },
    pt: { name: "Português", translation: "Tradução portuguesa", original: "Texto original", end: "Fim da intervenção", discussion: "Debate", slide: "Diapositivo", passage: "Passagem citada", conference: "Conferência", dateLocale: "pt-PT", session: ["Primeira sessão", "Segunda sessão", "Terceira sessão", "Quarta sessão", "Quinta sessão", "Sexta sessão", "Sétima sessão", "Oitava sessão"], sessionN: "Sessão" },
  };

  const FORMAT = "diglot.conference", TALK_FORMAT = "diglot.talk", VERSION = 1;
  // I file salvati con i nomi precedenti del programma restano validi.
  const isConference = (d) => !!d && /^(diglot|conferenze|leggio)\.conference$/.test(d.format);

  function lang(code) { return LANGS[code] || LANGS.en; }
  function langName(code) {
    if (LANGS[code]) return LANGS[code].name;
    try { const n = new Intl.DisplayNames(["it"], { type: "language" }).of(code); return n ? n.charAt(0).toUpperCase() + n.slice(1) : code; } catch (e) { return code; }
  }
  function label(code, key) { return lang(code)[key]; }
  // Prima la lingua chiesta, poi una qualsiasi: un campo vuoto non deve lasciare un buco sullo schermo.
  function pick(map, code) {
    if (!map) return "";
    if (map[code]) return map[code];
    for (const k in map) if (map[k]) return map[k];
    return "";
  }

  function newTalk(conf) {
    const l = conf.languages;
    return { id: L.uid("t"), speaker: "", affiliation: "", title: {}, from: l[1] || l[0], to: l[0], screenLabel: "", segments: [], decks: [], deck: null, passages: [], source: null };
  }
  function sessionName(conf, ordinal) {
    const name = {};
    conf.languages.forEach((c) => { const x = lang(c); name[c] = x.session[ordinal] || x.sessionN + " " + (ordinal + 1); });
    return name;
  }
  function newSession(conf, ordinal) { return { id: L.uid("s"), time: "", name: sessionName(conf, ordinal), talks: [] }; }
  function newDay(conf, date) { return { id: L.uid("d"), date: date || "", sessions: [newSession(conf, 0)] }; }

  function newConference(opts) {
    opts = opts || {};
    const now = Date.now();
    const conf = {
      format: FORMAT, version: VERSION, id: L.uid("c"), createdAt: now, updatedAt: now,
      title: opts.title || {}, big: "", kicker: {}, place: "", datesText: "",
      languages: opts.languages && opts.languages.length ? opts.languages : ["it", "de"],
      days: [], theme: L.Theme ? L.Theme.defaults() : {},
    };
    conf.days.push(newDay(conf, opts.date || ""));
    return conf;
  }

  function eachTalk(conf, fn) {
    conf.days.forEach((d) => d.sessions.forEach((s) => s.talks.forEach((t) => fn(t, s, d))));
  }
  function talks(conf) { const out = []; eachTalk(conf, (t, s, d) => out.push({ talk: t, session: s, day: d })); return out; }
  function find(conf, id) { let r = null; eachTalk(conf, (t, s, d) => { if (t.id === id) r = { talk: t, session: s, day: d }; }); return r; }

  function dayLabel(day, code) {
    if (!day.date) return "";
    const d = new Date(day.date + "T12:00:00");
    if (isNaN(d)) return "";
    const s = new Intl.DateTimeFormat(lang(code).dateLocale || code, { weekday: "long", day: "numeric", month: "long" }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function datesLabel(conf, code) {
    if (conf.datesText) return conf.datesText;
    const ds = conf.days.map((d) => d.date).filter(Boolean).sort();
    if (!ds.length) return "";
    const a = new Date(ds[0] + "T12:00:00"), b = new Date(ds[ds.length - 1] + "T12:00:00");
    const f = new Intl.DateTimeFormat(lang(code).dateLocale || code, { day: "numeric", month: "long", year: "numeric" });
    return ds.length === 1 || !f.formatRange ? f.format(a) : f.formatRange(a, b);
  }

  // Slide attiva: quella scelta, altrimenti la prima serie caricata.
  function activeDeck(talk) {
    const decks = talk.decks || [];
    return decks.find((d) => d.id === talk.deck) || decks[0] || null;
  }

  function talkLangs(talk) {
    const set = [];
    const add = (c) => { if (c && set.indexOf(c) < 0) set.push(c); };
    add(talk.from); add(talk.to);
    (talk.segments || []).slice(0, 40).forEach((s) => Object.keys(s.text || {}).forEach(add));
    return set;
  }

  // Cosa manca a un intervento prima dell'evento: alimenta l'elenco «Da sistemare».
  function issues(talk) {
    const out = [];
    const segs = talk.segments || [], decks = talk.decks || [];
    if (!talk.speaker) out.push({ code: "speaker", text: "manca il nome del relatore" });
    if (!segs.length && !decks.length) out.push({ code: "text", text: "manca il testo" });
    if (segs.length) {
      const body = segs.filter((s) => !s.heading);
      const noTo = body.filter((s) => !(s.text && s.text[talk.to])).length;
      const noFrom = body.filter((s) => !(s.text && s.text[talk.from])).length;
      if (noTo) out.push({ code: "translation", text: noTo === body.length ? "manca la traduzione in " + langName(talk.to) : noTo + " schermate senza testo in " + langName(talk.to) });
      else if (noFrom && noFrom < body.length) out.push({ code: "original", text: noFrom + " schermate senza testo in " + langName(talk.from) });
      const flagged = segs.filter((s) => s.check).length;
      if (flagged) out.push({ code: "check", text: flagged + (flagged === 1 ? " schermata da controllare" : " schermate da controllare") });
      const cues = segs.filter((s) => s.cue).map((s) => s.cue);
      const deck = activeDeck(talk);
      if (cues.length && !deck) out.push({ code: "deck", text: "il testo indica le slide ma non ne hai caricate" });
      else if (cues.length && deck && Math.max.apply(null, cues) > deck.slides.length) out.push({ code: "deck", text: "il testo arriva alla slide " + Math.max.apply(null, cues) + ", la serie ne ha " + deck.slides.length });
    }
    return out;
  }

  function normalizeTalk(t, conf) {
    const base = newTalk(conf);
    const talk = Object.assign(base, t);
    talk.id = talk.id || L.uid("t");
    talk.title = talk.title || {};
    talk.segments = Array.isArray(talk.segments) ? talk.segments.map((s) => {
      const seg = { text: s.text || {}, p: s.p || 0 };
      if (s.heading) seg.heading = true;
      if (s.cue) seg.cue = s.cue;
      if (s.check) seg.check = s.check;
      return seg;
    }) : [];
    talk.decks = Array.isArray(talk.decks) ? talk.decks : [];
    talk.passages = Array.isArray(talk.passages) ? talk.passages.map((p) => Object.assign({ id: L.uid("q"), ref: "", author: "", pages: [] }, p)) : [];
    return talk;
  }

  function normalize(raw) {
    const conf = Object.assign(newConference({ languages: raw.languages }), raw);
    conf.format = FORMAT; conf.version = VERSION;
    conf.id = raw.id || L.uid("c");
    conf.title = raw.title || {}; conf.kicker = raw.kicker || {};
    conf.languages = raw.languages && raw.languages.length ? raw.languages : ["it", "de"];
    conf.days = (raw.days || []).map((d) => ({
      id: d.id || L.uid("d"), date: d.date || "",
      sessions: (d.sessions || []).map((s) => ({ id: s.id || L.uid("s"), time: s.time || "", name: s.name || {}, talks: (s.talks || []).map((t) => normalizeTalk(t, conf)) })),
    }));
    conf.theme = L.Theme.normalize(raw.theme);
    return conf;
  }

  L.Model = { LANGS, FORMAT, TALK_FORMAT, VERSION, isConference, lang, langName, label, pick, newConference, newDay, newSession, newTalk, sessionName, eachTalk, talks, find, dayLabel, datesLabel, activeDeck, talkLangs, issues, normalize, normalizeTalk };
})(window.Diglot);
