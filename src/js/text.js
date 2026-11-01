(function (L) {
  "use strict";

  // Marcatori interni: «qui cambia slide» (CUE) e «numero in grassetto che forse indica una slide» (CAND).
  const CUE = "", CUE_END = "", CAND = "", CAND_END = "";
  const CUE_RE = /(\d+)/g;

  const ABBR = new Set(["bzw", "vgl", "sog", "ggf", "etc", "ca", "hrsg", "hg", "bd", "nr", "ss", "ff", "cit", "cfr", "ibid", "ivi", "op", "pp", "vol", "voll", "ed", "eds", "trad", "tr", "nn", "cap", "capp", "fig", "tav", "art", "sig", "sigg", "dott", "prof", "avv", "ing", "on", "es", "ecc", "cf", "vs", "mr", "mrs", "ms", "dr", "st", "no", "pag", "ndr", "mme", "mm", "vgl", "anm", "abs", "aufl", "jh", "jhd", "bspw", "usw", "evtl", "inkl", "zit", "ebd", "sr", "sra", "pág", "núm", "págs", "ex", "al", "sec", "seq", "sgg", "seg"]);

  function clean(s) {
    return String(s || "").replace(/­/g, "").replace(/[   ]/g, " ").replace(/\s+/g, " ").trim();
  }

  function isAbbr(tok) {
    if (!tok) return false;
    const low = tok.toLowerCase();
    if (ABBR.has(low)) return true;
    if (/^\p{L}$/u.test(tok)) return true;
    if (/^(\p{L}\.)+\p{L}?$/u.test(tok)) return true;
    return /^\d{1,2}$/.test(tok);
  }

  // Un rimando come «(27 f.)» appartiene alla frase che lo precede, non a quella che segue.
  const CITATION = /^\((?:\d[\d\sf.,–-]*|(?:p|pp|s|ss|S|vgl|cfr)\.\s*\d[^)]{0,18}|ivi[^)]{0,18}|ebd[^)]{0,18}|ibid[^)]{0,18}|Enc\.[^)]{0,18}|Enz\.[^)]{0,18})\)[.,;:”“»"]*(?=\s|$)/;

  function sentences(text) {
    const out = [];
    let start = 0, m;
    const re = /[.?!…]+["'”’»›)\]“]*(?=\s|$)/g;
    while ((m = re.exec(text))) {
      const end = m.index + m[0].length;
      const after = /^\s+(\S)/.exec(text.slice(end));
      if (!after) continue;
      if (!/[\p{Lu}\d«“"'‘„(\[¿¡–—-]/u.test(after[1])) continue;
      const prevChar = text[m.index - 1];
      if ((m[0][0] === "…" || m[0].startsWith("...")) && (prevChar === "[" || prevChar === "(")) continue;
      if (m[0][0] === ".") {
        const before = text.slice(start, m.index);
        const tok = (/([^\s(\[«“"„‘']*)$/.exec(before) || ["", ""])[1];
        if (isAbbr(tok)) continue;
      }
      out.push(text.slice(start, end).trim());
      start = end;
    }
    const rest = text.slice(start).trim();
    if (rest) out.push(rest);
    for (let i = 1; i < out.length; i++) {
      const c = CITATION.exec(out[i]);
      if (c) {
        out[i - 1] += " " + c[0];
        out[i] = out[i].slice(c[0].length).trim();
        if (!out[i]) { out.splice(i, 1); i--; }
      }
    }
    return out;
  }

  // Punti in cui una frase troppo lunga si può spezzare, dal più naturale al meno.
  const CUTS = [/[;:](?=\s)/g, /\s[–—-](?=\s)/g, /[)»”](?=\s)/g, /,(?=\s)/g];
  function cutPoints(s) {
    const pts = [];
    CUTS.forEach((re, rank) => {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(s))) pts.push({ at: m.index + m[0].length, rank });
    });
    return pts;
  }
  function splitLong(s, maxw) {
    const n = L.words(s);
    if (n <= maxw) return [s];
    const mid = s.length / 2;
    let best = null, score = Infinity;
    cutPoints(s).forEach((p) => {
      const left = L.words(s.slice(0, p.at)), right = n - left;
      if (left < 6 || right < 6) return;
      const sc = Math.abs(p.at - mid) / s.length + p.rank * 0.06;
      if (sc < score) { score = sc; best = p.at; }
    });
    if (best === null) {
      if (n <= maxw * 1.5) return [s];
      const sp = s.indexOf(" ", Math.floor(mid));
      if (sp < 0) return [s];
      best = sp;
    }
    return splitLong(s.slice(0, best).trim(), maxw).concat(splitLong(s.slice(best).trim(), maxw));
  }

  function splitCues(text) {
    const out = [];
    let last = 0, cue = null, m;
    CUE_RE.lastIndex = 0;
    while ((m = CUE_RE.exec(text))) {
      const piece = text.slice(last, m.index);
      if (clean(piece)) out.push({ cue, text: clean(piece) });
      cue = +m[1];
      last = m.index + m[0].length;
    }
    const piece = text.slice(last);
    if (clean(piece) || cue !== null) out.push({ cue, text: clean(piece) });
    return out;
  }
  function stripMarks(text) {
    return String(text || "").replace(CUE_RE, " ").replace(/([^]*)/g, "$1");
  }

  // Indicazioni esplicite: [Slide 3], (Folie 3), <<3>>, oppure una riga che dice solo «Folie 3».
  const KEYWORD = /[\[(<{]{1,2}\s*(?:slide|folie|diapositiva|diapo|dia|lucido|transparent)\s*(?:n\.?\s*)?(\d{1,3})\s*[\])>}]{1,2}|<<\s*(\d{1,3})\s*>>|\[\[\s*(\d{1,3})\s*\]\]/gi;
  const ALONE = /^(?:slide|folie|diapositiva|diapo)\s*(?:n\.?\s*)?(\d{1,3})\s*[.:]?$/i;

  function markExplicitCues(text) {
    const t = clean(text);
    const alone = ALONE.exec(t);
    if (alone) return CUE + alone[1] + CUE_END;
    return text.replace(KEYWORD, (_, a, b, c) => CUE + (a || b || c) + CUE_END + " ");
  }

  // I numeri in grassetto contano come indicazioni di slide solo se formano una serie crescente.
  function resolveCandidates(blocks) {
    const nums = [];
    blocks.forEach((b) => { const re = /[(\[]?(\d+)[)\]]?/g; let m; while ((m = re.exec(b.text))) nums.push(+m[1]); });
    let rising = 0;
    for (let i = 1; i < nums.length; i++) if (nums[i] > nums[i - 1]) rising++;
    const accept = nums.length >= 3 && nums[0] <= 2 && rising >= (nums.length - 1) * 0.8;
    blocks.forEach((b) => {
      b.text = b.text.replace(/([(\[]?)(\d+)([)\]]?)/g, (_, o, n, c) => (accept ? CUE + n + CUE_END + " " : o + n + c));
    });
    return accept ? nums.length : 0;
  }

  // Una riga che contiene solo il marcatore passa al paragrafo successivo.
  function foldCueOnlyBlocks(blocks) {
    const out = [];
    let pending = "";
    blocks.forEach((b) => {
      if (!clean(stripMarks(b.text)) && //.test(b.text)) { pending += b.text; return; }
      if (pending) { b.text = pending + b.text; pending = ""; }
      out.push(b);
    });
    if (pending && out.length) out[out.length - 1].text += pending;
    return out;
  }

  const STOP = {
    de: "der die das und ist nicht ein eine zu den mit von für auf im dem des sich auch als es wird sind dass daß aber oder wie bei nach aus wenn nur noch einer einem einen über sein durch werden kann zum zur diese dieser".split(" "),
    it: "il lo la le gli di che è in un una per con non del della dei delle si da al alla sono come più ma anche nel nella questo questa essere ha sul sulla ad ed degli ai alle tra fra suo sua loro".split(" "),
    en: "the of and to in is that it for as with was on be by this are at from or an which not have but their has its can these they we".split(" "),
    fr: "le la les des de du et est que qui dans pour une un pas sur au aux ce cette il elle ne se sont avec plus par nous ou mais comme son sa ses".split(" "),
    es: "el la los las de del y que en un una por con para no es se lo como más pero su al sus este esta son ha entre sobre también le".split(" "),
    pt: "o a os as de do da dos das e que em um uma para com não é se por como mais mas ao na no nos nas sua seu são foi".split(" "),
  };
  const STOP_SETS = {};
  Object.keys(STOP).forEach((k) => { STOP_SETS[k] = new Set(STOP[k]); });

  function detectLang(text) {
    const toks = String(text || "").toLowerCase().match(/\p{L}+/gu) || [];
    if (!toks.length) return { lang: null, score: 0, words: 0 };
    let best = null, bestScore = 0, second = 0;
    Object.keys(STOP_SETS).forEach((code) => {
      const set = STOP_SETS[code];
      let hits = 0;
      toks.forEach((t) => { if (set.has(t)) hits++; });
      const score = hits / toks.length;
      if (score > bestScore) { second = bestScore; bestScore = score; best = code; } else if (score > second) second = score;
    });
    return { lang: bestScore > 0.08 && bestScore > second * 1.15 ? best : null, score: bestScore, words: toks.length };
  }

  // Intestazione del documento: titolo e autore all'inizio, prima del corpo del testo.
  function frontMatter(blocks) {
    const front = [];
    for (let i = 0; i < blocks.length && i < 6; i++) {
      const t = clean(stripMarks(blocks[i].text)), w = L.words(t);
      if (!t || w > 24 || /[,:;!]$/.test(t) || (/\.$/.test(t) && w > 8) || /^(\d+|[IVXLC]+)[.)]\s/.test(t)) break;
      front.push(i);
    }
    if (front.length === blocks.length) return { count: 0, title: "", author: "" };
    const title = front.length ? clean(stripMarks(blocks[front[0]].text)) : "";
    let author = "";
    if (front.length > 1) {
      const t = clean(stripMarks(blocks[front[1]].text));
      if (L.words(t) <= 7) author = t;
    }
    return { count: front.length, title, author };
  }

  // Testo in una sola lingua: paragrafi spezzati in porzioni da leggere sullo schermo.
  function segmentSingle(blocks, lang, opts) {
    const target = opts.target || 48, maxw = opts.maxw || Math.round(target * 1.45);
    const segs = [];
    blocks.forEach((b, p) => {
      if (b.heading) {
        const pieces = splitCues(b.text);
        const seg = { text: { [lang]: clean(stripMarks(b.text)) }, p, heading: true };
        if (pieces.length && pieces[pieces.length - 1].cue) seg.cue = pieces[pieces.length - 1].cue;
        if (seg.text[lang]) segs.push(seg);
        return;
      }
      splitCues(b.text).forEach((piece) => {
        let cur = "", cue = piece.cue;
        const flush = () => {
          if (!cur && !cue) return;
          const seg = { text: { [lang]: cur }, p };
          if (cue) seg.cue = cue;
          if (cur) segs.push(seg);
          cur = ""; cue = null;
        };
        sentences(piece.text).forEach((s) => {
          splitLong(s, maxw).forEach((part) => {
            if (cur && L.words(cur) + L.words(part) > target) flush();
            cur = cur ? cur + " " + part : part;
          });
        });
        flush();
      });
    });
    return segs;
  }

  L.Text = { CUE, CUE_END, CAND, CAND_END, clean, sentences, splitLong, cutPoints, splitCues, stripMarks, markExplicitCues, resolveCandidates, foldCueOnlyBlocks, detectLang, frontMatter, segmentSingle };
})(window.Diglot);
