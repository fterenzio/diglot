(function (L) {
  "use strict";
  const Studio = L.Studio;

  function parseRoute() {
    const hash = location.hash || "#/";
    const [path, qs] = hash.slice(1).split("?");
    return { parts: path.split("/").filter(Boolean), params: Object.fromEntries(new URLSearchParams(qs || "")) };
  }
  const isPlayer = (r) => r.parts[0] === "play";

  function showFailure(e) {
    const app = document.getElementById("app");
    app.replaceChildren(L.el("main", { class: "page" }, L.el("h1", null, "Qualcosa non ha funzionato"), Studio.errorBox(e && e.message ? e.message : "Errore imprevisto."), L.el("p", null, L.el("a", { href: "#/" }, "Torna all'elenco delle conferenze"))));
  }

  function renderRoute() {
    const r = parseRoute(), p = r.parts;
    Studio.routeNow = renderRoute;
    let job;
    if (!p.length) job = Studio.pages.home();
    else if (p[0] === "converti") job = Studio.pages.tools();
    else if (p[0] === "aiuto") job = Studio.pages.help();
    else if (p[0] === "c" && p[2] === "t") job = Studio.pages.talk(p[1], p[3], p[4]);
    else if (p[0] === "c" && p[2] === "grafica") job = Studio.pages.theme(p[1]);
    else if (p[0] === "c" && p[2] === "sala") job = Studio.pages.room(p[1]);
    else if (p[0] === "c") job = Studio.pages.program(p[1]);
    else { location.hash = "#/"; return; }
    const toTop = routeChanged;
    routeChanged = false;
    Promise.resolve(job).then(() => { if (toTop) window.scrollTo(0, 0); }).catch(showFailure);
  }
  let routeChanged = true;

  const start = parseRoute();
  if (isPlayer(start)) {
    L.startPlayer(start.params).catch(showFailure);
  } else {
    Studio.setUiTheme(Studio.uiTheme());
    L.Store.onChange((id, rev) => Studio.external(id, rev));
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !e.target.isContentEditable && Studio.undoStack.length) {
        e.preventDefault();
        Studio.undo();
      }
    });
    window.addEventListener("beforeunload", () => Studio.flush());
    renderRoute();
  }

  // Studio e schermo sono due mondi: passare dall'uno all'altro ricarica la pagina, così ognuno parte pulito.
  window.addEventListener("hashchange", () => {
    if (isPlayer(parseRoute()) !== isPlayer(start)) { location.reload(); return; }
    if (!isPlayer(start)) { routeChanged = true; Studio.flush(); renderRoute(); }
  });
})(window.Diglot);
