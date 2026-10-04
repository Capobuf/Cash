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
npm run format:check
npm test
npm run build
npm start
```

Usa `npm run format` per formattare codice, test e configurazioni con Prettier.
`npm run format:check` verifica gli stessi file senza modificarli e viene eseguito anche dalla CI.
ESLint resta dedicato ai controlli sul codice, senza un secondo insieme di regole stilistiche.

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

Gli archivi schema 1–9 richiedono anteprima e conferma prima della migrazione allo schema 10.
La migrazione rimuove il saldo bancario manuale e il relativo contenitore annuale, senza
trasferirli altrove. Conserva profili, movimenti, categorie, regole, snapshot FIC, preventivi
e gli altri dati. Per gli archivi storici elimina anche covered/additions senza creare
movimenti e aggiunge la categoria di sistema Imposte P.IVA solo se assente.
Una categoria utente omonima rimane distinta.
Movimenti e regole assenti vengono letti con liste vuote; le vecchie
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

L’aliquota INPS si inserisce in **Impostazioni → Profili annuali → Fiscalità**, anche con FIC collegato.
Un nuovo profilo o una copia per un nuovo anno mostra **Configura INPS**, con istruzioni per cercare
su inps.it la circolare «Gestione Separata aliquote contributive» dell’anno e scegliere la voce
Professionisti in base a pensione e altra copertura previdenziale. La copia non riporta l’aliquota:
va inserita nuovamente; anche il massimale deve essere verificato. Un’aliquota mancante o zero
non consente la previsione fiscale. Gli archivi esistenti conservano i dati: gli eventuali zeri
vanno corretti e il profilo riconfermato. Il valore FIC `contributions_percentage` non sovrascrive
più l’aliquota manuale.

La procedura guidata richiede un token manuale con i soli permessi `entity.clients:r`, `products:r`,
`settings:r`, `issued_documents.quotes:a`, `issued_documents.invoices:r`,
`issued_documents.credit_notes:r` e `received_documents:r` e lo salva nel Gestore credenziali di Windows non appena viene confermato,
anche se il wizard viene poi interrotto. Fa quindi scegliere azienda e prodotto con nome esatto
`Consulenza`, verifica i permessi e importa il profilo fiscale aziendale. I valori disponibili in Fatture in
Cloud prevalgono su quelli manuali per regime e redditività; aliquota e massimale INPS restano manuali. Ogni postazione deve essere configurata
separatamente. Disattivare il modulo conserva configurazione e token; `Rimuovi collegamento` elimina il
token locale e i riferimenti condivisi, senza modificare snapshot o esportazioni storiche.

I Clienti sono recuperati esclusivamente da Fatture in Cloud. Cash conserva soltanto riferimenti e
snapshot necessari a Sedi e Preventivi; non mantiene un’anagrafica Cliente locale.

## Analisi finanziaria

La sezione **Analisi finanziaria → Panoramica** confronta Fatturato obiettivo e Costi pianificati Cash con fatture, spese registrate
e pagamenti FIC. Fatture in Cloud resta la source of truth: i documenti amministrativi sono in sola lettura.
La Panoramica nell’area Preventivazione resta distinta dalla Panoramica finanziaria.

**Spese → Movimenti** importa un file XLSX o CSV della banca tramite dialog nativo. Per gli XLSX il parser legge il primo
foglio e cerca l’intestazione `Data_Operazione`, `Data_Valuta`, `Entrate`, `Uscite`, `Descrizione`,
`Descrizione_Completa`, `Stato`, anche dopo un preambolo. Acquisisce solo le righe con `Uscite < 0`, indipendentemente
dallo stato, usando data valuta, descrizione completa (con fallback) e importo positivo a due decimali.
Una riga di uscita non valida annulla l’intero import; le entrate sono ignorate. Il risultato riporta
movimenti aggiunti, duplicati e entrate ignorate. La deduplica esatta data/descrizione/importo vale
anche all’interno del file e conserva le categorie già assegnate. Due spese reali con la stessa terna
sono intenzionalmente considerate duplicate.

I CSV UTF-8 con intestazione `Tipo,Prodotto,Data di inizio,Data di completamento,Descrizione,Importo,Costo,Valuta,State,Saldo`
usano la data di completamento, con fallback alla data di inizio (anche per i movimenti in sospeso).
Gli importi hanno il punto decimale: l’uscita è `Costo - Importo` quando positiva, così le commissioni
sono incluse anche con importo zero. Gli accrediti netti sono ignorati. Sono ammesse solo uscite in EUR;
struttura, date o importi non validi annullano l’intera importazione. Sono supportati campi tra virgolette,
virgole nelle descrizioni e descrizioni su più righe. Valgono le stesse regole di deduplica degli XLSX:
un movimento in sospeso poi completato con data diversa non viene riconciliato automaticamente.

La tabella consente ricerca, filtri e assegnazione manuale di più categorie con autosalvataggio.
**Nuova spesa** e **Modifica** consentono di gestire data, descrizione, importo positivo e categorie
manuali; data/descrizione/importo duplicati vengono rifiutati. Cambiando descrizione si ricalcolano le regole.
Le checkbox selezionano singole spese o tutti i risultati visibili nell’anno e nei filtri correnti;
cambiando filtri o anno la selezione si azzera. La barra mostra numero e totale delle spese selezionate.
Le azioni di massa aggiungono, rimuovono, sostituiscono o svuotano le categorie manuali in un solo
salvataggio, senza alterare quelle automatiche. L’eliminazione singola o multipla richiede conferma
con l’elenco delle spese; categorie e regole vengono conservate. Reimportare un file XLSX o CSV può reinserire
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
Il selettore anno nell’AppShell è visibile in tutte le sezioni ed è solo stato UI. Include sempre
l’anno corrente, oltre agli anni di profili, preventivi, banca, documenti/pagamenti FIC e correzioni
fiscali. Il default è l’anno corrente anche con soli dati storici o archivio vuoto. La selezione
influenza Dashboard, Analisi finanziaria, Movimenti e Riepilogo; le altre sezioni non filtrano i contenuti.
L’import acquisisce tutti gli anni del file; Categorie è indipendente dall’anno.

I movimenti bancari restano separati dai documenti e dai KPI Fatture in Cloud: nessuna somma,
riconciliazione o categorizzazione automatica non configurata dall’utente. Lettura XLSX/CSV e filesystem restano nel processo Electron;
il renderer riceve solo righe normalizzate e applica un’unica mutazione dell’archivio.

**Aggiorna dati Fatture in Cloud** acquisisce manualmente tutte le pagine di invoice, credit_note,
expense e passive_credit_note e sostituisce un unico snapshot finanziario nel file JSON. Un errore
lascia invariato lo snapshot precedente. Nessun aggiornamento automatico, polling o webhook.
I nuovi permessi sono di sola lettura; i vecchi token vanno riconfigurati con gli scope sopra elencati.

L’emesso segue la data fattura; l’incassato segue paid_date, anche per fatture di anni precedenti.
I pagamenti paid senza data valida bloccano l’intera acquisizione. Note di credito e costi documentati
restano separati da ricavi e costi pianificati. La **Previsione fiscale automatica** riusa il calcolo forfettario
con il profilo confermato dello stesso anno. Sono disponibili tabella mensile e dettagli dei residui.

Lo snapshot rimane consultabile offline, con integrazione disattivata o rimossa e su postazioni senza token.
La data dell’ultimo aggiornamento è sempre mostrata. Un cambio azienda viene segnalato e una sincronizzazione
riuscita sostituisce interamente i dati, senza mescolarli. Cash non ricostruisce saldi bancari dai movimenti e non gestisce contabilità.

La **Previsione fiscale automatica** mostra il totale anno N (`annualTotal`): contributi INPS stimati, sostitutiva stimata e
bollo di 2 euro per ogni fattura dell’anno con importo lordo superiore a 77,46 euro
e con numerazione e numero privi del prefisso PA. Separatamente mostra il totale acconti N+1 (`totalAdvances`, sostitutiva 100%
oltre 51,65 euro, INPS 80%). Il profilo annuale fornisce coefficienti e aliquote; in assenza
di un profilo successivo confermato l’acconto INPS usa l’aliquota corrente con avviso.
Non è un calcolo dichiarativo: la base sostitutiva usa contributi stimati anziché versamenti
fiscali effettivi. Il bollo viene calcolato indipendentemente dall’incasso e dal campo
stamp_duty importato, anche se assente o pari a zero.

Il box **Correzione con il prospetto del commercialista** permette di inserire un
solo totale annuale facoltativo, riferito ai versamenti dell’anno selezionato. La guida spiega
quali saldi e acconti includere, come evitare duplicazioni tra totale e rate, e come trattare
bollo, compensazioni e importi già pagati. Non è un’aggiunta alla stima e non modifica i movimenti.
`Ancora da versare N = max(0, totale del commercialista N − pagamenti bancari Imposte P.IVA nell’anno N)`,
solo se il totale annuale è disponibile. La stima automatica resta visibile per confronto e non è un fallback;
**Rimuovi totale annuale** elimina il dato e rende indisponibili residuo e disponibilità stimata.
Zero è un totale valido; un’eccedenza pagata non viene trasformata in credito fiscale.
La correzione funziona anche quando la stima è indisponibile, resta confinata al suo anno ed è
salvata in `fiscalPaymentOverrides` (schema 10); la migrazione non inventa importi dagli archivi precedenti.

La categoria di sistema **Imposte P.IVA** è rinominabile e non eliminabile. Il riconoscimento
usa systemRole, anche dopo un rename, e le categorie effettive manuali/automatiche.
I movimenti classificati come Imposte P.IVA sono esclusivamente versamenti effettivamente usciti dal conto nell’anno,
senza attribuzione automatica a tributo, saldo/acconto o anno fiscale.
Le imposte pagate restano nel totale delle uscite. L’eccedenza è mostrata come differenza,
senza crediti o riporti. La dashboard distingue anno corrente e acconti successivi.

`Margine dopo le uscite = Incassato − Uscite dal conto`.
`Disponibilità stimata = Margine dopo le uscite − Ancora da versare N`, solo con totale annuale del commercialista.
Con quel totale la Card principale mostra **Disponibilità stimata** o **Disavanzo stimato** se negativa;
senza quel totale mostra **Margine dopo le uscite** e spiega che il residuo annuale non è determinabile.
Stima fiscale N e acconti N+1 restano indipendenti e non vengono sottratti dai pagamenti bancari N.
Le imposte già pagate sono comprese nelle uscite e riducono il residuo fiscale: non si sottraggono due volte.
Il Sankey Recharts rappresenta Top 5 clienti + Altri clienti → Incassato → Uscite dal conto / Margine.
Le uscite si dividono in Imposte P.IVA già pagate / Altre uscite. Senza totale annuale il Sankey termina al margine;
con quel totale il margine si divide in Ancora da versare nell’anno / Disponibilità stimata, quando non negativa.
Le stime automatiche non entrano nel Sankey o nel grafico mensile. Le normali categorie, potenzialmente sovrapposte,
restano nel grafico separato.
Nella stessa Card, Fatturato emesso, Incassato nell’anno e Da incassare forniscono il contesto:
fatturato e incassato hanno perimetri temporali diversi e non sono collegati nel Sankey.
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

## Dipendenze e manutenzione

La CI usa Node.js 24, cache npm e `npm ci` con il lockfile versionato; esegue typecheck,
lint, `format:check`, test e `package:win`, quindi pubblica come artefatto `release/Cash.exe` (Windows x64).
Non è previsto un installer distinto dal portable.

Le credenziali restano nel Gestore credenziali di Windows. `@zowe/secrets-for-zowe-sdk`
sostituisce `keytar` usando gli stessi identificatori (`it.cash.desktop`,
`fatture-in-cloud-token` e `openrouteservice-api-key`) e lo stesso formato. Non occorre
reinserire o trasferire i segreti: è stata verificata su Windows la lettura di credenziali
fittizie scritte con keytar 7.9.0, compresi Unicode, aggiornamento e cancellazione.
Il test Windows in `tests/integration/credentials-windows.test.ts` verifica il modulo
nativo con un servizio temporaneo distinto e ne cancella le credenziali a fine test.
I test del collegamento FIC verificano anche il ripristino del token quando il salvataggio fallisce.

Il pacchetto Zowe è una dipendenza runtime necessaria, con binario Node-API precompilato
per Windows x64 incluso nel pacchetto npm: non usa `prebuild-install`. Rimane esterno al
bundle esbuild e viene estratto dall'ASAR per il caricamento nativo. Non serve uno step
CI dedicato; electron-builder gestisce già i moduli nativi. `safeStorage` non è usato:
richiederebbe un nuovo archivio cifrato e un percorso di migrazione dal Credential Manager.

Electron, electron-builder, ESLint, TypeScript, Vitest e la CLI shadcn restano nelle
`devDependencies`. Le librerie applicative JavaScript vengono incorporate da esbuild
in `dist`; ExcelJS e Recharts sono dichiarati in `dependencies` dal modulo di analisi
finanziaria. Il modulo esterno per le credenziali deve essere distribuito in `dependencies`.

ESLint 10 è abbinato a `@eslint/js` 10 e typescript-eslint 8 compatibile con ESLint 10 e
TypeScript 5.9. `globals` 16.3.0 resta compatibile. Le tre nuove regole recommended di
ESLint 10 sono disattivate esplicitamente per conservare il perimetro del lint precedente.
La serie ESLint 9 è [fuori supporto](https://eslint.org/version-support/).

Verifica del registro npm del 2 ottobre 2026: ExcelJS 4.4.0 ed electron-builder
26.15.3 sono le versioni indicate da `latest`. Il tag `v26` di electron-builder
punta a 26.17.0, che conserva le stesse catene deprecate; il tag `next` è una
versione alpha. ExcelJS espone anche 4.4.1-prerelease.0, ancora con archiver 5 e
fast-csv 4. Non emerge un aggiornamento stabile delle dipendenze dirette che
rimuova i warning, quindi le versioni applicative restano invariate.

Il lockfile contiene sei pacchetti deprecati, tutti transitivi. Catene ExcelJS 4.4.0:

- `exceljs → archiver@5.3.2 → archiver-utils@2.1.0 → glob@7.2.3 → inflight@1.0.6`
  (anche tramite `zip-stream → archiver-utils@3.0.4`);
- `exceljs → unzipper@0.10.14 → fstream@1.0.12 → rimraf@2.6.3 → glob@7.2.3`;
- `exceljs → fast-csv@4.3.6 → @fast-csv/format@4.3.5 → lodash.isequal@4.5.0`.

Catene della toolchain electron-builder 26.15.3:

- `app-builder-lib → @electron/asar@3.4.1 → glob@7.2.3 → inflight@1.0.6`;
- `app-builder-lib → @electron/get@3.1.0 → global-agent@3.0.0 → boolean@3.2.0`
  (anche tramite `roarr`);
- `app-builder-lib → electron-builder-squirrel-windows → electron-winstaller → temp → rimraf@2.6.3`.

Queste deprecazioni richiedono aggiornamenti upstream: non vengono forzate tramite
nuovi `overrides` o dipendenze dirette. L'override ExcelJS/uuid già presente non
riguarda questi sei pacchetti. Il target di Cash rimane portable, non Squirrel.
Per ripetere la verifica usare `npm view exceljs dist-tags`,
`npm view electron-builder dist-tags` e
`npm ls boolean fstream glob inflight lodash.isequal rimraf --all`.
Per controllare la sicurezza usare sia `npm audit` sia `npm audit --omit=dev`:
quest'ultimo esclude anche le librerie JavaScript incorporate nel bundle, quindi da solo
non rappresenta tutta la superficie runtime dell'app. Entrambi gli audit del
2 ottobre 2026 riportano zero vulnerabilità; questo risultato non elimina le deprecazioni.
