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

Gli archivi schema 1–4 richiedono anteprima e conferma prima della migrazione allo schema 5.
Il passaggio v4→v5 conserva tutti i dati esistenti e aggiorna soltanto la versione, senza snapshot iniziale.
Il nuovo numero di schema impedisce ai vecchi client di risalvare l’archivio scartando lo snapshot finanziario. La migrazione
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

La pagina dedicata confronta Fatturato obiettivo e Costi pianificati Cash con fatture, spese registrate
e pagamenti FIC. Fatture in Cloud resta la source of truth: i documenti amministrativi sono in sola lettura.
La Panoramica continua a riguardare esclusivamente la preventivazione.

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
riuscita sostituisce interamente i dati, senza mescolarli. Cash non calcola saldi bancari e non gestisce contabilità.

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
