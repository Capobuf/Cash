**CASH**

# SPECIFICA FUNZIONALE

*Specifica canonica consolidata - v0.3*

*7 settembre 2026*

| **Voce** | **Valore** |
| --- | --- |
| Progetto | Cash |
| Scopo | Supporto interno alla preventivazione per un libero professionista |
| Stato | Specifica consolidata con decisioni aperte esplicitamente elencate |
| Perimetro | Comportamento funzionale; stack, architettura e dettagli implementativi non sono definiti qui. |

Cash deve permettere di costruire preventivi partendo da obiettivi economici, disponibilità lavorativa, tempi, trasferte e spese previste, mantenendo la decisione commerciale finale in capo all'utente.

**Obiettivo:** quotare i lavori su una base verificabile senza trasformare Cash in un ERP, in un gestionale di commesse o in un sistema di contabilità.

<br>

## Indice

- 1. Visione e obiettivi

- 2. Principi e invarianti globali

- 3. Perimetro funzionale

- 4. Modello economico

- 5. Fiscalità

- 6. Costi aziendali

- 7. Disponibilità lavorativa e valore medio da generare

- 8. Inflazione e prezzi di riferimento

- 9. Veicoli e trasferte

- 10. Clienti, sedi e Fatture in Cloud

- 11. Catalogo e template

- 12. Preventivi, voci e sottovoci

- 13. Varianti

- 14. Motore di calcolo della singola voce

- 15. Analisi complessiva del preventivo

- 16. Confronto bottom-up / top-down

- 17. Prezzo scelto e calcolo inverso

- 18. Provvigioni

- 19. Snapshot e aggiornamento con valori correnti

- 20. Esportazione verso Fatture in Cloud

- 21. Flussi utente principali

- 22. Modello dati concettuale

- 23. Regole, validazioni ed errori

- 24. Fuori scope

- 25. Decisioni aperte

- 26. Criteri di accettazione dell'MVP

- Appendice A - Esempio di preventivo

- Appendice B - Flusso di calcolo

<br>

## 1. Visione e obiettivi

Cash è uno strumento interno di supporto alla preventivazione per un libero professionista. Non è un ERP e non deve evolvere implicitamente verso contabilità, project management, field service management o gestione completa del ciclo commerciale.

La funzione principale è rendere esplicito da quali elementi deriva una quotazione e consentire all'utente di confrontare il risultato del calcolo con il prezzo che ritiene commercialmente corretto.

Una voce apparentemente semplice, come “Configurazione server”, può includere gestione del cliente, rapporto con il fornitore, ritiro del server, preparazione, configurazione tecnica, inventariazione, etichettatura, trasferte, installazione e costi esterni. Cash deve permettere di rappresentare questi elementi internamente senza obbligare a mostrarli al cliente.

Cash deve aiutare a rispondere almeno a queste domande:

**1.** Quanto tempo e quali spese richiede realmente il lavoro che sto preventivando?

**2.** Quale valore dovrebbe generare il lavoro per essere coerente con il mio obiettivo annuale?

**3.** Se applico il prezzo che considero commercialmente corretto, quale resa prevista ottengo?

**4.** Se il calcolo interno produce un valore molto diverso dal prezzo abituale, quali componenti causano la differenza?

**5.** Come rende il preventivo nel suo complesso, oltre alla singola voce?

## 2. Principi e invarianti globali

- Semplicità prima di completezza: introdurre solo concetti necessari alla preventivazione.

- Trasparenza del calcolo: ogni risultato economico deve essere riconducibile a input espliciti.

- Separazione fra analisi interna e documento commerciale: le sottovoci sono interne salvo decisione esplicita dell'utente.

- Template come acceleratori: precompilano, non vincolano e non creano collegamenti vivi.

- Nessun automatismo commerciale rigido: il prezzo finale resta una scelta dell'utente.

- Nessuna consuntivazione: Cash non richiede di registrare a posteriori tempo, trasferte o costi effettivi.

- Nessuna vendita o rivendita di hardware/software: il software quota prestazioni professionali e spese sostenute per erogarle.

**INV-001 -** Il prezzo calcolato non è un prezzo obbligatorio. Il prezzo finale è sempre deciso dall'utente.

**INV-002 -** Cash non deve utilizzare fallback automatici. Se un dato o una sorgente necessari non sono disponibili, deve mostrare un errore e non sostituire il dato con valori presunti, precedenti o alternativi non richiesti.

**INV-003 -** Un preventivo conserva gli input con cui è stato costruito. Le modifiche ai dati generali non modificano automaticamente i preventivi esistenti.

**INV-004 -** Ogni copia derivata da un template è indipendente dalla propria origine. Nessuna modifica si propaga automaticamente ai contenuti già copiati.

**INV-005 -** Ogni sottovoce del preventivo appartiene a una e una sola voce principale. Non esistono tempi, spese o trasferte direttamente a livello di preventivo.

**INV-006 -** Provvigioni e altri importi accessori esterni alla quotazione non modificano costi, spese, prezzi o indicatori di resa del preventivo.

**INV-007 -** Il Tempo stimato di una voce principale è sempre calcolato dalle sue sottovoci e non può essere impostato direttamente.

**INV-008 -** Ogni voce principale deve contenere almeno una sottovoce che produca tempo e il suo Tempo stimato complessivo deve essere maggiore di zero.

**INV-009 -** L'aggiornamento di un preventivo con i valori correnti è atomico: o tutti i valori richiesti vengono aggiornati correttamente, oppure il preventivo rimane invariato.

## 3. Perimetro funzionale

| **Area** | **Funzione prevista** |
| --- | --- |
| Obiettivo economico | Fatturato obiettivo annuo e visualizzazione immediata del netto fiscale stimato e del disponibile stimato. |
| Fiscalità | Stima mirata al profilo fiscale previsto, con parametri modificabili; nessun motore fiscale universale. |
| Costi aziendali | Elenco minimale di costi medi mensili. |
| Disponibilità lavorativa | Calcolo di giorni e ore disponibili e del valore medio da generare. |
| Inflazione | Rivalutazione informativa di un prezzo storico/riferimento in fase di preventivazione. |
| Veicoli | Calcolo del costo chilometrico con consumo, carburante e costi annuali essenziali. |
| Sedi | Luoghi riutilizzabili gestiti localmente in Cash, opzionalmente associati a un cliente, con distanza in km dalla sede/laboratorio di riferimento. |
| Trasferte | Sede selezionata, distanza derivata dai km della Sede, A/R, veicolo, occorrenze e tempo automatico o manuale. |
| Clienti | Ricerca e selezione da Fatture in Cloud; snapshot dei dati essenziali nel preventivo. |
| Catalogo | Sottovoci riutilizzabili e template composti da una o più voci principali. |
| Preventivi | Composizione manuale o da template, personalizzazione completa e analisi economica per voce e complessiva. Nessuno stato o workflow commerciale. |
| Provvigioni | Tracciamento di un eventuale importo accessorio fuori dal corpo e dai calcoli del preventivo. |
| Fatture in Cloud | Esportazione/raggruppamento delle voci usando il prodotto “Consulenza”. |
| Utente | Uso monoutente. Autenticazione, ruoli e permessi non sono requisiti funzionali dell'MVP. |

## 4. Modello economico

### 4.1 Fatturato obiettivo

L'utente inserisce un unico obiettivo economico principale: il fatturato annuo che vuole raggiungere. Non viene richiesto un obiettivo separato di reddito personale o costo della vita.

Durante l'inserimento o la modifica del fatturato obiettivo, Cash aggiorna immediatamente la proiezione economica.

| **Indicatore** | **Descrizione** |
| --- | --- |
| Fatturato obiettivo | Importo annuo dichiarato dall'utente. |
| Contributi stimati | Stima calcolata secondo il profilo fiscale configurato. |
| Imposta stimata | Stima dell'imposta sostitutiva secondo il profilo fiscale. |
| Netto fiscale stimato | Fatturato meno contributi e imposta stimata. |
| Costi aziendali annui | Somma dei costi mensili inseriti × 12. |
| Disponibile stimato | Netto fiscale stimato meno costi aziendali annui. |

> **Netto fiscale stimato:** Fatturato - Contributi stimati - Imposta stimata

> **Disponibile stimato:** Netto fiscale stimato - Costi aziendali annui

> *È un indicatore interno; non rappresenta una dichiarazione fiscale o contabile.*

### 4.2 Nessun costo della vita

Il costo della vita personale è fuori scope. L'inflazione viene utilizzata solo come riferimento durante la preventivazione e non per proiettare spese personali o utile futuro.

## 5. Fiscalità

La prima versione è costruita intorno a un caso fiscale specifico: professionista informatico in regime forfettario oltre i primi cinque anni di attività. Non è richiesto un motore fiscale generico.

Il profilo fiscale contiene parametri modificabili, così che aliquote e coefficienti possano essere aggiornati senza modificare il motore di calcolo.

| **Parametro** | **Uso** |
| --- | --- |
| Coefficiente di redditività | Determina il reddito forfettario a partire dal fatturato. |
| Aliquota contributiva | Usata per stimare i contributi previdenziali secondo le regole applicabili. |
| Aliquota imposta sostitutiva | Usata per la stima dell'imposta. |

> **Reddito forfettario:** Fatturato × Coefficiente di redditività

> **Contributi stimati:** Funzione del reddito forfettario e dell'aliquota contributiva configurata

> **Base imposta:** Reddito forfettario - Contributi deducibili

> **Imposta stimata:** Base imposta × Aliquota imposta sostitutiva

La funzione è una stima per supportare la preventivazione. Cash non deve presentarsi come software fiscale, contabile o sostitutivo del commercialista.

## 6. Costi aziendali

La gestione dei costi aziendali è intenzionalmente minimale. L'utente normalizza personalmente ogni costo a un valore medio mensile.

| **Campo** | **Obbligatorietà** | **Esempio** |
| --- | --- | --- |
| Categoria | Obbligatorio | Software |
| Descrizione | Obbligatorio | Microsoft 365 |
| Importo mensile | Obbligatorio | € 50,00 |

Non sono previsti periodicità, date di aggiornamento, classificazione fisso/variabile, ammortamenti o importazione delle spese da Fatture in Cloud.

> **Costi aziendali annui:** Somma(importi mensili) × 12

## 7. Disponibilità lavorativa e valore medio da generare

### 7.1 Disponibilità lavorativa

Cash stima quanta parte dell'anno può essere realmente utilizzata per lavori dei clienti. I giorni teoricamente lavorativi vengono derivati dal calendario e ridotti tramite parametri semplici e modificabili.

| **Parametro** | **Comportamento previsto** |
| --- | --- |
| Giorni lavorativi teorici | Derivati dal calendario, escludendo weekend e festività applicabili. |
| Ore lavorative al giorno | Valore impostato dall'utente. |
| Ferie | Valore regolabile dall'utente. |
| Malattia / imprevisti | Valore regolabile dall'utente. |
| Tempo dedicabile ai lavori | Percentuale delle ore residue realmente dedicabile ai lavori dei clienti. |

> **Giorni disponibili:** Giorni lavorativi teorici - Ferie - Malattia/imprevisti

> **Ore lavorative disponibili:** Giorni disponibili × Ore lavorative al giorno

> **Ore disponibili per lavori:** Ore lavorative disponibili × % Tempo dedicabile ai lavori

### 7.2 Valore medio da generare

> **Valore medio da generare:** Fatturato obiettivo / Ore disponibili per lavori

Il valore medio da generare non è una tariffa oraria obbligatoria. Indica quanto fatturato dovrebbe essere generato mediamente per ogni ora della capacità dedicata ai clienti affinché l'obiettivo annuale sia raggiungibile.

## 8. Inflazione e prezzi di riferimento

L'inflazione viene utilizzata esclusivamente durante la preventivazione per aggiornare un prezzo storico o di riferimento al valore equivalente corrente. Non modifica automaticamente il prezzo finale.

Una voce può avere opzionalmente un prezzo di riferimento e la data/anno a cui il prezzo si riferisce. Cash può mostrare il prezzo originario e il suo equivalente aggiornato per inflazione.

| **Dato** | **Comportamento** |
| --- | --- |
| Prezzo di riferimento | Valore storico o di riferimento associato alla voce. |
| Data/anno del riferimento | Periodo a cui si riferisce il prezzo. |
| Prezzo rivalutato | Valore informativo calcolato con l'indice configurato. |
| Prezzo scelto | Definito liberamente dall'utente; non viene modificato dall'inflazione. |

Se i dati necessari per la rivalutazione non sono disponibili, Cash deve mostrare un errore. Non deve usare valori precedenti o indici alternativi come fallback.

## 9. Veicoli e trasferte

### 9.1 Veicoli

| **Campo** | **Descrizione** |
| --- | --- |
| Nome | Identificativo del veicolo. |
| Carburante | Tipologia di alimentazione rilevante ai fini del costo. |
| Consumo | Consumo medio del veicolo. |
| Km annui medi | Percorrenza media annuale dichiarata dall'utente. |
| Assicurazione annua | Costo annuale. |
| Bollo annuo | Costo annuale. |
| Manutenzione annua media | Media complessiva di manutenzione ordinaria e altre spese ricorrenti. |

La manutenzione media può includere pneumatici, tagliandi, riparazioni e altri costi ordinari. Ammortamento e svalutazione sono esclusi.

> **Costo carburante/km:** Consumo × Prezzo carburante corrente, normalizzato per km

> **Quota costi annuali/km:** (Assicurazione + Bollo + Manutenzione) / Km annui medi

> **Costo veicolo/km:** Costo carburante/km + Quota costi annuali/km

Il prezzo del carburante è un dato dinamico da una fonte esterna da definire. Se non è disponibile, il calcolo che lo richiede deve produrre un errore; non sono ammessi fallback automatici.

### 9.2 Trasferte come sottovoci

Una trasferta appartiene sempre a una voce principale del preventivo. Non esistono trasferte direttamente a livello di preventivo.

La Trasferta non modella una partenza e una destinazione separate. Fa riferimento a una sola Sede salvata in Cash. La distanza della singola tratta deriva dai km configurati sulla Sede, che rappresentano la distanza di sola andata dalla sede/laboratorio di riferimento dell'utente.

| **Campo** | **Comportamento** |
| --- | --- |
| Sede | Luogo salvato in Cash usato dalla trasferta. Se il preventivo ha una Sede, questa viene proposta come valore predefinito; l'utente può cambiarla per la singola trasferta. |
| Andata/ritorno | Se attivo, la distanza di sola andata configurata sulla Sede viene raddoppiata. |
| Veicolo | Veicolo usato per il costo chilometrico. |
| Occorrenze previste | Numero di volte in cui si prevede di effettuare quella trasferta; default 1. |
| Tempo di viaggio | Calcolato dalla distanza della Sede e dalla velocità media configurata oppure sovrascritto manualmente. |

La Trasferta non contiene campi Partenza, Destinazione o Distanza manuale. Se la Sede non dispone della distanza necessaria, il calcolo non può procedere e Cash deve mostrare un errore.

Cash non usa servizi di routing, mappe, traffico o geolocalizzazione per calcolare distanza o tempo di viaggio.

### 9.3 Calcolo automatico del tempo di viaggio

L'utente configura una velocità media di trasferta in km/h. Cash non assume una velocità predefinita se l'utente non l'ha configurata.

> **Distanza singola tratta:** Distanza in km configurata sulla Sede

> **Distanza effettiva:** Distanza della Sede × (2 se A/R, altrimenti 1) × Occorrenze previste

> **Tempo automatico complessivo:** Distanza effettiva / Velocità media di trasferta

> **Costo trasferta complessivo:** Distanza effettiva × Costo veicolo/km

L'utente può sostituire il tempo calcolato di una singola occorrenza con un valore manuale. Il valore manuale rappresenta il tempo complessivo di una singola occorrenza della trasferta così configurata, incluso l'eventuale A/R. Il numero di occorrenze moltiplica poi il tempo manuale. L'override è una scelta esplicita dell'utente e non un fallback.

> **Tempo manuale complessivo:** Tempo manuale di una singola occorrenza × Occorrenze previste

Se la velocità media non è configurata, Cash non deve inventare un valore: il calcolo automatico del tempo non è disponibile. L'utente può configurare la velocità o inserire esplicitamente il tempo manuale.

### 9.4 Più trasferte e trasferte condivise

Una voce può contenere più trasferte distinte, per esempio una trasferta verso un fornitore e una verso la sede del cliente. Il numero di occorrenze previste serve a rappresentare una stima prudenziale quando non è certo quante volte sarà necessario effettuare lo stesso percorso.

Se una stessa trasferta permette di svolgere attività appartenenti a più voci, viene conteggiata una sola volta e associata alla voce che l'utente considera principalmente responsabile della trasferta. Cash non la divide automaticamente tra le voci.

Cash non crea giornate di lavoro, visite pianificate, probabilità, range di trasferte o consuntivi.

## 10. Clienti, sedi e Fatture in Cloud

### 10.1 Clienti

Fatture in Cloud è la fonte prevista per l'anagrafica cliente. Cash permette di cercare e selezionare un cliente senza replicare un CRM completo.

Nel preventivo sono confermati come dati cliente almeno:

- Ragione sociale.

- Partita IVA.

Quando viene creato il preventivo, questi dati vengono copiati nel preventivo. Modifiche successive in Fatture in Cloud non modificano i preventivi già esistenti.

Se Fatture in Cloud non è disponibile durante un'operazione che richiede dati live, Cash deve mostrare un errore. Non deve sostituire silenziosamente la risposta con una lista cache considerata corrente. I dati già salvati dentro un preventivo restano invece validi perché sono lo snapshot canonico di quel preventivo.

### 10.2 Sedi

Le Sedi sono gestite esclusivamente in Cash e non fanno parte dell'integrazione con Fatture in Cloud. Una Sede è un luogo riutilizzabile: può rappresentare una sede cliente, un fornitore, il laboratorio, un magazzino o qualunque altro luogo utile. Non viene introdotta un'entità separata “Fornitore”.

| **Campo sede** | **Descrizione** |
| --- | --- |
| Nome | Etichetta leggibile della Sede. |
| Indirizzo | Indirizzo del luogo. |
| Cliente associato | Opzionale. Una Sede può essere collegata a un cliente oppure esistere senza cliente. |
| Distanza | Distanza in km dalla sede/laboratorio di riferimento dell'utente, riferita alla sola andata. Necessaria quando la Sede viene usata per un calcolo di Trasferta. |

La sede/laboratorio di riferimento è implicita nel significato della distanza e non viene modellata come partenza della Trasferta.

Quando una Sede viene utilizzata in un preventivo o in una Trasferta, i valori usati vengono salvati nello snapshot. Modifiche successive alla Sede non alterano automaticamente i preventivi esistenti.

### 10.3 Sede del preventivo e Sede della trasferta

Un preventivo può specificare una Sede principale. Questa rappresenta il luogo principale a cui si riferisce il preventivo e viene salvata nello snapshot del preventivo.

Quando viene inserita una Trasferta, se il preventivo ha una Sede questa viene proposta automaticamente come Sede della Trasferta. L'utente può sostituirla con qualsiasi altra Sede salvata in Cash. La modifica vale solo per quella Trasferta e non modifica la Sede principale del preventivo.

Se il preventivo non ha una Sede, Cash non ne assume una: la Sede della Trasferta deve essere scelta esplicitamente.

## 11. Catalogo e template

Il catalogo è il punto unico da cui recuperare contenuti riutilizzabili. Deve contenere sia sottovoci singole slegate da una voce principale, sia template composti da una o più voci principali con le relative sottovoci e varianti.

### 11.1 Sottovoci riutilizzabili

L'utente può creare una sottovoce nel catalogo con i valori predefiniti pertinenti al tipo.

| **Esempio** | **Tipo** | **Valore predefinito** |
| --- | --- | --- |
| Gestione cliente | Tempo | 30 min |
| Parcheggio | Spesa | € 5,00 |
| Inventariazione | Tempo | 15 min |

Quando una sottovoce viene usata in una voce del preventivo o dentro un template, ne viene creata una copia indipendente e liberamente modificabile.

### 11.2 Template

Un template può contenere una o più voci principali. Un template con una sola voce copre il caso tipico “Configurazione server”; un template con più voci consente di riutilizzare un gruppo di lavori ricorrente.

Ogni voce contenuta nel template può avere:

- Nome della voce.

- Eventuale prezzo di riferimento.

- Data/anno del prezzo di riferimento, se presente.

- Sottovoci predefinite.

- Eventuali gruppi di varianti.

Non è richiesta una descrizione commerciale predefinita dell'attività nel catalogo.

### 11.3 Costruzione del preventivo dal catalogo

Durante la creazione del preventivo l'utente può:

- Inserire un intero template dal catalogo, ottenendo una o più voci già precompilate con sottovoci e varianti.

- Creare manualmente una voce principale e aggiungere poi sottovoci dal catalogo.

- Creare sottovoci manualmente senza usare il catalogo.

Il catalogo accelera il lavoro ma non è obbligatorio.

### 11.4 Salvataggio dal preventivo al catalogo

L'utente può salvare nel catalogo contenuto già costruito nel preventivo:

- Una singola sottovoce, che diventa una sottovoce riutilizzabile.

- Una o più voci del preventivo, che diventano un nuovo template riutilizzabile.

Il contenuto salvato nel catalogo diventa un nuovo punto di partenza per preventivi futuri; non crea collegamenti retroattivi con il preventivo da cui è stato ricavato.

### 11.5 Copie indipendenti e nessuna propagazione

I template servono esclusivamente alla precompilazione. La catena logica è: sottovoce di catalogo → copia nel template → copia nel preventivo. Ogni copia è indipendente.

Esempio: se “Gestione cliente” nel catalogo passa da 30 a 40 minuti, un template che l'aveva copiata a 45 minuti resta a 45 minuti e i preventivi già creati restano invariati.

## 12. Preventivi, voci e sottovoci

### 12.1 Struttura generale

Un preventivo contiene una o più voci principali. Ogni voce principale contiene le sottovoci interne necessarie a descrivere il lavoro e a calcolarne tempo e spese.

Le voci principali costituiscono il livello commerciale. Le sottovoci sono interne al calcolo e non vengono esposte automaticamente al cliente.

Il Tempo stimato della voce principale non è un input manuale: è sempre derivato dalle sottovoci. Ogni voce principale deve contenere almeno una sottovoce che produca tempo e deve avere un Tempo stimato complessivo maggiore di zero.

### 12.2 Tipi di sottovoce

| **Tipo** | **Campi minimi** | **Effetto sul calcolo** |
| --- | --- | --- |
| Tempo | Descrizione, durata | Aumenta il tempo stimato della voce. |
| Spesa | Descrizione, importo | Aumenta le spese previste della voce. |
| Trasferta | Sede, A/R, veicolo, occorrenze, tempo automatico o manuale | Aumenta sia il tempo stimato sia le spese previste. La distanza deriva dalla Sede. |

### 12.3 Significato della durata

La durata di una sottovoce Tempo è il tempo complessivo che l'utente attribuisce a quell'attività. Include eventuali attese, elaborazioni automatiche o tempi tecnici intermedi se l'utente li considera parte dell'attività.

Cash non distingue tempo attivo, passivo o di attesa e non modella attività in parallelo. Se “Configurazione server” vale 1 ora e “Configurazione firewall” vale 30 minuti, il tempo stimato è 1 ora e 30 minuti anche se una parte delle due attività può essere svolta contemporaneamente.

Il tempo stimato rappresenta quindi la somma del tempo attribuito alle attività, non il tempo cronologico minimo necessario per completare il lavoro.

### 12.4 Significato della spesa

Una Spesa è un costo che l'utente prevede di sostenere direttamente per poter svolgere quella specifica voce del preventivo.

Esempi: parcheggio, corriere, etichette o piccolo materiale di consumo, intervento di un collaboratore o tecnico esterno.

Non sono Spese del preventivo hardware o software acquistati direttamente dal cliente o venduti da un fornitore al cliente. Cash non gestisce rivendita di hardware/software.

Una provvigione riconosciuta da terzi non è una Spesa e non è una sottovoce.

## 13. Varianti

Le varianti servono a precompilare una voce in modo diverso in base a caratteristiche ricorrenti, senza creare decine di template quasi uguali e senza introdurre un rule engine generico.

### 13.1 Gruppi e opzioni

L'utente può creare liberamente zero o più gruppi di varianti per ciascuna voce di template. Ogni gruppo ha un nome e un insieme di opzioni definite dall'utente. Più gruppi possono essere selezionati contemporaneamente e i loro contributi si sommano.

| **Gruppo** | **Opzione** | **Sottovoci prodotte - esempio** |
| --- | --- | --- |
| Aggiornamento firmware | Non necessario | Nessuna |
| Aggiornamento firmware | Necessario | Aggiornamento firmware - Tempo - 30 min |
| Configurazione RAID | Nessuna | Nessuna |
| Configurazione RAID | Semplice | Configurazione RAID - Tempo - 10 min |
| Configurazione RAID | Media | Configurazione RAID - Tempo - 30 min |
| Configurazione RAID | Complessa | Configurazione RAID - Tempo - 60 min |

I nomi dei gruppi, delle opzioni e delle sottovoci sono definiti dall'utente; Cash non impone categorie predefinite.

### 13.2 Opzione predefinita

Ogni gruppo può avere zero o una opzione predefinita. Quando l'utente aggiunge la prima opzione a un gruppo, questa viene inizialmente impostata come predefinita. L'utente può successivamente cambiare il default o rimuoverlo del tutto.

Se un gruppo non ha un default, Cash deve chiedere all'utente quale opzione usare durante l'aggiunta della voce al preventivo.

### 13.3 Effetti delle varianti

Ogni opzione definisce zero o più sottovoci da applicare alla voce. Le sottovoci possono essere di tipo Tempo, Spesa o Trasferta, secondo quanto configurato nel template.

Un gruppo di varianti gestisce esclusivamente le sottovoci generate dalle proprie opzioni. Non può modificare o rimuovere sottovoci normali della voce e non può modificare le sottovoci generate da altri gruppi.

Quando l'utente cambia opzione, Cash rimuove le sottovoci prodotte dalla precedente opzione di quel gruppo e inserisce quelle della nuova opzione. Le sottovoci normali e quelle degli altri gruppi restano inalterate.

Questo modello non richiede priorità tra gruppi: gruppi diversi non competono sulla stessa sottovoce e i rispettivi contributi si sommano.

Attività concettualmente autonome, come configurazione backup o monitoring, rimangono voci principali separate e non diventano semplici varianti della configurazione server.

### 13.4 Modifica delle varianti nel preventivo

Dopo aver inserito una voce nel preventivo, l'utente può cambiare le varianti selezionate.

Se il cambio di variante sostituisce o rimuove una sottovoce generata da quel gruppo che l'utente aveva modificato manualmente, Cash deve avvisare l'utente prima di applicare il cambiamento. Se l'utente conferma, prevale il nuovo risultato della variante.

Sottovoci aggiunte o modificate manualmente ma non appartenenti al gruppo interessato restano inalterate. Non è richiesto un sistema generale di priorità o un motore di regole.

## 14. Motore di calcolo della singola voce

> **Tempo stimato:** Somma delle durate delle sottovoci Tempo + tempi complessivi delle Trasferte

> **Spese previste:** Somma delle sottovoci Spesa + costi complessivi delle Trasferte

> **Valore del tempo:** Tempo stimato × Valore medio da generare

> **Valore teorico:** Valore del tempo + Spese previste

Il Tempo stimato è sempre un risultato derivato e non può essere sovrascritto direttamente sulla voce principale. Una voce è valida solo se il Tempo stimato risultante è maggiore di zero.

Il valore teorico è il risultato bottom-up della stima. Non deve essere presentato come “prezzo corretto” o “prezzo obbligatorio”.

La UI della voce deve rendere comprensibili almeno tempo complessivo, spese complessive, sottovoci che assorbono più tempo, trasferte con tempi/costi e valore medio da generare usato nel calcolo.

## 15. Analisi complessiva del preventivo

Cash deve analizzare sia le singole voci sia il preventivo nel suo complesso. L'analisi complessiva è un'aggregazione dei dati delle voci e non introduce elementi economici a livello preventivo.

> **Tempo totale stimato:** Somma dei tempi stimati delle voci

> **Spese totali previste:** Somma delle spese previste delle voci

> **Valore teorico totale:** Somma dei valori teorici delle voci

> **Prezzo totale scelto:** Somma dei prezzi scelti delle voci

> **Resa complessiva prevista:** (Prezzo totale scelto - Spese totali previste) / Tempo totale stimato

> **Scostamento complessivo:** (Resa complessiva prevista / Valore medio da generare) - 1

> **Tempo massimo complessivo coerente:** (Prezzo totale scelto - Spese totali previste) / Valore medio da generare

Il raggruppamento delle righe in esportazione verso Fatture in Cloud non modifica questa analisi interna.

## 16. Confronto bottom-up / top-down

Cash mette a confronto due prospettive complementari.

### 16.1 Bottom-up

Parte da ciò che il lavoro richiede: tempo, trasferte, spese e valore medio da generare. Produce il valore teorico.

### 16.2 Top-down

Parte da riferimenti commerciali: eventuale prezzo storico, rivalutazione per inflazione e prezzo che l'utente ritiene sostenibile per il cliente.

| **Indicatore** | **Scopo** |
| --- | --- |
| Valore teorico | Mostra il risultato del calcolo basato su impegno e spese. |
| Prezzo di riferimento | Ricorda quanto l'attività è stata storicamente considerata. |
| Prezzo rivalutato | Mostra l'equivalente aggiornato del riferimento. |
| Prezzo scelto | Decisione commerciale finale dell'utente. |

Se una voce storicamente quotata € 400 produce un valore teorico di € 1.000, Cash non conclude che € 1.000 sia il prezzo “giusto”. Deve rendere visibile perché il calcolo è arrivato a quel valore e lasciare la decisione all'utente.

## 17. Prezzo scelto e calcolo inverso

L'utente può impostare liberamente il prezzo finale della voce. Da quel momento Cash calcola la resa economica prevista.

> **Resa prevista:** (Prezzo scelto - Spese previste) / Tempo stimato

> **Scostamento dall'obiettivo:** (Resa prevista / Valore medio da generare) - 1

> **Tempo massimo coerente:** (Prezzo scelto - Spese previste) / Valore medio da generare

Se il prezzo scelto genera una resa inferiore all'obiettivo, Cash evidenzia lo scostamento senza bloccare il preventivo. L'utente può accettare consapevolmente una resa inferiore.

## 18. Provvigioni

Cash deve permettere di tenere traccia di un eventuale importo di provvigione riconosciuto da terzi in relazione al preventivo. La provvigione è esterna alla quotazione e viene mantenuta fuori dal corpo del preventivo.

La provvigione:

- Non è una voce principale.

- Non è una sottovoce.

- Non è una Spesa.

- Non viene sommata al totale del preventivo.

- Non modifica Valore teorico, Resa prevista, Scostamento o Tempo massimo coerente.

- Non viene esportata automaticamente verso Fatture in Cloud.

- Non compare automaticamente nel documento commerciale destinato al cliente.

## 19. Snapshot e aggiornamento con valori correnti

### 19.1 Snapshot del preventivo

Un preventivo conserva gli input con cui è stato costruito. I dati generali o dinamici non devono modificare retroattivamente i risultati di un preventivo già esistente.

Tra i dati che devono restare associati al preventivo rientrano, quando utilizzati:

- Ragione sociale e partita IVA del cliente.

- Nome e indirizzo della Sede principale del preventivo.

- Per le Trasferte: Sede utilizzata, nome/indirizzo e distanza in km usata nel calcolo.

- Valore medio da generare utilizzato.

- Costo veicolo/km utilizzato nelle Trasferte.

- A/R, numero di occorrenze, modalità automatica/manuale e tempi delle Trasferte.

- Valore di inflazione/rivalutazione utilizzato.

- Struttura delle voci, sottovoci, varianti e modifiche manuali.

- Prezzi scelti dall'utente.

Il preventivo deve quindi restare leggibile e riproducibile secondo il contesto in cui è stato costruito.

### 19.2 Aggiorna con valori correnti

Quando l'utente riapre un preventivo, deve poter richiedere esplicitamente un aggiornamento ai valori correnti. Non deve mai avvenire un aggiornamento automatico in apertura.

L'azione aggiorna esclusivamente i valori generali/dinamici pertinenti agli elementi effettivamente presenti nel preventivo e ricalcola gli indicatori derivati. In particolare, quando applicabile, aggiorna:

- Valore medio da generare.

- Costo chilometrico corrente del veicolo usato nelle Trasferte.

- Distanza corrente configurata sulla stessa Sede utilizzata da ciascuna Trasferta.

- Tempo di Trasferta originariamente calcolato in automatico, usando distanza corrente della Sede e velocità media di trasferta corrente.

- Rivalutazione per inflazione.

L'azione non modifica automaticamente cliente, nome/indirizzo della Sede nello snapshot, struttura delle voci/sottovoci, varianti, sottovoci Tempo inserite manualmente, Spese inserite manualmente, A/R, numero di occorrenze, veicolo selezionato o prezzo scelto.

Se una Trasferta usa un override manuale del tempo, l'aggiornamento può aggiornare distanza e costo della Trasferta ma non modifica il tempo manuale.

### 19.3 Atomicità dell'aggiornamento

L'azione “Aggiorna con valori correnti” è atomica. Cash deve verificare prima che tutti i dati necessari all'aggiornamento degli elementi presenti nel preventivo siano disponibili e validi.

Se anche un solo dato necessario manca, una sorgente richiesta non è disponibile o un valore non è valido, l'intera operazione fallisce e nessun valore del preventivo viene modificato. Lo snapshot precedente rimane integralmente valido.

Cash deve indicare chiaramente quale dato o sorgente ha impedito l'aggiornamento. Non sono ammessi aggiornamenti parziali né il riuso silenzioso dei valori precedenti per completare l'operazione.

## 20. Esportazione verso Fatture in Cloud

Fatture in Cloud è un'integrazione di comodità, non il motore economico di Cash. Preventivazione e analisi avvengono interamente in Cash.

### 20.1 Import cliente

Cash recupera l'anagrafica cliente da Fatture in Cloud per consentirne la selezione. Le Sedi non vengono importate da Fatture in Cloud.

### 20.2 Esportazione preventivo

L'utente può esportare o raggruppare una o più voci del preventivo verso Fatture in Cloud. Il prodotto utilizzato sarà sempre “Consulenza”.

| **Dato Cash** | **Mapping verso Fatture in Cloud** |
| --- | --- |
| Cliente | Cliente selezionato da Fatture in Cloud. |
| Una o più voci raggruppate | Una riga commerciale o un gruppo di righe secondo la scelta dell'utente. |
| Prodotto | Sempre “Consulenza”. |
| Prezzo | Prezzo finale scelto per la voce o somma del gruppo esportato. |
| Sottovoci interne | Non esportate automaticamente. |
| Provvigione | Non esportata automaticamente. |

La modalità con cui viene costruita o inserita la descrizione commerciale della riga esportata è ancora da definire.

L'esportazione è un'azione: non assegna uno stato al preventivo, non lo blocca e non ne impedisce modifiche successive.

## 21. Flussi utente principali

### 21.1 Configurazione iniziale

**1.** Inserire il fatturato obiettivo annuo.

**2.** Verificare netto fiscale stimato e disponibile stimato.

**3.** Inserire i costi aziendali medi mensili.

**4.** Configurare ore giornaliere, ferie, malattia/imprevisti e percentuale dedicabile ai lavori.

**5.** Visualizzare ore disponibili e valore medio da generare.

**6.** Configurare eventuali veicoli.

**7.** Configurare la velocità media di trasferta se si vuole il calcolo automatico del tempo di viaggio.

**8.** Creare le Sedi riutilizzabili necessarie e, quando serve, indicarne cliente associato e distanza di sola andata dalla sede/laboratorio di riferimento.

**9.** Collegare Fatture in Cloud per selezione clienti ed esportazione.

### 21.2 Creazione del catalogo

**1.** Creare eventuali sottovoci riutilizzabili con valori predefiniti.

**2.** Creare un template con una o più voci principali.

**3.** Per ciascuna voce, aggiungere sottovoci dal catalogo o crearle direttamente.

**4.** Impostare eventuale prezzo di riferimento e data/anno.

**5.** Creare eventuali gruppi di varianti, opzioni, sottovoci prodotte dalle opzioni ed eventuali default.

### 21.3 Creazione di un preventivo

**1.** Selezionare il cliente da Fatture in Cloud; Cash copia ragione sociale e partita IVA nel preventivo.

**2.** Se necessario, selezionare una Sede principale del preventivo; Cash ne conserva lo snapshot.

**3.** Inserire un template dal catalogo oppure creare manualmente una o più voci.

**4.** Per i gruppi di varianti senza default, scegliere l'opzione richiesta.

**5.** Aggiungere o modificare liberamente sottovoci Tempo, Spesa e Trasferta.

**6.** Per ogni Trasferta, usare la Sede del preventivo proposta da Cash oppure selezionare un'altra Sede; configurare A/R, veicolo, occorrenze ed eventuale override manuale del tempo. La distanza deriva dalla Sede.

**7.** Verificare che ogni voce principale contenga almeno una sottovoce che produca tempo.

**8.** Visualizzare tempo, spese, valore teorico, eventuale prezzo storico e rivalutato.

**9.** Impostare il prezzo finale scelto.

**10.** Visualizzare resa, scostamento e tempo massimo coerente per voce e per preventivo complessivo.

**11.** Registrare, se presente, la provvigione fuori dal corpo del preventivo.

**12.** Eventualmente salvare una sottovoce o una o più voci come nuovo contenuto del catalogo.

**13.** Eventualmente raggruppare/esportare le voci verso Fatture in Cloud.

### 21.4 Riapertura di un preventivo

**1.** Mostrare il preventivo con gli input storici con cui è stato costruito.

**2.** Consentire modifiche manuali alle voci e sottovoci.

**3.** Consentire il cambio di variante, con warning se vengono sostituite o rimosse sottovoci generate dal gruppo e modificate manualmente.

**4.** Consentire l'azione esplicita “Aggiorna con valori correnti”.

**5.** Eseguire l'aggiornamento in modo atomico: se un dato necessario non è disponibile, non modificare nulla.

### 21.5 Assenza di ciclo di vita commerciale

Cash non gestisce stati del preventivo. Non esistono stati come Bozza, Inviato, Accettato, Rifiutato o Scaduto. Un preventivo salvato resta modificabile.

Cash non gestisce workflow di approvazione, accettazione, scadenza o validità commerciale e non assegna una propria numerazione commerciale ai preventivi. L'esportazione verso Fatture in Cloud non modifica questo comportamento.

## 22. Modello dati concettuale

Il modello seguente descrive concetti funzionali e relazioni, senza imporre tabelle, classi o architettura.

| **Concetto** | **Contenuto / relazione principale** |
| --- | --- |
| Profilo economico | Fatturato obiettivo, parametri fiscali, parametri di disponibilità lavorativa, velocità media di trasferta. |
| Costo aziendale | Categoria, descrizione, importo mensile. |
| Veicolo | Consumo, km annui medi, assicurazione, bollo, manutenzione e costo chilometrico derivato. |
| Cliente | Riferimento alla fonte Fatture in Cloud; nel preventivo vengono copiati ragione sociale e partita IVA. |
| Sede | Luogo locale riutilizzabile con nome, indirizzo, cliente opzionale e distanza di sola andata dalla sede/laboratorio di riferimento. |
| Catalogo | Contiene sottovoci riutilizzabili e template. |
| Sottovoce catalogo | Tipo Tempo / Spesa / Trasferta con valori predefiniti pertinenti. |
| Template | Contiene una o più voci principali riutilizzabili. |
| Voce template | Nome, eventuale prezzo di riferimento/data, sottovoci e gruppi di varianti. |
| Gruppo variante | Nome, opzioni, zero/una opzione predefinita; ogni opzione produce zero o più sottovoci gestite esclusivamente dal proprio gruppo. |
| Preventivo | Snapshot cliente, eventuale Sede principale, data, insieme di voci, eventuale provvigione e valori economici usati. Non ha stato commerciale. |
| Voce preventivo | Copia indipendente di una voce template o voce creata manualmente; prezzo scelto, risultati di calcolo e Tempo stimato derivato. |
| Sottovoce preventivo | Elemento Tempo / Spesa / Trasferta, copiato o creato manualmente e modificabile liberamente nei limiti delle regole delle varianti. |

Relazione logica:

- Profilo economico → determina Valore medio da generare.

- Cliente Fatture in Cloud → può avere zero o più Sedi locali associate in Cash; una Sede può anche non avere cliente.

- Preventivo → può avere una Sede principale.

- Trasferta → usa una sola Sede; se il preventivo ha una Sede, questa viene proposta come default ma può essere cambiata.

- Sede → fornisce alla Trasferta la distanza di sola andata usata nel calcolo.

- Catalogo → contiene Sottovoci riutilizzabili e Template.

- Template → contiene una o più Voci template.

- Voce template → contiene Sottovoci e Varianti.

- Preventivo → contiene Voci preventivo.

- Voce preventivo → contiene Sottovoci personalizzabili.

- Sottovoci → producono Tempo stimato e Spese previste.

- Tempo + Spese + Valore medio → Valore teorico.

- Valore teorico + Prezzo storico/inflazione → supportano il Prezzo scelto.

- Prezzo scelto → Resa prevista, Scostamento e Tempo massimo coerente.

- Somma delle voci → Analisi complessiva del preventivo.

Non è richiesto un concetto funzionale di Utente, Ruolo o Permesso per l'MVP.

## 23. Regole, validazioni ed errori

| **Regola** | **Comportamento** |
| --- | --- |
| Fatturato obiettivo | Deve essere maggiore di zero per calcolare il valore medio da generare. |
| Ore disponibili per lavori | Devono essere maggiori di zero; in caso contrario il valore medio non è calcolabile. |
| Costi aziendali | Importi mensili non negativi. |
| Km annui veicolo | Devono essere maggiori di zero per distribuire i costi annuali sul costo/km. |
| Velocità media di trasferta | Deve essere maggiore di zero per il calcolo automatico del tempo; se assente, nessuna velocità viene assunta. |
| Distanza Sede | Non negativa; deve essere disponibile quando la Sede è usata per un calcolo di Trasferta. |
| Occorrenze trasferta | Intero positivo; default 1. |
| Tempo manuale trasferta | Se utilizzato come override, deve essere maggiore di zero. |
| Sottovoce Tempo | Durata maggiore di zero. Una sottovoce Tempo con durata zero non è valida. |
| Voce principale | Deve contenere almeno una sottovoce che produca tempo e il Tempo stimato derivato deve essere maggiore di zero. |
| Sottovoce Spesa | Importo non negativo. |
| Prezzo scelto | Libero; può essere inferiore al valore teorico. Cash segnala gli scostamenti ma non blocca. |
| Template | Le modifiche alle copie non alterano l'origine e viceversa. |
| Cambio variante | Un gruppo sostituisce solo le sottovoci prodotte dalle proprie opzioni; warning obbligatorio prima di perdere modifiche manuali su tali sottovoci. |
| Inflazione | Valore di confronto; non modifica automaticamente il prezzo scelto. |
| Aggiornamento valori correnti | Solo su azione esplicita dell'utente; mai automatico in apertura; operazione atomica. |
| Fallback | Vietati: un dato necessario mancante o una sorgente non disponibile producono un errore esplicito. |

### 23.1 Nessun fallback

La regola di assenza di fallback vale in tutto il prodotto. Sono vietati comportamenti silenziosi che sostituiscono un dato necessario con un valore precedente, presunto, alternativo o “ragionevole”.

Esempi:

| **Situazione** | **Comportamento corretto** | **Comportamento vietato** |
| --- | --- | --- |
| Fonte carburante non disponibile | Mostrare errore e rendere non disponibile il calcolo che richiede il dato. | Usare automaticamente il prezzo del giorno precedente. |
| Fatture in Cloud non disponibile | Mostrare errore per l'operazione live richiesta. | Mostrare una vecchia lista cache come se fosse corrente. |
| Velocità media non configurata | Segnalare che il tempo automatico non è calcolabile; l'utente può inserire esplicitamente il tempo manuale. | Assumere automaticamente 50 km/h o altro valore. |
| Distanza della Sede non disponibile | Mostrare errore per la Trasferta che richiede la distanza. | Assumere 0 km o una distanza precedente non appartenente allo snapshot. |
| Dato non valido | Mostrare l'errore sul dato. | Sostituirlo con un default non scelto dall'utente. |

Non sono fallback: valori predefiniti esplicitamente configurati, snapshot storici del preventivo, modifiche manuali e override espliciti.

### 23.2 Aggiornamenti atomici

Ogni esecuzione di “Aggiorna con valori correnti” deve produrre un unico esito: successo completo oppure nessuna modifica. Cash non deve lasciare un preventivo aggiornato solo in parte.

### 23.3 Utente, autenticazione e permessi

Cash è concepito inizialmente come strumento monoutente. Non sono previsti utenti multipli, ruoli o autorizzazioni.

L'autenticazione non è un requisito funzionale dell'MVP. Il modello funzionale deve poter essere utilizzato anche in un contesto locale e fidato senza login, account o sessioni applicative. Non è richiesto che Cash sia esposto o servito tramite un server.

Stack, modalità di esecuzione e architettura restano decisioni implementative e non vengono fissati da questa specifica.

## 24. Fuori scope

- ERP e gestione amministrativa completa.

- Costo della vita e obiettivi personali di spesa.

- Time tracking e consuntivazione dei lavori.

- Project management, pianificazione di giornate o visite e gestione commesse.

- CRM completo.

- Contabilità e importazione dei costi aziendali da Fatture in Cloud.

- Simulatore fiscale universale per tutti i regimi e professioni.

- Vendita o rivendita di hardware e software.

- Entità o gestione specifica dei fornitori: per le trasferte un fornitore è semplicemente una Sede.

- Ammortamento e svalutazione dei veicoli.

- Servizi di routing, mappe, traffico o geolocalizzazione per le trasferte.

- Partenza/destinazione e calcolo di percorsi tra Sedi: la distanza è quella configurata sulla Sede rispetto alla sede/laboratorio di riferimento.

- Rule engine generico, scripting o formule arbitrarie sulle varianti.

- Priorità tra gruppi di varianti: ogni gruppo gestisce solo le proprie sottovoci.

- Ripartizione automatica di trasferte o costi condivisi tra più voci.

- Gestione di probabilità, range o simulazioni delle trasferte future.

- Prezzo finale imposto automaticamente dal software.

- AI necessaria al funzionamento del prodotto.

- Monitoring, backup o altri servizi inglobati automaticamente dentro macro-attività tecniche.

- Fallback automatici di qualunque tipo.

- Multiutenza, ruoli e autorizzazioni nell'MVP.

- Autenticazione applicativa obbligatoria nell'MVP.

- Stati del preventivo, workflow commerciale, approvazioni, accettazione/rifiuto, scadenza o validità gestita da Cash.

- Numerazione commerciale propria dei preventivi.

- Definizione dello stack tecnologico e dell'architettura applicativa in questa fase.

## 25. Decisioni aperte

I punti seguenti non sono ancora definiti. Non devono essere interpretati come requisiti già decisi.

| **Tema** | **Decisione ancora necessaria** |
| --- | --- |
| Fonte inflazione | Indice preciso, granularità temporale e fonte da utilizzare. |
| Prezzo carburante | Fonte definitiva e criterio geografico/nazionale. È già deciso che non esistono fallback automatici. |
| Preset fiscale iniziale | Valori iniziali dei parametri fiscali e modalità con cui vengono mantenuti aggiornati. |
| Calendario festività | Fonte e criterio per determinare le festività applicabili nel calcolo dei giorni lavorativi teorici. |
| Descrizione commerciale Fatture in Cloud | Come viene inserita o costruita la descrizione delle righe esportate, dato che il catalogo non richiede una descrizione commerciale predefinita. |
| Esposizione delle spese | Se e come una spesa interna possa essere trasformata esplicitamente in una riga commerciale destinata al cliente. |
| Aggiornamento template esistente | È definito “salva come nuovo template”; non è ancora definito se una voce/preventivo possa aggiornare un template già esistente. |
| Contenuto salvato come template | Precisare quali dati commerciali della voce corrente, oltre a struttura/sottovoci/varianti, vengono copiati quando si salva dal preventivo al catalogo. |
| Sede nelle Trasferte riutilizzabili | Definire se una Trasferta salvata nel catalogo o in un template possa preimpostare una Sede specifica oppure debba proporre sempre la Sede del preventivo al momento dell'uso. |
| Arrotondamenti | Precisione e regole di arrotondamento di importi, percentuali e durate mostrate. |

## 26. Criteri di accettazione dell'MVP

L'MVP è funzionalmente coerente con questa specifica quando consente almeno quanto segue:

**1.** Impostare un fatturato obiettivo e visualizzare immediatamente netto fiscale stimato, costi aziendali annui e disponibile stimato.

**2.** Configurare il caso fiscale previsto tramite parametri modificabili.

**3.** Inserire costi aziendali tramite categoria, descrizione e importo mensile.

**4.** Calcolare giorni/ore disponibili considerando ferie, imprevisti e percentuale dedicabile ai clienti.

**5.** Calcolare e mostrare il valore medio da generare.

**6.** Configurare almeno un veicolo e ricavarne il costo chilometrico.

**7.** Creare Sedi riutilizzabili con nome, indirizzo, cliente opzionale e distanza di sola andata dalla sede/laboratorio di riferimento.

**8.** Usare una Sede come riferimento della Trasferta senza modellare Partenza e Destinazione separate.

**9.** Quando il preventivo ha una Sede, proporla come Sede della Trasferta e permettere all'utente di sostituirla per la singola Trasferta.

**10.** Calcolare la distanza effettiva della Trasferta dai km della Sede, A/R e numero di occorrenze previste.

**11.** Calcolare il tempo di Trasferta dalla velocità media configurata e permettere un override manuale per singola occorrenza.

**12.** Calcolare il costo della Trasferta dalla distanza effettiva e dal costo veicolo/km.

**13.** Non usare alcun servizio di routing, mappe, traffico o geolocalizzazione.

**14.** Recuperare/selezionare clienti da Fatture in Cloud e salvare nel preventivo ragione sociale e partita IVA come snapshot.

**15.** Gestire una Sede principale del preventivo e conservarne lo snapshot.

**16.** Creare sottovoci riutilizzabili nel catalogo con valori predefiniti.

**17.** Creare template con una o più voci principali, sottovoci e varianti.

**18.** Creare una voce manualmente e aggiungervi sottovoci dal catalogo o manuali.

**19.** Salvare una sottovoce del preventivo come contenuto riutilizzabile del catalogo.

**20.** Salvare una o più voci del preventivo come nuovo template.

**21.** Garantire l'indipendenza delle copie: nessuna propagazione automatica fra catalogo, template e preventivi.

**22.** Gestire gruppi di varianti creati dall'utente, con zero/una opzione predefinita e richiesta esplicita quando il default manca.

**23.** Permettere a ciascuna opzione di produrre zero o più sottovoci e garantire che ogni gruppo gestisca esclusivamente le sottovoci prodotte dalle proprie opzioni.

**24.** Sommarne i contributi quando più gruppi di varianti sono selezionati contemporaneamente.

**25.** Consentire il cambio di variante sostituendo solo le sottovoci del gruppo interessato e mostrare un warning prima di perdere modifiche manuali su tali sottovoci.

**26.** Calcolare il Tempo stimato della voce esclusivamente dalle sottovoci e impedirne l'inserimento diretto sulla voce principale.

**27.** Rendere valida una voce principale solo se contiene almeno una sottovoce che produca tempo e il Tempo stimato risultante è maggiore di zero.

**28.** Calcolare tempo stimato, spese previste e valore teorico per la singola voce.

**29.** Calcolare tempo, spese, valore teorico, prezzo totale, resa e scostamento per il preventivo complessivo.

**30.** Mostrare un eventuale prezzo di riferimento e il relativo valore aggiornato per inflazione.

**31.** Permettere all'utente di scegliere liberamente il prezzo finale.

**32.** Calcolare resa prevista, scostamento dall'obiettivo e tempo massimo coerente.

**33.** Registrare un eventuale importo di provvigione fuori dal corpo del preventivo e senza effetti sui calcoli.

**34.** Conservare gli input storici del preventivo e non aggiornarli automaticamente.

**35.** Offrire un'azione esplicita “Aggiorna con valori correnti” che aggiorni, quando pertinenti, valore medio da generare, costo veicolo/km, distanza corrente della Sede, tempo automatico di Trasferta e rivalutazione per inflazione.

**36.** Mantenere invariato il tempo di Trasferta quando è presente un override manuale.

**37.** Eseguire “Aggiorna con valori correnti” atomicamente: in caso di errore o dato necessario mancante, non modificare alcun valore del preventivo.

**38.** Raggruppare/esportare le voci verso Fatture in Cloud usando il prodotto “Consulenza” senza esportare automaticamente le sottovoci interne o la provvigione.

**39.** In assenza di un dato o di una sorgente necessari, mostrare un errore esplicito senza utilizzare fallback automatici.

**40.** Funzionare come strumento monoutente senza richiedere funzionalmente autenticazione, ruoli o permessi.

**41.** Non introdurre stati, workflow commerciale o numerazione propria dei preventivi; un preventivo salvato resta modificabile anche dopo l'esportazione.

## Appendice A - Esempio di preventivo

Esempio: installazione e configurazione di un server, con altre attività nello stesso preventivo.

### Sedi utilizzate

| **Sede** | **Cliente associato** | **Distanza di sola andata** |
| --- | --- | --- |
| Fornitore ABC | Nessuno | 10 km |
| Cliente Rossi - Sede centrale | Rossi S.r.l. | 35 km |

Il preventivo ha come Sede principale “Cliente Rossi - Sede centrale”. Quando viene inserita una Trasferta, Cash propone questa Sede; per il ritiro del server l'utente la sostituisce con “Fornitore ABC”.

### Voce 1 - Configurazione server

| **Sottovoce** | **Tipo** | **Stima / configurazione** |
| --- | --- | --- |
| Gestione cliente | Tempo | 30 min |
| Gestione fornitore | Tempo | 20 min |
| Ritiro server dal fornitore | Tempo | 30 min |
| Trasferta fornitore | Trasferta | Sede: Fornitore ABC; A/R; 1 occorrenza |
| Preparazione server | Tempo | 30 min |
| Configurazione sistema | Tempo | 2 h |
| Inventariazione | Tempo | 15 min |
| Etichette | Spesa | € 5 |
| Trasferta cliente | Trasferta | Sede: Cliente Rossi - Sede centrale; A/R; 2 occorrenze previste |
| Installazione fisica | Tempo | 45 min |

#### Varianti della voce

| **Gruppo** | **Opzione scelta** | **Effetto** |
| --- | --- | --- |
| Aggiornamento firmware | Necessario | Aggiunge “Aggiornamento firmware - Tempo - 30 min”. |
| Configurazione RAID | Media | Aggiunge “Configurazione RAID - Tempo - 30 min”. |

Se “Aggiornamento firmware” fosse impostato su “Non necessario”, quel gruppo non aggiungerebbe alcuna sottovoce. Per “Configurazione RAID”, le opzioni possono essere Nessuna → nessuna sottovoce, Semplice → 10 min, Media → 30 min, Complessa → 60 min.

I due gruppi sono indipendenti e i loro contributi si sommano. Un cambio dell'opzione RAID non modifica la sottovoce di aggiornamento firmware né le sottovoci normali della voce.

#### Trasferte e occorrenze

La Trasferta verso il cliente usa i 35 km configurati sulla Sede. Con A/R e 2 occorrenze, la distanza effettiva è 35 × 2 × 2 = 140 km. Il tempo automatico deriva da questa distanza e dalla velocità media configurata; il costo deriva dalla distanza e dal costo veicolo/km.

Le due occorrenze della trasferta cliente rappresentano una stima prudenziale. Se il lavoro viene completato con un solo accesso, Cash non consuntiva automaticamente la differenza.

Se nello stesso accesso vengono svolte anche “Configurazione backup” e “Configurazione firewall”, la trasferta può restare associata una sola volta alla voce “Configurazione server”. L'analisi della singola voce include quindi quella trasferta, mentre il totale del preventivo evita doppi conteggi.

#### Esempio di tempo attribuito

Se “Configurazione server” vale 1 ora e durante 30 minuti di attesa viene svolta anche “Configurazione firewall” da 30 minuti, Cash conta comunque 1 ora + 30 minuti. Non tenta di ricostruire parallelismi o tempo cronologico minimo.

#### Esempio di provvigione

Se il cliente acquista il server direttamente dal fornitore e il fornitore riconosce al professionista una provvigione di € 100, la provvigione viene registrata fuori dal corpo del preventivo. Non modifica il prezzo della Configurazione server, le Spese previste o la Resa prevista.

## Appendice B - Flusso di calcolo

**Fatturato obiettivo**

→ Fiscalità + costi aziendali → netto/disponibile stimato

→ Calendario + ferie + imprevisti + % dedicabile → ore disponibili per lavori

→ Fatturato obiettivo / ore disponibili → valore medio da generare

→ Preventivo → voci → sottovoci Tempo / Spesa / Trasferta

→ Trasferte: Sede + distanza configurata sulla Sede + A/R + occorrenze + veicolo + tempo automatico/manuale

→ Tempo stimato derivato dalle sottovoci + spese previste → valore teorico

→ Confronto con prezzo di riferimento e rivalutazione per inflazione

→ Prezzo scelto dall'utente

→ Resa prevista + scostamento + tempo massimo coerente

→ Aggregazione delle voci → analisi complessiva del preventivo

→ Eventuale provvigione registrata separatamente, senza effetti sui calcoli

→ Eventuale aggiornamento atomico con valori correnti

→ Eventuale raggruppamento/esportazione verso Fatture in Cloud
