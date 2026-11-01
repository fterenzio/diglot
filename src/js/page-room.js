(function (L) {
  "use strict";
  const { el } = L, M = L.Model, Studio = L.Studio;

  function clockStates(conf) {
    const now = new Date();
    let nowKey = null, nextKey = null;
    const at = (date, hhmm) => {
      const m = /^(\d{1,2})[.:](\d{2})$/.exec((hhmm || "").trim());
      return date && m ? new Date(date + "T" + m[1].padStart(2, "0") + ":" + m[2] + ":00") : null;
    };
    conf.days.forEach((d) => d.sessions.forEach((s, si) => {
      const start = at(d.date, s.time);
      if (!start) return;
      const nx = d.sessions[si + 1], end = (nx && at(d.date, nx.time)) || new Date(start.getTime() + 2 * 3600e3);
      if (now >= start && now < end) nowKey = s.id;
      if (!nextKey && start > now) nextKey = s.id;
    }));
    return { nowKey, nextKey };
  }

  let resumeTimer = null;
  function resumeBox(conf) {
    const box = el("section", { class: "resume", id: "resume", "aria-label": "Riprendi" });
    let last = "";
    const update = () => {
      let m = null;
      try { m = JSON.parse(localStorage.getItem("diglot-sync-" + conf.id) || "null"); } catch (e) { m = null; }
      if (!m || !m.t || Date.now() - m.ts > 12 * 3600e3) { box.classList.remove("on"); last = ""; return; }
      const sig = m.t + "|" + m.i;
      if (sig === last) return;
      last = sig;
      const f = m.t === "cover" ? null : M.find(conf, m.t);
      box.replaceChildren(
        el("div", null, el("div", { class: "lab-t" }, "Ultima proiezione"), el("div", { class: "resume-what" }, m.t === "cover" ? "Copertina della conferenza" : f ? (f.talk.speaker || "Intervento") + ", schermata " + m.i : "Intervento tolto dal programma")),
        el("div", { class: "actions" },
          el("a", { class: "btn primary", href: Studio.playUrl(m.t, { mode: "regia" }), target: "diglot-regia" }, "Riprendi in regia"),
          el("a", { class: "btn", href: Studio.playUrl(m.t), target: "diglot-screen" }, "Riapri lo schermo")));
      box.classList.add("on");
    };
    update();
    clearInterval(resumeTimer);
    resumeTimer = setInterval(() => { if (document.getElementById("resume") === box) update(); else clearInterval(resumeTimer); }, 1000);
    return box;
  }

  function sessionRow(conf, s, clock) {
    const code = conf.languages[0];
    return el("div", { class: "room-session" + (s.id === clock.nowKey ? " now" : "") },
      el("div", { class: "room-time" }, s.time || "", s.id === clock.nowKey ? el("span", { class: "state on" }, "In corso") : s.id === clock.nextKey ? el("span", { class: "state" }, "Prossima") : null),
      el("div", { class: "room-body" },
        el("div", { class: "room-sname" }, M.pick(s.name, code)),
        s.talks.length ? s.talks.map((t) => {
          const issues = M.issues(t), sum = Studio.talkSummary(t);
          return el("article", { class: "room-talk" },
            el("div", null,
              el("div", { class: "room-sp" }, t.speaker || "Relatore da indicare"),
              el("div", { class: "room-ti" }, M.pick(t.title, t.from) || "Titolo da indicare"),
              el("div", { class: "room-st" + (issues.length ? " warn" : " ok") }, [t.from.toUpperCase() + " → " + t.to.toUpperCase(), sum, issues.map((x) => x.text).join("; ")].filter(Boolean).join(" · "))),
            el("div", { class: "actions" },
              el("a", { class: "btn primary", href: Studio.playUrl(t.id), target: "diglot-screen" }, "Schermo"),
              el("a", { class: "btn", href: Studio.playUrl(t.id, { mode: "regia" }), target: "diglot-regia" }, "Regia")));
        }) : el("p", { class: "lab-h" }, "Nessun intervento: per questa sessione si può proiettare la copertina.")));
  }

  Studio.pages.room = async function (confId) {
    const conf = await Studio.openConf(confId);
    if (!conf) { location.hash = "#/"; return; }
    const main = Studio.shell("room");
    const code = conf.languages[0];
    document.title = "In sala · " + (M.pick(conf.title, code) || "Diglot");
    const clock = clockStates(conf);
    const pending = M.talks(conf).filter((x) => M.issues(x.talk).some((i) => i.code === "text" || i.code === "translation")).length;

    main.append(...[
      el("div", { class: "room-head" },
        el("h1", null, "In sala"),
        el("p", { class: "tab-lead" }, "Lo schermo va sul proiettore, la regia sul portatile. Da qui si aprono entrambi, intervento per intervento: se apri la regia di un altro relatore, lo schermo cambia al primo «Avanti»."),
        pending ? el("p", { class: "warn" }, pending + (pending === 1 ? " intervento senza testo o traduzione: " : " interventi senza testo o traduzione: ") + "sullo schermo andrà solo ciò che c'è. ", el("a", { href: "#/c/" + conf.id }, "Vedi cosa manca")) : null),
      resumeBox(conf),
      el("div", { class: "actions room-actions" },
        el("a", { class: "btn primary", id: "open-cover", href: Studio.playUrl("cover"), target: "diglot-screen" }, "Copertina per pause e saluti"),
        el("a", { class: "btn", href: Studio.playUrl("cover", { mode: "regia" }), target: "diglot-regia" }, "Regia della copertina"),
        el("a", { class: "btn", href: Studio.playUrl("cover", { teams: "1" }), onclick: (e) => { e.preventDefault(); window.open(e.currentTarget.href, "diglot-teams", "width=1280,height=720"); } }, "Finestra per Teams (16:9)")),
      conf.days.map((d, di) => el("section", { class: "room-day" },
        el("h2", { class: "day-label" }, M.dayLabel(d, code) || "Giornata " + (di + 1)),
        d.sessions.map((s) => sessionRow(conf, s, clock)))),
      conf.days.every((d) => d.sessions.every((s) => !s.talks.length)) ? el("div", { class: "empty" }, el("p", { class: "empty-lead" }, "Il programma non ha ancora interventi."), el("a", { class: "btn", href: "#/c/" + conf.id }, "Vai al programma")) : null,
    ].flat().filter(Boolean));
  };
})(window.Diglot);
