(function (L) {
  "use strict";
  const T = L.Text, M = L.Model;

  const DEEPL = /\b(translated with|übersetzt mit|tradotto con|traduit avec|traducido con|traduzido com)\s+(www\.)?deepl(\.com)?(\/\S*)?(\s*\(.*?\))?/i;
  const PASS_CHECK = { manca: "Una lingua non ha il testo corrispondente", lunghezza: "Lunghezze molto diverse: controlla che le due lingue corrispondano" };

  function readText(file, text) {
    const blocks = [];
    text.replace(/\r\n?/g, "\n").split(/\n\s*\n/).forEach((chunk) => {
      const t = T.clean(chunk);
      if (!t) return;
      const head = /^#{1,6}\s+(.*)$/.exec(t);
      blocks.push({ text: T.markExplicitCues(head ? head[1] : t), heading: !!head || (L.words(t) <= 10 && !/[.;:,!?]$/.test(t) && /^(\d+|[IVXLC]+)[.)]\s/.test(t)) });
    });
    return { kind: "text", name: file.name, blocks, meta: {} };
  }

  async function readFile(file, progress) {
    const ext = L.fileExt(file.name);
    let parsed;
    if (ext === "docx") parsed = await L.Docx.read(file);
    else if (ext === "pdf") parsed = await L.Pdf.read(file, progress);
    else if (ext === "txt" || ext === "md") parsed = readText(file, await file.text());
    else if (ext === "doc") throw new Error("Il vecchio formato .doc non si può leggere: in Word usa «Salva con nome» e scegli .docx.");
    else throw new Error("«" + file.name + "» non è un formato che so leggere: usa .docx, .pdf, .txt o .json.");
    tidy(parsed);
    return parsed;
  }

  function tidyBlocks(blocks) {
    let list = blocks.filter((b) => {
      const t = T.clean(T.stripMarks(b.text));
      if (!t) return /|/.test(b.text);
      return !DEEPL.test(t) || t.replace(DEEPL, "").trim().length > 0;
    });
    list.forEach((b) => { b.text = b.text.replace(DEEPL, " "); });
    T.resolveCandidates(list);
    return T.foldCueOnlyBlocks(list);
  }
  function tidy(parsed) {
    parsed.blocks = tidyBlocks(parsed.blocks);
    if (parsed.columns) { parsed.columns.left = tidyBlocks(parsed.columns.left); parsed.columns.right = tidyBlocks(parsed.columns.right); }
    const lang = T.detectLang(parsed.blocks.map((b) => T.stripMarks(b.text)).join(" "));
    parsed.lang = lang.lang;
    parsed.words = lang.words;
    parsed.front = T.frontMatter(parsed.blocks.filter((b) => !b.table));
  }

  function langOf(blocks) { return T.detectLang(blocks.map((b) => T.stripMarks(b.text)).join(" ")).lang; }

  function tableLayout(parsed) {
    const inTable = parsed.blocks.filter((b) => b.table);
    if (!inTable.length) return null;
    const words = (list) => list.reduce((n, b) => n + L.words(b.text), 0);
    if (words(inTable) < words(parsed.blocks) * 0.6) return null;
    const cols = {};
    inTable.forEach((b) => { (cols[b.table.c] = cols[b.table.c] || []).push(b); });
    const ranked = Object.keys(cols).sort((x, y) => words(cols[y]) - words(cols[x])).slice(0, 2).map(Number).sort((x, y) => x - y);
    if (ranked.length < 2) return null;
    const la = langOf(cols[ranked[0]]), lb = langOf(cols[ranked[1]]);
    if (!la || !lb || la === lb) return null;
    const rows = new Map();
    inTable.forEach((b) => {
      const k = b.table.t + "/" + b.table.r;
      if (!rows.has(k)) rows.set(k, { a: [], b: [] });
      if (b.table.c === ranked[0]) rows.get(k).a.push(b);
      if (b.table.c === ranked[1]) rows.get(k).b.push(b);
    });
    const pairs = [...rows.values()].filter((r) => r.a.length || r.b.length);
    const outside = parsed.blocks.filter((b) => !b.table).length;
    return { layout: "table", langs: [la, lb], pairs, outside };
  }

  function alternateLayout(blocks) {
    const longEnough = blocks.filter((b) => L.words(T.stripMarks(b.text)) >= 6);
    if (longEnough.length < 4) return null;
    const counts = {};
    const tags = blocks.map((b) => {
      const r = L.words(T.stripMarks(b.text)) >= 6 ? T.detectLang(T.stripMarks(b.text)).lang : null;
      if (r) counts[r] = (counts[r] || 0) + 1;
      return r;
    });
    const top = Object.keys(counts).sort((x, y) => counts[y] - counts[x]).slice(0, 2);
    if (top.length < 2 || counts[top[1]] < longEnough.length * 0.2) return null;
    const known = tags.map((t) => (t === top[0] || t === top[1] ? t : null));
    // Le righe troppo corte per riconoscere la lingua (titoli) seguono l'alternanza.
    for (let i = 0; i < known.length; i++) {
      if (known[i]) continue;
      let next = null, gap = 0;
      for (let j = i + 1; j < known.length; j++) { gap++; if (known[j]) { next = known[j]; break; } }
      const other = (c) => (c === top[0] ? top[1] : top[0]);
      if (i > 0 && known[i - 1]) known[i] = other(known[i - 1]);
      else if (next) known[i] = gap % 2 ? other(next) : next;
      else known[i] = top[0];
    }
    const runs = [];
    known.forEach((c, i) => {
      const last = runs[runs.length - 1];
      if (last && last.lang === c) last.blocks.push(blocks[i]);
      else runs.push({ lang: c, blocks: [blocks[i]] });
    });
    const first = runs[0].lang, second = first === top[0] ? top[1] : top[0];
    if (runs.length < 3) {
      if (runs.length === 2) return { layout: "sequence", langs: [first, second], a: runs[0].blocks, b: runs[1].blocks };
      return null;
    }
    const pairs = [];
    for (let i = 0; i < runs.length; i++) {
      if (runs[i].lang === first) {
        const nx = runs[i + 1] && runs[i + 1].lang === second ? runs[i + 1] : null;
        pairs.push({ a: runs[i].blocks, b: nx ? nx.blocks : [] });
        if (nx) i++;
      } else pairs.push({ a: [], b: runs[i].blocks });
    }
    return { layout: "alternate", langs: [first, second], pairs };
  }

  function columnsLayout(parsed) {
    if (!parsed.columns) return null;
    const la = langOf(parsed.columns.left), lb = langOf(parsed.columns.right);
    if (!la || !lb || la === lb) return null;
    return { layout: "columns", langs: [la, lb], a: parsed.columns.left, b: parsed.columns.right };
  }

  // Originale e traduzione alternati frase per frase dentro lo stesso paragrafo.
  function sentenceLayout(blocks) {
    const parts = [];
    blocks.forEach((b) => {
      if (b.heading) parts.push(b);
      else T.sentences(T.clean(b.text)).forEach((s) => parts.push({ text: s }));
    });
    const found = alternateLayout(parts);
    return found && found.layout === "alternate" ? Object.assign(found, { layout: "sentences" }) : null;
  }

  // Un paragrafo che cambia lingua da una frase all'altra rivela i file alternati frase per frase.
  function mixedInside(blocks) {
    let long = 0, mixed = 0;
    blocks.forEach((b) => {
      const tags = T.sentences(T.clean(T.stripMarks(b.text))).filter((s) => L.words(s) >= 4).map((s) => T.detectLang(s).lang).filter(Boolean);
      if (tags.length < 2) return;
      long++;
      if (tags.some((c, i) => i > 0 && c !== tags[i - 1])) mixed++;
    });
    return long >= 3 && mixed >= long * 0.5;
  }

  function analyze(parsed) {
    const free = parsed.blocks.filter((b) => !b.table);
    const prose = mixedInside(free) ? sentenceLayout(free) || alternateLayout(free) : alternateLayout(free);
    return tableLayout(parsed) || columnsLayout(parsed) || prose || { layout: "single", langs: [parsed.lang], a: parsed.blocks };
  }

  const LAYOUT_NAMES = {
    table: "Tabella a due colonne", columns: "Due colonne nel PDF", alternate: "Paragrafi alternati", sentences: "Frasi alternate", sequence: "Prima una lingua, poi l'altra",
    single: "Testo in una sola lingua", files: "Due file separati",
  };

  // Quando il riconoscimento automatico sbaglia, la struttura si impone a mano.
  function forced(parsed, how) {
    const blocks = parsed.blocks;
    if (how === "single") return { layout: "single", langs: [parsed.lang], a: blocks };
    if (how === "alternate") {
      const pairs = [];
      for (let i = 0; i < blocks.length; i += 2) pairs.push({ a: [blocks[i]], b: blocks[i + 1] ? [blocks[i + 1]] : [] });
      return { layout: "alternate", langs: [langOf(pairs.flatMap((x) => x.a)), langOf(pairs.flatMap((x) => x.b))], pairs };
    }
    if (how === "sequence") {
      const total = blocks.reduce((n, b) => n + L.words(b.text), 0);
      let acc = 0, cut = 0;
      while (cut < blocks.length && acc < total / 2) acc += L.words(blocks[cut++].text);
      const a = blocks.slice(0, cut), b = blocks.slice(cut);
      return { layout: "sequence", langs: [langOf(a), langOf(b)], a, b };
    }
    return null;
  }

  // Da uno o due file a schermate bilingui. «plan» conserva le letture già fatte: cambiare un'opzione non rilegge i file.
  function plan(parsedList, how) {
    if (parsedList.length >= 2) {
      const [x, y] = parsedList;
      return { layout: "files", langs: [x.lang, y.lang], a: x.blocks, b: y.blocks, front: x.front, parsed: parsedList };
    }
    const p = parsedList[0], a = (how && forced(p, how)) || analyze(p);
    return Object.assign(a, { front: a.pairs ? frontOfPairs(a.pairs) : p.front, parsed: parsedList });
  }

  // Nei file bilingui l'intestazione è una coppia di righe corte: titolo e titolo tradotto.
  function frontOfPairs(pairs) {
    const plain = (b) => T.clean(T.stripMarks(b.text));
    const short = (t) => L.words(t) <= 24 && !/[,:;!]$/.test(t) && !(/\.$/.test(t) && L.words(t) > 8) && !/^(\d+|[IVXLC]+)[.)]\s/.test(t);
    let n = 0;
    while (n < pairs.length && n < 3 && [...pairs[n].a, ...pairs[n].b].length && [...pairs[n].a, ...pairs[n].b].every((b) => short(plain(b)))) n++;
    if (!n || n === pairs.length) return { count: 0, title: "", author: "" };
    const first = pairs[0], next = pairs[1];
    return {
      count: n,
      title: first.a[0] ? plain(first.a[0]) : "",
      titleB: first.b[0] ? plain(first.b[0]) : "",
      author: n > 1 && next.a[0] && L.words(plain(next.a[0])) <= 7 ? plain(next.a[0]) : "",
    };
  }

  function dropFront(blocks, front, skip) { return skip && front && front.count ? blocks.slice(front.count) : blocks; }

  function build(pl, opts) {
    opts = opts || {};
    const la = opts.langA || pl.langs[0] || "xx", lb = opts.langB || pl.langs[1] || null;
    const so = { target: opts.target || 48 };
    let segments;
    if (pl.layout === "single") segments = T.segmentSingle(dropFront(pl.a, pl.front, opts.skipFront !== false), la, so);
    else if (pl.pairs) segments = L.Align.alignPairs(opts.skipFront !== false && pl.front ? pl.pairs.slice(pl.front.count) : pl.pairs, la, lb || "xx", so);
    else {
      const skip = opts.skipFront !== false;
      const frontB = pl.parsed && pl.parsed[1] ? pl.parsed[1].front : pl.layout === "files" ? null : T.frontMatter(pl.b);
      segments = L.Align.alignTexts(dropFront(pl.a, pl.layout === "sequence" || pl.layout === "columns" ? T.frontMatter(pl.a) : pl.front, skip), dropFront(pl.b, frontB, skip), la, lb || "xx", so);
    }
    const flagged = segments.filter((s) => s.check).length;
    const cues = segments.filter((s) => s.cue).length;
    return { segments, langs: lb ? [la, lb] : [la], layout: pl.layout, flagged, cues, front: pl.front, outside: pl.outside || 0 };
  }

  function checkText(code) { return PASS_CHECK[code] || code; }

  // JSON di un intervento: leggibile a mano, stabile tra versioni.
  function talkToJSON(talk) {
    return {
      format: M.TALK_FORMAT, version: M.VERSION, speaker: talk.speaker, affiliation: talk.affiliation || "", title: talk.title,
      from: talk.from, to: talk.to, screenLabel: talk.screenLabel || "",
      segments: talk.segments.map((s) => {
        const o = Object.assign({}, s.text);
        o.p = s.p;
        if (s.heading) o.heading = true;
        if (s.cue) o.slide = s.cue;
        return o;
      }),
      passages: (talk.passages || []).map((p) => ({ ref: p.ref, author: p.author || "", pages: p.pages })),
    };
  }

  const RESERVED = new Set(["p", "heading", "slide", "h", "o", "t", "cue", "check", "f", "n", "lang", "sec", "text"]);

  // Accetta il formato attuale, il vecchio {segs:[{o,t}]} e semplici elenchi di coppie.
  function talkFromJSON(data, hint) {
    hint = hint || {};
    let list = null, talk = {};
    if (Array.isArray(data)) list = data;
    else if (data && Array.isArray(data.segments)) { list = data.segments; talk = data; }
    else if (data && Array.isArray(data.segs)) { list = data.segs; talk = { screenLabel: data.label || "" }; }
    if (!list) throw new Error("Questo JSON non contiene slide: mi aspetto un campo «segments» oppure un elenco di coppie di testi.");
    const from = talk.from || hint.from || "de", to = talk.to || hint.to || "it";
    const segments = list.map((s, i) => {
      if (typeof s === "string") return { text: { [to]: s }, p: i };
      if (Array.isArray(s)) return { text: { [from]: String(s[0] || ""), [to]: String(s[1] || "") }, p: i };
      if (typeof s !== "object" || !s) throw new Error("La voce " + (i + 1) + " non è valida: dev'essere un oggetto, un testo o una coppia.");
      const text = {};
      if (s.text && typeof s.text === "object") Object.assign(text, s.text);
      if (s.o !== undefined || s.t !== undefined) { if (s.o) text[from] = String(s.o); if (s.t) text[to] = String(s.t); }
      Object.keys(s).forEach((k) => { if (!RESERVED.has(k) && typeof s[k] === "string") text[k] = s[k]; });
      if (!Object.keys(text).length) throw new Error("La voce " + (i + 1) + " non ha testo.");
      const seg = { text, p: typeof s.p === "number" ? s.p : i };
      if (s.heading || s.h) seg.heading = true;
      const cue = s.slide || s.cue;
      if (cue) seg.cue = +cue;
      return seg;
    });
    return Object.assign({}, talk, { from, to, segments, format: undefined, version: undefined });
  }

  const extOf = (type) => ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg", "image/gif": "gif", "font/woff2": "woff2", "font/ttf": "ttf", "font/otf": "otf" }[type] || "bin");

  // File .diglot: uno ZIP con conference.json e i file delle slide. È il modo di portare una conferenza su un altro computer.
  async function exportBundle(conf, progress) {
    const zip = new JSZip();
    const refs = L.Store.mediaRefs(conf);
    const manifest = {};
    for (let i = 0; i < refs.length; i++) {
      if (progress && i % 10 === 0) progress("Preparo i file " + (i + 1) + " di " + refs.length);
      const rec = await L.Store.getMedia(refs[i]);
      if (!rec) continue;
      const path = "media/" + refs[i] + "." + extOf(rec.type);
      zip.file(path, rec.blob);
      manifest[refs[i]] = { path, type: rec.type, name: rec.name };
    }
    zip.file("conference.json", JSON.stringify(conf, null, 1));
    zip.file("media.json", JSON.stringify(manifest));
    return zip.generateAsync({ type: "blob", compression: "STORE" });
  }

  function remapMedia(conf, map) {
    M.eachTalk(conf, (t) => (t.decks || []).forEach((d) => d.slides.forEach((s) => { if (map[s.media]) s.media = map[s.media]; })));
    const th = conf.theme || {};
    if (th.logo && map[th.logo.media]) th.logo.media = map[th.logo.media];
    if (th.coverBg && map[th.coverBg.media]) th.coverBg.media = map[th.coverBg.media];
    (th.fonts || []).forEach((f) => { if (map[f.media]) f.media = map[f.media]; });
  }

  async function importBundle(file, progress) {
    let zip;
    try { zip = await JSZip.loadAsync(file); } catch (e) { throw new Error("Questo file non si apre: non è un pacchetto .diglot valido."); }
    const entry = zip.file("conference.json");
    if (!entry) throw new Error("Nel pacchetto manca conference.json: non è un file di questo programma.");
    const raw = JSON.parse(await entry.async("string"));
    const conf = M.normalize(raw);
    conf.id = L.uid("c");
    const manifestFile = zip.file("media.json");
    const manifest = manifestFile ? JSON.parse(await manifestFile.async("string")) : {};
    const map = {}, ids = Object.keys(manifest);
    for (let i = 0; i < ids.length; i++) {
      if (progress && i % 10 === 0) progress("Importo i file " + (i + 1) + " di " + ids.length);
      const m = manifest[ids[i]], f = zip.file(m.path);
      if (!f) continue;
      const blob = new Blob([await f.async("arraybuffer")], { type: m.type });
      map[ids[i]] = await L.Store.putMedia(blob, conf.id, m.name);
    }
    remapMedia(conf, map);
    return conf;
  }

  function conferenceFromJSON(data) {
    if (!M.isConference(data)) throw new Error("Questo JSON non descrive una conferenza.");
    const conf = M.normalize(data);
    conf.id = L.uid("c");
    M.eachTalk(conf, (t) => { t.decks = []; t.deck = null; });
    conf.theme.logo = null; conf.theme.coverBg = null; conf.theme.fonts = [];
    return conf;
  }

  L.Convert = { readFile, plan, build, analyze, LAYOUT_NAMES, checkText, talkToJSON, talkFromJSON, exportBundle, importBundle, conferenceFromJSON, langOf };
})(window.Diglot);
