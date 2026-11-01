(function (L) {
  "use strict";
  const T = L.Text;

  // Scheletro consonantico: fa coincidere «Phänomen» e «fenomeno», «Spekulation» e «speculazione».
  function skeleton(word) {
    const w = word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss").replace(/ph/g, "f").replace(/th/g, "t").replace(/k/g, "c").replace(/z/g, "t").replace(/qu/g, "c").replace(/[^a-z]/g, "");
    return w.replace(/[aeiouyhw]/g, "").replace(/(.)\1+/g, "$1").slice(0, 5);
  }
  function anchors(s) {
    const out = new Set();
    (String(s).match(/\d+/g) || []).forEach((n) => out.add("#" + n));
    (String(s).match(/\p{L}{5,}/gu) || []).forEach((w) => { const k = skeleton(w); if (k.length >= 3) out.add(k); });
    return out;
  }

  function units(blocks) {
    const U = [];
    blocks.forEach((b, p) => {
      if (b.heading) {
        const cue = T.splitCues(b.text).map((x) => x.cue).filter(Boolean)[0];
        const s = T.clean(T.stripMarks(b.text));
        if (s) U.push({ s, p, heading: true, cue: cue || null, end: true });
        return;
      }
      T.splitCues(b.text).forEach((piece) => {
        const ss = T.sentences(piece.text);
        ss.forEach((s, k) => U.push({ s, p, cue: k === 0 ? piece.cue : null, end: false }));
      });
      if (U.length && U[U.length - 1].p === p) U[U.length - 1].end = true;
    });
    return U;
  }

  function indexTokens(UA, UB) {
    const df = new Map();
    const ids = new Map();
    const encode = (U) => U.map((u) => {
      const list = [];
      anchors(u.s).forEach((tok) => {
        if (!ids.has(tok)) ids.set(tok, ids.size);
        const id = ids.get(tok);
        df.set(id, (df.get(id) || 0) + 1);
        list.push(id);
      });
      return list;
    });
    const a = encode(UA), b = encode(UB);
    const N = UA.length + UB.length + 1;
    const idf = new Float32Array(ids.size);
    df.forEach((v, id) => { idf[id] = Math.log(N / v); });
    return { a, b, idf, size: ids.size };
  }

  const BEADS = [[1, 1, 0], [1, 2, 6], [2, 1, 6], [2, 2, 14], [1, 3, 18], [3, 1, 18], [2, 3, 24], [3, 2, 24], [1, 0, 60], [0, 1, 60]];

  // Allineamento frase per frase: lunghezze simili, parole affini, confini di paragrafo. Scorre solo vicino alla diagonale.
  function alignUnits(UA, UB) {
    const n = UA.length, m = UB.length;
    if (!n || !m) return [].concat(UA.map((u) => ({ a: [u], b: [] })), UB.map((u) => ({ a: [], b: [u] })));
    const LA = UA.map((u) => u.s.length), LB = UB.map((u) => u.s.length);
    const r = LB.reduce((x, y) => x + y, 0) / Math.max(1, LA.reduce((x, y) => x + y, 0));
    const tok = indexTokens(UA, UB);
    const stamp = new Int32Array(tok.size);
    let tick = 1;
    const band = Math.max(30, Math.ceil(Math.max(n, m) * 0.2) + Math.abs(n - m));
    const best = new Float64Array((n + 1) * (m + 1)).fill(Infinity), back = new Int8Array((n + 1) * (m + 1)).fill(-1);
    const at = (i, j) => i * (m + 1) + j;
    best[0] = 0;
    for (let i = 0; i <= n; i++) {
      const jc = Math.round(i * m / Math.max(1, n));
      const jFrom = Math.max(0, jc - band), jTo = Math.min(m, jc + band);
      for (let j = jFrom; j <= jTo; j++) {
        if (!i && !j) continue;
        let bv = Infinity, bk = -1;
        for (let k = 0; k < BEADS.length; k++) {
          const x = BEADS[k][0], y = BEADS[k][1];
          if (i < x || j < y) continue;
          const prev = best[at(i - x, j - y)];
          if (prev === Infinity) continue;
          let la = 0, lb = 0;
          for (let q = i - x; q < i; q++) la += LA[q];
          for (let q = j - y; q < j; q++) lb += LB[q];
          la *= r;
          let c = (la - lb) * (la - lb) / (la + lb + 40) * 0.5 + BEADS[k][2];
          tick++;
          for (let q = i - x; q < i; q++) { const t = tok.a[q]; for (let z = 0; z < t.length; z++) stamp[t[z]] = tick; }
          let sim = 0;
          for (let q = j - y; q < j; q++) { const t = tok.b[q]; for (let z = 0; z < t.length; z++) if (stamp[t[z]] === tick) { sim += tok.idf[t[z]]; stamp[t[z]] = 0; } }
          c -= 7 * sim;
          const ah = x && UA[i - x].heading, bh = y && UB[j - y].heading;
          if (!!ah !== !!bh) c += 40;
          if (x && y && UA[i - 1].end && UB[j - 1].end) c -= 4;
          const v = prev + c;
          if (v < bv) { bv = v; bk = k; }
        }
        best[at(i, j)] = bv; back[at(i, j)] = bk;
      }
    }
    if (best[at(n, m)] === Infinity) return null;
    const beads = [];
    for (let i = n, j = m; i > 0 || j > 0;) {
      const k = back[at(i, j)], x = BEADS[k][0], y = BEADS[k][1];
      beads.push({ a: UA.slice(i - x, i), b: UB.slice(j - y, j) });
      i -= x; j -= y;
    }
    return beads.reverse();
  }

  const joinUnits = (list) => list.map((u) => u.s).join(" ");

  function splitPair(a, b, maxw) {
    if (L.words(a) <= maxw && L.words(b) <= maxw * 1.15) return [[a, b]];
    const ca = T.cutPoints(a), cb = T.cutPoints(b);
    let best = null, score = Infinity;
    ca.forEach((pa) => {
      const ra = pa.at / a.length;
      if (L.words(a.slice(0, pa.at)) < 6 || L.words(a.slice(pa.at)) < 6) return;
      cb.forEach((pb) => {
        const rb = pb.at / b.length;
        if (L.words(b.slice(0, pb.at)) < 5 || L.words(b.slice(pb.at)) < 5) return;
        const sc = Math.abs(ra - rb) * 3 + Math.abs(ra - 0.5) + (pa.rank + pb.rank) * 0.03;
        if (sc < score) { score = sc; best = [pa.at, pb.at]; }
      });
    });
    if (!best || score > 1.2) return [[a, b]];
    return splitPair(a.slice(0, best[0]).trim(), b.slice(0, best[1]).trim(), maxw).concat(splitPair(a.slice(best[0]).trim(), b.slice(best[1]).trim(), maxw));
  }

  // Dalle coppie di frasi alle schermate: raggruppa fino al limite di parole, senza scavalcare paragrafi e cambi di slide.
  function beadsToSegments(beads, la, lb, opts, ratio) {
    const target = opts.target || 48, maxw = opts.maxw || Math.round(target * 1.45);
    const segs = [];
    let cur = null;
    const flush = () => { if (cur) { segs.push(cur); cur = null; } };
    beads.forEach((bead) => {
      const a = joinUnits(bead.a), b = joinUnits(bead.b);
      const first = bead.a[0] || bead.b[0];
      const p = first.p;
      const cue = (bead.a.find((u) => u.cue) || bead.b.find((u) => u.cue) || {}).cue || null;
      const heading = (bead.a[0] && bead.a[0].heading) || (bead.b[0] && bead.b[0].heading);
      const lonely = !bead.a.length || !bead.b.length;
      if (heading) {
        flush();
        const seg = { text: { [la]: a, [lb]: b }, p, heading: true };
        if (cue) seg.cue = cue;
        if (lonely) seg.check = "manca";
        segs.push(seg);
        return;
      }
      if (cue || (cur && cur.p !== p) || (cur && L.words(cur.text[la]) + L.words(a) > target)) flush();
      splitPair(a, b, maxw).forEach((pair, k) => {
        if (k > 0) flush();
        if (!cur) { cur = { text: { [la]: pair[0], [lb]: pair[1] }, p }; if (cue && k === 0) cur.cue = cue; }
        else { cur.text[la] = (cur.text[la] + " " + pair[0]).trim(); cur.text[lb] = (cur.text[lb] + " " + pair[1]).trim(); }
        if (lonely) cur.check = "manca";
      });
    });
    flush();
    const rr = ratio || (() => {
      const x = segs.reduce((n, s) => n + (s.text[la] || "").length, 0), y = segs.reduce((n, s) => n + (s.text[lb] || "").length, 0);
      return y / Math.max(1, x);
    })();
    segs.forEach((s) => {
      if (s.heading || s.check) return;
      const x = (s.text[la] || "").length, y = (s.text[lb] || "").length;
      if (x > 40 || y > 40) { const q = y / Math.max(1, x) / Math.max(0.01, rr); if (q < 0.55 || q > 1.8) s.check = "lunghezza"; }
    });
    return segs;
  }

  // Due testi completi nella stessa sequenza (due file, o due colonne di un PDF).
  function alignTexts(blocksA, blocksB, la, lb, opts) {
    const beads = alignUnits(units(blocksA), units(blocksB));
    if (!beads) throw new Error("I due testi sono troppo diversi per essere allineati automaticamente.");
    return beadsToSegments(beads, la, lb, opts);
  }

  // Coppie già note (righe di tabella, paragrafi alternati): si allinea solo dentro ogni coppia.
  function alignPairs(pairs, la, lb, opts) {
    const beads = [];
    pairs.forEach((pair, p) => {
      const UA = units(pair.a), UB = units(pair.b);
      (alignUnits(UA, UB) || [{ a: UA, b: UB }]).forEach((x) => {
        x.a.concat(x.b).forEach((u) => { u.p = p; });
        beads.push(x);
      });
    });
    return beadsToSegments(beads, la, lb, opts);
  }

  // Nuova lingua su schermate già pronte: ognuna riceve le frasi che le corrispondono.
  function alignToExisting(segs, baseLang, newLang, blocks) {
    const UB = units(blocks);
    const n = segs.length, m = UB.length;
    const LA = segs.map((s) => (s.text[baseLang] || "").length), LB = UB.map((u) => u.s.length);
    const r = LB.reduce((x, y) => x + y, 0) / Math.max(1, LA.reduce((x, y) => x + y, 0));
    const tok = indexTokens(segs.map((s) => ({ s: s.text[baseLang] || "" })), UB);
    const stamp = new Int32Array(tok.size);
    let tick = 1;
    const best = new Float64Array((n + 1) * (m + 1)).fill(Infinity), back = new Int8Array((n + 1) * (m + 1)).fill(-1);
    const at = (i, j) => i * (m + 1) + j;
    best[0] = 0;
    for (let i = 1; i <= n; i++) {
      for (let j = 0; j <= m; j++) {
        tick++;
        const t = tok.a[i - 1];
        for (let z = 0; z < t.length; z++) stamp[t[z]] = tick;
        let lb = 0, sim = 0;
        for (let k = 0; k <= 7 && k <= j; k++) {
          if (k > 0) {
            lb += LB[j - k];
            const tb = tok.b[j - k];
            for (let z = 0; z < tb.length; z++) if (stamp[tb[z]] === tick) { sim += tok.idf[tb[z]]; stamp[tb[z]] = 0; }
          }
          const prev = best[at(i - 1, j - k)];
          if (prev === Infinity) continue;
          const la = LA[i - 1] * r;
          const c = (lb - la) * (lb - la) / (la + 50) * 0.5 + (k === 0 ? 150 : 0) - 8 * sim;
          if (prev + c < best[at(i, j)]) { best[at(i, j)] = prev + c; back[at(i, j)] = k; }
        }
      }
    }
    if (best[at(n, m)] === Infinity) throw new Error("Il testo nella nuova lingua non si allinea a queste slide.");
    const out = segs.map((s) => Object.assign({}, s, { text: Object.assign({}, s.text) }));
    for (let i = n, j = m; i > 0; i--) {
      const k = back[at(i, j)];
      const text = joinUnits(UB.slice(j - k, j));
      out[i - 1].text[newLang] = text;
      const x = LA[i - 1], q = text.length / Math.max(1, x) / Math.max(0.01, r);
      if (!out[i - 1].heading && !out[i - 1].check && (!text || (x > 40 && (q < 0.55 || q > 1.8)))) out[i - 1].check = text ? "lunghezza" : "manca";
      j -= k;
    }
    return out;
  }

  // Ricalcola le schermate sul testo già allineato, con un altro limite di parole.
  function reflow(segs, la, lb, opts) {
    const groups = [];
    segs.forEach((s) => {
      const last = groups[groups.length - 1];
      if (last && last.p === s.p && !s.heading && !last.heading) last.items.push(s);
      else groups.push({ p: s.p, heading: !!s.heading, items: [s] });
    });
    const out = [];
    groups.forEach((g, gi) => {
      const mark = (s) => (s.cue ? T.CUE + s.cue + T.CUE_END + " " : "");
      if (g.heading) { const s = g.items[0]; out.push(Object.assign({}, s, { p: gi })); return; }
      const a = g.items.map((s) => mark(s) + (s.text[la] || "")).join(" ");
      const b = g.items.map((s) => (s.text[lb] || "")).join(" ");
      if (!b.trim()) { T.segmentSingle([{ text: a }], la, opts).forEach((s) => { s.p = gi; out.push(s); }); return; }
      beadsToSegments(alignUnits(units([{ text: a }]), units([{ text: b }])) || [], la, lb, opts).forEach((s) => { s.p = gi; out.push(s); });
    });
    return out;
  }

  L.Align = { units, alignUnits, alignTexts, alignPairs, alignToExisting, reflow, splitPair };
})(window.Diglot);
