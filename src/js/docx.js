(function (L) {
  "use strict";
  const T = L.Text;

  const on = (node) => {
    if (!node) return false;
    const v = node.getAttributeNS(node.namespaceURI, "val") || node.getAttribute("w:val");
    return !(v === "0" || v === "false" || v === "none");
  };
  const child = (node, name) => { for (const c of node.children) if (c.localName === name) return c; return null; };
  const attr = (node, name) => (node ? node.getAttribute("w:" + name) || node.getAttributeNS(node.namespaceURI, name) : null);

  function parseStyles(xml) {
    const map = {};
    if (!xml) return map;
    const dom = new DOMParser().parseFromString(xml, "application/xml");
    for (const s of dom.getElementsByTagNameNS("*", "style")) {
      const id = attr(s, "styleId"), nameEl = child(s, "name"), ppr = child(s, "pPr"), based = child(s, "basedOn");
      const lvl = ppr ? child(ppr, "outlineLvl") : null;
      map[id] = { name: (attr(nameEl, "val") || "").toLowerCase(), outline: lvl ? +attr(lvl, "val") : null, basedOn: attr(based, "val") };
    }
    return map;
  }
  function styleInfo(styles, id) {
    const out = { heading: false, title: false, quote: false, skip: false };
    for (let cur = id, hops = 0; cur && styles[cur] && hops < 6; cur = styles[cur].basedOn, hops++) {
      const s = styles[cur];
      if (/^(toc|inhalt|sommario|indice|table of|footnote|endnote|fußnote|nota a piè)/.test(s.name)) out.skip = true;
      if (/^(title|titolo|titel|titre|título)$/.test(s.name)) out.title = true;
      if (/heading|titolo \d|überschrift|titre \d|título \d/.test(s.name) || (s.outline !== null && s.outline < 9)) out.heading = true;
      if (/quote|citazione|zitat|citation|cita/.test(s.name)) out.quote = true;
    }
    return out;
  }

  // Testo e grassetto carattere per carattere: «(1)» può arrivare diviso in tre pezzi.
  function collectRuns(node, out) {
    for (const c of node.children) {
      switch (c.localName) {
        case "r": readRun(c, out); break;
        case "ins": case "hyperlink": case "smartTag": case "sdt": case "sdtContent": case "fldSimple": case "moveTo": collectRuns(c, out); break;
        default: break;
      }
    }
  }
  function readRun(r, out) {
    const pr = child(r, "rPr");
    const bold = pr ? on(child(pr, "b")) : false;
    const italic = pr ? on(child(pr, "i")) : false;
    const vert = pr ? attr(child(pr, "vertAlign"), "val") : null;
    if (pr && child(pr, "vanish")) return;
    let text = "";
    for (const c of r.children) {
      if (c.localName === "t") text += c.textContent;
      else if (c.localName === "tab") text += " ";
      else if (c.localName === "br" || c.localName === "cr") text += "\n";
      else if (c.localName === "noBreakHyphen") text += "-";
    }
    if (!text) return;
    if (vert === "superscript" && /^[\s\d*†,]+$/.test(text)) return;
    out.push({ t: text, b: bold, i: italic });
  }

  function paragraph(p, styles) {
    const ppr = child(p, "pPr");
    const style = styleInfo(styles, ppr ? attr(child(ppr, "pStyle"), "val") : null);
    if (style.skip) return null;
    const runs = [];
    collectRuns(p, runs);
    let text = "", boldMap = "";
    runs.forEach((r) => { text += r.t; boldMap += (r.b ? "1" : "0").repeat(r.t.length); });
    if (!text.trim()) return null;

    let marked = "", last = 0, m;
    const re = /[(\[]\d{1,3}[)\]]/g;
    while ((m = re.exec(text))) {
      const allBold = boldMap.slice(m.index, m.index + m[0].length).indexOf("0") < 0;
      const before = text.slice(0, m.index).trimEnd();
      if (allBold && (!before || /[.?!»”“:]$/.test(before))) {
        marked += text.slice(last, m.index) + T.CAND + m[0] + T.CAND_END;
        last = m.index + m[0].length;
      }
    }
    marked += text.slice(last);
    const bare = T.clean(text);
    const visible = runs.filter((r) => r.t.trim());
    const allBold = visible.length > 0 && visible.every((r) => r.b);
    const allItalic = visible.length > 0 && visible.every((r) => r.i);
    const w = L.words(bare), noEnd = !/[.;:,!]$/.test(bare);
    const numbered = /^(\d+|[IVXLC]+)[.)]\s+\S/.test(bare) && w <= 14 && noEnd;
    const heading = style.heading || style.title || (w <= 14 && noEnd && allBold) || numbered;
    return { text: T.markExplicitCues(marked), heading, title: style.title, quote: style.quote || (allItalic && w > 20), italic: allItalic };
  }

  // Alcuni file bilingui mettono originale e traduzione nello stesso paragrafo, separati da un a capo.
  function splitMixedLines(block) {
    const lines = block.text.split("\n").filter((x) => x.trim());
    if (lines.length < 2) return [block];
    const langs = lines.map((x) => T.detectLang(T.stripMarks(x)).lang);
    const mixed = lines.every((x) => L.words(T.stripMarks(x)) >= 4) && langs.some((c, i) => i > 0 && c && langs[i - 1] && c !== langs[i - 1]);
    return mixed ? lines.map((x) => Object.assign({}, block, { text: x })) : [block];
  }

  function walk(node, styles, out, table) {
    for (const c of node.children) {
      if (c.localName === "p") {
        const b = paragraph(c, styles);
        if (b) splitMixedLines(b).forEach((part) => { if (table) part.table = table; out.push(part); });
      } else if (c.localName === "tbl") {
        const t = out.tableCount = (out.tableCount || 0) + 1;
        let r = 0;
        for (const row of c.children) {
          if (row.localName !== "tr") continue;
          let col = 0;
          for (const cell of row.children) {
            if (cell.localName !== "tc") continue;
            walk(cell, styles, out, { t, r, c: col });
            col++;
          }
          r++;
        }
      } else if (c.localName === "sdt" || c.localName === "sdtContent" || c.localName === "customXml" || c.localName === "ins") {
        walk(c, styles, out, table);
      }
    }
  }

  L.Docx = {
    async read(file) {
      let zip;
      try { zip = await JSZip.loadAsync(file); } catch (e) { throw new Error("Questo file Word non si apre: potrebbe essere protetto da password o danneggiato. Salvalo di nuovo senza password e riprova."); }
      const main = zip.file("word/document.xml");
      if (!main) throw new Error("Questo file non contiene un documento Word.");
      const stylesFile = zip.file("word/styles.xml");
      const styles = parseStyles(stylesFile ? await stylesFile.async("string") : "");
      const dom = new DOMParser().parseFromString(await main.async("string"), "application/xml");
      const body = dom.getElementsByTagNameNS("*", "body")[0];
      if (!body) throw new Error("Il documento Word è vuoto.");
      const blocks = [];
      walk(body, styles, blocks, null);
      return { kind: "docx", name: file.name, blocks: blocks.slice(), meta: {} };
    },
  };
})(window.Diglot);
