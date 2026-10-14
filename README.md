<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="src/renderer/assets/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="src/renderer/assets/logo-light.svg">
    <img src="src/renderer/assets/logo-light.svg" alt="Logo Cash" width="88">
  </picture>
</p>

<h1 align="center">Cash</h1>

<p align="center">
  <strong>Quanto vale davvero il tuo lavoro?</strong><br>
  Preventivazione e controllo economico per un libero professionista, in un'app desktop Windows.
</p>

<p align="center">
  <a href="https://github.com/Capobuf/Cash/releases">Scarica per Windows</a> ·
  <a href="docs/installazione.md">Installazione</a> ·
  <a href="docs/configurazione-iniziale.md">Configurazione</a> ·
  <a href="docs/utilizzo.md">Guida all'utilizzo</a>
</p>

![Panoramica di Cash con valore orario obiettivo, KPI e preventivi recenti](docs/images/screenshots/dashboard.webp)

> Le schermate mostrano esclusivamente dati dimostrativi.

## Perché esiste

Cash nasce da un'esigenza personale: **fare preventivi più precisi senza affidarmi soltanto all'esperienza e a una stima mentale**.

Quando lavori in proprio, sbagliare una valutazione può significare chiedere troppo al cliente oppure accettare un lavoro che non ripaga il tempo e le risorse necessarie. E un'attività che, a sensazione, vale 400 € potrebbe nascondere 300 € di costi: in quel caso serve capire *perché*.

Ho iniziato a sviluppare Cash per mettere in chiaro tempi, spese e trasferte prima di formulare un'offerta. Poi mi sono accorto che per stabilire quanto chiedere dovevo capire anche **quanto costa mantenere l'attività**, quali obiettivi economici voglio raggiungere e quante ore posso realmente dedicare ai clienti.

Cash è quindi uno **strumento di calcolo e analisi interno**. Propone riferimenti economici e rende leggibili i numeri; **il prezzo finale resta una scelta del professionista**.

## Cosa fa

- **Preventivi:** componi un lavoro con attività, spese e trasferte; confronta il valore teorico con il prezzo che decidi di proporre.
- **Tempi e spostamenti:** considera sedi, veicoli, consumi, costi e durata dei viaggi. Con OpenRouteService puoi calcolare i percorsi; distanza e tempo possono anche essere inseriti manualmente.
- **Obiettivi e sostenibilità:** definisci profili annuali con fatturato obiettivo, capacità lavorativa, costi e parametri fiscali per ricavare un valore orario di riferimento.
- **Spese bancarie:** importa le uscite da file XLSX e CSV, organizza categorie e sottocategorie, crea regole di classificazione basate sulle descrizioni ed escludi movimenti dai conteggi quando necessario.
- **Analisi finanziaria:** consulta fatturato, incassi, importi da incassare, spese e flussi. Con Fatture in Cloud configurato puoi aggiornare i dati amministrativi e consultarne l'ultima copia locale anche offline.
- **Archivio e backup:** i dati di Cash restano in un archivio SQLite locale; sono disponibili copie di sicurezza verificate, backup programmati e gestione delle copie precedenti.

### Dentro un preventivo

![Dettaglio di un preventivo con attività, prezzi scelti, valori teorici e analisi economica](docs/images/screenshots/quote-detail.webp)

Ogni preventivo può contenere più sezioni. Per ciascuna puoi inserire le attività svolte, i costi sostenuti e le trasferte, mantenendo distinto il **valore teorico** dal **prezzo scelto**. Il riepilogo mostra anche tempo, spese e resa oraria prevista.

### Capire dove vanno i soldi

![Riepilogo delle spese con indicatori e flusso tra categorie e sottocategorie](docs/images/screenshots/bank-summary.webp)

L'importazione dei movimenti riduce il lavoro manuale dopo la configurazione iniziale delle categorie. Il riepilogo permette di vedere come si distribuiscono le uscite, comprese quelle personali quando sono rilevanti per la propria sostenibilità economica.

## Come si utilizza

1. **Crea un archivio locale** e imposta un profilo annuale con obiettivi, disponibilità e fiscalità.
2. **Inserisci i costi ricorrenti, i veicoli e le sedi** necessari alle valutazioni.
3. **Componi un preventivo** con attività, spese e trasferte; valuta i numeri e scegli il prezzo.
4. **Importa e categorizza le spese** per verificare i flussi economici.
5. **Collega, se ti servono, Fatture in Cloud e OpenRouteService** e configura i backup.

Il collegamento a servizi esterni non è necessario per iniziare a costruire preventivi locali; alcune funzioni, come l'elenco clienti Fatture in Cloud e l'aggiornamento degli incassi, lo richiedono.

## Installazione

Cash è sviluppato per **Windows x64**. Non richiede un server web.

Dalla pagina [GitHub Releases](https://github.com/Capobuf/Cash/releases) puoi scegliere tra l'installer `Cash-Setup-<versione>.exe` e la versione portabile `Cash.exe`.

Per avviare il progetto dai sorgenti, compilarlo e verificare i prerequisiti, consulta la [guida all'installazione](docs/installazione.md).

## Documentazione

| Guida | Contenuto |
| --- | --- |
| [Installazione](docs/installazione.md) | Installer, versione portabile, avvio dai sorgenti e archivio locale |
| [Configurazione iniziale](docs/configurazione-iniziale.md) | Profili, costi, sedi, veicoli, integrazioni e backup |
| [Utilizzo](docs/utilizzo.md) | Preventivi, catalogo, clienti, analisi finanziaria, movimenti e categorie |

Le guide includono altri [screenshot reali dell'applicazione](docs/images/screenshots/), tutti acquisiti con dati dimostrativi e tema scuro.

## Note sul progetto

- **Progetto personale e pubblico:** Cash nasce dalle mie necessità lavorative; condivido il codice per ricevere idee, segnalazioni e contributi tramite [Issues](https://github.com/Capobuf/Cash/issues) e pull request.
- **Dati locali:** conserva l'archivio SQLite attivo su un disco locale, non direttamente in cartelle sincronizzate da Google Drive, OneDrive o su condivisioni di rete. Per la sincronizzazione cloud utilizza eventualmente **le copie di backup chiuse**, scegliendo una cartella gestita dal relativo client.
- **Stime, non consulenza fiscale:** le proiezioni economiche e fiscali sono strumenti di pianificazione. Verifica i parametri con il tuo consulente e usa Fatture in Cloud come riferimento per i documenti amministrativi.
