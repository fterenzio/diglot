(function (L) {
  "use strict";
  const { el } = L, M = L.Model, Store = L.Store, Studio = L.Studio;

  function sampleConference() {
    const conf = M.newConference({ languages: ["it", "de"] });
    conf.title = { it: "Conferenza di prova", de: "Probekonferenz" };
    conf.kicker = { it: "Esempio per imparare a usare il programma", de: "Beispiel" };
    conf.place = "Sala di prova";
    const day = conf.days[0];
    day.date = new Date().toISOString().slice(0, 10);
    const s = day.sessions[0];
    s.time = "10.00";
    const t = M.newTalk(conf);
    t.speaker = "Relatore di prova"; t.from = "de"; t.to = "it";
    t.title = { it: "Come funziona la proiezione", de: "Wie die Projektion funktioniert" };
    const rows = [
      ["Der Vortrag beginnt.", "L'intervento comincia.", true],
      ["Der Vortragende liest auf Deutsch, das Publikum liest die Übersetzung auf der Leinwand.", "Il relatore legge in tedesco, il pubblico legge la traduzione sullo schermo."],
      ["In der Regie sieht man den Originaltext und schaltet mit der Leertaste weiter.", "In regia si vede il testo originale e si va avanti con la barra spaziatrice."],
      ["Steht im Text ein Hinweis auf eine Folie, wechselt die Folie von selbst.", "Quando nel testo c'è l'indicazione di una slide, la slide cambia da sola."],
      ["Mit der Taste E korrigiert man einen Tippfehler, ohne die Regie zu verlassen.", "Con il tasto E si corregge un refuso senza uscire dalla regia."],
      ["Mit der Taste Q erscheint die Folie für die Diskussion.", "Con il tasto Q compare la schermata della discussione."],
    ];
    t.segments = rows.map((r, i) => ({ text: { de: r[0], it: r[1] }, p: i, ...(r[2] ? { heading: true } : {}), ...(i === 3 ? { cue: 2 } : i === 1 ? { cue: 1 } : {}) }));
    t.passages = [{ id: L.uid("q"), ref: "Citazione di prova", author: "Autore di prova", pages: [{ de: "Ein zitierter Abschnitt erscheint neben dem Text oder auf der ganzen Leinwand.", it: "Un passo citato compare accanto al testo o a tutto schermo." }] }];
    s.talks.push(t);
    return conf;
  }
  async function sampleSlides(conf) {
    const t = conf.days[0].sessions[0].talks[0];
    const slides = [];
    for (const n of [1, 2]) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" width="1920" height="1080"><rect width="960" height="540" fill="#ffffff"/><text x="60" y="120" font-family="Helvetica,Arial,sans-serif" font-size="44" fill="#222222">Slide di prova ${n}</text><text x="60" y="190" font-family="Helvetica,Arial,sans-serif" font-size="26" fill="#555555">Al posto di questa immagine vanno le slide del relatore.</text></svg>`;
      slides.push({ media: await Store.putMedia(new Blob([svg], { type: "image/svg+xml" }), conf.id, "prova-" + n + ".svg"), w: 1920, h: 1080 });
    }
    t.decks = [{ id: L.uid("k"), name: "Slide di prova", source: "images", slides, warnings: [] }];
    t.deck = t.decks[0].id;
  }

  function newConferenceDialog() {
    const codes = Object.keys(M.LANGS);
    let a = "it", b = "de";
    const title = el("input", { class: "ed big", placeholder: "Titolo della conferenza", "aria-label": "Titolo della conferenza" });
    const date = el("input", { class: "ed", type: "date", "aria-label": "Primo giorno" });
    const err = el("p", { class: "lab-h bad", hidden: true }, "Scrivi il titolo per creare la conferenza.");
    const dlg = el("dialog", { class: "dlg" },
      el("h2", null, "Nuova conferenza"),
      el("form", { method: "dialog", onsubmit: async (e) => {
        e.preventDefault();
        if (!title.value.trim()) { err.hidden = false; title.focus(); return; }
        const conf = M.newConference({ languages: a === b ? [a] : [a, b], title: { [a]: title.value.trim() }, date: date.value });
        await Store.putConference(conf);
        dlg.close();
        location.hash = "#/c/" + conf.id;
      } },
        Studio.labeled("Titolo", title), err,
        el("div", { class: "row-2" },
          Studio.labeled("Prima lingua", Studio.langSelect(a, (v) => { a = v; }, { codes })),
          Studio.labeled("Seconda lingua", Studio.langSelect(b, (v) => { b = v; }, { codes }))),
        Studio.labeled("Primo giorno", date, "Si può cambiare e completare nel programma."),
        el("div", { class: "dlg-actions" },
          el("button", { class: "btn", type: "button", onclick: () => dlg.close() }, "Annulla"),
          el("button", { class: "btn primary", type: "submit" }, "Crea la conferenza"))));
    dlg.addEventListener("close", () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    title.focus();
  }

  async function importFile(file, status) {
    const ext = L.fileExt(file.name);
    status.textContent = "Importo «" + file.name + "»…";
    let conf;
    if (ext === "json") conf = L.Convert.conferenceFromJSON(JSON.parse(await file.text()));
    else if (["diglot", "conferenza", "leggio", "zip"].includes(ext)) conf = await L.Convert.importBundle(file, (m) => { status.textContent = m; });
    else throw new Error("Per importare una conferenza serve un file .diglot o .json. I testi dei relatori si caricano dalla pagina dell'intervento o dal Convertitore.");
    await Store.putConference(conf);
    return conf;
  }

  Studio.pages.home = async function () {
    Studio.closeConf();
    const main = Studio.shell("home");
    document.title = "Diglot";
    const status = el("p", { class: "lab-h", role: "status" });
    const list = el("div", { class: "conf-list" }, el("p", { class: "lab-h" }, "Apro l'archivio…"));
    main.append(
      el("div", { class: "home-head" },
        el("h1", null, "Conferenze"),
        el("div", { class: "actions" },
          el("button", { class: "btn primary", id: "new-conf", onclick: newConferenceDialog }, "Nuova conferenza"),
          el("label", { class: "btn" }, "Importa un file",
            el("input", { type: "file", id: "import-conf", class: "visually-hidden", accept: ".diglot,.conferenza,.leggio,.zip,.json", onchange: async (e) => {
              const f = e.target.files[0]; e.target.value = "";
              if (!f) return;
              try { const conf = await importFile(f, status); status.textContent = ""; location.hash = "#/c/" + conf.id; }
              catch (err) { status.textContent = ""; Studio.toast(err.message || "Importazione non riuscita.", { error: true }); }
            } })))),
      status, list);

    let all;
    try { all = await Store.listConferences(); }
    catch (e) {
      list.replaceChildren(Studio.errorBox("Questo browser non consente di salvare dati (forse è una finestra privata). Apri il programma in una finestra normale di Chrome, Edge, Firefox o Safari."));
      return;
    }
    if (!all.length) {
      list.replaceChildren(el("div", { class: "empty" },
        el("p", { class: "empty-lead" }, "Qui non c'è ancora nessuna conferenza."),
        el("p", null, "Creane una nuova, importa un file .diglot da un altro computer, oppure prova l'esempio: ha un intervento bilingue con due slide di prova, per vedere come lavorano insieme schermo e regia."),
        el("button", { class: "btn", id: "load-sample", onclick: async () => {
          const conf = sampleConference();
          await sampleSlides(conf);
          await Store.putConference(conf);
          location.hash = "#/c/" + conf.id;
        } }, "Apri l'esempio")));
    } else {
      list.replaceChildren(...all.map((raw) => {
        const conf = M.normalize(raw), talks = M.talks(conf), code = conf.languages[0];
        const where = [M.datesLabel(conf, code), conf.place].filter(Boolean).join(" · ");
        const pending = talks.filter((x) => M.issues(x.talk).length).length;
        return el("article", { class: "conf-row" },
          el("div", { class: "conf-main" },
            el("a", { class: "conf-name", href: "#/c/" + conf.id }, M.pick(conf.title, code) || "Conferenza senza titolo"),
            el("p", { class: "conf-meta" }, [where, talks.length + (talks.length === 1 ? " intervento" : " interventi"), pending ? pending + " da completare" : talks.length ? "materiali completi" : ""].filter(Boolean).join(" · "))),
          el("div", { class: "actions" },
            el("a", { class: "btn", href: "#/c/" + conf.id + "/sala" }, "In sala"),
            el("button", { class: "link", onclick: async () => {
              const copy = L.clone(conf);
              copy.id = L.uid("c");
              const map = {};
              for (const id of Store.mediaRefs(conf)) { const r = await Store.getMedia(id); if (r) map[id] = await Store.putMedia(r.blob, copy.id, r.name); }
              M.eachTalk(copy, (t) => { t.id = L.uid("t"); t.decks.forEach((d) => d.slides.forEach((s) => { if (map[s.media]) s.media = map[s.media]; })); });
              if (copy.theme.logo && map[copy.theme.logo.media]) copy.theme.logo.media = map[copy.theme.logo.media];
              if (copy.theme.coverBg && map[copy.theme.coverBg.media]) copy.theme.coverBg.media = map[copy.theme.coverBg.media];
              if (copy.theme.poster && map[copy.theme.poster.media]) copy.theme.poster.media = map[copy.theme.poster.media];
              copy.theme.fonts.forEach((f) => { if (map[f.media]) f.media = map[f.media]; });
              copy.title = Object.fromEntries(Object.entries(copy.title).map(([k, v]) => [k, v + " (copia)"]));
              await Store.putConference(copy);
              Studio.render();
            } }, "Duplica"),
            el("button", { class: "link", onclick: async (e) => {
              e.target.disabled = true; status.textContent = "Preparo il file…";
              try { L.download(await L.Convert.exportBundle(conf, (m) => { status.textContent = m; }), L.slug(M.pick(conf.title, code)) + ".diglot"); status.textContent = ""; }
              catch (err) { status.textContent = ""; Studio.toast("Esportazione non riuscita: " + err.message, { error: true }); }
              e.target.disabled = false;
            } }, "Esporta"),
            el("button", { class: "link danger", onclick: async () => {
              const ok = await Studio.confirm("Eliminare la conferenza?", "«" + (M.pick(conf.title, code) || "Senza titolo") + "» sparisce da questo browser con testi e slide. Non si può annullare: se ti serve ancora, esportala prima.", "Elimina", true);
              if (ok) { await Store.deleteConference(conf.id); Studio.render(); }
            } }, "Elimina")));
      }));
    }

    const foot = el("p", { class: "home-foot" }, "Conferenze, testi e slide restano in questo browser, su questo computer: il programma non li invia in rete. Per portarli altrove usa «Esporta».");
    main.append(foot);
    const use = await Store.usage();
    if (use && use.usage) foot.append(" Spazio occupato: " + (use.usage / 1048576).toFixed(0) + " MB.");
    Store.requestPersistence();
  };
})(window.Diglot);
