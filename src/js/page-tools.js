(function (L) {
  "use strict";
  const { el } = L, M = L.Model, Store = L.Store, Studio = L.Studio;

  const EXAMPLE = `{
  "format": "diglot.talk",
  "version": 1,
  "speaker": "Nome del relatore",
  "title": { "de": "Titel", "it": "Titolo" },
  "from": "de",
  "to": "it",
  "segments": [
    { "de": "1. Abschnitt", "it": "1. Sezione", "p": 0, "heading": true },
    { "de": "Erster Satz.", "it": "Prima frase.", "p": 1, "slide": 1 },
    { "de": "Zweiter Satz.", "it": "Seconda frase.", "p": 1 }
  ],
  "passages": [
    { "ref": "Opera, p. 12", "author": "Autore", "pages": [{ "de": "Zitat", "it": "Citazione" }] }
  ]
}`;

  async function assignPanel(api) {
    const all = (await Store.listConferences()).map(M.normalize);
    if (!all.length) return el("p", { class: "lab-h" }, "Per mettere il testo in un intervento serve una conferenza: creala dalla pagina «Conferenze».");
    let conf = all[0], talkId = "";
    const talkSel = el("select", { class: "ed-select", "aria-label": "Intervento", id: "conv-talk", onchange: (e) => { talkId = e.target.value; } });
    const fillTalks = () => {
      talkSel.replaceChildren(el("option", { value: "" }, "Nuovo intervento, nell'ultima sessione"), ...M.talks(conf).map((x) => el("option", { value: x.talk.id }, (x.talk.speaker || "Senza nome") + (x.talk.segments.length ? " (sostituisce il testo)" : ""))));
      talkId = "";
    };
    fillTalks();
    return el("div", { class: "assign" },
      Studio.labeled("Conferenza", el("select", { class: "ed-select", id: "conv-conf", "aria-label": "Conferenza", onchange: (e) => { conf = all.find((c) => c.id === e.target.value); fillTalks(); } }, all.map((c) => el("option", { value: c.id }, M.pick(c.title, c.languages[0]) || "Senza titolo")))),
      Studio.labeled("Intervento", talkSel),
      el("button", { class: "btn primary", id: "conv-assign", onclick: async () => {
        let t = talkId ? M.find(conf, talkId).talk : null;
        if (!t) {
          t = M.newTalk(conf);
          const day = conf.days[conf.days.length - 1] || (conf.days.push(M.newDay(conf)), conf.days[conf.days.length - 1]);
          if (!day.sessions.length) day.sessions.push(M.newSession(conf, 0));
          day.sessions[day.sessions.length - 1].talks.push(t);
        }
        api.applyTo(t);
        await Store.putConference(conf);
        Studio.closeConf();
        location.hash = "#/c/" + conf.id + "/t/" + t.id;
      } }, "Metti nell'intervento"));
  }

  Studio.pages.tools = async function () {
    await Studio.flush();
    Studio.closeConf();
    const main = Studio.shell("tools");
    document.title = "Convertitore · Diglot";
    const wiz = el("div", { class: "wizard" });
    main.append(
      el("h1", null, "Convertitore"),
      el("p", { class: "tab-lead" }, "Trasforma un documento in testo pronto da proiettare, in formato JSON. DeepL traduce il file conservandone la struttura: caricalo qui con il suo originale, oppure carica da solo il file bilingue se lo hai già unito in una tabella a due colonne o a paragrafi alternati. Il JSON già pronto si può ricaricare e controllare."),
      wiz,
      el("details", { class: "fmt" }, el("summary", null, "Come riconosce documenti e slide"),
        el("ul", null,
          el("li", null, "File bilingue: tabella a due colonne, due colonne in un PDF, paragrafi alternati, oppure una lingua dopo l'altra. La lingua si riconosce dalle parole, e se sbaglia si corregge a mano."),
          el("li", null, "Due file: vengono allineati frase per frase, confrontando lunghezze, numeri, nomi e parole affini. Le schermate dubbie restano segnate da controllare."),
          el("li", null, "Note a piè di pagina, numeri di pagina e testatine dei PDF vengono tolti; la riga «Tradotto con DeepL» della versione gratuita anche."),
          el("li", null, "Cambi di slide: [Slide 3], (Folie 3), <<3>> nel testo, oppure numeri in grassetto a inizio frase come (3), se formano una serie crescente."),
          el("li", null, "PDF fatti di sole immagini (scansioni): non contengono testo, vanno prima passati da un programma di riconoscimento del testo."))),
      el("details", { class: "fmt" }, el("summary", null, "Il formato JSON"),
        el("p", null, "Ogni voce di «segments» è una schermata: una chiave per lingua, «p» per il paragrafo, «heading» per i titoli, «slide» dove cambia la slide. Sono accettati anche il vecchio formato con «segs» e «o»/«t», e un semplice elenco di coppie [originale, traduzione]."),
        el("pre", { class: "code" }, EXAMPLE)));
    L.Wizard.mount(wiz, { inputId: "conv-files", actions: (api) => {
      const holder = el("div", { class: "assign-holder" });
      assignPanel(api).then((p) => holder.replaceChildren(p));
      const t = api.result, file = (api.parsed[0] && api.parsed[0].name || "testo").replace(/\.[^.]+$/, "");
      return [
        el("button", { class: "btn primary", id: "conv-json", onclick: () => {
          const shell = { speaker: "", affiliation: "", title: {}, from: api.opts.from, to: api.opts.to, screenLabel: "", segments: api.result.segments, passages: [] };
          L.download(new Blob([JSON.stringify(L.Convert.talkToJSON(shell), null, 1)], { type: "application/json" }), L.slug(file) + ".json");
        } }, "Scarica il JSON"),
        holder,
      ];
    } });
  };

  Studio.pages.help = async function () {
    await Studio.flush();
    Studio.closeConf();
    const main = Studio.shell("help");
    document.title = "Aiuto · Diglot";
    const keys = [
      [["→", "D", "Spazio", "PagGiù"], "schermata successiva"], [["←", "A", "PagSu"], "schermata precedente"], [["numero", "Invio"], "vai a quella schermata"],
      [["B"], "schermo nero; di nuovo B o «Avanti» per riaccenderlo"], [["S"], "a schermate oppure foglio unico che scorre"], [["V"], "in regia: pannelli oppure testo a fronte"],
      [["E"], "in regia: correggi la schermata corrente"], [["G", "numero"], "elenco di slide e citazioni, proietta quella col numero"], [["Maiusc", "G"], "le stesse di tutti i relatori: scegli il relatore, poi l'elemento"],
      [["J", "K"], "slide o pagina avanti e indietro"], [["L", "H"], "elemento successivo e precedente"], [["X"], "toglie slide o citazione"], [["M"], "mostra o nasconde le slide legate al testo"], [["O"], "cambia serie di slide"],
      [["Q"], "discussione: si scelgono i relatori; di nuovo Q o «Avanti» per toglierla"], [["T"], "chiaro o scuro"], [["+", "−"], "dimensione del testo"], [["F"], "sulla finestra dello schermo: schermo intero"], [["R"], "sulla finestra dello schermo: apre la regia"],
    ];
    main.append(
      el("h1", null, "Aiuto"),
      el("p", { class: "tab-lead" }, "Il nome viene dai diglot, i libri con lo stesso testo in due lingue: qui le due lingue sono quella del relatore e quella sullo schermo."),
      el("section", { class: "help" },
        el("h2", null, "Preparare una conferenza"),
        el("p", null, "Nel Programma scrivi giorni, sessioni e interventi. Nella pagina di ogni intervento carichi testo, slide e citazioni. L'elenco «Da sistemare» dice cosa manca ancora. In Grafica scegli colori, caratteri e logo: l'anteprima usa il testo vero."),
        el("h2", null, "Durante la conferenza"),
        el("p", null, "Vai in «In sala» e apri «Schermo»: trascina la finestra sul proiettore e premi F. «Regia» resta sul portatile. Le due finestre devono stare nello stesso browser, sullo stesso computer. Se un relatore cambia lingua all'ultimo, nella regia c'è «Lingua sullo schermo»."),
        el("h2", null, "Comandi da tastiera"),
        el("dl", { class: "keytable" }, keys.map(([k, t]) => [el("dt", null, k.map((x) => el("kbd", null, x))), el("dd", null, t)]))),
      el("section", { class: "help" },
        el("h2", null, "Portare tutto su un altro computer"),
        el("p", null, "Il programma è un solo file, Diglot.html: si copia su una chiavetta e si apre con un doppio clic, senza installare nulla e senza internet. Conferenze, testi e slide stanno invece nel browser in cui li hai caricati: per spostarli usa «Esporta» e importa il file .diglot dall'altra parte."),
        el("h2", null, "Collegamento Teams"),
        el("p", null, "Il modo più affidabile è condividere in Teams lo schermo del proiettore. Senza proiettore, apri «Finestra per Teams» e condividi quella: segue la regia anche nel passaggio da un intervento all'altro. Lasciala visibile e non ridotta a icona."),
        el("h2", null, "Limiti da conoscere"),
        el("ul", null,
          el("li", null, "I PowerPoint si disegnano qui dentro senza PowerPoint: testi, forme, immagini e tabelle sì; grafici e SmartArt no, e i caratteri non installati vengono sostituiti. Per una copia identica esporta le slide in PDF."),
          el("li", null, "Le animazioni delle slide non vengono riprodotte: ogni diapositiva è un'immagine."),
          el("li", null, "I dati restano in un solo browser: non si sincronizzano da soli tra computer diversi, e cancellando i dati di navigazione spariscono. Esporta una copia prima dell'evento."),
          el("li", null, "Usa Chrome o Edge aggiornati. Firefox e Safari recenti dovrebbero funzionare ma le prove automatiche sono fatte su Chrome."))));
  };
})(window.Diglot);
