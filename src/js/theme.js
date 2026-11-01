(function (L) {
  "use strict";

  // Tre scelte per modo: fondo, testo, accento. Il resto si ricava, così il contrasto resta sotto controllo.
  const PRESETS = {
    carta: { name: "Carta e oro", light: { paper: "#f2ebdd", ink: "#2a2420", accent: "#b48a4e" }, dark: { paper: "#241f1b", ink: "#f1e9da", accent: "#d0a868" } },
    aula: { name: "Bianco, sale luminose", light: { paper: "#ffffff", ink: "#111111", accent: "#a2341f" }, dark: { paper: "#111111", ink: "#ffffff", accent: "#ef8f75" } },
    ardesia: { name: "Ardesia, sale buie", light: { paper: "#e8ecec", ink: "#14242b", accent: "#1f6f78" }, dark: { paper: "#10202a", ink: "#eef3f3", accent: "#67c1c9" } },
    inchiostro: { name: "Inchiostro blu", light: { paper: "#f4f2ec", ink: "#16243f", accent: "#34507f" }, dark: { paper: "#121a2c", ink: "#eef0f5", accent: "#94afdc" } },
  };

  const SERIF_FALLBACK = '"Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif';
  const SANS_FALLBACK = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const FONTS = [
    { family: "EB Garamond", kind: "serif", note: "incluso" },
    { family: "Archivo", kind: "sans", note: "incluso" },
    { family: "Georgia", kind: "serif" }, { family: "Times New Roman", kind: "serif" }, { family: "Palatino", kind: "serif" },
    { family: "Helvetica Neue", kind: "sans" }, { family: "Arial", kind: "sans" }, { family: "Verdana", kind: "sans" }, { family: "Tahoma", kind: "sans" },
  ];

  function defaults() {
    return {
      preset: "carta", light: Object.assign({}, PRESETS.carta.light), dark: Object.assign({}, PRESETS.carta.dark), mode: "light",
      fontText: "EB Garamond", fontLabel: "Archivo", fonts: [],
      size: 1, lineHeight: 1.32, align: "left", margin: 7,
      bar: true, barCaps: true, progress: true, sideText: 42,
      logo: null, coverBg: null,
    };
  }
  function normalize(t) {
    const base = defaults(), out = Object.assign(base, t || {});
    out.light = Object.assign({}, PRESETS.carta.light, t && t.light);
    out.dark = Object.assign({}, PRESETS.carta.dark, t && t.dark);
    out.fonts = (t && t.fonts) || [];
    return out;
  }

  function parse(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    const n = m ? parseInt(m[1], 16) : 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function toHex(rgb) { return "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""); }
  function mix(a, b, f) { const x = parse(a), y = parse(b); return toHex(x.map((v, i) => v + (y[i] - v) * f)); }
  function lum(hex) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const c = parse(hex);
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function contrast(a, b) {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  // Avvicina il colore all'inchiostro quanto basta per il contrasto AA sul fondo.
  function legibleOn(color, paper, ink) {
    let out = color;
    for (let f = 0; f <= 1 && contrast(out, paper) < 4.5; f += 0.05) out = mix(color, ink, f);
    return out;
  }

  function palette(p) {
    return {
      paper: p.paper, ink: p.ink, accent: p.accent,
      paper2: mix(p.paper, p.ink, 0.06),
      inkSoft: legibleOn(mix(p.ink, p.paper, 0.34), p.paper, p.ink),
      accentInk: legibleOn(p.accent, p.paper, p.ink),
      rule: mix(p.paper, p.ink, 0.22),
      tint: mix(p.paper, p.accent, 0.16),
    };
  }

  function stack(theme, family, kind) {
    const known = FONTS.find((f) => f.family === family);
    const k = known ? known.kind : kind;
    return '"' + family + '", ' + (k === "sans" ? SANS_FALLBACK : SERIF_FALLBACK);
  }

  const loadedFonts = new Set();
  async function loadCustomFonts(theme) {
    for (const f of theme.fonts || []) {
      if (loadedFonts.has(f.media)) continue;
      const rec = await L.Store.getMedia(f.media);
      if (!rec) continue;
      try {
        const face = new FontFace(f.family, await rec.blob.arrayBuffer());
        await face.load();
        document.fonts.add(face);
        loadedFonts.add(f.media);
      } catch (e) { /* carattere illeggibile: resta quello di riserva */ }
    }
  }

  function apply(theme, mode, target) {
    const p = palette(mode === "dark" ? theme.dark : theme.light);
    const s = (target || document.documentElement).style;
    s.setProperty("--paper", p.paper); s.setProperty("--paper-2", p.paper2);
    s.setProperty("--ink", p.ink); s.setProperty("--ink-soft", p.inkSoft);
    s.setProperty("--accent", p.accent); s.setProperty("--accent-ink", p.accentInk);
    s.setProperty("--accent-tint", p.tint); s.setProperty("--rule", p.rule);
    s.setProperty("--font-text", stack(theme, theme.fontText, "serif"));
    s.setProperty("--font-label", stack(theme, theme.fontLabel, "sans"));
    s.setProperty("--text-lh", String(theme.lineHeight));
    s.setProperty("--text-align", theme.align === "justify" ? "justify" : theme.align === "center" ? "center" : "left");
    s.setProperty("--stage-margin", theme.margin + "vw");
    s.setProperty("--bar-case", theme.barCaps ? "uppercase" : "none");
    s.setProperty("--bar-track", theme.barCaps ? ".1em" : ".02em");
    const side = Math.max(25, Math.min(70, theme.sideText || 42));
    s.setProperty("--side-cols", side + "fr " + (100 - side) + "fr");
  }

  L.Theme = { PRESETS, FONTS, defaults, normalize, palette, contrast, mix, apply, loadCustomFonts };
})(window.Diglot);
