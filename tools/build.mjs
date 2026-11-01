// Unisce sorgenti, librerie e caratteri in un solo HTML: Diglot.html si copia su una chiavetta e si apre con un doppio clic.
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (p) => join(root, "src", p);
const read = (p) => readFileSync(src(p), "utf8");

const CSS = ["css/fonts.css", "css/base.css", "css/stage.css", "css/regia.css", "css/studio.css"];
const VENDOR = ["vendor/jszip.min.js", "vendor/pdf.min.js"];
const APP = [
  "js/util.js", "js/model.js", "js/store.js", "js/theme.js",
  "js/text.js", "js/docx.js", "js/pdf.js", "js/align.js", "js/convert.js",
  "js/pptx.js", "js/decks.js",
  "js/player.js",
  "js/studio.js", "js/wizard.js", "js/page-home.js", "js/page-program.js", "js/page-talk.js", "js/page-theme.js", "js/page-room.js", "js/page-tools.js",
  "js/main.js",
];

const inlineFonts = (css) => css.replace(/url\(fonts\/([^)]+)\)/g, (_, f) => `url(data:font/woff2;base64,${readFileSync(src("fonts/" + f)).toString("base64")})`);
// Il testo delle librerie finisce dentro <script>: una chiusura letterale interromperebbe la pagina.
const safeScript = (js) => js.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");

const css = CSS.map((f) => read(f)).map(inlineFonts).join("\n");
const worker = readFileSync(src("vendor/pdf.worker.min.js")).toString("base64");
const scripts = [...VENDOR, ...APP].map((f) => `<script>${safeScript(read(f))}</script>`).join("\n");

const html = `<!doctype html>
<!--
Diglot: progettazione e proiezione di testi e traduzioni.
Componenti di terzi inclusi nel file: JSZip (MIT), PDF.js (Apache-2.0), EB Garamond e Archivo (SIL OFL).
-->
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diglot</title>
<style>${css}</style>
</head>
<body>
<noscript>Questo programma ha bisogno di JavaScript: attivalo nel browser.</noscript>
<div id="app"></div>
<script>window.DIGLOT_PDF_WORKER="${worker}";</script>
${scripts}
</body>
</html>
`;
const out = join(root, "Diglot.html");
writeFileSync(out, html);
console.log("Diglot.html", (statSync(out).size / 1048576).toFixed(2) + " MB");
