(function (L) {
  "use strict";
  const T = L.Text;

  let configured = false;
  function setup() {
    if (configured) return;
    const bin = atob(window.DIGLOT_PDF_WORKER), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([bytes], { type: "text/javascript" }));
    configured = true;
  }

  async function open(file) {
    setup();
    const data = new Uint8Array(await file.arrayBuffer());
    // isEvalSupported spento: un PDF ostile non può eseguire codice attraverso i font (CVE-2024-4367).
    const task = pdfjsLib.getDocument({ data, isEvalSupported: false });
    try { return await task.promise; } catch (e) {
      if (e && e.name === "PasswordException") throw new Error("Questo PDF è protetto da password. Toglila e riprova.");
      throw new Error("Questo PDF non si apre: potrebbe essere danneggiato.");
    }
  }

  function median(values) {
    if (!values.length) return 0;
    const v = values.slice().sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  }

  async function pageItems(page) {
    const vp = page.getViewport({ scale: 1 });
    await page.getOperatorList();
    const tc = await page.getTextContent();
    const items = [];
    tc.items.forEach((it) => {
      if (!it.str || !it.str.trim() || !it.transform) return;
      const t = it.transform;
      if (Math.abs(t[1]) > 0.5 || Math.abs(t[2]) > 0.5) return;
      let font = "";
      try { if (page.commonObjs.has(it.fontName)) font = page.commonObjs.get(it.fontName).name || ""; } catch (e) { font = ""; }
      items.push({ s: it.str, x: t[4], y: vp.height - t[5], size: Math.abs(t[3]) || it.height || 10, w: it.width || 0, bold: /bold|black|heavy|semibold|demi/i.test(font), italic: /italic|oblique/i.test(font) });
    });
    return { W: vp.width, H: vp.height, items };
  }

  function bodySize(pages) {
    const hist = {};
    pages.forEach((p) => p.items.forEach((i) => { const k = Math.round(i.size * 2) / 2; hist[k] = (hist[k] || 0) + i.s.length; }));
    let best = 0, n = 0;
    for (const k in hist) if (hist[k] > n) { n = hist[k]; best = +k; }
    return best || 10;
  }

  // Righe della pagina; una riga con un grande vuoto al centro diventa due frammenti (due colonne).
  function pageLines(page, body, pageIndex) {
    const items = page.items.filter((i) => !(i.size < body * 0.8 && /^[\s\d*†,.]+$/.test(i.s)));
    items.sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = [];
    items.forEach((it) => {
      const row = rows[rows.length - 1];
      if (row && Math.abs(row.y - it.y) < Math.max(row.size, it.size) * 0.4) { row.items.push(it); row.size = Math.max(row.size, it.size); }
      else rows.push({ y: it.y, size: it.size, items: [it] });
    });
    const lines = [];
    rows.forEach((row) => {
      row.items.sort((a, b) => a.x - b.x);
      let frag = null;
      const flush = () => { if (frag) lines.push(frag); frag = null; };
      row.items.forEach((it) => {
        if (frag && it.x - frag.x1 > Math.max(1.6 * row.size, page.W * 0.035)) flush();
        if (!frag) frag = { page: pageIndex, y: row.y, size: 0, x0: it.x, x1: it.x, text: "", boldChars: 0, chars: 0, italicChars: 0 };
        const needSpace = frag.text && !/\s$/.test(frag.text) && !/^\s/.test(it.s) && it.x - frag.x1 > it.size * 0.18;
        const trimmed = it.s.trim();
        const cand = it.bold && /^[(\[]\d{1,3}[)\]]$/.test(trimmed);
        frag.text += (needSpace ? " " : "") + (cand ? T.CAND + trimmed + T.CAND_END + " " : it.s);
        frag.x1 = Math.max(frag.x1, it.x + it.w);
        frag.size = Math.max(frag.size, it.size);
        const n = it.s.trim().length;
        frag.chars += n;
        if (it.bold) frag.boldChars += n;
        if (it.italic) frag.italicChars += n;
      });
      flush();
    });
    return lines;
  }

  function stripRunningText(pageLineSets, pages) {
    const seen = {};
    const key = (l) => T.clean(T.stripMarks(l.text)).replace(/\d+/g, "#").toLowerCase();
    pageLineSets.forEach((lines, n) => {
      const H = pages[n].H;
      new Set(lines.filter((l) => l.y < H * 0.12 || l.y > H * 0.88).map(key)).forEach((k) => { seen[k] = (seen[k] || 0) + 1; });
    });
    const limit = Math.max(3, Math.ceil(pages.length * 0.3));
    return pageLineSets.map((lines, n) => {
      const H = pages[n].H;
      return lines.filter((l) => {
        if (!(l.y < H * 0.12 || l.y > H * 0.88)) return true;
        const k = key(l);
        return !(seen[k] >= limit || /^[#\W]*$/.test(k));
      });
    });
  }

  // Note a piè di pagina: righe in corpo minore, contigue, a partire dal fondo.
  function stripFootnotes(lines, body) {
    const out = lines.slice().sort((a, b) => a.y - b.y);
    let removed = 0;
    while (out.length && out[out.length - 1].size < body * 0.93) { out.pop(); removed++; }
    return { lines: out, removed };
  }

  const END = /[.?!:»”"]$/;
  const KEEP_HYPHEN = /^(und|oder|bzw|sowie|and|or|e|ed|o|et|ou|y)\b/;

  function joinLines(a, b) {
    if (/\p{L}-$/u.test(a) && /^\p{Ll}/u.test(b)) return KEEP_HYPHEN.test(b) ? a + " " + b : a.slice(0, -1) + b;
    return a + " " + b;
  }

  function paragraphs(lines, body) {
    if (!lines.length) return [];
    const gaps = [];
    for (let i = 1; i < lines.length; i++) {
      const dy = lines[i].y - lines[i - 1].y;
      if (lines[i].page === lines[i - 1].page && dy > 0 && dy < body * 3) gaps.push(dy);
    }
    const lh = median(gaps) || body * 1.3;
    const leftEdge = median(lines.map((l) => Math.round(l.x0)));
    const right = lines.map((l) => l.x1).sort((a, b) => a - b)[Math.floor(lines.length * 0.9)] || 0;
    const width = Math.max(1, right - leftEdge);
    const out = [];
    let cur = null, prev = null;
    const push = () => { if (cur) out.push(cur); };
    lines.forEach((line) => {
      const plain = T.clean(T.stripMarks(line.text));
      const startsLow = /^\p{Ll}/u.test(plain);
      const opensBlock = !prev || line.page !== prev.page || line.y - prev.y > lh * 1.2 || END.test(T.clean(prev.text));
      const isHead = !startsLow && opensBlock && (line.size >= body * 1.15 || (line.chars && line.boldChars / line.chars > 0.9 && L.words(plain) <= 14 && !/[.;:,]$/.test(plain)));
      let brk = !cur;
      if (prev && !brk) {
        if (line.page === prev.page) {
          const dy = line.y - prev.y;
          if (dy > lh * 1.5 || dy < 0) brk = true;
          else if (line.x0 > leftEdge + line.size * 0.8 && prev.x0 <= leftEdge + line.size * 0.5) brk = true;
          else if (prev.x1 < right - width * 0.15 && END.test(T.clean(prev.text))) brk = true;
        } else brk = END.test(T.clean(prev.text));
        if (isHead !== cur.heading) brk = true;
      }
      if (brk) { push(); cur = { text: line.text.trim(), heading: !!isHead, page: line.page, indent: line.x0 - leftEdge, italicChars: line.italicChars, chars: line.chars }; }
      else { cur.text = joinLines(cur.text.trim(), line.text.trim()); cur.italicChars += line.italicChars; cur.chars += line.chars; }
      prev = line;
    });
    push();
    // Tolti i numeri delle note, resta a volte uno spazio davanti alla punteggiatura.
    return out.map((p) => ({ text: T.markExplicitCues(p.text.replace(/\s+([.,])(?=\s|$)/g, "$1")), heading: p.heading, quote: p.indent > body * 1.5 || (p.chars > 120 && p.italicChars / p.chars > 0.9), page: p.page }));
  }

  async function pageImage(doc, n, file, conf) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(4, 1920 / Math.max(base.width, base.height));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob = await L.Decks.canvasBlob(canvas);
    const media = await L.Store.putMedia(blob, conf.id, file.name + " · " + n);
    const out = { media, w: canvas.width, h: canvas.height };
    canvas.width = canvas.height = 0;
    page.cleanup();
    return out;
  }

  L.Pdf = {
    open,
    async read(file, progress) {
      const doc = await open(file);
      const pages = [];
      for (let n = 1; n <= doc.numPages; n++) {
        if (progress) progress("Leggo la pagina " + n + " di " + doc.numPages);
        const page = await doc.getPage(n);
        pages.push(await pageItems(page));
        page.cleanup();
        if (n % 4 === 0) await L.yieldUI();
      }
      await doc.destroy();
      const chars = pages.reduce((a, p) => a + p.items.reduce((x, i) => x + i.s.length, 0), 0);
      if (chars < 20 * pages.length) return { kind: "pdf", name: file.name, blocks: [], meta: { scanned: true, pages: pages.length } };

      const body = bodySize(pages);
      const stripped = stripRunningText(pages.map((p, i) => pageLines(p, body, i)), pages);
      let notes = 0;
      const flow = [], left = [], right = [];
      let twoCol = 0;
      stripped.forEach((all, n) => {
        const res = stripFootnotes(all, body);
        notes += res.removed;
        const W = pages[n].W, mid = W / 2, slack = W * 0.02;
        const isL = (l) => l.x1 < mid + slack, isR = (l) => l.x0 > mid - slack;
        const L_ = res.lines.filter(isL), R_ = res.lines.filter(isR), F = res.lines.filter((l) => !isL(l) && !isR(l));
        if (L_.length >= 4 && R_.length >= 4 && F.length <= (res.lines.length || 1) * 0.25) {
          twoCol++;
          const firstBody = Math.min(L_[0].y, R_[0].y);
          F.filter((l) => l.y < firstBody).forEach((l) => flow.push(l));
          L_.forEach((l) => { flow.push(l); left.push(l); });
          R_.forEach((l) => { flow.push(l); right.push(l); });
          F.filter((l) => l.y >= firstBody).forEach((l) => flow.push(l));
        } else res.lines.forEach((l) => flow.push(l));
      });
      const parsed = { kind: "pdf", name: file.name, blocks: paragraphs(flow, body), meta: { pages: pages.length, notes } };
      if (twoCol >= Math.max(1, pages.length * 0.6)) parsed.columns = { left: paragraphs(left, body), right: paragraphs(right, body) };
      return parsed;
    },
    // Ogni pagina diventa un'immagine: è il modo fedele di proiettare slide esportate in PDF.
    async renderPages(file, conf, progress) {
      const doc = await open(file);
      const slides = [];
      for (let n = 1; n <= doc.numPages; n++) {
        if (progress) progress("Preparo la slide " + n + " di " + doc.numPages);
        slides.push(await pageImage(doc, n, file, conf));
        await L.yieldUI();
      }
      await doc.destroy();
      return slides;
    },
    async renderFirstPage(file, conf) {
      const doc = await open(file);
      const out = await pageImage(doc, 1, file, conf);
      out.pages = doc.numPages;
      await doc.destroy();
      return out;
    },
  };
})(window.Diglot);
