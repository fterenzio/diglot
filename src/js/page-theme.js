(function (L) {
  "use strict";
  const { el } = L, M = L.Model, TH = L.Theme, Store = L.Store, Studio = L.Studio;

  const SCENES = [["conf", "Copertina"], ["cover", "Titolo intervento"], ["text", "Testo"], ["section", "Titolo di sezione"], ["sheet", "Foglio unico"], ["side", "Testo e slide"], ["disc", "Discussione"]];

  function group(title, ...kids) { return el("section", { class: "th-group" }, el("h2", null, title), kids); }

  Studio.pages.theme = async function (confId) {
    const conf = await Studio.openConf(confId);
    if (!conf) { location.hash = "#/"; return; }
    const th = conf.theme;
    const main = Studio.shell("theme");
    document.title = "Grafica · Diglot";
    let scene = "text", previewMode = th.mode;
    const frame = el("iframe", { id: "th-preview", title: "Anteprima dello schermo", src: L.planUrl("#/play?" + new URLSearchParams({ c: conf.id, t: "__sample", preview: "1", scene }).toString()) });
    const send = () => {
      const w = frame.contentWindow;
      if (w) w.postMessage({ diglotTheme: Object.assign({}, th, { mode: previewMode }) }, "*");
    };
    let ready = false;
    frame.addEventListener("load", () => {
      ready = true;
      setTimeout(() => { send(); if (frame.contentWindow) frame.contentWindow.postMessage({ diglotScene: scene }, "*"); }, 400);
    });
    let settle = null;
    // Trascinare un cursore è una modifica sola: l'annullamento torna a prima del gesto.
    const begin = () => {
      if (!Studio.editing) { Studio.snapshot(); Studio.editing = true; }
      clearTimeout(settle);
      settle = setTimeout(() => { Studio.editing = false; }, 800);
    };
    const changed = (redraw) => {
      Studio.touch();
      if (ready) send();
      if (redraw) draw();
    };

    const panel = el("div", { class: "th-panel" });
    const contrastLine = (p) => {
      const rows = [["Testo sul fondo", TH.contrast(p.ink, p.paper)], ["Testo secondario", TH.contrast(p.inkSoft, p.paper)], ["Accento nel testo", TH.contrast(p.accentInk, p.paper)]];
      return el("ul", { class: "contrast" }, rows.map(([t, v]) => el("li", { class: v < 4.5 ? "bad" : "" }, t + ": " + v.toFixed(1).replace(".", ",") + ":1" + (v < 4.5 ? ", poco leggibile da lontano" : ""))));
    };
    const colors = (name, title) => {
      const p = th[name];
      const pick = (key, label) => el("label", { class: "color" }, el("input", { type: "color", value: p[key], "aria-label": label + " · " + title, oninput: (e) => { begin(); p[key] = e.target.value; th.preset = ""; Studio.touch(); if (ready) send(); }, onchange: () => draw() }), label);
      return el("div", { class: "th-colors" }, el("h3", null, title), el("div", { class: "color-row" }, pick("paper", "Fondo"), pick("ink", "Testo"), pick("accent", "Accento")), contrastLine(TH.palette(p)));
    };
    const fontOptions = (value) => {
      const custom = th.fonts.map((f) => ({ family: f.family, note: "caricato" }));
      const all = TH.FONTS.concat(custom);
      return all.map((f) => el("option", { value: f.family, selected: f.family === value }, f.family + (f.note ? " (" + f.note + ")" : "")));
    };
    const uploadMedia = async (file, what) => {
      try { return await Store.putMedia(file, conf.id, file.name); }
      catch (e) { Studio.toast("Non riesco a salvare " + what + ": " + e.message, { error: true }); return null; }
    };

    function draw() {
      panel.replaceChildren(
        group("Colori",
          el("div", { class: "presets", role: "group", "aria-label": "Combinazioni pronte" }, Object.entries(TH.PRESETS).map(([key, pr]) =>
            el("button", { class: "preset" + (th.preset === key ? " on" : ""), "aria-pressed": th.preset === key, dataset: { preset: key }, onclick: () => { Studio.snapshot(); th.preset = key; th.light = Object.assign({}, pr.light); th.dark = Object.assign({}, pr.dark); changed(true); } },
              el("span", { class: "swatch" }, [pr.light.paper, pr.light.ink, pr.light.accent].map((c) => el("i", { style: "background:" + c }))), pr.name))),
          colors("light", "Modo chiaro"), colors("dark", "Modo scuro"),
          Studio.labeled("All'apertura dello schermo", el("select", { class: "ed-select", onchange: (e) => { Studio.snapshot(); th.mode = e.target.value; previewMode = e.target.value; changed(true); } },
            el("option", { value: "light", selected: th.mode === "light" }, "Chiaro"), el("option", { value: "dark", selected: th.mode === "dark" }, "Scuro")), "In sala si cambia con il tasto T.")),
        group("Caratteri",
          Studio.labeled("Testo", el("select", { class: "ed-select", id: "th-font-text", onchange: (e) => { Studio.snapshot(); th.fontText = e.target.value; changed(); } }, fontOptions(th.fontText))),
          Studio.labeled("Etichette e titoli di sezione", el("select", { class: "ed-select", onchange: (e) => { Studio.snapshot(); th.fontLabel = e.target.value; changed(); } }, fontOptions(th.fontLabel))),
          el("label", { class: "btn file" }, "Carica un carattere", el("input", { type: "file", class: "visually-hidden", accept: ".woff2,.woff,.ttf,.otf", onchange: async (e) => {
            const f = e.target.files[0]; e.target.value = "";
            if (!f) return;
            const media = await uploadMedia(f, "il carattere");
            if (!media) return;
            const family = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
            Studio.snapshot();
            th.fonts.push({ family, media });
            th.fontText = family;
            await TH.loadCustomFonts(th);
            changed(true);
          } })),
          el("p", { class: "lab-h" }, "I caratteri caricati vengono conservati nella conferenza ed esportati con essa.")),
        group("Testo sullo schermo",
          Studio.labeled("Dimensione: " + Math.round(th.size * 100) + "%", el("input", { type: "range", id: "th-size", min: 0.7, max: 1.4, step: 0.05, value: th.size, oninput: (e) => { begin(); th.size = +e.target.value; e.target.previousSibling.textContent = "Dimensione: " + Math.round(th.size * 100) + "%"; changed(); } })),
          Studio.labeled("Interlinea: " + th.lineHeight.toFixed(2).replace(".", ","), el("input", { type: "range", min: 1.1, max: 1.7, step: 0.02, value: th.lineHeight, oninput: (e) => { begin(); th.lineHeight = +e.target.value; e.target.previousSibling.textContent = "Interlinea: " + th.lineHeight.toFixed(2).replace(".", ","); changed(); } })),
          Studio.labeled("Margini laterali: " + th.margin + "%", el("input", { type: "range", min: 3, max: 16, step: 1, value: th.margin, oninput: (e) => { begin(); th.margin = +e.target.value; e.target.previousSibling.textContent = "Margini laterali: " + th.margin + "%"; changed(); } })),
          Studio.labeled("Allineamento", el("select", { class: "ed-select", onchange: (e) => { Studio.snapshot(); th.align = e.target.value; changed(); } },
            [["left", "A sinistra"], ["justify", "Giustificato"], ["center", "Centrato"]].map(([v, t]) => el("option", { value: v, selected: th.align === v }, t)))),
          Studio.labeled("Testo accanto alle slide: " + th.sideText + "% della larghezza", el("input", { type: "range", min: 25, max: 70, step: 1, value: th.sideText, oninput: (e) => { begin(); th.sideText = +e.target.value; e.target.previousSibling.textContent = "Testo accanto alle slide: " + th.sideText + "% della larghezza"; changed(); } }))),
        group("Elementi",
          el("label", { class: "check" }, el("input", { type: "checkbox", checked: th.bar, onchange: (e) => { Studio.snapshot(); th.bar = e.target.checked; changed(); } }), " Riga in alto con relatore e titolo"),
          el("label", { class: "check" }, el("input", { type: "checkbox", checked: th.barCaps, onchange: (e) => { Studio.snapshot(); th.barCaps = e.target.checked; changed(); } }), " Riga in alto in maiuscolo"),
          el("label", { class: "check" }, el("input", { type: "checkbox", checked: th.progress, onchange: (e) => { Studio.snapshot(); th.progress = e.target.checked; changed(); } }), " Barra di avanzamento in basso")),
        group("Logo e sfondo",
          th.logo ? el("div", { class: "th-logo" },
            Studio.labeled("Posizione del logo", el("select", { class: "ed-select", onchange: (e) => { Studio.snapshot(); th.logo.pos = e.target.value; changed(); } },
              [["tr", "In alto a destra"], ["tl", "In alto a sinistra"], ["br", "In basso a destra"], ["bl", "In basso a sinistra"]].map(([v, t]) => el("option", { value: v, selected: (th.logo.pos || "tr") === v }, t)))),
            Studio.labeled("Altezza del logo: " + (th.logo.size || 7) + "%", el("input", { type: "range", min: 3, max: 18, step: 1, value: th.logo.size || 7, oninput: (e) => { begin(); th.logo.size = +e.target.value; e.target.previousSibling.textContent = "Altezza del logo: " + th.logo.size + "%"; changed(); } })),
            el("label", { class: "check" }, el("input", { type: "checkbox", checked: !!th.logo.coverOnly, onchange: (e) => { Studio.snapshot(); th.logo.coverOnly = e.target.checked; changed(); } }), " Solo sulle copertine"),
            el("button", { class: "link danger", onclick: () => { Studio.snapshot(); th.logo = null; changed(true); } }, "Togli il logo"))
            : el("label", { class: "btn file" }, "Carica il logo", el("input", { type: "file", id: "th-logo", class: "visually-hidden", accept: "image/*", onchange: async (e) => {
              const f = e.target.files[0]; e.target.value = "";
              if (!f) return;
              const media = await uploadMedia(f, "il logo");
              if (media) { Studio.snapshot(); th.logo = { media, pos: "tr", size: 7, coverOnly: false }; changed(true); }
            } })),
          th.coverBg ? el("div", { class: "th-logo" },
            Studio.labeled("Velatura dello sfondo: " + Math.round((th.coverBg.dim === undefined ? 0.7 : th.coverBg.dim) * 100) + "%", el("input", { type: "range", min: 0, max: 0.95, step: 0.05, value: th.coverBg.dim === undefined ? 0.7 : th.coverBg.dim, oninput: (e) => { begin(); th.coverBg.dim = +e.target.value; e.target.previousSibling.textContent = "Velatura dello sfondo: " + Math.round(th.coverBg.dim * 100) + "%"; changed(); } }), "Un'immagine chiara sotto il testo può ridurre la leggibilità: se serve alza la velatura."),
            el("button", { class: "link danger", onclick: () => { Studio.snapshot(); th.coverBg = null; changed(true); } }, "Togli lo sfondo"))
            : el("label", { class: "btn file" }, "Carica lo sfondo delle copertine", el("input", { type: "file", id: "th-bg", class: "visually-hidden", accept: "image/*", onchange: async (e) => {
              const f = e.target.files[0]; e.target.value = "";
              if (!f) return;
              const media = await uploadMedia(f, "lo sfondo");
              if (media) { Studio.snapshot(); th.coverBg = { media, dim: 0.7 }; changed(true); }
            } }))),
        group("Riusare la grafica",
          el("div", { class: "actions" },
            el("button", { class: "link", id: "th-export", onclick: () => {
              const copy = Object.assign({}, th, { logo: null, coverBg: null, fonts: [], format: "diglot.theme", version: 1 });
              L.download(new Blob([JSON.stringify(copy, null, 1)], { type: "application/json" }), "grafica-" + L.slug(M.pick(conf.title, conf.languages[0])) + ".json");
            } }, "Esporta in JSON"),
            el("label", { class: "link" }, "Importa da JSON", el("input", { type: "file", id: "th-import", class: "visually-hidden", accept: ".json", onchange: async (e) => {
              const f = e.target.files[0]; e.target.value = "";
              if (!f) return;
              try {
                const data = JSON.parse(await f.text());
                if (!/^(diglot|conferenze|leggio)\.theme$/.test(data.format)) throw new Error("Questo JSON non è una grafica esportata da questo programma.");
                Studio.snapshot();
                conf.theme = Object.assign(TH.normalize(data), { logo: th.logo, coverBg: th.coverBg, fonts: th.fonts });
                Studio.touch();
                Studio.render();
              } catch (err) { Studio.toast(err.message, { error: true }); }
            } })),
            el("button", { class: "link danger", onclick: () => {
              Studio.snapshot();
              conf.theme = Object.assign(TH.defaults(), { logo: null, coverBg: null, fonts: th.fonts });
              Studio.touch();
              Studio.render();
              Studio.toast("Grafica riportata a quella iniziale.", { action: { label: "Annulla", run: () => Studio.undo() } });
            } }, "Riporta all'inizio"))));
    }
    draw();

    const sceneButtons = el("div", { class: "th-scenes", role: "group", "aria-label": "Scena da provare" }, SCENES.map(([k, t]) =>
      el("button", { class: "tab-btn" + (k === scene ? " on" : ""), "aria-pressed": k === scene, dataset: { scene: k }, onclick: (e) => {
        scene = k;
        sceneButtons.querySelectorAll("button").forEach((b) => { const on = b.dataset.scene === k; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
        if (frame.contentWindow) frame.contentWindow.postMessage({ diglotScene: k }, "*");
      } }, t)));
    const modeSwitch = el("button", { class: "tab-btn", id: "th-preview-mode", onclick: (e) => { previewMode = previewMode === "dark" ? "light" : "dark"; e.target.textContent = previewMode === "dark" ? "Anteprima: scuro" : "Anteprima: chiaro"; send(); } }, previewMode === "dark" ? "Anteprima: scuro" : "Anteprima: chiaro");

    main.append(el("div", { class: "th" }, panel,
      el("div", { class: "th-view" },
        el("div", { class: "th-stick" },
          el("div", { class: "th-frame" }, frame),
          el("div", { class: "th-under" }, sceneButtons, modeSwitch),
          el("p", { class: "lab-h" }, "L'anteprima è in proporzione 16:9 e usa il testo della conferenza se c'è già. Le modifiche vanno subito anche sullo schermo aperto in sala.")))));
    Studio.setSaveState(Studio.saving === "pending" ? "pending" : "idle");
  };
})(window.Diglot);
