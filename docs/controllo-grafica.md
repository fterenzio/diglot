# Controllo finale della grafica (antislop, modalità during)

Lettura: strumento di lavoro per chi organizza conferenze universitarie, nel linguaggio del programma stampato, ENERGY 1 / RHYTHM 2 / MOTION 1. Direzione in [DESIGN.md](../DESIGN.md).

Le prove citate sono in `tests/e2e.mjs`: 162 controlli su Chrome senza finestra, tutti superati, elenco in fondo.

## Blocco 1: regole assolute

| Regola | Esito | Prova |
|---|---|---|
| R-02 lineette lunghe | PASS | nessuna nei testi dell'interfaccia e nei documenti; restano solo nelle espressioni di riconoscimento del testo |
| R-03 telefono | PASS | a 375 e 1024 px nessuno sbordo su 9 pagine in entrambi i temi e in regia; pulsanti da 44 px sotto i 760 px |
| R-17 numeri | PASS | solo conteggi reali: schermate, slide, parole, megabyte occupati |
| R-18 testimonianze | PASS | nessuna |
| R-23 risorse visive | PASS | nessun logo creato: il nome è scritto come testo; l'esempio usa «Relatore di prova» |
| R-24 navigazione | PASS | ogni voce porta a una pagina esistente, provata |
| R-25 contrasto | PASS | testo, secondario, accento, esito ed errore da 4,6:1 a 13,5:1 su tutti i fondi, nei due temi; i colori scelti dall'utente mostrano il rapporto e avvisano sotto 4,5:1 |
| R-26 controlli | PASS | ogni controllo ha un comportamento, vedi elenco |
| R-27 stati | PASS | vuoto con azione, caricamento con avanzamento, errori con causa e rimedio (password, scansione, formato, spazio) |
| R-28 domande frequenti | PASS | nessuna sezione generica; Aiuto spiega comandi e limiti reali |
| R-32 tastiera | PASS | tutto raggiungibile con Tab, fuoco visibile, dialoghi con Esc; Invio su un pulsante attiva il pulsante; spostamenti anche con Su e Giù oltre al trascinamento |
| R-33 modifiche via script | PASS | funzioni scritte nei sorgenti; `build.mjs` unisce i file, non li altera |
| R-34 temi | PASS | chiaro e scuro provati su tutte le pagine, sull'interfaccia e sullo schermo |
| R-35 esecuzione | PASS | programma costruito ed eseguito, nessun errore in console, elenco qui sotto |
| R-36 dichiarazioni | PASS | l'unica affermazione è che il programma non invia i dati in rete: non fa chiamate di rete; la versione online contiene anche uno script aggiunto da Netlify, che non fa parte del programma |
| R-37 direzione | PASS | direzione dalla proiezione già approvata, scritta in DESIGN.md da chi ha costruito il programma: va confermata dal committente |
| R-38 contenuti | PASS | esempio e anteprima dichiarati come prova |

## Blocco 2: tecniche con motivo

| Regola | Esito | Motivo |
|---|---|---|
| R-01 sfumature | PASS | nessuna, colori piatti |
| R-04 icone | PASS | nessuna libreria; solo i simboli di trasporto in regia, che indicano una direzione |
| R-06 tipografia | PASS | Garamond per leggere, Archivo per consultare; maiuscolo solo nella testatina dello schermo, si spegne in Grafica |
| R-07 sfondi | PASS | nessuna trama; lo sfondo e la locandina delle copertine sono facoltativi e dell'utente |
| R-08 frecce | PASS | solo «Indietro», «Avanti», ritorno al programma e direzione tra lingue |
| R-09 etichette | PASS | solo stati reali: «In corso», «Prossima» |
| R-10 vetro | PASS | nessuno |
| R-12 ombre | PASS | solo dialoghi, avvisi e pannello di regia, che stanno sopra la pagina |
| R-13 bagliori | PASS | nessuno |
| R-14 schede | PASS | nessuna scheda: righe e filetti |
| R-19 animazioni | PASS | solo stati, barra di avanzamento e scorrimento in regia |
| R-22 illustrazioni | PASS | nessuna |

## Blocco 3: carattere

| Domanda | Esito | Prova |
|---|---|---|
| Dial dichiarati e rispettati | PASS | ENERGY 1 / RHYTHM 2 / MOTION 1: le pagine cambiano composizione secondo il lavoro, senza animazioni |
| Un punto focale per schermata | PASS | il programma, le schermate del testo, l'anteprima, il testo letto in regia |
| Spazio come struttura | PASS | giornate e sessioni separate da spazi e filetti di peso diverso |
| Un accento deliberato | PASS | oro su filetti, barra e voce attiva |
| Motivo riconoscibile | PASS | il filetto oro corto e la pagina che si legge come un programma stampato |

## Blocco 4: qualità

| Regola | Esito | Prova |
|---|---|---|
| C-1 intenzione | PASS | motivi in DESIGN.md |
| C-2 completezza | PASS | elenco qui sotto |
| C-3 contenuti | PASS | «Da sistemare» e il programma sostituiscono il cruscotto standard |
| C-4 tenuta | PASS con limite | stati, temi, misure e tastiera provati su Chrome; Firefox, Safari e Windows non provati |
| C-5 prove | PASS | nessuna dichiarazione non verificabile |
| R-05, R-11, R-15, R-16 | PASS | nessuno schema da modello; raggi 3-8 px; pulsanti con azioni precise; nessuno slogan |
| R-20, R-30 | PASS | identità da programma stampato, nessuna imitazione di altri prodotti |
| R-21 tema scuro | PASS | scelta dell'utente, il predefinito segue il sistema |
| R-29 tavolozza | PASS | fondo, inchiostro, un accento; verde e ruggine solo per esiti ed errori |
| R-31 motivi scritti | PASS | DESIGN.md |

## Commenti nel codice (antislop-code)

PASS: nessun separatore decorativo o etichetta vuota; i commenti spiegano un vincolo o un motivo, una riga ciascuno, due solo dove il secondo fatto è nuovo.

## Prove eseguite

- elenco vuoto con invito a iniziare
- titolo obbligatorio per una nuova conferenza
- nuova conferenza creata
- elenco da sistemare segnala il testo mancante
- convertitore: alternati.docx riconosciuto come Paragrafi alternati
- convertitore: tabella.docx riconosciuto come Tabella a due colonne
- convertitore: sequenza.docx riconosciuto come Prima una lingua, poi l'altra
- convertitore: colonne.pdf riconosciuto come Due colonne nel PDF
- convertitore: solo_de.docx + solo_it.docx riconosciuto come Due file separati
- convertitore: a_capo.docx riconosciuto come Paragrafi alternati
- convertitore: frasi.docx riconosciuto come Frasi alternate
- convertitore: testo.txt riconosciuto come Testo in una sola lingua
- struttura del file imposta a mano
- convertitore: vecchio.json riconosciuto come File JSON
- convertitore: cue.docx riconosciuto come Testo in una sola lingua
- indicazioni [Folie N] trovate
- convertitore: grassetto.docx riconosciuto come Testo in una sola lingua
- numeri in grassetto letti come cambi di slide
- intestazione del documento riconosciuta
- testo caricato nell'intervento
- dividi una schermata
- unisci due schermate
- sposta una frase alla schermata sopra
- annulla ripristina la frase
- la modifica al testo viene salvata
- trova e sostituisci
- nuova lingua proposta sulle schermate esistenti
- slide da PDF: una per pagina
- slide da PowerPoint disegnate, grafico segnalato
- slide da immagini
- anteprime delle slide visibili
- citazioni importate da un file
- anteprima della grafica riceve i colori
- logo caricato
- locandina: file sbagliato rifiutato
- locandina caricata dal PDF, in verticale
- locandina: di un PDF di due pagine si usa la prima e lo si dice
- in sala compaiono gli interventi
- regia manda avanti lo schermo
- slide accanto al testo dal primo cambio
- la slide cambia dove il testo lo indica
- M nasconde le slide
- schermo nero
- foglio unico
- lingua sullo schermo cambiata dalla regia
- correzione dalla regia arriva allo schermo
- discussione sullo schermo
- Maiusc+G elenca i relatori con materiali
- Invio su un pulsante attiva il pulsante, non «Avanti»
- C riproietta la copertina sullo schermo
- sulla copertina riproiettata c'è la locandina
- la regia dice che c'è la copertina
- «Avanti» toglie la copertina e resta allo stesso punto
- tornando dalla copertina la slide è come prima
- il pulsante Copertina fa lo stesso del tasto
- di nuovo C torna allo stesso punto
- la copertina esce anche dal foglio unico
- il pulsante della Sala riproietta la copertina anche con lo schermo già aperto
- la regia sa che la Sala ha riproiettato la copertina
- dalla copertina della Sala si torna allo stesso punto
- nessun errore in schermo e regia
- la regia della copertina la manda sullo schermo con C
- regia della copertina senza errori
- intervento di sole slide: lo schermo cambia intervento e mostra la slide
- copertina da un altro intervento: lo schermo la mostra senza ricaricarsi
- togliendola lo schermo passa all'intervento della regia
- un link verso uno schermo già aperto lo cambia davvero
- locandina accanto al titolo: dentro lo schermo, senza coprire il testo, con le sue proporzioni
- sulla copertina va la prima pagina del PDF
- un titolo lunghissimo si riduce e non finisce sotto la locandina
- locandina da sola a tutta altezza, e lo schermo aperto si aggiorna
- slide accanto al testo sulla copertina: va a tutto schermo, senza errori
- esporta e reimporta con le slide
- la locandina resta esportando e reimportando
- duplicando la conferenza la locandina resta
- locandina tolta
- JSON dell'intervento: andata e ritorno
- programma scaricato in JSON
- esporta dal programma
- aggiungi una sessione
- aggiungi una giornata con la data dopo
- togli una giornata
- annulla dall'avviso
- sposta un intervento giù
- sposta un intervento su
- trascina un intervento
- aggiungi una lingua alla conferenza
- togli una lingua dalla conferenza
- la data aggiorna il giorno scritto
- stampa del testo
- scarica il JSON dell'intervento
- segna come titolo
- passa all'intervento successivo
- aggiungi e togli una pagina di citazione
- aggiungi una citazione
- togli una citazione
- scegli la serie proiettata
- togli una serie
- togli una slide
- carattere caricato e scelto
- grafica esportata
- JSON sbagliato rifiutato per la grafica
- riporta la grafica all'inizio
- togli il logo
- in sala: riprendi l'ultima proiezione
- A+ e A− cambiano il testo
- testo a fronte
- clic su una riga a fronte
- vai alla schermata
- cerca nel testo
- elenco di slide e citazioni
- proietta dall'elenco
- togli la slide
- pulsante schermo nero
- nessun errore nei controlli della regia
- finestra per Teams
- esporta dall'elenco
- file col vecchio nome ancora importato
- JSON col vecchio formato ancora accettato
- il JSON del programma non porta con sé la locandina
- file col secondo nome ancora importato
- preferenze dei nomi precedenti conservate
- file sbagliato rifiutato all'importazione
- nessuno sbordo a 375px, chiaro: elenco
- nessuno sbordo a 375px, chiaro: programma
- nessuno sbordo a 375px, chiaro: testo
- nessuno sbordo a 375px, chiaro: slide
- nessuno sbordo a 375px, chiaro: citazioni
- nessuno sbordo a 375px, chiaro: grafica
- nessuno sbordo a 375px, chiaro: sala
- nessuno sbordo a 375px, chiaro: convertitore
- nessuno sbordo a 375px, chiaro: aiuto
- nessuno sbordo a 1024px, chiaro: elenco
- nessuno sbordo a 1024px, chiaro: programma
- nessuno sbordo a 1024px, chiaro: testo
- nessuno sbordo a 1024px, chiaro: slide
- nessuno sbordo a 1024px, chiaro: citazioni
- nessuno sbordo a 1024px, chiaro: grafica
- nessuno sbordo a 1024px, chiaro: sala
- nessuno sbordo a 1024px, chiaro: convertitore
- nessuno sbordo a 1024px, chiaro: aiuto
- nessuno sbordo a 375px, scuro: elenco
- nessuno sbordo a 375px, scuro: programma
- nessuno sbordo a 375px, scuro: testo
- nessuno sbordo a 375px, scuro: slide
- nessuno sbordo a 375px, scuro: citazioni
- nessuno sbordo a 375px, scuro: grafica
- nessuno sbordo a 375px, scuro: sala
- nessuno sbordo a 375px, scuro: convertitore
- nessuno sbordo a 375px, scuro: aiuto
- nessuno sbordo a 1024px, scuro: elenco
- nessuno sbordo a 1024px, scuro: programma
- nessuno sbordo a 1024px, scuro: testo
- nessuno sbordo a 1024px, scuro: slide
- nessuno sbordo a 1024px, scuro: citazioni
- nessuno sbordo a 1024px, scuro: grafica
- nessuno sbordo a 1024px, scuro: sala
- nessuno sbordo a 1024px, scuro: convertitore
- nessuno sbordo a 1024px, scuro: aiuto
- regia a 375px senza sbordi
- regia a 375px con la copertina sullo schermo, senza sbordi
- nessun errore nella progettazione
