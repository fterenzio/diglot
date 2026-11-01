(function (L) {
  "use strict";
  const { el } = L, M = L.Model, Studio = L.Studio;

  let drag = null;

  function moveIn(list, i, d) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const [x] = list.splice(i, 1);
    list.splice(j, 0, x);
  }

  function langHeader(conf) {
    const codes = Object.keys(M.LANGS).filter((c) => conf.languages.indexOf(c) < 0);
    return el("div", { class: "lang-line" },
      el("span", { class: "lab-t" }, "Lingue"),
      conf.languages.map((c) => el("span", { class: "lang-chip" }, M.langName(c),
        conf.languages.length > 1 ? el("button", { class: "link", "aria-label": "Togli " + M.langName(c), onclick: () => Studio.change(() => { conf.languages = conf.languages.filter((x) => x !== c); }) }, "togli") : null)),
      codes.length ? el("select", { class: "ed-select", "aria-label": "Aggiungi una lingua", onchange: (e) => { const v = e.target.value; if (v) Studio.change(() => { conf.languages.push(v); }); } },
        el("option", { value: "" }, "Aggiungi…"), codes.map((c) => el("option", { value: c }, M.langName(c)))) : null);
  }

  function confHeader(conf) {
    const l = conf.languages;
    return el("section", { class: "conf-head", "aria-label": "Dati della conferenza" },
      l.map((c, i) => Studio.field({ class: i === 0 ? "t-title" : "t-title2", value: conf.title[c], placeholder: "Titolo in " + M.langName(c), label: "Titolo in " + M.langName(c), lang: c, set: (v) => { conf.title[c] = v; }, after: i === 0 ? (v) => { const x = document.querySelector(".top-title"); if (x) x.textContent = v || "Conferenza senza titolo"; } : null })),
      el("div", { class: "rule-mark" }),
      el("div", { class: "conf-fields" },
        Studio.labeled("Parola in evidenza sulla copertina", Studio.field({ value: conf.big, placeholder: "Facoltativa", set: (v) => { conf.big = v; } })),
        Studio.labeled("Luogo", Studio.field({ value: conf.place, placeholder: "Città, sede", set: (v) => { conf.place = v; } })),
        Studio.labeled("Date sulla copertina", Studio.field({ value: conf.datesText, placeholder: M.datesLabel(Object.assign({}, conf, { datesText: "" }), l[0]) || "Si ricavano dai giorni", set: (v) => { conf.datesText = v; } })),
        l.map((c) => Studio.labeled("Dicitura sopra il titolo (" + M.langName(c) + ")", Studio.field({ value: conf.kicker[c], placeholder: "Facoltativa", lang: c, set: (v) => { conf.kicker[c] = v; } })))),
      langHeader(conf));
  }

  function talkRow(conf, session, talk, ti, isRoomy) {
    const issues = M.issues(talk);
    const summary = Studio.talkSummary(talk);
    const row = el("article", { class: "talk", draggable: "true", dataset: { talk: talk.id },
      ondragstart: (e) => { if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) { e.preventDefault(); return; } drag = { talk, from: session }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", talk.id); row.classList.add("dragging"); },
      ondragend: () => { row.classList.remove("dragging"); drag = null; document.querySelectorAll(".drop-before").forEach((x) => x.classList.remove("drop-before")); },
      ondragover: (e) => { if (drag) { e.preventDefault(); row.classList.add("drop-before"); } },
      ondragleave: () => row.classList.remove("drop-before"),
      ondrop: (e) => { e.preventDefault(); e.stopPropagation(); if (!drag || drag.talk === talk) return; const d = drag; drag = null; Studio.change(() => { d.from.talks.splice(d.from.talks.indexOf(d.talk), 1); session.talks.splice(session.talks.indexOf(talk), 0, d.talk); }); },
    },
      el("div", { class: "talk-main" },
        el("div", { class: "talk-who" },
          Studio.field({ class: "t-speaker", value: talk.speaker, placeholder: "Nome del relatore", label: "Nome del relatore", set: (v) => { talk.speaker = v; } }),
          Studio.field({ class: "t-affil", value: talk.affiliation, placeholder: "Affiliazione (facoltativa)", label: "Affiliazione", set: (v) => { talk.affiliation = v; } })),
        conf.languages.map((c, i) => Studio.field({ class: i === 0 ? "t-talk" : "t-talk2", value: talk.title[c], placeholder: "Titolo in " + M.langName(c), label: "Titolo in " + M.langName(c), lang: c, set: (v) => { talk.title[c] = v; } })),
        el("div", { class: "talk-lang" },
          el("span", null, "Parla in"), Studio.langSelect(talk.from, (v) => Studio.change(() => { talk.from = v; }), { label: "Lingua del relatore" }),
          el("span", null, "sullo schermo"), Studio.langSelect(talk.to, (v) => Studio.change(() => { talk.to = v; }), { label: "Lingua proiettata" })),
        el("p", { class: "talk-status" + (issues.length ? " warn" : " ok") }, [summary, issues.map((x) => x.text).join("; ")].filter(Boolean).join(" · ") || "Pronto")),
      el("div", { class: "talk-side" },
        el("a", { class: "btn", href: "#/c/" + conf.id + "/t/" + talk.id }, "Testo e slide"),
        el("div", { class: "row-tools" },
          el("button", { class: "link", disabled: ti === 0, "aria-label": "Sposta su", onclick: () => Studio.change(() => moveIn(session.talks, ti, -1)) }, "Su"),
          el("button", { class: "link", disabled: ti === session.talks.length - 1, "aria-label": "Sposta giù", onclick: () => Studio.change(() => moveIn(session.talks, ti, 1)) }, "Giù"),
          el("button", { class: "link danger", onclick: () => {
            Studio.change(() => session.talks.splice(ti, 1));
            Studio.toast("Intervento tolto dal programma.", { action: { label: "Annulla", run: () => Studio.undo() } });
          } }, "Togli"))));
    return row;
  }

  function sessionBlock(conf, day, session, si) {
    return el("section", { class: "session", "aria-label": "Sessione",
      ondragover: (e) => { if (drag) e.preventDefault(); },
      ondrop: (e) => { e.preventDefault(); if (!drag) return; const d = drag; drag = null; Studio.change(() => { d.from.talks.splice(d.from.talks.indexOf(d.talk), 1); session.talks.push(d.talk); }); },
    },
      el("div", { class: "session-time" }, Studio.field({ class: "t-time", value: session.time, placeholder: "00.00", label: "Ora di inizio", set: (v) => { session.time = v; } })),
      el("div", { class: "session-body" },
        el("div", { class: "session-head" },
          el("div", { class: "session-names" }, conf.languages.map((c, i) => Studio.field({ class: i === 0 ? "t-session" : "t-session2", value: session.name[c], placeholder: "Nome della sessione in " + M.langName(c), label: "Nome della sessione in " + M.langName(c), lang: c, set: (v) => { session.name[c] = v; } }))),
          el("div", { class: "row-tools" },
            el("button", { class: "link", disabled: si === 0, "aria-label": "Sposta la sessione su", onclick: () => Studio.change(() => moveIn(day.sessions, si, -1)) }, "Su"),
            el("button", { class: "link", disabled: si === day.sessions.length - 1, "aria-label": "Sposta la sessione giù", onclick: () => Studio.change(() => moveIn(day.sessions, si, 1)) }, "Giù"),
            el("button", { class: "link danger", onclick: () => {
              Studio.change(() => day.sessions.splice(si, 1));
              Studio.toast("Sessione tolta dal programma.", { action: { label: "Annulla", run: () => Studio.undo() } });
            } }, "Togli"))),
        session.talks.map((t, ti) => talkRow(conf, session, t, ti)),
        el("button", { class: "link add", onclick: () => Studio.change(() => { const t = M.newTalk(conf); session.talks.push(t); Studio.focusTalk = t.id; }) }, "Aggiungi un intervento")));
  }

  function dayBlock(conf, day, di) {
    const heading = el("h2", { class: "day-label" }, M.dayLabel(day, conf.languages[0]) || "Giornata " + (di + 1));
    return el("section", { class: "day", "aria-label": "Giornata" },
      el("div", { class: "day-head" },
        heading,
        el("label", { class: "day-date" }, "Data ", Studio.field({ type: "date", value: day.date, label: "Data della giornata", set: (v) => { day.date = v; }, after: () => { Studio.editing = false; heading.textContent = M.dayLabel(day, conf.languages[0]) || "Giornata " + (di + 1); } })),
        el("div", { class: "row-tools" },
          conf.days.length > 1 ? el("button", { class: "link danger", onclick: () => {
            Studio.change(() => conf.days.splice(di, 1));
            Studio.toast("Giornata tolta dal programma.", { action: { label: "Annulla", run: () => Studio.undo() } });
          } }, "Togli la giornata") : null)),
      day.sessions.map((s, si) => sessionBlock(conf, day, s, si)),
      el("button", { class: "link add", onclick: () => Studio.change(() => day.sessions.push(M.newSession(conf, day.sessions.length))) }, "Aggiungi una sessione"));
  }

  function todoPanel(conf) {
    const items = [];
    if (!M.pick(conf.title, conf.languages[0])) items.push({ who: "Conferenza", text: "manca il titolo", href: "#/c/" + conf.id });
    M.talks(conf).forEach(({ talk }) => M.issues(talk).forEach((x) => items.push({ who: talk.speaker || "Intervento senza nome", text: x.text, href: "#/c/" + conf.id + "/t/" + talk.id })));
    const total = M.talks(conf).length;
    return el("aside", { class: "todo", "aria-label": "Da sistemare" },
      el("h2", null, "Da sistemare"),
      !total ? el("p", { class: "lab-h" }, "Il programma è vuoto: aggiungi il primo intervento a una sessione.")
        : !items.length ? el("p", { class: "ok" }, "Niente: tutti gli interventi hanno testo e traduzione.")
        : el("ul", null, items.map((x) => el("li", null, el("a", { href: x.href }, el("b", null, x.who), el("span", null, x.text))))),
      el("a", { class: "btn primary wide", href: "#/c/" + conf.id + "/sala" }, "Vai in sala"),
      el("button", { class: "link", id: "export-conf", onclick: async (e) => {
        await Studio.flush();
        e.target.disabled = true;
        try { L.download(await L.Convert.exportBundle(conf), L.slug(M.pick(conf.title, conf.languages[0])) + ".diglot"); }
        catch (err) { Studio.toast("Esportazione non riuscita: " + err.message, { error: true }); }
        e.target.disabled = false;
      } }, "Esporta per un altro computer"),
      el("button", { class: "link", id: "export-json", onclick: () => {
        L.download(new Blob([JSON.stringify(conf, null, 1)], { type: "application/json" }), L.slug(M.pick(conf.title, conf.languages[0])) + ".json");
      } }, "Scarica il programma in JSON"));
  }

  Studio.pages.program = async function (confId) {
    const conf = await Studio.openConf(confId);
    if (!conf) { location.hash = "#/"; return; }
    const main = Studio.shell("program");
    document.title = (M.pick(conf.title, conf.languages[0]) || "Programma") + " · Diglot";
    main.append(el("div", { class: "prog" },
      el("div", { class: "prog-main" },
        confHeader(conf),
        conf.days.map((d, di) => dayBlock(conf, d, di)),
        el("button", { class: "link add", onclick: () => Studio.change(() => {
          const last = conf.days[conf.days.length - 1];
          let date = "";
          if (last && last.date) { const d = new Date(last.date + "T12:00:00"); d.setDate(d.getDate() + 1); date = d.toISOString().slice(0, 10); }
          conf.days.push(M.newDay(conf, date));
        }) }, "Aggiungi una giornata")),
      todoPanel(conf)));
    if (Studio.focusTalk) {
      const r = main.querySelector('[data-talk="' + Studio.focusTalk + '"] .t-speaker');
      Studio.focusTalk = null;
      if (r) r.focus();
    }
    Studio.setSaveState(Studio.saving === "pending" ? "pending" : "idle");
  };
})(window.Diglot);
