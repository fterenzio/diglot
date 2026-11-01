# Diglot

Progettazione e proiezione di testi e traduzioni per conferenze. Il nome viene dai diglot, i libri con lo stesso testo in due lingue.

Il programma è un solo file, [`Diglot.html`](Diglot.html): si scarica, si apre con un doppio clic e funziona senza installare nulla e senza internet. Come si usa: pagina Aiuto, dentro il programma. Formato dei file: [`docs/formato-json.md`](docs/formato-json.md).

## Per modificarlo

I sorgenti sono in `src/`. Questo comando li riunisce in `Diglot.html` e richiede solo Node.js:

```bash
node tools/build.mjs
```

Le prove automatiche usano documenti inventati e pilotano Google Chrome su Mac, con Node.js 22 o successivo:

```bash
node tests/e2e.mjs
```

## Componenti di terzi

JSZip (MIT), PDF.js (Apache-2.0), EB Garamond e Archivo (SIL Open Font License).
