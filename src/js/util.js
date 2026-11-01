window.Diglot = {};
(function (L) {
  "use strict";

  L.uid = function (prefix) {
    return (prefix || "") + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  };

  L.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  };
  // Per ciò che va sullo schermo del pubblico: apostrofi tipografici.
  L.escTypo = function (s) {
    return L.esc(String(s == null ? "" : s).replace(/(\w)'(?=\w)/g, "$1’"));
  };

  L.el = function (tag, props) {
    const node = document.createElement(tag);
    for (const k in props || {}) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "dataset") Object.assign(node.dataset, v);
      else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "value" || k === "checked" || k === "disabled" || k === "selected" || k === "open") node[k] = v;
      else node.setAttribute(k, v === true ? "" : v);
    }
    const add = (kid) => {
      if (kid == null || kid === false) return;
      if (Array.isArray(kid)) kid.forEach(add);
      else node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    };
    for (let i = 2; i < arguments.length; i++) add(arguments[i]);
    return node;
  };

  L.debounce = function (fn, ms) {
    let t = null;
    const wrapped = function () { clearTimeout(t); t = setTimeout(() => { t = null; fn(); }, ms); };
    wrapped.flush = function () {
      if (t === null) return undefined;
      clearTimeout(t); t = null;
      return fn();
    };
    return wrapped;
  };

  L.download = function (blob, name) {
    const url = URL.createObjectURL(blob);
    const a = L.el("a", { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  L.slug = function (s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60) || "senza-titolo";
  };

  L.words = function (s) {
    const t = String(s || "").trim();
    return t ? t.split(/\s+/).length : 0;
  };

  // Lascia respirare l'interfaccia nei lavori lunghi (pagine di PDF, slide).
  L.yieldUI = function () { return new Promise((res) => setTimeout(res, 0)); };

  L.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  L.fileExt = function (name) { const m = /\.([^.]+)$/.exec(name || ""); return m ? m[1].toLowerCase() : ""; };

  L.planUrl = function (hash) { return location.href.split("#")[0] + hash; };
})(window.Diglot);
