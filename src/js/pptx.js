(function (L) {
  "use strict";

  // Disegna ogni diapositiva come un SVG autonomo, senza PowerPoint: posizioni, colori, testi, immagini, tabelle.
  // Grafici e SmartArt non si possono ricostruire: restano un riquadro segnalato, e per quelli serve il PDF.

  const EMU = 12700;
  const kid = (n, name) => { if (!n) return null; for (const c of n.children) if (c.localName === name) return c; return null; };
  const kids = (n, name) => (n ? [...n.children].filter((c) => !name || c.localName === name) : []);
  const path = (n, ...names) => { let cur = n; for (const name of names) { cur = kid(cur, name); if (!cur) return null; } return cur; };
  const num = (n, a, d) => { if (!n) return d; const v = n.getAttribute(a); return v === null || v === "" ? d : +v; };
  const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const parseXml = (text) => new DOMParser().parseFromString(text, "application/xml");
  const resolvePath = (base, target) => {
    if (target.startsWith("/")) return target.slice(1);
    const parts = base.split("/").slice(0, -1);
    target.split("/").forEach((p) => { if (p === "..") parts.pop(); else if (p !== ".") parts.push(p); });
    return parts.join("/");
  };

  async function readRels(zip, file) {
    const dir = file.split("/").slice(0, -1).join("/"), name = file.split("/").pop();
    const entry = zip.file(dir + "/_rels/" + name + ".rels");
    const map = {};
    if (!entry) return map;
    const doc = parseXml(await entry.async("string"));
    for (const r of doc.documentElement.children) map[r.getAttribute("Id")] = { type: (r.getAttribute("Type") || "").split("/").pop(), target: resolvePath(file, r.getAttribute("Target") || ""), external: r.getAttribute("TargetMode") === "External" };
    return map;
  }
  const relOf = (rels, type) => Object.values(rels).find((r) => r.type === type);
  const rid = (n, name) => n.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", name) || n.getAttribute("r:" + name);

  function parseTheme(doc) {
    const out = { colors: {}, major: "", minor: "" };
    if (!doc) return out;
    const scheme = doc.getElementsByTagNameNS("*", "clrScheme")[0];
    if (scheme) for (const c of scheme.children) {
      const v = c.children[0];
      if (v) out.colors[c.localName] = (v.getAttribute("val") && v.localName === "srgbClr" ? v.getAttribute("val") : v.getAttribute("lastClr") || "000000").toLowerCase();
    }
    const fs = doc.getElementsByTagNameNS("*", "fontScheme")[0];
    if (fs) {
      out.major = (path(fs, "majorFont", "latin") || { getAttribute: () => "" }).getAttribute("typeface") || "";
      out.minor = (path(fs, "minorFont", "latin") || { getAttribute: () => "" }).getAttribute("typeface") || "";
    }
    return out;
  }

  function hexToHsl(hex) {
    const n = parseInt(hex, 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  }
  function hslToHex(h, s, l) {
    const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    let r = l, g = l, b = l;
    if (s) { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3); }
    return [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
  }

  function schemeColor(name, ctx) {
    const map = ctx.clrMap || {};
    const key = map[name] || name;
    return ctx.theme.colors[key] || ctx.theme.colors[name] || "000000";
  }
  // Riceve l'elemento colore (srgbClr, schemeClr, ...) con le sue variazioni di luminosità.
  function colorValue(c, ctx) {
    if (!c) return null;
    let hex;
    switch (c.localName) {
      case "srgbClr": hex = c.getAttribute("val"); break;
      case "schemeClr": hex = c.getAttribute("val") === "phClr" ? ctx.phClr || "000000" : schemeColor(c.getAttribute("val"), ctx); break;
      case "sysClr": hex = c.getAttribute("lastClr") || "000000"; break;
      case "prstClr": hex = { black: "000000", white: "ffffff", red: "ff0000", blue: "0000ff", green: "008000", yellow: "ffff00", gray: "808080", grey: "808080" }[c.getAttribute("val")] || "000000"; break;
      default: return null;
    }
    let alpha = 1, [h, s, l] = hexToHsl(hex);
    for (const m of c.children) {
      const v = num(m, "val", 100000) / 100000;
      if (m.localName === "lumMod") l *= v;
      else if (m.localName === "lumOff") l += v;
      else if (m.localName === "satMod") s *= v;
      else if (m.localName === "tint") l = l * v + (1 - v);
      else if (m.localName === "shade") l *= v;
      else if (m.localName === "alpha") alpha = v;
    }
    return { hex: "#" + hslToHex(h, Math.min(1, s), Math.max(0, Math.min(1, l))), alpha };
  }
  const colorIn = (n, ctx) => { if (!n) return null; for (const c of n.children) { const v = colorValue(c, ctx); if (v) return v; } return null; };
  const cssColor = (c) => (c.alpha < 1 ? "rgba(" + [1, 3, 5].map((i) => parseInt(c.hex.substr(i, 2), 16)).join(",") + "," + c.alpha.toFixed(3) + ")" : c.hex);

  const SERIF = /garamond|times|georgia|cambria|palatino|book antiqua|minion|baskerville|constantia|serif/i;
  function fontStack(name, ctx) {
    let f = name || ctx.theme.minor || "";
    if (f === "+mj-lt" || f === "+mj-ea") f = ctx.theme.major;
    if (f === "+mn-lt" || f === "+mn-ea") f = ctx.theme.minor;
    const generic = SERIF.test(f) ? "Georgia, 'Times New Roman', serif" : "'Helvetica Neue', Helvetica, Arial, sans-serif";
    return f ? "'" + f.replace(/'/g, "") + "', " + generic : generic;
  }

  function mapRect(xf, tr) {
    return { x: tr.ox + (xf.x - tr.cx) * tr.sx, y: tr.oy + (xf.y - tr.cy) * tr.sy, w: xf.w * tr.sx, h: xf.h * tr.sy, rot: xf.rot, flipH: xf.flipH, flipV: xf.flipV };
  }
  function readXfrm(node) {
    if (!node) return null;
    const off = kid(node, "off"), ext = kid(node, "ext");
    if (!off || !ext) return null;
    return { x: num(off, "x", 0) / EMU, y: num(off, "y", 0) / EMU, w: num(ext, "cx", 0) / EMU, h: num(ext, "cy", 0) / EMU, rot: num(node, "rot", 0) / 60000, flipH: node.getAttribute("flipH") === "1", flipV: node.getAttribute("flipV") === "1" };
  }

  function presetPath(name, r, av) {
    const { x, y, w, h } = r, X = x + w, Y = y + h, cx = x + w / 2, cy = y + h / 2, m = Math.min(w, h);
    const adj = (key, d) => { const a = av[key]; return (a === undefined ? d : a) / 100000; };
    const poly = (pts) => "M" + pts.map((p) => p[0].toFixed(2) + " " + p[1].toFixed(2)).join("L") + "Z";
    switch (name) {
      case "rect": case "flowChartProcess": case "textBox": return { d: poly([[x, y], [X, y], [X, Y], [x, Y]]) };
      case "roundRect": case "flowChartAlternateProcess": {
        const rr = m * adj("adj", 16667);
        return { d: `M${x + rr} ${y}H${X - rr}A${rr} ${rr} 0 0 1 ${X} ${y + rr}V${Y - rr}A${rr} ${rr} 0 0 1 ${X - rr} ${Y}H${x + rr}A${rr} ${rr} 0 0 1 ${x} ${Y - rr}V${y + rr}A${rr} ${rr} 0 0 1 ${x + rr} ${y}Z` };
      }
      case "ellipse": case "flowChartConnector": return { d: `M${x} ${cy}A${w / 2} ${h / 2} 0 1 1 ${X} ${cy}A${w / 2} ${h / 2} 0 1 1 ${x} ${cy}Z` };
      case "line": case "straightConnector1": case "bentConnector2": case "bentConnector3": case "curvedConnector3": return { d: `M${x} ${y}L${X} ${Y}`, open: true };
      case "triangle": case "flowChartExtract": return { d: poly([[x + w * adj("adj", 50000), y], [X, Y], [x, Y]]) };
      case "rtTriangle": return { d: poly([[x, y], [X, Y], [x, Y]]) };
      case "diamond": case "flowChartDecision": return { d: poly([[cx, y], [X, cy], [cx, Y], [x, cy]]) };
      case "parallelogram": { const a = m * adj("adj", 25000); return { d: poly([[x + a, y], [X, y], [X - a, Y], [x, Y]]) }; }
      case "trapezoid": { const a = m * adj("adj", 25000); return { d: poly([[x + a, y], [X - a, y], [X, Y], [x, Y]]) }; }
      case "pentagon": return { d: poly([[cx, y], [X, y + h * 0.382], [x + w * 0.809, Y], [x + w * 0.191, Y], [x, y + h * 0.382]]) };
      case "hexagon": { const a = m * adj("adj", 25000); return { d: poly([[x + a, y], [X - a, y], [X, cy], [X - a, Y], [x + a, Y], [x, cy]]) }; }
      case "homePlate": { const a = m * adj("adj", 50000); return { d: poly([[x, y], [X - a, y], [X, cy], [X - a, Y], [x, Y]]) }; }
      case "chevron": { const a = m * adj("adj", 50000); return { d: poly([[x, y], [X - a, y], [X, cy], [X - a, Y], [x, Y], [x + a, cy]]) }; }
      case "rightArrow": { const t = h * adj("adj1", 50000), a = m * adj("adj2", 50000); return { d: poly([[x, cy - t / 2], [X - a, cy - t / 2], [X - a, y], [X, cy], [X - a, Y], [X - a, cy + t / 2], [x, cy + t / 2]]) }; }
      case "leftArrow": { const t = h * adj("adj1", 50000), a = m * adj("adj2", 50000); return { d: poly([[X, cy - t / 2], [x + a, cy - t / 2], [x + a, y], [x, cy], [x + a, Y], [x + a, cy + t / 2], [X, cy + t / 2]]) }; }
      case "downArrow": { const t = w * adj("adj1", 50000), a = m * adj("adj2", 50000); return { d: poly([[cx - t / 2, y], [cx + t / 2, y], [cx + t / 2, Y - a], [X, Y - a], [cx, Y], [x, Y - a], [cx - t / 2, Y - a]]) }; }
      case "upArrow": { const t = w * adj("adj1", 50000), a = m * adj("adj2", 50000); return { d: poly([[cx - t / 2, Y], [cx + t / 2, Y], [cx + t / 2, y + a], [X, y + a], [cx, y], [x, y + a], [cx - t / 2, y + a]]) }; }
      case "plus": case "mathPlus": { const a = m * adj("adj", 25000); return { d: poly([[x + a, y], [X - a, y], [X - a, y + a], [X, y + a], [X, Y - a], [X - a, Y - a], [X - a, Y], [x + a, Y], [x + a, Y - a], [x, Y - a], [x, y + a], [x + a, y + a]]) }; }
      default: return { d: poly([[x, y], [X, y], [X, Y], [x, Y]]), unknown: true };
    }
  }

  function customPath(geom, r) {
    let d = "";
    for (const p of kids(path(geom, "pathLst"), "path")) {
      const pw = num(p, "w", 0) || r.w * EMU, ph = num(p, "h", 0) || r.h * EMU, sx = r.w / pw, sy = r.h / ph;
      const pt = (n) => [r.x + num(n, "x", 0) * sx, r.y + num(n, "y", 0) * sy];
      let cur = [r.x, r.y];
      for (const c of p.children) {
        const pts = kids(c, "pt").map(pt);
        if (c.localName === "moveTo") { d += "M" + pts[0].join(" "); cur = pts[0]; }
        else if (c.localName === "lnTo") { d += "L" + pts[0].join(" "); cur = pts[0]; }
        else if (c.localName === "cubicBezTo") { d += "C" + pts.map((q) => q.join(" ")).join(" "); cur = pts[2]; }
        else if (c.localName === "quadBezTo") { d += "Q" + pts.map((q) => q.join(" ")).join(" "); cur = pts[1]; }
        else if (c.localName === "close") d += "Z";
        else if (c.localName === "arcTo") {
          const wr = num(c, "wR", 0) * sx, hr = num(c, "hR", 0) * sy, st = num(c, "stAng", 0) / 60000 * Math.PI / 180, sw = num(c, "swAng", 0) / 60000 * Math.PI / 180;
          const ox = cur[0] - wr * Math.cos(st), oy = cur[1] - hr * Math.sin(st), ex = ox + wr * Math.cos(st + sw), ey = oy + hr * Math.sin(st + sw);
          d += `A${wr} ${hr} 0 ${Math.abs(sw) > Math.PI ? 1 : 0} ${sw > 0 ? 1 : 0} ${ex} ${ey}`;
          cur = [ex, ey];
        }
      }
    }
    return { d };
  }

  function geometry(spPr, r) {
    const prst = kid(spPr, "prstGeom"), cust = kid(spPr, "custGeom");
    if (cust && kid(cust, "pathLst")) return customPath(cust, r);
    const av = {};
    if (prst) for (const g of kids(kid(prst, "avLst"), "gd")) { const m = /val\s+(-?\d+)/.exec(g.getAttribute("fmla") || ""); if (m) av[g.getAttribute("name")] = +m[1]; }
    return presetPath(prst ? prst.getAttribute("prst") : "rect", r, av);
  }

  let idSeq = 0;
  function fillAttr(spPr, styleNode, ctx, defs) {
    if (spPr) {
      if (kid(spPr, "noFill")) return "none";
      const solid = kid(spPr, "solidFill");
      if (solid) { const c = colorIn(solid, ctx); return c ? cssColor(c) : "none"; }
      const grad = kid(spPr, "gradFill");
      if (grad) return gradient(grad, ctx, defs);
      const patt = kid(spPr, "pattFill");
      if (patt) { const c = colorIn(kid(patt, "fgClr"), ctx); return c ? cssColor(c) : "none"; }
    }
    const ref = styleNode ? kid(styleNode, "fillRef") : null;
    if (ref && num(ref, "idx", 0) > 0) { const c = colorIn(ref, ctx); if (c) return cssColor(c); }
    return "none";
  }
  function gradient(grad, ctx, defs) {
    const stops = kids(kid(grad, "gsLst"), "gs").map((g) => ({ pos: num(g, "pos", 0) / 1000, c: colorIn(g, ctx) })).filter((s) => s.c).sort((a, b) => a.pos - b.pos);
    if (!stops.length) return "none";
    const ang = num(kid(grad, "lin"), "ang", 0) / 60000 * Math.PI / 180;
    const id = "g" + (++idSeq), dx = Math.cos(ang) / 2, dy = Math.sin(ang) / 2;
    defs.push(`<linearGradient id="${id}" x1="${0.5 - dx}" y1="${0.5 - dy}" x2="${0.5 + dx}" y2="${0.5 + dy}">` + stops.map((s) => `<stop offset="${s.pos}%" stop-color="${s.c.hex}" stop-opacity="${s.c.alpha}"/>`).join("") + "</linearGradient>");
    return `url(#${id})`;
  }
  function strokeAttrs(spPr, styleNode, ctx, defs) {
    const ln = spPr ? kid(spPr, "ln") : null;
    if (ln && kid(ln, "noFill")) return 'stroke="none"';
    let c = ln ? colorIn(kid(ln, "solidFill"), ctx) : null;
    let w = ln && ln.getAttribute("w") !== null ? num(ln, "w", 12700) / EMU : null;
    const ref = styleNode ? kid(styleNode, "lnRef") : null;
    if (!c && ref && num(ref, "idx", 0) > 0) { c = colorIn(ref, ctx); if (w === null) w = 0.75; }
    if (!c) return 'stroke="none"';
    let out = `stroke="${cssColor(c)}" stroke-width="${w === null ? 0.75 : w}"`;
    const dash = ln ? kid(ln, "prstDash") : null;
    if (dash) {
      const v = dash.getAttribute("val"), u = w || 1;
      const pat = { dash: [4, 3], sysDash: [3, 1], dot: [1, 1], sysDot: [1, 1], lgDash: [8, 3], dashDot: [4, 3, 1, 3] }[v];
      if (pat) out += ` stroke-dasharray="${pat.map((p) => p * u).join(" ")}"`;
    }
    const tail = ln ? kid(ln, "tailEnd") : null, head = ln ? kid(ln, "headEnd") : null;
    const marker = (node, attr) => {
      if (!node || !node.getAttribute("type") || node.getAttribute("type") === "none") return;
      const id = "m" + (++idSeq);
      defs.push(`<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${c.hex}"/></marker>`);
      out += ` ${attr}="url(#${id})"`;
    };
    marker(tail, "marker-end"); marker(head, "marker-start");
    return out;
  }
  function shadowStyle(spPr, ctx) {
    const sh = path(spPr, "effectLst", "outerShdw");
    if (!sh) return "";
    const c = colorIn(sh, ctx); if (!c) return "";
    const dist = num(sh, "dist", 0) / EMU, dir = num(sh, "dir", 0) / 60000 * Math.PI / 180, blur = num(sh, "blurRad", 0) / EMU;
    return `filter:drop-shadow(${(Math.cos(dir) * dist).toFixed(2)}px ${(Math.sin(dir) * dist).toFixed(2)}px ${(blur / 2).toFixed(2)}px ${cssColor(c)});`;
  }

  // Le proprietà del testo si ereditano: master, segnaposto del layout, forma, paragrafo, frammento.
  function lvlNode(list, lvl) { return list ? kid(list, "lvl" + (lvl + 1) + "pPr") : null; }
  function firstAttr(chain, name) { for (let i = chain.length - 1; i >= 0; i--) { const n = chain[i]; if (n && n.getAttribute(name) !== null) return n.getAttribute(name); } return null; }
  function firstKid(chain, ...names) { for (let i = chain.length - 1; i >= 0; i--) { const n = chain[i]; if (!n) continue; for (const name of names) { const k = kid(n, name); if (k) return k; } } return null; }

  function runStyle(rPrChain, ctx, scale) {
    let s = "";
    const sz = firstAttr(rPrChain, "sz"), size = (sz ? +sz / 100 : 18) * (scale || 1);
    s += `font-size:${size.toFixed(2)}px;`;
    const b = firstAttr(rPrChain, "b"), i = firstAttr(rPrChain, "i"), u = firstAttr(rPrChain, "u"), st = firstAttr(rPrChain, "strike"), cap = firstAttr(rPrChain, "cap"), base = firstAttr(rPrChain, "baseline");
    if (b === "1" || b === "true") s += "font-weight:700;";
    if (i === "1" || i === "true") s += "font-style:italic;";
    const deco = [u && u !== "none" ? "underline" : "", st && st !== "noStrike" ? "line-through" : ""].filter(Boolean).join(" ");
    if (deco) s += `text-decoration:${deco};`;
    if (cap === "all") s += "text-transform:uppercase;";
    if (cap === "small") s += "font-variant:small-caps;";
    if (base && +base !== 0) s += `vertical-align:${+base > 0 ? "super" : "sub"};font-size:${(size * 0.66).toFixed(2)}px;`;
    const fill = firstKid(rPrChain, "solidFill");
    const c = fill ? colorIn(fill, ctx) : null;
    s += `color:${c ? cssColor(c) : ctx.styleText ? cssColor(ctx.styleText) : "#" + schemeColor("tx1", ctx)};`;
    const latin = firstKid(rPrChain, "latin");
    s += `font-family:${fontStack(latin ? latin.getAttribute("typeface") : "", ctx)};`;
    return { css: s, size };
  }

  function bulletText(chain, counters, lvl) {
    const ch = firstKid(chain, "buChar"), auto = firstKid(chain, "buAutoNum");
    const noneIdx = lastIndexOfKid(chain, "buNone"), chIdx = lastIndexOfKid(chain, "buChar"), autoIdx = lastIndexOfKid(chain, "buAutoNum");
    if (noneIdx >= chIdx && noneIdx >= autoIdx && noneIdx >= 0) return null;
    if (autoIdx > chIdx && auto) {
      counters[lvl] = (counters[lvl] || 0) + 1;
      const n = counters[lvl], t = auto.getAttribute("type") || "arabicPeriod";
      const roman = (v) => { const R = [[10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]]; let o = ""; R.forEach(([a, b]) => { while (v >= a) { o += b; v -= a; } }); return o; };
      const core = /alphaLc/.test(t) ? String.fromCharCode(96 + n) : /alphaUc/.test(t) ? String.fromCharCode(64 + n) : /romanLc/.test(t) ? roman(n) : /romanUc/.test(t) ? roman(n).toUpperCase() : String(n);
      return /ParenBoth/.test(t) ? "(" + core + ")" : /ParenR/.test(t) ? core + ")" : core + ".";
    }
    if (ch) return ch.getAttribute("char") || "•";
    return null;
  }
  function lastIndexOfKid(chain, name) { for (let i = chain.length - 1; i >= 0; i--) if (chain[i] && kid(chain[i], name)) return i; return -1; }

  function spacing(node) {
    if (!node) return null;
    const pct = kid(node, "spcPct"), pts = kid(node, "spcPts");
    if (pct) return { pct: num(pct, "val", 100000) / 100000 };
    if (pts) return { pts: num(pts, "val", 0) / 100 };
    return null;
  }

  function paragraphsHTML(txBody, chainLists, ctx, opts) {
    const counters = {};
    let html = "";
    const scale = opts.fontScale || 1, lnCut = opts.lnReduce || 0;
    kids(txBody, "p").forEach((p, pi) => {
      const pPr = kid(p, "pPr");
      const lvl = num(pPr, "lvl", 0);
      Object.keys(counters).forEach((k) => { if (+k > lvl) delete counters[k]; });
      const chain = chainLists.map((list) => lvlNode(list, lvl));
      chain.push(pPr);
      const defR = chain.map((n) => (n ? kid(n, "defRPr") : null));
      const align = firstAttr(chain, "algn");
      const marL = +(firstAttr(chain, "marL") || 0) / EMU, indent = +(firstAttr(chain, "indent") || 0) / EMU;
      const runs = kids(p).filter((n) => n.localName === "r" || n.localName === "br" || n.localName === "fld");
      const firstPr = runs.length ? kid(runs[0], "rPr") : kid(p, "endParaRPr");
      const base = runStyle(defR.concat([firstPr]), ctx, scale);
      const spcBef = spacing(firstKid(chain, "spcBef")), spcAft = spacing(firstKid(chain, "spcAft")), lnSpc = spacing(firstKid(chain, "lnSpc"));
      let style = `margin:0;margin-left:${marL.toFixed(2)}px;text-indent:${indent.toFixed(2)}px;text-align:${{ ctr: "center", r: "right", just: "justify", dist: "justify" }[align] || "left"};`;
      const em = (sp) => (sp.pct !== undefined ? sp.pct * base.size * 1.2 : sp.pts * scale);
      if (spcBef && pi > 0) style += `margin-top:${em(spcBef).toFixed(2)}px;`;
      if (spcAft) style += `margin-bottom:${em(spcAft).toFixed(2)}px;`;
      const lh = lnSpc && lnSpc.pct !== undefined ? 1.2 * Math.max(0.5, lnSpc.pct - lnCut) : lnSpc && lnSpc.pts !== undefined ? null : 1.2 * (1 - lnCut);
      style += lh ? `line-height:${lh.toFixed(3)};` : `line-height:${(lnSpc.pts * scale).toFixed(2)}px;`;
      let inner = "";
      runs.forEach((r) => {
        if (r.localName === "br") { inner += "<br/>"; return; }
        const t = kid(r, "t"), rs = runStyle(defR.concat([kid(r, "rPr")]), ctx, scale);
        let text = t ? t.textContent : "";
        if (r.localName === "fld" && /slidenum/.test(r.getAttribute("type") || "")) text = String(ctx.slideNumber);
        inner += `<span style="${xmlEsc(rs.css)}">${xmlEsc(text)}</span>`;
      });
      const hasText = runs.some((r) => r.localName !== "br" && (kid(r, "t") || {}).textContent);
      if (hasText) {
        const bu = bulletText(chain, counters, lvl);
        if (bu !== null) {
          const clr = firstKid(chain, "buClr"), c = clr ? colorIn(clr, ctx) : null;
          const w = Math.max(0, -indent);
          inner = `<span style="display:inline-block;width:${w.toFixed(2)}px;text-indent:0;${xmlEsc(base.css)}${c ? "color:" + cssColor(c) + ";" : ""}">${xmlEsc(bu)}</span>` + inner;
        }
      } else inner += `<span style="${xmlEsc(base.css)}"><br/></span>`;
      html += `<p style="${xmlEsc(style)}">${inner}</p>`;
    });
    return html;
  }

  function textBox(sp, r, ctx, inherited) {
    const tx = kid(sp, "txBody");
    if (!tx) return "";
    if (!kids(tx, "p").some((p) => kids(p).some((n) => (n.localName === "r" || n.localName === "fld") && (kid(n, "t") || {}).textContent))) return "";
    const bodies = inherited.bodies.concat([kid(tx, "bodyPr")]);
    const ins = (name, d) => { const v = firstAttr(bodies, name); return (v === null ? d : +v) / EMU; };
    const anchor = firstAttr(bodies, "anchor") || "t", wrap = firstAttr(bodies, "wrap") || "square";
    const fit = firstKid(bodies, "normAutofit");
    const opts = { fontScale: fit ? num(fit, "fontScale", 100000) / 100000 : 1, lnReduce: fit ? num(fit, "lnSpcReduction", 0) / 100000 : 0 };
    const chain = inherited.lists.concat([kid(tx, "lstStyle")]);
    const inner = paragraphsHTML(tx, chain, ctx, opts);
    const justify = { t: "flex-start", ctr: "center", b: "flex-end" }[anchor] || "flex-start";
    const style = `display:flex;flex-direction:column;justify-content:${justify};box-sizing:border-box;width:100%;height:100%;padding:${ins("tIns", 45720).toFixed(2)}px ${ins("rIns", 91440).toFixed(2)}px ${ins("bIns", 45720).toFixed(2)}px ${ins("lIns", 91440).toFixed(2)}px;${wrap === "none" ? "white-space:nowrap;" : ""}overflow-wrap:break-word;`;
    return `<foreignObject x="${r.x.toFixed(2)}" y="${r.y.toFixed(2)}" width="${Math.max(1, r.w).toFixed(2)}" height="${Math.max(1, r.h).toFixed(2)}" style="overflow:visible"><div xmlns="http://www.w3.org/1999/xhtml" style="${xmlEsc(style)}">${inner}</div></foreignObject>`;
  }

  function placeholderSources(ph, level) {
    if (!ph) return { layoutSp: null, masterSp: null, masterList: level.masterOther };
    const type = ph.getAttribute("type") || "body", idx = ph.getAttribute("idx");
    const findIn = (tree, typeMatch) => {
      if (!tree) return null;
      for (const sp of kids(tree, "sp")) {
        const p = path(sp, "nvSpPr", "nvPr", "ph");
        if (!p) continue;
        if (idx !== null && p.getAttribute("idx") === idx) return sp;
        if (typeMatch(p.getAttribute("type") || "body")) return sp;
      }
      return null;
    };
    const same = (t) => t === type || (type === "ctrTitle" && t === "title") || (type === "subTitle" && t === "body");
    const layoutSp = findIn(level.layoutTree, same);
    const masterSp = findIn(level.masterTree, (t) => t === type || ((type === "ctrTitle") && t === "title") || ((type === "subTitle" || type === "obj" || type === "body") && t === "body"));
    const masterList = /^(title|ctrTitle)$/.test(type) ? level.masterTitle : /^(body|subTitle|obj)$/.test(type) || !["dt", "ftr", "sldNum"].includes(type) ? level.masterBody : level.masterOther;
    return { layoutSp, masterSp, masterList };
  }

  async function drawPicture(pic, r, ctx, out) {
    const blip = path(pic, "blipFill", "blip");
    const rel = blip ? ctx.rels[rid(blip, "embed")] : null;
    const data = rel ? await mediaData(rel.target, ctx) : null;
    if (!data) { out.warn("immagine in un formato non leggibile"); out.body.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#ddd"/>`); return; }
    const crop = path(pic, "blipFill", "srcRect");
    const cl = num(crop, "l", 0) / 1000, ct = num(crop, "t", 0) / 1000, cr = num(crop, "r", 0) / 1000, cb = num(crop, "b", 0) / 1000;
    out.body.push(`<g${transformOf(r)}><svg x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" viewBox="${cl * 10} ${ct * 10} ${(100 - cl - cr) * 10} ${(100 - ct - cb) * 10}" preserveAspectRatio="none"><image href="${data}" width="1000" height="1000" preserveAspectRatio="none"/></svg></g>`);
  }
  const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp", bmp: "image/bmp" };
  async function mediaData(file, ctx) {
    if (ctx.mediaCache.has(file)) return ctx.mediaCache.get(file);
    const entry = ctx.zip.file(file), mime = MIME[L.fileExt(file)];
    let v = null;
    if (entry && mime) v = "data:" + mime + ";base64," + await entry.async("base64");
    ctx.mediaCache.set(file, v);
    return v;
  }
  function transformOf(r) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, parts = [];
    if (r.rot) parts.push(`rotate(${r.rot} ${cx} ${cy})`);
    if (r.flipH || r.flipV) parts.push(`translate(${cx} ${cy}) scale(${r.flipH ? -1 : 1} ${r.flipV ? -1 : 1}) translate(${-cx} ${-cy})`);
    return parts.length ? ` transform="${parts.join(" ")}"` : "";
  }

  function drawTable(frame, r, ctx, out, level) {
    const tbl = path(frame, "graphic", "graphicData", "tbl");
    const cols = kids(kid(tbl, "tblGrid"), "gridCol").map((g) => num(g, "w", 0) / EMU), total = cols.reduce((a, b) => a + b, 0) || 1;
    const firstRow = (kid(tbl, "tblPr") || { getAttribute: () => null }).getAttribute("firstRow") === "1";
    let rows = "";
    kids(tbl, "tr").forEach((tr, ri) => {
      let cells = "";
      kids(tr, "tc").forEach((tc) => {
        if (tc.getAttribute("hMerge") === "1" || tc.getAttribute("vMerge") === "1") return;
        const pr = kid(tc, "tcPr");
        let css = "vertical-align:" + ({ ctr: "middle", b: "bottom" }[pr ? pr.getAttribute("anchor") : ""] || "top") + ";padding:3.6px 7.2px;";
        const fill = pr ? kid(pr, "solidFill") : null, c = fill ? colorIn(fill, ctx) : null;
        if (c) css += `background:${cssColor(c)};`;
        ["L", "R", "T", "B"].forEach((side) => {
          const ln = pr ? kid(pr, "ln" + side) : null, lc = ln ? colorIn(kid(ln, "solidFill"), ctx) : null;
          css += `border-${{ L: "left", R: "right", T: "top", B: "bottom" }[side]}:` + (lc ? `${(num(ln, "w", 12700) / EMU).toFixed(2)}px solid ${cssColor(lc)};` : ln && kid(ln, "noFill") ? "none;" : "0.75px solid rgba(0,0,0,.25);");
        });
        const span = num(tc, "gridSpan", 1), rspan = num(tc, "rowSpan", 1);
        const body = kid(tc, "txBody");
        const inner = body ? paragraphsHTML(body, [level.masterOther, kid(body, "lstStyle")], ctx, {}) : "";
        cells += `<td style="${xmlEsc(css + (firstRow && ri === 0 ? "font-weight:700;" : ""))}"${span > 1 ? ` colspan="${span}"` : ""}${rspan > 1 ? ` rowspan="${rspan}"` : ""}>${inner}</td>`;
      });
      rows += `<tr style="height:${(num(tr, "h", 0) / EMU * r.h / Math.max(1, r.tableH || r.h)).toFixed(2)}px">${cells}</tr>`;
    });
    const colgroup = cols.map((w) => `<col style="width:${(w / total * 100).toFixed(2)}%"/>`).join("");
    out.body.push(`<foreignObject x="${r.x}" y="${r.y}" width="${r.w}" height="${Math.max(r.h, 1) * 1.5}"><div xmlns="http://www.w3.org/1999/xhtml"><table style="border-collapse:collapse;table-layout:fixed;width:100%"><colgroup>${colgroup}</colgroup>${rows}</table></div></foreignObject>`);
  }

  async function drawTree(tree, tr, ctx, out, level, onlyDecor) {
    for (const node of tree.children) await drawNode(node, tr, ctx, out, level, onlyDecor);
  }

  async function drawNode(node, tr, ctx, out, level, onlyDecor) {
    switch (node.localName) {
      case "AlternateContent": {
        const pick = kid(node, "Fallback") || kid(node, "Choice");
        if (pick) for (const c of pick.children) await drawNode(c, tr, ctx, out, level, onlyDecor);
        return;
      }
      case "grpSp": {
        const xf = kid(kid(node, "grpSpPr"), "xfrm");
        if (!xf) { await drawTree(node, tr, ctx, out, level, onlyDecor); return; }
        const off = readXfrm(xf), chOff = kid(xf, "chOff"), chExt = kid(xf, "chExt");
        const mapped = mapRect(off, tr);
        const cw = num(chExt, "cx", 1) / EMU || 1, ch = num(chExt, "cy", 1) / EMU || 1;
        const next = { ox: mapped.x, oy: mapped.y, cx: num(chOff, "x", 0) / EMU, cy: num(chOff, "y", 0) / EMU, sx: mapped.w / cw, sy: mapped.h / ch };
        if (mapped.rot) out.body.push(`<g transform="rotate(${mapped.rot} ${mapped.x + mapped.w / 2} ${mapped.y + mapped.h / 2})">`);
        await drawTree(node, next, ctx, out, level, onlyDecor);
        if (mapped.rot) out.body.push("</g>");
        return;
      }
      case "pic": {
        const ph = path(node, "nvPicPr", "nvPr", "ph");
        if (onlyDecor && ph) return;
        const xf = readXfrm(kid(kid(node, "spPr"), "xfrm"));
        if (!xf) return;
        await drawPicture(node, mapRect(xf, tr), ctx, out);
        return;
      }
      case "cxnSp": case "sp": {
        const nv = kid(node, "nvSpPr") || kid(node, "nvCxnSpPr");
        const ph = path(nv, "nvPr", "ph");
        if (onlyDecor && ph) return;
        const src = placeholderSources(ph, level);
        const spPr = kid(node, "spPr");
        const xf = readXfrm(kid(spPr, "xfrm")) || readXfrm(path(src.layoutSp, "spPr", "xfrm")) || readXfrm(path(src.masterSp, "spPr", "xfrm"));
        if (!xf) return;
        const r = mapRect(xf, tr);
        const style = kid(node, "style");
        const srcPr = kid(spPr, "solidFill") || kid(spPr, "noFill") || kid(spPr, "gradFill") || !src.layoutSp ? spPr : kid(src.layoutSp, "spPr");
        const hasGeom = kid(spPr, "prstGeom") || kid(spPr, "custGeom");
        const geom = geometry(hasGeom ? spPr : srcPr || spPr, r);
        if (geom.unknown) out.warn("forma non riconosciuta, disegnata come rettangolo");
        const fill = geom.open ? "none" : fillAttr(srcPr, style, ctx, out.defs);
        const stroke = strokeAttrs(spPr, style, ctx, out.defs);
        if (fill !== "none" || stroke !== 'stroke="none"') {
          const shadow = shadowStyle(spPr, ctx);
          out.body.push(`<g${transformOf(r)}><path d="${geom.d}" fill="${fill}" ${stroke}${shadow ? ` style="${shadow}"` : ""}/></g>`);
        }
        const fontRef = style ? kid(style, "fontRef") : null;
        const fontColor = fontRef ? colorIn(fontRef, ctx) : null;
        const tCtx = fontColor ? Object.assign({}, ctx, { styleText: fontColor }) : ctx;
        // Il colore di stile della forma vale più dei predefiniti del documento, meno di quello scritto sul testo.
        const inherited = {
          lists: [ph ? src.masterList : fontColor ? null : level.defaults, src.masterSp ? path(src.masterSp, "txBody", "lstStyle") : null, src.layoutSp ? path(src.layoutSp, "txBody", "lstStyle") : null].filter(Boolean),
          bodies: [src.masterSp ? path(src.masterSp, "txBody", "bodyPr") : null, src.layoutSp ? path(src.layoutSp, "txBody", "bodyPr") : null],
        };
        const text = textBox(node, r, tCtx, inherited);
        if (text) out.body.push(r.rot ? `<g transform="rotate(${r.rot} ${r.x + r.w / 2} ${r.y + r.h / 2})">${text}</g>` : text);
        return;
      }
      case "graphicFrame": {
        const xf = readXfrm(kid(node, "xfrm"));
        if (!xf) return;
        const r = mapRect(xf, tr);
        const data = path(node, "graphic", "graphicData");
        if (data && kid(data, "tbl")) { drawTable(node, r, ctx, out, level); return; }
        out.warn(data && /chart/.test(data.getAttribute("uri") || "") ? "contiene un grafico" : "contiene un oggetto incorporato (SmartArt o simile)");
        out.body.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="#eeeeee" stroke="#999999" stroke-dasharray="4 3"/><foreignObject x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"><div xmlns="http://www.w3.org/1999/xhtml" style="display:flex;align-items:center;justify-content:center;height:100%;font:14px Helvetica,Arial,sans-serif;color:#444;text-align:center;padding:8px;box-sizing:border-box">Oggetto non riprodotto: carica le slide in PDF per vederlo</div></foreignObject>`);
        return;
      }
      default: return;
    }
  }

  async function background(chainDocs, W, H, ctx, out) {
    for (const d of chainDocs) {
      const bg = path(d.doc.documentElement, "cSld", "bg");
      if (!bg) continue;
      const pr = kid(bg, "bgPr"), ref = kid(bg, "bgRef");
      const useCtx = Object.assign({}, ctx, { rels: d.rels });
      if (pr) {
        const blip = path(pr, "blipFill", "blip");
        if (blip) {
          const rel = d.rels[rid(blip, "embed")], data = rel ? await mediaData(rel.target, useCtx) : null;
          if (data) { out.body.push(`<image href="${data}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`); return; }
        }
        const fill = fillAttr(pr, null, useCtx, out.defs);
        if (fill !== "none") { out.body.push(`<rect width="${W}" height="${H}" fill="${fill}"/>`); return; }
      } else if (ref) {
        const c = colorIn(ref, useCtx);
        if (c) { out.body.push(`<rect width="${W}" height="${H}" fill="${cssColor(c)}"/>`); return; }
      }
    }
    out.body.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  }

  async function load(zip, file) {
    const entry = zip.file(file);
    return { doc: parseXml(await entry.async("string")), rels: await readRels(zip, file), file };
  }

  L.Pptx = {
    async render(file, conf, progress) {
      let zip;
      try { zip = await JSZip.loadAsync(file); } catch (e) { throw new Error("Questo PowerPoint non si apre: potrebbe essere protetto da password o danneggiato. Esporta le slide in PDF e carica quello."); }
      if (!zip.file("ppt/presentation.xml")) throw new Error("Questo file non contiene diapositive di PowerPoint.");
      const pres = await load(zip, "ppt/presentation.xml");
      const root = pres.doc.documentElement;
      const sz = kid(root, "sldSz");
      const W = num(sz, "cx", 12192000) / EMU, H = num(sz, "cy", 6858000) / EMU;
      const defaults = kid(root, "defaultTextStyle");
      const ids = kids(kid(root, "sldIdLst"), "sldId");
      const slides = [], warnings = [], cache = new Map(), mediaCache = new Map();
      const cached = async (f) => { if (!cache.has(f)) cache.set(f, await load(zip, f)); return cache.get(f); };

      for (let n = 0; n < ids.length; n++) {
        if (progress) progress("Disegno la slide " + (n + 1) + " di " + ids.length);
        const rel = pres.rels[rid(ids[n], "id")];
        if (!rel) continue;
        const slide = await load(zip, rel.target);
        if (slide.doc.documentElement.getAttribute("show") === "0") continue;
        const layout = await cached(relOf(slide.rels, "slideLayout").target);
        const master = await cached(relOf(layout.rels, "slideMaster").target);
        const themeRel = relOf(master.rels, "theme");
        const themeDoc = themeRel ? (await cached(themeRel.target)).doc : null;
        const clr = kid(master.doc.documentElement, "clrMap");
        const clrMap = {};
        if (clr) for (const a of clr.attributes) clrMap[a.name] = a.value;
        const ctx = { zip, theme: parseTheme(themeDoc), clrMap, rels: slide.rels, slideNumber: n + 1, mediaCache };
        const tx = kid(master.doc.documentElement, "txStyles");
        const level = {
          layoutTree: path(layout.doc.documentElement, "cSld", "spTree"), masterTree: path(master.doc.documentElement, "cSld", "spTree"),
          masterTitle: tx ? kid(tx, "titleStyle") : null, masterBody: tx ? kid(tx, "bodyStyle") : null, masterOther: tx ? kid(tx, "otherStyle") : null, defaults,
        };
        const seen = new Set();
        const out = { body: [], defs: [], warn(msg) { if (!seen.has(msg)) { seen.add(msg); warnings.push("Slide " + (n + 1) + ": " + msg); } } };
        await background([slide, layout, master], W, H, ctx, out);
        const id = { ox: 0, oy: 0, cx: 0, cy: 0, sx: 1, sy: 1 };
        const showLayout = slide.doc.documentElement.getAttribute("showMasterSp") !== "0";
        if (showLayout) {
          if (layout.doc.documentElement.getAttribute("showMasterSp") !== "0") await drawTree(level.masterTree, id, Object.assign({}, ctx, { rels: master.rels }), out, level, true);
          await drawTree(level.layoutTree, id, Object.assign({}, ctx, { rels: layout.rels }), out, level, true);
        }
        await drawTree(path(slide.doc.documentElement, "cSld", "spTree"), id, ctx, out, level, false);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${Math.round(W * 2)}" height="${Math.round(H * 2)}"><defs>${out.defs.join("")}</defs>${out.body.join("")}</svg>`;
        const media = await L.Store.putMedia(new Blob([svg], { type: "image/svg+xml" }), conf.id, file.name + " · " + (n + 1));
        slides.push({ media, w: Math.round(W * 2), h: Math.round(H * 2) });
        await L.yieldUI();
      }
      return { slides, warnings };
    },
  };
})(window.Diglot);
