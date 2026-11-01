# Formato JSON

## Intervento (`diglot.talk`)

Lo produce il Convertitore e «Scarica JSON»; si ricarica dagli stessi punti.

```json
{
  "format": "diglot.talk",
  "version": 1,
  "speaker": "Nome del relatore",
  "affiliation": "",
  "title": { "de": "Titel", "it": "Titolo" },
  "from": "de",
  "to": "it",
  "screenLabel": "",
  "segments": [
    { "de": "1. Abschnitt", "it": "1. Sezione", "p": 0, "heading": true },
    { "de": "Erster Satz.", "it": "Prima frase.", "p": 1, "slide": 1 },
    { "de": "Zweiter Satz.", "it": "Seconda frase.", "p": 1 }
  ],
  "passages": [
    { "ref": "Opera, p. 12", "author": "Autore", "pages": [{ "de": "Zitat", "it": "Citazione" }] }
  ]
}
```

- `from`: lingua in cui parla il relatore. `to`: lingua proiettata.
- `screenLabel`: dicitura sullo schermo al posto di «Traduzione italiana» e simili. Facoltativa.
- Ogni voce di `segments` è una schermata, con una chiave per lingua (codici a due lettere).
- `p`: numero del paragrafo, serve al foglio unico per tenere insieme le schermate.
- `heading`: la schermata è un titolo di sezione.
- `slide`: da questa schermata in poi va la slide con questo numero (si conta da 1).

## Altri formati accettati in lettura

- Vecchio formato: `{ "segs": [{ "o": "originale", "t": "traduzione", "p": 0, "h": 1 }] }`.
- Elenco di coppie: `[["originale", "traduzione"], ...]`.
- File dei nomi precedenti del programma: estensioni `.leggio` e `.conferenza`, formati `leggio.*` e `conferenze.*`.
- Elenco di testi: `["schermata uno", "schermata due"]`, considerati nella lingua proiettata.

## Conferenza (`diglot.conference`)

«Scarica il programma in JSON» salva programma, testi e grafica, senza i file delle slide, del logo e dei caratteri. Importandolo, le slide vanno ricaricate.

Per spostare tutto serve «Esporta»: il file `.diglot` è uno ZIP con `conference.json`, `media.json` e la cartella `media/`.

## Grafica (`diglot.theme`)

Colori, caratteri e impostazioni dello schermo, da riusare in un'altra conferenza dalla pagina Grafica. Logo, sfondo e caratteri caricati non sono inclusi.
