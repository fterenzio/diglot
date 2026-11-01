(function (L) {
  "use strict";

  const IMG = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);
  const collator = new Intl.Collator("it", { numeric: true, sensitivity: "base" });

  function imageSize(blob) {
    return new Promise((res) => {
      const url = URL.createObjectURL(blob), im = new Image();
      im.onload = () => { res({ w: im.naturalWidth || 16, h: im.naturalHeight || 9 }); URL.revokeObjectURL(url); };
      im.onerror = () => { res(null); URL.revokeObjectURL(url); };
      im.src = url;
    });
  }

  L.Decks = {
    // PNG finché resta leggero; le pagine piene di fotografie passano a JPEG.
    async canvasBlob(canvas) {
      const png = await new Promise((r) => canvas.toBlob(r, "image/png"));
      if (png && png.size < 1500000) return png;
      return new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    },

    async importFiles(files, conf, progress) {
      const list = [...files];
      if (!list.length) throw new Error("Nessun file scelto.");
      const exts = list.map((f) => L.fileExt(f.name));
      const stem = list[0].name.replace(/\.[^.]+$/, "");
      if (exts.some((e) => ["ppt", "key", "odp"].includes(e))) throw new Error("Questo formato non si può leggere qui. Da PowerPoint o Keynote esporta le slide in PDF e carica quello: è anche il modo più fedele.");
      if (list.length === 1 && exts[0] === "pdf") {
        const slides = await L.Pdf.renderPages(list[0], conf, progress);
        return { id: L.uid("k"), name: stem, source: "pdf", slides, warnings: [] };
      }
      if (list.length === 1 && exts[0] === "pptx") {
        const r = await L.Pptx.render(list[0], conf, progress);
        if (!r.slides.length) throw new Error("In questo PowerPoint non ci sono diapositive visibili.");
        return { id: L.uid("k"), name: stem, source: "pptx", slides: r.slides, warnings: r.warnings };
      }
      if (exts.every((e) => IMG.has(e))) {
        const sorted = list.slice().sort((a, b) => collator.compare(a.name, b.name));
        const slides = [];
        for (let i = 0; i < sorted.length; i++) {
          if (progress) progress("Carico l'immagine " + (i + 1) + " di " + sorted.length);
          const size = await imageSize(sorted[i]);
          if (!size) throw new Error("«" + sorted[i].name + "» non è un'immagine leggibile.");
          const media = await L.Store.putMedia(sorted[i], conf.id, sorted[i].name);
          slides.push({ media, w: size.w, h: size.h });
        }
        return { id: L.uid("k"), name: sorted.length > 1 ? "Immagini" : stem, source: "images", slides, warnings: [] };
      }
      throw new Error("Per le slide servono un PDF, un PowerPoint (.pptx) oppure una o più immagini. Più file insieme funzionano solo se sono tutte immagini.");
    },
  };
})(window.Diglot);
