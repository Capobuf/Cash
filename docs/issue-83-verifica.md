# Verifica UI — issue #83

Confronto del 22 ottobre 2026 tra `1b92df8` e il branch
`codex/issue-83-ui-polish`. Le immagini sono catture di Electron 44 con i
componenti reali di Cash e dati dimostrativi in memoria; non utilizzano
l'archivio personale né chiamano servizi esterni.

## Modifiche

- Sidebar: distanza tra le voci, hover neutro, selezione con sfondo Moss e
  focus visibile. La sezione Spese evidenzia il padre con il peso del
  testo e l'icona; solo la pagina corrente ha lo sfondo selezionato e
  `aria-current="page"`. Rimossa la card Archivio locale. Nessuna modifica ai
  primitivi condivisi.
- Panoramica: hero più breve, aiuto sul valore orario, meno ripetizioni del
  profilo, nessun alert permanente quando la configurazione è completa.
  KPI e hero compattati, card Preventivi recenti alta quanto il contenuto.
  Giorni disponibili e «Stima interna non contabile» sono tooltip dei titoli,
  accessibili anche da tastiera. Restano visibili gli avvisi e le azioni per
  profili incompleti o proiezioni fiscali non disponibili.
- Clienti: menu con icone per entrambe le azioni, «Apri scheda cliente» e
  «Aggiungi una sede», e larghezza sufficiente a leggerle su una riga.
- Intestazioni e lista preventivi: rimosse le descrizioni ripetitive.
- Spese: spiegazioni del conteggio unico e delle assegnazioni multiple nei
  tooltip; l'avvertenza sui totali non sommabili resta visibile.
- Da incassare: due indicatori distinti per fatture aperte e scadute, con
  etichette e icona, singolare/plurale, zero e dati mancanti. Importi e calcoli
  invariati; testo e numeri lunghi possono andare a capo.
- Font dell'interfaccia Segoe UI, nativo Windows, con fallback di sistema.
  Token Moss, glow e ingresso della panoramica conservati. I nuovi aiuti
  rispettano il movimento ridotto e hanno associazioni ARIA esplicite.

## Confronti prima/dopo

| Area | Prima | Dopo |
| --- | --- | --- |
| Panoramica | [Prima](images/issue-83/before/dashboard-dark.png) | [Dopo](images/issue-83/after/dashboard-dark.png) |
| Hover e selezione, chiaro | [Prima](images/issue-83/before/sidebar-hover-light.png) | [Dopo](images/issue-83/after/sidebar-hover-light.png) |
| Hover e selezione, scuro | [Prima](images/issue-83/before/sidebar-hover-dark.png) | [Dopo](images/issue-83/after/sidebar-hover-dark.png) |
| Panoramica finanziaria | [Prima](images/issue-83/before/financial-dark.png) | [Dopo](images/issue-83/after/financial-dark.png) |
| Flusso spese e sottomenu | [Prima](images/issue-83/before/bank-summary-dark.png) | [Dopo](images/issue-83/after/bank-summary-dark.png) |
| Riepilogo categorie | [Prima](images/issue-83/before/bank-table-light.png) | [Dopo](images/issue-83/after/bank-table-light.png) |
| Lista preventivi | [Prima](images/issue-83/before/quotes-light.png) | [Dopo](images/issue-83/after/quotes-light.png) |

## Verifiche

### Scheda cliente: aggiornamento successivo

La scheda cliente presenta intestazione e pulsante di chiusura fissi, dati
raggruppati in anagrafica, contatti, fatturazione e altre informazioni, sedi in
riquadri compatti con icone nelle azioni e indicazione della partenza predefinita.
I preventivi e gli stati vuoti hanno una gerarchia visiva coerente.

Anteprime con dati dimostrativi: [tema chiaro](images/issue-83/after/client-detail-light.png)
e [tema scuro](images/issue-83/after/client-detail-dark.png).

### KPI finanziarie e navigazione: aggiornamento successivo

Rimossa la sottolineatura dai titoli con tooltip in Panoramica. Le KPI finanziarie
usano importi più compatti, icone e una griglia di altezze uniformi. Titoli su una
o due righe mantengono gli importi allineati; i dettagli si allineano in basso.
“Da incassare” mostra il conteggio delle fatture aperte come testo e una sola
riga separata per numero e importo delle scadute, senza badge impilati.
Conteggio uscite,
rapporto uscite/incassato, obiettivo e totale del commercialista sono nei tooltip
dei titoli; avanzamento, scaduti, dati mancanti e azioni restano visibili.

La sidebar di Cash usa `position: sticky`, altezza della finestra e scorrimento
interno della navigazione, senza modificare il componente condiviso.

Anteprime: [KPI chiare](images/issue-83/after/financial-kpi-light.png),
[KPI scure](images/issue-83/after/financial-kpi-dark.png),
[sidebar durante lo scorrimento](images/issue-83/after/sidebar-sticky.png).

**Test su questi aggiornamenti rimandati su richiesta dell’utente**, fino al
termine delle ulteriori modifiche. I risultati sotto si riferiscono al commit
`96e5dc2`, precedente alle revisioni della scheda cliente, delle KPI finanziarie
e della sidebar.

### Verifiche precedenti

- Catture prima/dopo di Panoramica, lista e dettaglio preventivi, Panoramica
  finanziaria, Spese/Riepilogo e Spese/Categorie in entrambi i temi, a 1440 px e
  a 960 px con testo al 125% (dimensione radice 20 px). Nessun overflow
  orizzontale della pagina a 960 px; tabelle e Sankey mantengono lo scorrimento
  interno previsto. Verificati anche lista e menu Clienti con il nuovo font.
  Una sola voce con `aria-current` per vista.
- Tab raggiunge tutti e cinque i nuovi aiuti con focus visibile; testo del
  tooltip associato con `aria-describedby` e `role="tooltip"`. Escape e
  passaggio al controllo successivo verificati in Electron.
- `prefers-reduced-motion: reduce`: nessuna animazione attiva nelle tre viste
  con grafici/panoramica; transizione sidebar pari a `0s`. I grafici mantengono
  il supporto nativo Recharts tramite `isAnimationActive="auto"`.
- Card Da incassare verificata anche a 280 px con importi fino a
  123.456.789.012.345,67 €, conteggi a nove cifre, zero e snapshot assente:
  nessun overflow della card e nessuna sostituzione dei dati mancanti con zero.
- `npm run typecheck`: superato.
- `npm run lint`: superato.
- `npm test -- --bail=1`: **83 file, 1.051 test superati** (circa 23 secondi).
- `npm run build`: superato.
- Prettier sui file modificati e `git diff --check`: superati.

Ulteriori evidenze: [aiuto valore orario da tastiera](images/issue-83/after/hourly-help-keyboard.png),
[giorni disponibili da tastiera](images/issue-83/after/capacity-help-keyboard.png),
[nota fiscale da tastiera](images/issue-83/after/fiscal-help-keyboard.png),
[menu clienti](images/issue-83/after/clients-menu-light.png),
[aiuto categorie da tastiera](images/issue-83/after/categories-help-keyboard.png),
[indicatori con testo ingrandito](images/issue-83/after/financial-narrow-light.png),
[dettaglio preventivo con testo ingrandito](images/issue-83/after/quote-detail-narrow-dark.png),
[importi e conteggi lunghi](images/issue-83/after/financial-long.png).

La verifica riguarda le viste renderizzate in Electron e la suite del
repository. Non è stata eseguita una nuova installazione del pacchetto Windows
né una sincronizzazione con servizi reali.
