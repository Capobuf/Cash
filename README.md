# Cash

Cash è un client desktop Windows monoutente con due aree separate: **Preventivazione** e **Analisi finanziaria**.
La preventivazione costruisce offerte a partire da obiettivi economici,
tempo, spese e trasferte. Il prezzo finale resta sempre una scelta dell’utente. L’app non è un software
fiscale o contabile e non sostituisce il commercialista.

La specifica canonica è [Cash_Specifica_Funzionale_v0.7.md](Cash_Specifica_Funzionale_v0.7.md), del 30 settembre 2026.

## Avvio in sviluppo

Richiede Node.js 24 e npm soltanto sulla macchina di sviluppo.

```powershell
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

Il runtime carica file locali e non avvia server HTTP né apre porte. Il renderer non ha accesso generico
a filesystem, credenziali o rete: usa esclusivamente le operazioni native esposte dal preload isolato.

## Archivio e Google Drive

Tutti i dati funzionali risiedono in un solo file JSON UTF-8 scelto dall’utente. Per usarlo con Google
Drive for Desktop:

1. configurare Drive in modalità mirroring («Duplica file»);
2. creare o spostare l’archivio in una cartella di «Il mio Drive» disponibile offline;
3. lavorare su una sola postazione alla volta;
4. prima di cambiare postazione, chiudere Cash solo dopo lo stato `Salvato`;
5. attendere la fine della sincronizzazione prima sulla postazione precedente e poi su quella nuova.

Ogni salvataggio valido incrementa la revisione, conserva la versione precedente in
`<nome>.backup.json`, scrive e valida un file temporaneo nella stessa cartella e controlla UUID,
revisione e SHA-256 prima della sostituzione. Cash non fonde versioni e non ripristina backup
automaticamente. In caso di conflitto usare `Copia di recupero` e confrontare esplicitamente i file.

Gli archivi schema 1–6 richiedono anteprima e conferma prima della migrazione allo schema 7.
Il passaggio v5→v6 aggiunge `bankExpenseCategories`, `bankExpenses` e `bankExpenseRules` vuoti e conserva tutti i dati,
incluso lo snapshot Fatture in Cloud. Le migrazioni storiche proseguono fino a v7.
Il passaggio v6→v7 conserva movimenti, categorie, regole e snapshot e aggiunge `financialProvisions: []`:
copertura iniziale zero, nessuna integrazione e nessun saldo presunto. Ogni previsione riguarda l’anno
selezionato e contiene `covered`, `additions` (solo descrizione/importo) e l’eventuale `bankBalance`
(importo/data inseriti manualmente). Non si copia la copertura all’anno successivo.
Le raccolte bancarie assenti vengono lette con liste vuote; le vecchie
assegnazioni `categoryId` diventano categorie manuali in `categoryIds`. L’apertura non riscrive
il file: il successivo salvataggio conserva il formato precedente nel consueto backup.
Il nuovo numero di schema impedisce ai vecchi client di risalvare l’archivio scartando i dati nuovi. La migrazione
automatica procede solo per trasformazioni deterministiche. Se trova Clienti locali, `oneWayKm` o
Trasferte del modello precedente, si arresta senza scrivere e indica i dati da ricostruire esplicitamente.
Uno schema più nuovo viene aperto soltanto in lettura.

## Uso offline e fonti live

Senza rete restano disponibili profili, Sedi, catalogo, template, preventivi, snapshot, modifica manuale
delle Trasferte e calcoli storici. Falliscono soltanto le azioni che chiedono un dato corrente:

- prezzo regionale carburante MIMIT;
- indice mensile FOI ISTAT senza tabacchi;
- ricerca, verifica prodotto ed esportazione Fatture in Cloud quando il modulo è attivo.
- geocodifica, reverse geocoding e calcolo percorso OpenRouteService.

Cash non usa cache o sorgenti alternative come valori correnti. Un errore della fonte è mostrato e non
modifica parzialmente il preventivo.

## Fatture in Cloud opzionale

Il modulo parte disattivato. In questo stato non effettua chiamate a Fatture in Cloud e l’intero ciclo
locale funziona senza token, azienda o prodotto. Il Client ID dell’app privata si inserisce dalla schermata
**Impostazioni → Integrazioni** o direttamente nel primo passaggio della procedura guidata. Viene salvato
soltanto nelle preferenze locali della postazione e non è incorporato nella build.

La procedura guidata richiede un token manuale con i soli permessi `entity.clients:r`, `products:r`,
`settings:r`, `issued_documents.quotes:a`, `issued_documents.invoices:r`,
`issued_documents.credit_notes:r` e `received_documents:r` e lo salva nel Gestore credenziali di Windows non appena viene confermato,
anche se il wizard viene poi interrotto. Fa quindi scegliere azienda e prodotto con nome esatto
`Consulenza`, verifica i permessi e importa il profilo fiscale aziendale. I valori disponibili in Fatture in
Cloud prevalgono su quelli manuali; i campi non esposti restano da compilare. Ogni postazione deve essere configurata
separatamente. Disattivare il modulo conserva configurazione e token; `Rimuovi collegamento` elimina il
token locale e i riferimenti condivisi, senza modificare snapshot o esportazioni storiche.

I Clienti sono recuperati esclusivamente da Fatture in Cloud. Cash conserva soltanto riferimenti e
snapshot necessari a Sedi e Preventivi; non mantiene un’anagrafica Cliente locale.

## Analisi finanziaria

La sezione **Analisi finanziaria → Panoramica** confronta Fatturato obiettivo e Costi pianificati Cash con fatture, spese registrate
e pagamenti FIC. Fatture in Cloud resta la source of truth: i documenti amministrativi sono in sola lettura.
La Panoramica nell’area Preventivazione resta distinta dalla Panoramica finanziaria.

**Spese → Movimenti** importa un XLSX della banca tramite dialog nativo. Il parser legge il primo
foglio e cerca l’intestazione `Data_Operazione`, `Data_Valuta`, `Entrate`, `Uscite`, `Descrizione`,
`Descrizione_Completa`, `Stato`, anche dopo un preambolo. Acquisisce solo le righe con `Uscite < 0`, indipendentemente
dallo stato, usando data valuta, descrizione completa (con fallback) e importo positivo a due decimali.
Una riga di uscita non valida annulla l’intero import; le entrate sono ignorate. Il risultato riporta
movimenti aggiunti, duplicati e entrate ignorate. La deduplica esatta data/descrizione/importo vale
anche all’interno del file e conserva le categorie già assegnate. Due spese reali con la stessa terna
sono intenzionalmente considerate duplicate.

La tabella consente ricerca, filtri e assegnazione manuale di più categorie con autosalvataggio.
**Nuova spesa** e **Modifica** consentono di gestire data, descrizione, importo positivo e categorie
manuali; data/descrizione/importo duplicati vengono rifiutati. Cambiando descrizione si ricalcolano le regole.
Le checkbox selezionano singole spese o tutti i risultati visibili nell’anno e nei filtri correnti;
cambiando filtri o anno la selezione si azzera. La barra mostra numero e totale delle spese selezionate.
Le azioni di massa aggiungono, rimuovono, sostituiscono o svuotano le categorie manuali in un solo
salvataggio, senza alterare quelle automatiche. L’eliminazione singola o multipla richiede conferma
con l’elenco delle spese; categorie e regole vengono conservate. Reimportare un XLSX può reinserire
le spese eliminate. Le modifiche rispettano sola lettura e blocco per conflitto esterno.
Nei dialoghi di categorizzazione, creazione/modifica spesa e regola è disponibile **Nuova categoria /
sottocategoria**: nome e padre facoltativo permettono di creare la voce senza lasciare le spese.
**Crea e seleziona** salva subito la categoria e la seleziona nel dialogo, preservando le scelte già
effettuate; l’assegnazione viene confermata con il salvataggio del dialogo. La creazione rapida è
disponibile anche nelle azioni multiple di aggiunta e sostituzione. Restano validi il massimo di due
livelli e l’unicità del nome nello stesso padre, senza distinzione di maiuscole/minuscole.
`BankExpense.categoryIds` contiene solo le categorie manuali. Le categorie automatiche, indicate con
`Auto`, sono derivate dalle regole e unite a quelle manuali senza duplicati.
**Spese → Categorie** gestisce categorie e sottocategorie su due livelli; nomi univoci, senza distinzione
maiuscole/minuscole, nello stesso padre. Categorie con figli, assegnazioni manuali o regole non sono eliminabili.
Nella stessa pagina, **Regole automatiche** permette di creare, modificare ed eliminare associazioni
`testo → categoria`. Il confronto cerca il testo nella descrizione dopo lowercase e rimozione di tutto
tranne lettere e numeri, senza fuzzy matching, priorità o regole predefinite. Tutte le regole corrispondenti
si sommano e ogni modifica ha effetto immediato sulle spese storiche e future, senza riscriverle.
L’azione **Crea regola** di ciascun movimento mostra descrizione originale, testo modificabile,
categoria e numero di corrispondenze su tutti gli anni prima della conferma.
**Spese → Riepilogo** mostra totali, quota categorizzata, spese mensili e totali per categoria principale.
Filtri e KPI usano le categorie effettive: una spesa è senza categoria solo se non ha né categorie manuali
né automatiche. Il filtro e il totale del padre includono i figli, contando ogni spesa una sola volta
nel ramo. Categorie di rami diversi possono sovrapporsi: i loro totali non sono sommabili e le percentuali
possono superare complessivamente il 100%. Il totale generale e i conteggi restano unici.
L’anno è condiviso con la Panoramica finanziaria, include gli anni bancari ed è solo stato UI.
L’import acquisisce tutti gli anni del file; Categorie è indipendente dall’anno.

I movimenti bancari restano separati dai documenti e dai KPI Fatture in Cloud: nessuna somma,
riconciliazione o categorizzazione automatica non configurata dall’utente. Lettura XLSX e filesystem restano nel processo Electron;
il renderer riceve solo righe normalizzate e applica un’unica mutazione dell’archivio.

**Aggiorna dati Fatture in Cloud** acquisisce manualmente tutte le pagine di invoice, credit_note,
expense e passive_credit_note e sostituisce un unico snapshot finanziario nel file JSON. Un errore
lascia invariato lo snapshot precedente. Nessun aggiornamento automatico, polling o webhook.
I nuovi permessi sono di sola lettura; i vecchi token vanno riconfigurati con gli scope sopra elencati.

L’emesso segue la data fattura; l’incassato segue paid_date, anche per fatture di anni precedenti.
I pagamenti paid senza data valida bloccano l’intera acquisizione. Note di credito e costi documentati
restano separati da ricavi e costi pianificati. La **Stima fiscale sull’incassato** riusa il motore forfettario
con il profilo confermato dello stesso anno. Sono disponibili tabella mensile e dettagli dei residui.

Lo snapshot rimane consultabile offline, con integrazione disattivata o rimossa e su postazioni senza token.
La data dell’ultimo aggiornamento è sempre mostrata. Un cambio azienda viene segnalato e una sincronizzazione
riuscita sostituisce interamente i dati, senza mescolarli. Cash non ricostruisce saldi bancari dai movimenti e non gestisce contabilità.

La **Situazione fiscale** distingue Stima automatica, Integrazioni, Previsione totale, Già coperto e
Da accantonare. **Modifica situazione** permette di gestire copertura e integrazioni (aggiunta,
modifica, rimozione) con un unico salvataggio. Il motore forfettario rimane una stima finanziaria
incompleta, non una posizione fiscale definitiva. Il bollo previsto è una normale integrazione:
nessun uso di `stamp_duty`, soglie d’importo delle fatture o lettura F24 da FIC.

`Da accantonare = max(0, stima automatica + integrazioni − già coperto)`.
La copertura è sempre decisa dall’utente: le uscite fiscali non la aggiornano automaticamente,
anche se categorizzate tramite le regole esistenti. Restano comprese in storico, flussi mensili,
totali bancari e analisi per categoria. Nessuna modifica o riclassificazione dei vecchi movimenti.
Una copertura superiore alla previsione azzera il residuo senza creare crediti o riporti.

`Disponibilità effettiva = saldo bancario di riferimento − da accantonare`.
Poiché l’import bancario acquisisce solo uscite, il saldo reale viene inserito manualmente con
la sua data nella situazione dell’anno selezionato. Include già i pagamenti effettuati: non si
sottraggono nuovamente le uscite importate. L’import non aggiorna il saldo; l’utente deve mantenerlo
aggiornato. Senza saldo o stima fiscale il KPI resta non disponibile, senza fallback.
Il **Margine dei flussi annuali** resta separato: incassato FIC − uscite bancarie − da accantonare.
Costi pianificati, costi FIC e preventivazione mantengono le loro logiche precedenti.

## OpenRouteService

La API key si configura in **Impostazioni → Integrazioni**, viene salvata nel Gestore credenziali di
Windows e verificata con una richiesta reale. Le Sedi vengono localizzate solo tramite “Cerca”. Il
percorso di una Trasferta viene calcolato solo tramite “Calcola percorso”; distanza e tempo restano
modificabili e non sono aggiornati automaticamente.

## Pacchetto Windows

```powershell
npm run package:win
```

Il comando crea `release/Cash.exe`, un’applicazione portable autosufficiente. Non richiede installazione,
Node.js, database, container o server sulla macchina dell’utente. Il prodotto è destinato a Windows 10/11
x64 e a uso sequenziale monoutente.
