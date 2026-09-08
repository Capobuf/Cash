# Cash

Cash è un client desktop Windows monoutente per costruire preventivi a partire da obiettivi economici,
tempo, spese e trasferte. Il prezzo finale resta sempre una scelta dell’utente. L’app non è un software
fiscale o contabile e non sostituisce il commercialista.

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

Gli archivi schema 1 richiedono anteprima e conferma prima della migrazione allo schema 2. La migrazione
crea prima il backup, imposta Fatture in Cloud su `Disattivata`, conserva gli eventuali riferimenti non
segreti e non converte gli snapshot remoti in Clienti locali. Uno schema più nuovo viene aperto soltanto
in lettura.

## Uso offline e fonti live

Senza rete restano disponibili profili, Clienti locali, Sedi, catalogo, template, preventivi, snapshot
e calcoli storici. Falliscono soltanto le azioni che chiedono un dato corrente:

- prezzo regionale carburante MIMIT;
- indice mensile FOI ISTAT senza tabacchi;
- ricerca, verifica prodotto ed esportazione Fatture in Cloud quando il modulo è attivo.

Cash non usa cache o sorgenti alternative come valori correnti. Un errore della fonte è mostrato e non
modifica parzialmente il preventivo.

## Fatture in Cloud opzionale

Il modulo parte disattivato. In questo stato non effettua chiamate a Fatture in Cloud e l’intero ciclo
locale funziona senza token, azienda o prodotto. Per produrre una build attivabile, incorporare il Client
ID dell’app privata al build:

```powershell
$env:CASH_FIC_CLIENT_ID = 'CLIENT_ID_DELL_APP_PRIVATA'
npm run package:win
```

La procedura guidata richiede un token manuale con i soli permessi `entity.clients:r`, `products:r` e
`issued_documents.quotes:a`, fa scegliere azienda e prodotto con nome esatto `Consulenza`, verifica i
permessi e salva il token nel Gestore credenziali di Windows. Ogni postazione deve essere configurata
separatamente. Disattivare il modulo conserva configurazione e token; `Rimuovi collegamento` elimina il
token locale e i riferimenti condivisi, senza modificare snapshot o esportazioni storiche.

Per un preventivo con Cliente locale, l’esportazione richiede sempre la selezione live esplicita di un
cliente remoto della stessa azienda. Non vengono effettuati abbinamenti o fusioni automatiche.

## Pacchetto Windows

```powershell
npm run package:win
```

L’installer NSIS risultante include Electron e non richiede Node.js, database, container o server sulla
macchina dell’utente. Il prodotto è destinato a Windows 10/11 x64 e a uso sequenziale monoutente.
