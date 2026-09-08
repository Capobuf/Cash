**CASH**

# SPECIFICA FUNZIONALE

*Specifica canonica consolidata - v0.6*

*8 settembre 2026*

| **Voce** | **Valore** |
| --- | --- |
| Progetto | Cash |
| Scopo | Supporto interno alla preventivazione per un libero professionista |
| Stato | Specifica completa per l'MVP; nessuna decisione funzionale bloccante aperta |
| Perimetro | Comportamento funzionale e soli vincoli tecnici necessari a garantire esecuzione locale, persistenza e integrazioni realmente implementabili |

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

- 24. Esecuzione locale e architettura vincolante

- 25. Persistenza e utilizzo tramite Google Drive

- 26. Impostazioni

- 27. Fuori scope

- 28. Decisioni ancora aperte

- 29. Criteri di accettazione dell'MVP

- 30. Fonti normative e tecniche

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

**INV-010 -** Il file dati è l'unica fonte canonica dei dati di Cash. Cache, copie di sicurezza e dati locali del client non possono sostituirlo automaticamente.

**INV-011 -** Ogni salvataggio verifica identificativo, revisione e impronta del file letto. Se il file è cambiato altrove, Cash blocca la scrittura e non tenta una fusione automatica.

**INV-012 -** Credenziali e token di servizi esterni non sono mai salvati nel file dati sincronizzato con Google Drive.

**INV-013 -** Cash non avvia né richiede un server applicativo, un database server o un servizio in ascolto su una porta locale.

## 3. Perimetro funzionale

| **Area** | **Funzione prevista** |
| --- | --- |
| Obiettivo economico | Fatturato obiettivo annuo e visualizzazione immediata del netto fiscale stimato e del disponibile stimato. |
| Fiscalità | Profilo annuale configurabile per il regime forfettario, con parametri modificabili; nessun supporto ad altri regimi fiscali. |
| Costi aziendali | Elenco minimale di costi medi mensili. |
| Disponibilità lavorativa | Calcolo di giorni e ore disponibili e del valore medio da generare. |
| Inflazione | Rivalutazione informativa di un prezzo storico/riferimento in fase di preventivazione. |
| Veicoli | Calcolo del costo chilometrico con consumo, carburante e costi annuali essenziali. |
| Sedi | Luoghi riutilizzabili gestiti localmente in Cash, opzionalmente associati a un cliente, con distanza in km dalla sede/laboratorio di riferimento. |
| Trasferte | Sede selezionata, distanza derivata dai km della Sede, A/R, veicolo, occorrenze e tempo automatico o manuale. |
| Clienti | Anagrafica locale minimale sempre disponibile; ricerca da Fatture in Cloud solo se l'integrazione è attivata. Snapshot dei dati essenziali nel preventivo. |
| Catalogo | Sottovoci riutilizzabili e template composti da una o più voci principali. |
| Preventivi | Composizione manuale o da template, personalizzazione completa e analisi economica per voce e complessiva. Nessuno stato o workflow commerciale. |
| Provvigioni | Tracciamento di un eventuale importo accessorio fuori dal corpo e dai calcoli del preventivo. |
| Fatture in Cloud | Integrazione interamente facoltativa, attivabile e configurabile dalle Impostazioni; consente ricerca clienti ed esportazione/raggruppamento delle voci usando il prodotto “Consulenza”. |
| Utente | Uso monoutente. Autenticazione, ruoli e permessi non sono requisiti funzionali dell'MVP. |
| Persistenza | Un solo file dati JSON scelto dall'utente, con revisioni, salvataggio atomico e copia di sicurezza dell'ultima versione valida. |
| Multi-postazione | Uso sequenziale dello stesso file tramite Google Drive for Desktop in modalità mirroring. |
| Esecuzione | Client desktop locale con interfaccia HTML/CSS/JavaScript; nessun server applicativo. |

## 4. Modello economico

### 4.1 Fatturato obiettivo

L'utente inserisce un unico obiettivo economico principale: il totale annuo di compensi e ricavi fiscalmente rilevanti che vuole raggiungere. Ai fini della stima fiscale, Cash assume per semplicità che il Fatturato obiettivo coincida con gli importi che saranno incassati nell'anno; l'utente deve quindi configurarlo secondo il principio di cassa applicabile al proprio profilo. Non viene richiesto un obiettivo separato di reddito personale o costo della vita.

Durante l'inserimento o la modifica del fatturato obiettivo, Cash aggiorna immediatamente la proiezione economica.

| **Indicatore** | **Descrizione** |
| --- | --- |
| Fatturato obiettivo | Importo annuo dichiarato dall'utente. |
| Spese specifiche annue previste | Stima annua dei costi direttamente legati ai lavori e recuperati nei relativi prezzi; valore non negativo, inizialmente 0. |
| Fatturato da generare con il tempo | Fatturato obiettivo meno Spese specifiche annue previste. |
| Contributi stimati | Stima calcolata secondo il profilo fiscale configurato. |
| Imposta stimata | Stima dell'imposta sostitutiva secondo il profilo fiscale. |
| Netto fiscale stimato | Fatturato obiettivo meno contributi e imposta stimata. |
| Costi aziendali annui | Somma dei costi mensili inseriti × 12. |
| Disponibile stimato | Netto fiscale stimato meno costi aziendali annui e Spese specifiche annue previste. |

> **Netto fiscale stimato:** Fatturato obiettivo - Contributi stimati - Imposta stimata

> **Disponibile stimato:** Netto fiscale stimato - Costi aziendali annui - Spese specifiche annue previste

> **Fatturato da generare con il tempo:** Fatturato obiettivo - Spese specifiche annue previste

La distinzione evita di confrontare grandezze diverse: la Resa prevista sottrae le Spese specifiche dal prezzo del lavoro e viene quindi confrontata con un obiettivo orario calcolato sulla sola parte di fatturato che deve essere generata dal tempo. Nel regime forfettario gli importi incassati per recuperare tali Spese possono comunque concorrere ai compensi fiscalmente rilevanti; per questo la stima fiscale continua a usare l'intero Fatturato obiettivo, mentre il Disponibile stimato sottrae anche i costi specifici previsti.

> *È un indicatore interno; non rappresenta una dichiarazione fiscale o contabile.*

### 4.2 Nessun costo della vita

Il costo della vita personale è fuori scope. L'inflazione viene utilizzata solo come riferimento durante la preventivazione e non per proiettare spese personali o utile futuro.

## 5. Fiscalità

Cash supporta esclusivamente il regime forfettario. Non è richiesto un motore fiscale generico e non sono configurabili regime ordinario, semplificato, casse professionali diverse dalla Gestione Separata o combinazioni di più attività con coefficienti differenti. La qualifica generica di “professionista informatico” non determina da sola il coefficiente di redditività: il profilo deve includere il codice ATECO effettivo e i parametri confermati dall'utente.

### 5.1 Profilo fiscale annuale configurabile

Il profilo fiscale è annuale, datato, revisionato e configurabile dall'utente in **Impostazioni → Profilo fiscale**. Il preset 2026 è soltanto una proposta iniziale modificabile; Cash non aggiorna automaticamente valori fiscali o previdenziali e non presenta il preset come consulenza fiscale.

| **Parametro** | **Preset 2026** | **Regola funzionale** |
| --- | --- | --- |
| Anno fiscale | 2026 | Identifica la validità temporale del profilo. |
| Codice attività ATECO 2025 | 62.20.10 | Informazione obbligatoria; deve coincidere con l'attività effettiva dell'utente. |
| Coefficiente di redditività | 67% | Percentuale modificabile; deve essere coerente con il codice ATECO indicato. |
| Aliquota Gestione Separata | 26,07% | Percentuale modificabile usata per la stima contributiva. |
| Massimale contributivo | € 122.295,00 | Importo modificabile che limita la base soggetta a contribuzione. |
| Fase dell'attività | Oltre i primi 5 periodi d'imposta o agevolazione non spettante | Selezione obbligatoria fra fase agevolata e ordinaria. |
| Aliquota sostitutiva agevolata | 5% | Percentuale modificabile applicata soltanto se è selezionata e confermata la fase agevolata. |
| Aliquota sostitutiva ordinaria | 15% | Percentuale modificabile applicata negli altri casi. |
| Soglia ordinaria di permanenza | € 85.000,00 | Importo modificabile; produce un avviso se superato dal Fatturato obiettivo. |
| Soglia di cessazione nell'anno | € 100.000,00 | Importo modificabile; oltre la soglia il profilo forfettario non produce una proiezione fiscale. |

La scelta della fase presenta due opzioni esplicite:

- **Primi 5 periodi d'imposta con agevolazione spettante:** usa l'aliquota agevolata configurata e richiede la conferma separata “Confermo di possedere i requisiti previsti per l'aliquota agevolata”. Il solo numero di anni dall'inizio dell'attività non è sufficiente a determinare il diritto all'agevolazione.

- **Oltre i primi 5 periodi d'imposta o agevolazione non spettante:** usa l'aliquota ordinaria configurata. In questa specifica “ordinaria” indica l'aliquota sostitutiva standard del regime forfettario, non il regime fiscale ordinario.

> **Aliquota sostitutiva effettiva:** aliquota agevolata se la relativa fase e la conferma dei requisiti sono entrambe attive; aliquota ordinaria negli altri casi

> **Reddito forfettario:** Fatturato obiettivo × Coefficiente di redditività

> **Base contributiva:** min(Reddito forfettario, Massimale contributivo)

> **Contributi stimati:** Base contributiva × Aliquota Gestione Separata

> **Base imposta:** max(0, Reddito forfettario - Contributi stimati)

> **Imposta stimata:** Base imposta × Aliquota sostitutiva effettiva

Il minimale INPS è informativo ai fini dell'accredito contributivo e non viene trasformato in un contributo minimo dovuto. La schermata mostra in tempo reale aliquota effettiva, reddito forfettario, base contributiva, contributi, base imposta, imposta e netto risultanti dal Fatturato obiettivo corrente, così che l'utente possa verificare l'effetto della configurazione prima di confermarla.

Il profilo può essere salvato come **Da verificare**, ma deve essere confermato prima delle proiezioni fiscali. La conferma attesta che codice ATECO, coefficiente, aliquote, massimale, fase dell'attività e soglie sono stati verificati dall'utente. Ogni modifica a un profilo confermato crea una nuova revisione e lo riporta a **Da verificare**; gli snapshot già presenti nei preventivi non cambiano.

Se il Fatturato obiettivo supera la soglia ordinaria di permanenza, Cash mostra un avviso forte e richiede una conferma specifica dell'applicabilità del regime nell'anno. Se supera la soglia di cessazione nell'anno, Cash non mostra contributi, imposta o netto fiscale calcolati con il profilo forfettario: la simulazione di un regime diverso è fuori scope. Il Fatturato obiettivo può comunque essere salvato e usato per la pianificazione non fiscale.

Il passaggio a un nuovo anno non copia silenziosamente aliquote o massimali. L'utente può creare un profilo vuoto oppure scegliere esplicitamente **Copia dall'anno precedente**; in entrambi i casi il nuovo profilo è **Da verificare** e i calcoli fiscali restano bloccati fino alla conferma.

La funzione è una stima per supportare la preventivazione. Cash non deve presentarsi come software fiscale, contabile o sostitutivo del commercialista.

L'MVP gestisce un solo codice ATECO, un solo coefficiente di redditività e la sola Gestione Separata per profilo annuale. Se il profilo reale richiede più coefficienti o un'altra gestione previdenziale, la proiezione fiscale non è supportata e Cash non costruisce medie o conversioni; la pianificazione non fiscale resta utilizzabile.

## 6. Costi aziendali

La gestione dei costi aziendali è intenzionalmente minimale. L'utente normalizza personalmente ogni costo a un valore medio mensile.

| **Campo** | **Obbligatorietà** | **Esempio** |
| --- | --- | --- |
| Categoria | Obbligatorio | Software |
| Descrizione | Obbligatorio | Microsoft 365 |
| Importo mensile | Obbligatorio | € 50,00 |

Non sono previsti periodicità, date di aggiornamento, classificazione fisso/variabile, ammortamenti o importazione delle spese da Fatture in Cloud. Assicurazione, bollo e manutenzione già configurati su un Veicolo non devono essere duplicati nei Costi aziendali: vengono recuperati tramite il costo chilometrico e rientrano nella stima delle Spese specifiche annue previste.

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

Il calendario è calcolato localmente per l'anno del profilo economico. Sono esclusi sabato, domenica e i giorni festivi nazionali italiani in vigore per quell'anno: 1 gennaio, 6 gennaio, lunedì di Pasqua, 25 aprile, 1 maggio, 2 giugno, 15 agosto, 4 ottobre dal 2026, 1 novembre, 8 dicembre, 25 dicembre e 26 dicembre. La data del lunedì di Pasqua è calcolata algoritmicamente.

L'utente può configurare zero o più festività locali ricorrenti o specifiche per anno, incluso il Santo patrono. Queste date vengono mostrate nell'elenco dei giorni esclusi. Cash non interroga un servizio calendario esterno e non aggiunge automaticamente chiusure aziendali, ponti o festività locali non configurate.

Le date escluse vengono trattate come un insieme univoco: una festività che cade nel fine settimana o una festività locale che coincide con una nazionale viene contata una sola volta. Una data ricorrente non valida per l'anno, per esempio 29 febbraio in un anno non bisestile, viene segnalata e non applicata. Ferie e malattia/imprevisti sono numeri di giorni ulteriori e non date: Cash impedisce che la loro somma renda negativi i Giorni disponibili.

> **Giorni disponibili:** Giorni lavorativi teorici - Ferie - Malattia/imprevisti

> **Ore lavorative disponibili:** Giorni disponibili × Ore lavorative al giorno

> **Ore disponibili per lavori:** Ore lavorative disponibili × % Tempo dedicabile ai lavori

### 7.2 Valore medio da generare

> **Valore medio da generare:** Fatturato da generare con il tempo / Ore disponibili per lavori

Il valore medio da generare non è una tariffa oraria obbligatoria. Indica quanto fatturato, al netto delle Spese specifiche annue previste, dovrebbe essere generato mediamente per ogni ora della capacità dedicata ai clienti affinché l'obiettivo annuale sia raggiungibile.

## 8. Inflazione e prezzi di riferimento

L'inflazione viene utilizzata esclusivamente durante la preventivazione per aggiornare un prezzo storico o di riferimento al valore equivalente corrente. Non modifica automaticamente il prezzo finale.

La fonte unica è l'indice ISTAT FOI generale nazionale al netto dei tabacchi. La granularità è mensile. Una voce può avere opzionalmente un prezzo di riferimento; se presente, richiede anche mese e anno del riferimento. Il periodo finale è l'ultimo mese pubblicato da ISTAT al momento del calcolo ed è sempre mostrato insieme alla data di acquisizione.

| **Dato** | **Comportamento** |
| --- | --- |
| Prezzo di riferimento | Valore storico o di riferimento associato alla voce. |
| Mese/anno del riferimento | Periodo obbligatorio quando è presente un prezzo di riferimento. |
| Indice iniziale | Valore FOI del mese di riferimento, con base e coefficienti di raccordo necessari. |
| Indice finale | Ultimo valore FOI mensile pubblicato, mai un valore provvisorio o stimato. |
| Prezzo rivalutato | Valore informativo calcolato dal rapporto fra gli indici resi confrontabili. |
| Prezzo scelto | Definito liberamente dall'utente; non viene modificato dall'inflazione. |

> **Prezzo rivalutato:** Prezzo di riferimento × (Indice FOI finale raccordato / Indice FOI iniziale raccordato)

Quando ISTAT cambia la base dell'indice, Cash usa esclusivamente i coefficienti di raccordo ufficiali per rendere confrontabili i due periodi. Nello snapshot vengono salvati periodo iniziale e finale, indici grezzi, basi, coefficienti applicati, risultato e data/ora di acquisizione.

Se uno dei dati necessari non è disponibile, se il periodo iniziale precede la serie supportata o se il raccordo non è determinabile con dati ufficiali, Cash mostra un errore. Non usa NIC, IPCA, valori precedenti o altre fonti come fallback.

## 9. Veicoli e trasferte

### 9.1 Veicoli

| **Campo** | **Descrizione** |
| --- | --- |
| Nome | Identificativo del veicolo. |
| Carburante | Tipologia di alimentazione rilevante ai fini del costo. |
| Modalità MIMIT | Valore derivato dal carburante secondo il dataset ufficiale: SELF per Benzina e Gasolio, SERVITO per GPL e Metano. Non è liberamente modificabile. |
| Consumo | Consumo medio del veicolo. |
| Km annui medi | Percorrenza media annuale dichiarata dall'utente. |
| Assicurazione annua | Costo annuale. |
| Bollo annuo | Costo annuale. |
| Manutenzione annua media | Media complessiva di manutenzione ordinaria e altre spese ricorrenti. |

La manutenzione media può includere pneumatici, tagliandi, riparazioni e altri costi ordinari. Ammortamento e svalutazione sono esclusi.

> **Costo carburante/km:** Consumo × Prezzo carburante corrente, normalizzato per km

> **Quota costi annuali/km:** (Assicurazione + Bollo + Manutenzione) / Km annui medi

> **Costo veicolo/km:** Costo carburante/km + Quota costi annuali/km

Il prezzo del carburante deriva esclusivamente dai prezzi medi MIMIT per regione o provincia autonoma, rete non autostradale. Per il calcolo automatico sono supportati Benzina e Gasolio con modalità SELF, GPL e Metano con modalità SERVITO, cioè le combinazioni pubblicate dal dataset ufficiale. La regione/provincia autonoma di riferimento è un'impostazione obbligatoria globale. Cash usa il dato giornaliero più recente effettivamente pubblicato dal MIMIT e salva nello snapshot valore, unità, territorio, rete, modalità, data di riferimento del prezzo e data/ora di acquisizione. La data mostrata dalla fonte, non la data del dispositivo, determina quale dato è il più recente.

Per i consumi espressi in litri ogni 100 km:

> **Costo carburante/km:** (Consumo l/100 km ÷ 100) × Prezzo carburante per litro

Per alimentazioni con unità diverse, il veicolo deve dichiarare esplicitamente unità del consumo e unità del prezzo; le due unità devono essere compatibili. Un carburante o una combinazione non pubblicati dal dataset regionale MIMIT non sono configurabili per il calcolo automatico. Se non è disponibile il dato giornaliero ufficiale della combinazione supportata, il calcolo che lo richiede produce un errore. Cash non riusa un valore conservato localmente come se fosse corrente e non usa la media nazionale, la rete autostradale o un altro carburante come fallback.

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

Cash dispone sempre di un'anagrafica cliente locale minimale. Fatture in Cloud è una sorgente aggiuntiva facoltativa: la sua assenza o disattivazione non limita creazione, calcolo, salvataggio, riapertura o consultazione dei preventivi.

Ogni Cliente locale contiene:

- UUID Cash immutabile.

- Denominazione o ragione sociale obbligatoria.

- Partita IVA facoltativa.

L'utente può creare, modificare, cercare ed eliminare Clienti locali dalle schermate **Clienti** e **Impostazioni**. Questa gestione resta intenzionalmente minimale e non introduce contatti, trattative, attività, scadenze o altre funzioni CRM.

Per facilitare il passaggio a un uso senza cloud, su un cliente o su uno snapshot Fatture in Cloud è disponibile l'azione esplicita **Copia come Cliente locale**. L'anteprima propone denominazione e partita IVA, segnala eventuali omonimi ma non li unisce automaticamente e crea un nuovo UUID solo dopo conferma. La copia non mantiene sincronizzazioni o collegamenti vivi con la fonte remota.

Il cliente resta facoltativo per salvare e calcolare un preventivo. Quando viene selezionato un Cliente locale, Cash salva nello snapshot sorgente `locale`, UUID, denominazione e partita IVA. Quando l'integrazione è attiva l'utente può, in alternativa, eseguire una ricerca live e scegliere un cliente Fatture in Cloud; lo snapshot salva sorgente `fatture_in_cloud`, azienda, identificativo remoto, ragione sociale e partita IVA. Modifiche successive all'origine non alterano i preventivi esistenti.

L'esportazione richiede uno snapshot cliente proveniente dalla stessa azienda Fatture in Cloud configurata. Se il preventivo usa un Cliente locale, Cash non tenta corrispondenze automatiche: prima dell'esportazione propone una selezione live esplicita e sostituisce lo snapshot del preventivo soltanto dopo conferma dell'utente. Il Cliente locale originario non viene modificato o collegato implicitamente.

Se Fatture in Cloud non è disponibile durante una ricerca o un'esportazione richiesta dall'utente, Cash mostra un errore limitato a tale operazione. Non sostituisce la risposta con una lista cache considerata corrente. Clienti locali e snapshot già salvati restano pienamente utilizzabili.

### 10.2 Sedi

Le Sedi sono gestite esclusivamente in Cash e non fanno parte dell'integrazione con Fatture in Cloud. Una Sede è un luogo riutilizzabile: può rappresentare una sede cliente, un fornitore, il laboratorio, un magazzino o qualunque altro luogo utile. Non viene introdotta un'entità separata “Fornitore”.

| **Campo sede** | **Descrizione** |
| --- | --- |
| Nome | Etichetta leggibile della Sede. |
| Indirizzo | Indirizzo del luogo. |
| Cliente associato | Opzionale. UUID di un Cliente locale oppure riferimento Fatture in Cloud con azienda, identificativo e denominazione leggibile; una Sede può esistere senza cliente. |
| Distanza | Distanza in km dalla sede/laboratorio di riferimento dell'utente, riferita alla sola andata. Necessaria quando la Sede viene usata per un calcolo di Trasferta. |

La sede/laboratorio di riferimento è implicita nel significato della distanza e non viene modellata come partenza della Trasferta. Il riferimento cliente salvato su una Sede serve soltanto a ricerca e proposta. Se punta a Fatture in Cloud conserva un riferimento leggibile, ma non diventa una cache utilizzabile per operazioni live.

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

- Mese/anno del prezzo di riferimento, se presente.

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

Il salvataggio di una o più voci crea sempre un nuovo template. Non può aggiornare o sovrascrivere un template esistente. Per modificare un template esistente l'utente deve aprirlo dal catalogo e salvarne esplicitamente le modifiche.

Per ogni voce salvata vengono copiati nome, eventuale prezzo di riferimento con mese/anno, sottovoci normali e gruppi di varianti con tutte le opzioni e il relativo default. Prima del salvataggio un'anteprima mostra cosa verrà copiato. Le modifiche manuali alle sottovoci normali vengono incluse; quelle apportate alle sottovoci generate dall'opzione selezionata vengono applicate alla definizione di tale opzione soltanto dopo conferma esplicita. L'opzione selezionata nel preventivo non diventa silenziosamente il nuovo default. Non vengono copiati cliente, Sede principale del preventivo, prezzo scelto, provvigione, risultati derivati, valori economici o dinamici dello snapshot né riferimenti di esportazione.

Una Trasferta salvata come sottovoce riutilizzabile o dentro un template conserva A/R, occorrenze e modalità automatica/manuale; se la modalità è manuale conserva anche i minuti per singola occorrenza. Non conserva Sede, distanza, veicolo, costo chilometrico, prezzo carburante o tempo automatico derivato. Quando viene inserita nel preventivo, Cash propone la Sede principale del preventivo; se assente, richiede una scelta esplicita. Il veicolo deve essere scelto esplicitamente.

### 11.5 Copie indipendenti e nessuna propagazione

I template servono esclusivamente alla precompilazione. La catena logica è: sottovoce di catalogo → copia nel template → copia nel preventivo. Ogni copia è indipendente.

Esempio: se “Gestione cliente” nel catalogo passa da 30 a 40 minuti, un template che l'aveva copiata a 45 minuti resta a 45 minuti e i preventivi già creati restano invariati.

## 12. Preventivi, voci e sottovoci

### 12.1 Struttura generale

Un preventivo contiene una o più voci principali. Ogni voce principale contiene le sottovoci interne necessarie a descrivere il lavoro e a calcolarne tempo e spese.

Il preventivo ha una data, inizialmente proposta come data locale corrente ma modificabile, e usa un solo Profilo economico annuale. Alla creazione Cash propone il profilo il cui anno coincide con quello della data; se manca o non è utilizzabile, l'utente deve selezionarlo o crearlo. Il preventivo può essere salvato senza profilo mentre è incompleto, ma i calcoli economici restano non disponibili. Cambiare la data non sostituisce silenziosamente il profilo: Cash segnala l'eventuale disallineamento e richiede una scelta esplicita. Cambiare profilo è un'operazione atomica che aggiorna il relativo snapshot e ricalcola tutti gli indicatori, senza modificare sottovoci o Prezzi scelti.

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

Le Spese restano sempre elementi interni: contribuiscono al Valore teorico ma non vengono trasformate automaticamente in righe commerciali e non possono essere “esposte” direttamente. Per recuperarne il costo, l'utente lo considera nel Prezzo scelto della voce a cui la Spesa appartiene. Una riga commerciale composta soltanto da una Spesa non è supportata nell'MVP; una voce principale separata è ammessa solo se rappresenta anche un'attività con Tempo stimato positivo. In questo modo Cash non confonde il costo sostenuto con il prezzo applicato al cliente e non viola la validità delle voci principali.

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

Ogni gruppo deve avere un nome non vuoto, almeno un'opzione e nomi di opzione univoci al proprio interno. Può avere zero o una opzione predefinita, che deve appartenere al gruppo. Quando l'utente aggiunge la prima opzione a un gruppo, questa viene inizialmente impostata come predefinita. L'utente può successivamente cambiare il default o rimuoverlo del tutto.

Se un gruppo non ha un default, Cash deve chiedere all'utente quale opzione usare durante l'aggiunta della voce al preventivo. Per un template con più gruppi o più voci, Cash raccoglie e valida tutte le scelte prima di inserire qualsiasi contenuto; se l'utente annulla, il preventivo resta invariato.

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

### 14.1 Precisione e arrotondamenti

Cash usa aritmetica decimale, non numeri binari a virgola mobile, per tutti i valori economici.

| **Tipo di valore** | **Regola** |
| --- | --- |
| Importi inseriti dall'utente | Euro con massimo 2 decimali. |
| Prezzo carburante acquisito | Precisione della fonte, fino a 3 decimali per unità. |
| Distanze | Km con massimo 1 decimale. |
| Consumi | Massimo 2 decimali nell'unità dichiarata. |
| Percentuali e coefficienti inseriti | Massimo 4 decimali percentuali; visualizzazione senza zeri finali inutili. |
| Durate manuali | Minuti interi positivi. |
| Tempo automatico di Trasferta | Calcolato sul totale della Trasferta e arrotondato al minuto intero più vicino, metà verso l'alto. |
| Costo veicolo/km | Conservato e mostrato con 6 decimali. |
| Componenti monetarie derivate | Arrotondate al centesimo, metà verso l'alto, prima di essere sommate nei totali mostrati. |
| Resa e scostamento | Calcolati sui valori monetari e temporali persistiti; mostrati rispettivamente con 2 decimali €/h e 2 decimali percentuali. |
| Tempo massimo coerente | Arrotondato per difetto al minuto intero, così da non sovrastimare il tempo disponibile. |

Le formule usano ore decimali ottenute dai minuti persistiti. I totali devono coincidere con la somma dei componenti monetari visibili; nessun arrotondamento nascosto può produrre differenze di un centesimo.

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

I totali di tempo, spese e valore teorico sono disponibili solo se tutte le voci incluse sono calcolabili; Prezzo totale, Resa, Scostamento e Tempo massimo complessivo richiedono inoltre il Prezzo scelto per ogni voce. Cash non omette silenziosamente le voci incomplete: mostra quali voci impediscono ciascun indicatore complessivo.

Se il prezzo totale è inferiore alle spese totali, valgono le stesse regole della singola voce: resa negativa, disavanzo esplicito e nessun tempo positivo coerente.

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

Se Prezzo scelto è inferiore a Spese previste, la Resa prevista resta negativa e Cash mostra il disavanzo. Il Tempo massimo coerente non viene rappresentato come durata negativa: mostra “nessun tempo positivo coerente” e il disavanzo economico. Le divisioni richiedono Tempo stimato e Valore medio da generare maggiori di zero; in caso contrario il risultato è un errore, non zero.

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

- Se selezionato, sorgente del cliente e relativi identificativi: UUID per un Cliente locale oppure azienda e identificativo per Fatture in Cloud; in entrambi i casi denominazione/ragione sociale e partita IVA disponibile.

- Nome e indirizzo della Sede principale del preventivo.

- Per le Trasferte: Sede utilizzata, nome/indirizzo e distanza in km usata nel calcolo.

- Valore medio da generare utilizzato.

- Fatturato obiettivo, Spese specifiche annue previste e Fatturato da generare con il tempo da cui deriva il valore medio.

- Profilo economico e fiscale annuale da cui deriva il Valore medio da generare, identificato da anno e revisione.

- Costo veicolo/km utilizzato nelle Trasferte.

- Dato carburante MIMIT usato: carburante, modalità, territorio, rete, prezzo, data del dato e data/ora di acquisizione.

- A/R, numero di occorrenze, modalità automatica/manuale e tempi delle Trasferte.

- Dati ISTAT usati per la rivalutazione: periodi, indici FOI, basi, coefficienti di raccordo, data/ora di acquisizione e risultato.

- Struttura delle voci, sottovoci, varianti e modifiche manuali.

- Prezzi scelti dall'utente.

Il preventivo deve quindi restare leggibile e riproducibile secondo il contesto in cui è stato costruito.

### 19.2 Aggiorna con valori correnti

Quando l'utente riapre un preventivo, deve poter richiedere esplicitamente un aggiornamento ai valori correnti. Non deve mai avvenire un aggiornamento automatico in apertura.

L'azione aggiorna esclusivamente i valori generali/dinamici pertinenti agli elementi effettivamente presenti nel preventivo e ricalcola gli indicatori derivati. In particolare, quando applicabile, aggiorna:

- Valore medio da generare, ricavato dalla revisione corrente dello stesso Profilo economico annuale già associato al preventivo; Cash non passa automaticamente a un altro anno.

- Costo chilometrico corrente del veicolo usato nelle Trasferte.

- Distanza corrente configurata sulla stessa Sede utilizzata da ciascuna Trasferta.

- Tempo di Trasferta originariamente calcolato in automatico, usando distanza corrente della Sede e velocità media di trasferta corrente.

- Rivalutazione per inflazione.

L'azione non modifica automaticamente cliente, nome/indirizzo della Sede nello snapshot, struttura delle voci/sottovoci, varianti, sottovoci Tempo inserite manualmente, Spese inserite manualmente, A/R, numero di occorrenze, veicolo selezionato o prezzo scelto.

Se una Trasferta usa un override manuale del tempo, l'aggiornamento può aggiornare distanza e costo della Trasferta ma non modifica il tempo manuale. Sedi e veicoli vengono ritrovati esclusivamente tramite il loro UUID di origine: se l'origine non esiste più, l'aggiornamento fallisce invece di associare un elemento omonimo.

L'aggiornamento crea una nuova revisione dello snapshot e conserva nel preventivo la data/ora dell'operazione. Non mantiene una cronologia completa delle versioni del preventivo: la copia di sicurezza del file dati protegge l'ultima revisione precedente dell'intero archivio.

### 19.3 Atomicità dell'aggiornamento

L'azione “Aggiorna con valori correnti” è atomica. Cash deve verificare prima che tutti i dati necessari all'aggiornamento degli elementi presenti nel preventivo siano disponibili e validi.

Se anche un solo dato necessario manca, una sorgente richiesta non è disponibile o un valore non è valido, l'intera operazione fallisce e nessun valore del preventivo viene modificato. Lo snapshot precedente rimane integralmente valido.

Cash deve indicare chiaramente quale dato o sorgente ha impedito l'aggiornamento. Non sono ammessi aggiornamenti parziali né il riuso silenzioso dei valori precedenti per completare l'operazione.

## 20. Esportazione verso Fatture in Cloud

Fatture in Cloud è un modulo di comodità, non il motore economico né una dipendenza di Cash. Il valore condiviso **Integrazione Fatture in Cloud** ha stato iniziale `Disattivata`. Quando è disattivata Cash non esegue chiamate verso il servizio, nasconde le azioni di ricerca live e rende l'esportazione non disponibile con una spiegazione; tutte le funzioni locali continuano a operare.

### 20.1 Collegamento e credenziali

L'utente attiva e configura autonomamente il modulo in **Impostazioni → Integrazioni → Fatture in Cloud** tramite una procedura guidata:

**1.** Attivare l'interruttore **Usa Fatture in Cloud**.

**2.** Visualizzare il Client ID dell'applicazione privata e le istruzioni per generare un token manuale.

**3.** Incollare il token e avviare **Verifica collegamento**.

**4.** Selezionare una delle aziende restituite dal servizio.

**5.** Verificare i permessi richiesti e selezionare il prodotto “Consulenza”.

**6.** Salvare la configurazione e visualizzare lo stato finale `Attiva` con azienda, prodotto e data/ora dell'ultima verifica riuscita.

Per l'MVP Cash usa l'autenticazione manuale prevista da Fatture in Cloud, coerente con un'applicazione privata monoutente. Cash distribuisce o mostra il Client ID della propria applicazione privata e non conserva alcun Client Secret. Sono richiesti almeno `entity.clients:r` per leggere i clienti, `products:r` per cercare e verificare il prodotto e `issued_documents.quotes:a` per creare preventivi; eventuali permessi ulteriori devono essere giustificati da una funzione effettivamente implementata.

Il token non viene scritto nel file dati né sincronizzato con Google Drive. Viene custodito dal portachiavi/gestore credenziali del sistema operativo della singola postazione. Ogni postazione viene collegata separatamente. Cash salva nel file dati solo l'identificativo dell'azienda Fatture in Cloud selezionata e i riferimenti non segreti necessari.

Il token manuale può essere revocato dall'utente. Una risposta di autenticazione o autorizzazione fallita produce un errore esplicito e richiede di correggere il collegamento; Cash non prova credenziali alternative.

Disattivare l'interruttore sospende le funzioni live ma conserva configurazione non segreta e token locale, per consentire una successiva riattivazione. L'azione separata **Rimuovi collegamento**, protetta da conferma, elimina dalla postazione il token e dal file condiviso azienda, prodotto e metadati di verifica. Non modifica Clienti locali, preventivi o snapshot storici Fatture in Cloud.

### 20.2 Import cliente

Soltanto con modulo `Attivo`, Cash interroga in tempo reale l'azienda configurata, permette di cercare e selezionare un cliente e copia nel preventivo sorgente, identificativo dell'azienda, identificativo cliente Fatture in Cloud, ragione sociale e partita IVA. Le Sedi non vengono importate e l'importazione non crea automaticamente un Cliente locale.

Cash non conserva una cache del catalogo clienti remoto come sorgente alternativa. Se il servizio non è raggiungibile, la sola ricerca live fallisce; l'anagrafica locale e i clienti già copiati nei preventivi rimangono disponibili.

### 20.3 Prodotto “Consulenza”

Durante la configurazione Cash cerca in Fatture in Cloud il prodotto con nome esatto “Consulenza”. Se ne trova uno solo, ne salva l'identificativo non segreto; se non ne trova nessuno o ne trova più di uno, l'utente deve creare o scegliere esplicitamente il prodotto corretto. Prima di ogni esportazione Cash recupera per identificativo i dati correnti necessari, inclusa la disciplina IVA configurata in Fatture in Cloud, e verifica che il prodotto esista ancora, appartenga all'azienda configurata e conservi il nome esatto. In caso contrario blocca l'invio e richiede una nuova selezione. Cash non calcola né sostituisce autonomamente tali dati.

### 20.4 Esportazione preventivo

L'utente può esportare una o più voci del preventivo creando un documento Fatture in Cloud di tipo preventivo. Prima dell'invio Cash mostra un'anteprima modificabile delle righe. Il raggruppamento riguarda solo l'esportazione e non modifica le voci interne.

| **Dato Cash** | **Mapping verso Fatture in Cloud** |
| --- | --- |
| Cliente | Cliente selezionato da Fatture in Cloud. |
| Una o più voci raggruppate | Una riga commerciale; per impostazione iniziale ogni voce genera una riga separata. |
| Prodotto | Identificativo e impostazioni correnti del prodotto “Consulenza”. |
| Nome riga | Sempre “Consulenza”. |
| Descrizione riga | Nomi delle voci comprese, nell'ordine del preventivo, separati da “ + ”; modificabile nell'anteprima senza alterare il preventivo. |
| Quantità | 1. |
| Prezzo netto | Prezzo scelto della voce oppure somma dei prezzi scelti delle voci raggruppate. |
| Sottovoci interne | Non esportate automaticamente. |
| Spese interne | Mai esportate come righe autonome. |
| Provvigione | Non esportata automaticamente. |

Ogni riga deve avere una descrizione non vuota e ogni voce selezionata deve comparire in un solo gruppo. Cash invia i prezzi già arrotondati al centesimo e lascia a Fatture in Cloud il calcolo dei totali fiscali secondo il prodotto e l'azienda configurati.

Prima dell'invio Cash valida cliente, prodotto, prezzi, descrizioni, autorizzazioni e risposta dei dati preliminari richiesti da Fatture in Cloud. Cliente e prodotto devono appartenere alla stessa azienda configurata; un cliente proveniente da un'altra azienda richiede una nuova selezione e un nuovo snapshot. Se una validazione fallisce non viene creato alcun documento.

Dopo le validazioni e prima della richiesta remota, Cash salva atomicamente nel preventivo un tentativo di esportazione con UUID, azienda, data/ora, righe definitive e impronta del payload. La richiesta viene inviata soltanto se questo salvataggio riesce. In caso di successo Cash completa il tentativo con l'identificativo del documento remoto e la data/ora della risposta.

Una risposta remota definitivamente negativa, per esempio un errore di validazione o autorizzazione ricevuto dal servizio, completa il tentativo con codice ed errore e non viene considerata un possibile documento creato; dopo aver corretto la causa l'utente può avviare un nuovo tentativo.

Se la richiesta ha esito di rete incerto dopo l'invio, oppure la risposta ha avuto successo ma non è possibile salvarla localmente, Cash non ripete automaticamente l'operazione: conserva il tentativo come “esito esportazione da verificare”, mantiene in memoria gli eventuali dati di risposta non salvati e chiede all'utente di controllare Fatture in Cloud. Un tentativo persistito senza identificativo remoto viene trattato allo stesso modo anche dopo un riavvio, pur potendo essere stato interrotto prima dell'invio. Se il preventivo è già stato esportato o contiene un tentativo da verificare, una nuova esportazione resta possibile solo dopo verifica e conferma esplicita, per evitare duplicati.

L'esportazione è un'azione: non assegna uno stato al preventivo, non lo blocca e non ne impedisce modifiche successive.

## 21. Flussi utente principali

### 21.1 Configurazione iniziale

**1.** Creare o aprire il file dati nella cartella “Il mio Drive” configurata in modalità mirroring.

**2.** In **Impostazioni → Profilo fiscale**, scegliere l'anno, configurare codice ATECO, coefficiente di redditività, aliquota Gestione Separata, massimale, fase nei/oltre i primi cinque periodi, aliquote sostitutive e soglie; verificare l'anteprima e confermare il profilo.

**3.** Inserire il Fatturato obiettivo annuo, le Spese specifiche annue previste e verificare netto fiscale stimato, disponibile stimato e Fatturato da generare con il tempo.

**4.** Inserire i costi aziendali medi mensili.

**5.** Configurare ore giornaliere, ferie, malattia/imprevisti, percentuale dedicabile ai lavori ed eventuali festività locali.

**6.** Visualizzare ore disponibili e valore medio da generare.

**7.** Configurare regione/provincia autonoma di riferimento ed eventuali veicoli; Cash deriva la modalità MIMIT supportata dal carburante.

**8.** Configurare la velocità media di trasferta se si vuole il calcolo automatico del tempo di viaggio.

**9.** Creare i Clienti e le Sedi riutilizzabili necessarie e, quando serve, associare una Sede a un Cliente e indicarne la distanza di sola andata dalla sede/laboratorio di riferimento.

**10.** Lasciare Fatture in Cloud disattivato oppure, soltanto se desiderato, completare la procedura guidata in **Impostazioni → Integrazioni**. La configurazione non è richiesta per terminare l'avvio né per usare le funzioni locali.

### 21.2 Creazione del catalogo

**1.** Creare eventuali sottovoci riutilizzabili con valori predefiniti.

**2.** Creare un template con una o più voci principali.

**3.** Per ciascuna voce, aggiungere sottovoci dal catalogo o crearle direttamente.

**4.** Impostare eventuale prezzo di riferimento e mese/anno.

**5.** Creare eventuali gruppi di varianti, opzioni, sottovoci prodotte dalle opzioni ed eventuali default.

### 21.3 Creazione di un preventivo

**1.** Confermare la data proposta, selezionare o creare il Profilo economico annuale coerente e, facoltativamente, selezionare un Cliente locale. Se Fatture in Cloud è attivo si può invece cercare un cliente remoto. Cash ne copia sorgente, identificativi, denominazione e partita IVA nello snapshot; il cliente può essere omesso finché non viene richiesta un'esportazione.

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

**13.** Se l'integrazione è attiva, eventualmente raggruppare/esportare le voci verso Fatture in Cloud; se il cliente è locale, selezionare e confermare prima il corrispondente cliente remoto senza abbinamenti automatici.

**14.** Verificare l'indicatore “Salvato” prima di chiudere Cash o cambiare postazione.

### 21.4 Riapertura di un preventivo

**1.** Mostrare il preventivo con gli input storici con cui è stato costruito.

**2.** Consentire modifiche manuali alle voci e sottovoci.

**3.** Consentire il cambio di variante, con warning se vengono sostituite o rimosse sottovoci generate dal gruppo e modificate manualmente.

**4.** Consentire l'azione esplicita “Aggiorna con valori correnti”.

**5.** Eseguire l'aggiornamento in modo atomico: se un dato necessario non è disponibile, non modificare nulla.

### 21.5 Passaggio a un'altra postazione

**1.** Chiudere Cash sulla prima postazione dopo che l'indicatore mostra “Salvato”.

**2.** Attendere che Google Drive for Desktop segnali il completamento della sincronizzazione.

**3.** Sulla seconda postazione attendere a sua volta il completamento della sincronizzazione, quindi aprire lo stesso file dati.

**4.** Se l'integrazione condivisa è attiva ma la postazione non possiede il token, configurarlo localmente prima di usare funzioni live; nessun token viene trasferito da Drive e l'assenza del token non blocca le funzioni locali.

L'uso contemporaneo dello stesso file su più postazioni non è supportato.

### 21.6 Assenza di ciclo di vita commerciale

Cash non gestisce stati del preventivo. Non esistono stati come Bozza, Inviato, Accettato, Rifiutato o Scaduto. Un preventivo salvato resta modificabile.

Cash non gestisce workflow di approvazione, accettazione, scadenza o validità commerciale e non assegna una propria numerazione commerciale ai preventivi. L'esportazione verso Fatture in Cloud non modifica questo comportamento.

## 22. Modello dati concettuale

Il modello seguente descrive concetti funzionali e relazioni, senza imporre tabelle, classi o architettura.

| **Concetto** | **Contenuto / relazione principale** |
| --- | --- |
| Profilo economico | Anno, revisione, fatturato obiettivo, Spese specifiche annue previste, profilo fiscale forfettario configurato e confermato, disponibilità lavorativa, festività locali e velocità media di trasferta. |
| Costo aziendale | Categoria, descrizione, importo mensile. |
| Veicolo | Carburante, modalità MIMIT derivata, consumo con unità, km annui medi, assicurazione, bollo, manutenzione e costo chilometrico derivato. |
| Cliente locale | UUID, denominazione/ragione sociale obbligatoria e partita IVA facoltativa; anagrafica minimale persistita nel file dati. |
| Snapshot cliente | Sorgente `locale` o `fatture_in_cloud`, identificativi pertinenti, denominazione/ragione sociale e partita IVA disponibile; copia indipendente dall'origine. |
| Sede | Luogo locale riutilizzabile con nome, indirizzo, cliente opzionale e distanza di sola andata dalla sede/laboratorio di riferimento. |
| Catalogo | Contiene sottovoci riutilizzabili e template. |
| Sottovoce catalogo | Tipo Tempo / Spesa / Trasferta con valori predefiniti pertinenti. |
| Template | Contiene una o più voci principali riutilizzabili. |
| Voce template | Nome, eventuale prezzo di riferimento con mese/anno, sottovoci e gruppi di varianti. |
| Gruppo variante | Nome, opzioni, zero/una opzione predefinita; ogni opzione produce zero o più sottovoci gestite esclusivamente dal proprio gruppo. |
| Preventivo | Data, riferimento e snapshot del Profilo economico annuale, eventuale snapshot cliente, eventuale Sede principale, insieme di voci, eventuale provvigione e valori economici usati. Non ha stato commerciale. |
| Voce preventivo | Copia indipendente di una voce template o voce creata manualmente; prezzo scelto, risultati di calcolo e Tempo stimato derivato. |
| Sottovoce preventivo | Elemento Tempo / Spesa / Trasferta, copiato o creato manualmente e modificabile liberamente nei limiti delle regole delle varianti. |
| Configurazione Fatture in Cloud | Stato attivo/disattivo e riferimenti non segreti di azienda, prodotto e ultima verifica; il token resta fuori dal file dati. |
| File dati | Versione schema, revisione, data/ora ultima modifica e raccolte di impostazioni, profili, costi, Clienti locali, veicoli, Sedi, catalogo e preventivi. |
| Riferimento esportazione | UUID del tentativo, azienda, data/ora, righe e impronta del payload, eventuale identificativo documento Fatture in Cloud ed esito da verificare; non è uno stato commerciale. |

Relazione logica:

- Profilo economico → determina Valore medio da generare.

- Cliente locale o riferimento Fatture in Cloud → può avere zero o più Sedi locali associate in Cash; una Sede può anche non avere cliente.

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

Ogni entità persistente possiede un identificatore UUID immutabile, una data/ora di creazione e una data/ora di ultima modifica in formato ISO 8601 UTC. I riferimenti interni usano gli UUID, non nomi o posizioni nell'elenco. L'eliminazione di un elemento generale già usato non modifica gli snapshot dei preventivi; viene bloccata soltanto se esistono riferimenti vivi nel catalogo o nella configurazione corrente che diventerebbero invalidi.

## 23. Regole, validazioni ed errori

| **Regola** | **Comportamento** |
| --- | --- |
| Fatturato obiettivo | Deve essere maggiore di zero per calcolare il valore medio da generare. È il totale annuo fiscalmente rilevante pianificato. |
| Spese specifiche annue previste | Importo annuo non negativo e inferiore al Fatturato obiettivo; la differenza deve essere positiva per calcolare il valore medio da generare. |
| Ore disponibili per lavori | Devono essere maggiori di zero; in caso contrario il valore medio non è calcolabile. |
| Costi aziendali | Importi mensili non negativi. |
| Ore lavorative al giorno | Maggiori di zero e non superiori a 24. |
| Profilo fiscale | Anno, un solo codice ATECO, coefficiente, aliquota Gestione Separata e aliquote sostitutive maggiori di 0% e non superiori a 100%, massimale positivo, fase dell'attività e soglie positive e coerenti sono obbligatori; la soglia di cessazione deve essere maggiore di quella ordinaria. Il profilo deve essere confermato prima delle proiezioni fiscali. |
| Fase agevolata | Richiede la conferma esplicita dei requisiti; senza conferma il profilo resta Da verificare e non calcola indicatori fiscali. Cash non deriva il diritto all'agevolazione dalla sola data di inizio attività. |
| Profilo del preventivo | Un solo Profilo economico annuale; obbligatorio per i calcoli. Un anno diverso da quello della data richiede conferma esplicita. |
| Ferie e imprevisti | Interi non negativi; la loro somma non può superare i giorni lavorativi teorici. |
| Km annui veicolo | Devono essere maggiori di zero per distribuire i costi annuali sul costo/km. |
| Carburante veicolo | Per il calcolo automatico deve appartenere alle combinazioni del dataset regionale MIMIT: Benzina/Gasolio SELF oppure GPL/Metano SERVITO. |
| Consumo veicolo | Deve essere maggiore di zero e avere un'unità compatibile con il prezzo MIMIT richiesto. |
| Velocità media di trasferta | Deve essere maggiore di zero per il calcolo automatico del tempo; se assente, nessuna velocità viene assunta. |
| Distanza Sede | Non negativa; deve essere disponibile quando la Sede è usata per un calcolo di Trasferta. |
| Occorrenze trasferta | Intero positivo; default 1. |
| Tempo manuale trasferta | Se utilizzato come override, deve essere maggiore di zero. |
| Sottovoce Tempo | Durata maggiore di zero. Una sottovoce Tempo con durata zero non è valida. |
| Voce principale | Deve contenere almeno una sottovoce che produca tempo e il Tempo stimato derivato deve essere maggiore di zero. |
| Sottovoce Spesa | Importo non negativo. |
| Contenuto di catalogo | I campi intrinseci devono essere validi. Una Trasferta riutilizzabile può omettere Sede e veicolo secondo la regola di copia, ma conserva una modalità temporale valida. |
| Template | Deve contenere almeno una voce; ogni voce deve contenere almeno una sottovoce Tempo o Trasferta. I riferimenti contestuali esclusi dalle Trasferte vengono richiesti dopo l'inserimento nel preventivo. Le modifiche alle copie non alterano l'origine e viceversa. |
| Prezzo di riferimento | Non negativo; mese/anno obbligatorio se il prezzo è presente e non successivo all'ultimo mese FOI pubblicato. |
| Prezzo scelto | Non negativo; può essere inferiore al valore teorico o alle spese. È obbligatorio per l'esportazione. |
| Provvigione | Facoltativa; se presente, importo in euro non negativo. Non entra nei calcoli del preventivo. |
| Sede | Nome e indirizzo non vuoti; distanza non negativa se presente. |
| Cliente locale | Denominazione/ragione sociale non vuota; partita IVA facoltativa, ma validata formalmente se presente. |
| Costi annuali del veicolo | Assicurazione, bollo e manutenzione non negativi. La UI ricorda di non duplicarli nei Costi aziendali. |
| Cambio variante | Un gruppo sostituisce solo le sottovoci prodotte dalle proprie opzioni; warning obbligatorio prima di perdere modifiche manuali su tali sottovoci. |
| Inflazione | Valore di confronto; non modifica automaticamente il prezzo scelto. |
| Aggiornamento valori correnti | Solo su azione esplicita dell'utente; mai automatico in apertura; operazione atomica. |
| Fallback | Vietati: un dato necessario mancante o una sorgente non disponibile producono un errore esplicito. |
| File dati | JSON, identificativo e struttura devono essere validi. Uno schema più nuovo viene aperto soltanto in lettura; uno precedente richiede la migrazione prevista. Una revisione incoerente blocca il salvataggio. |
| Fatture in Cloud | Se disattivato, non esegue chiamate e non richiede token, azienda, cliente o prodotto. Se attivo, token locale, azienda, prodotto e permessi devono essere validi per la specifica operazione live; per esportare serve anche un cliente remoto della stessa azienda. |

### 23.1 Nessun fallback

La regola di assenza di fallback vale in tutto il prodotto. Sono vietati comportamenti silenziosi che sostituiscono un dato necessario con un valore precedente, presunto, alternativo o “ragionevole”.

Esempi:

| **Situazione** | **Comportamento corretto** | **Comportamento vietato** |
| --- | --- | --- |
| Fonte carburante non disponibile | Mostrare errore e rendere non disponibile il calcolo che richiede il dato. | Usare una copia locale precedente come se fosse il dato ufficiale corrente. |
| Fatture in Cloud non disponibile | Mostrare errore per l'operazione live richiesta. | Mostrare una vecchia lista cache come se fosse corrente. |
| Fatture in Cloud disattivato | Usare normalmente Clienti locali e funzioni locali; spiegare perché ricerca ed esportazione non sono disponibili. | Tentare chiamate remote o bloccare la preventivazione. |
| Velocità media non configurata | Segnalare che il tempo automatico non è calcolabile; l'utente può inserire esplicitamente il tempo manuale. | Assumere automaticamente 50 km/h o altro valore. |
| Distanza della Sede non disponibile | Mostrare errore per la Trasferta che richiede la distanza. | Assumere 0 km o una distanza precedente non appartenente allo snapshot. |
| Dato non valido | Mostrare l'errore sul dato. | Sostituirlo con un default non scelto dall'utente. |
| File dati non leggibile | Bloccare l'apertura e offrire la selezione esplicita della copia di sicurezza. | Caricare automaticamente la copia di sicurezza o dati locali. |
| Revisione cambiata su disco | Bloccare il salvataggio e offrire una copia di recupero delle modifiche locali. | Sovrascrivere o fondere automaticamente. |
| Profilo fiscale di un nuovo anno non confermato | Bloccare i calcoli dipendenti e chiedere la conferma dei parametri. | Riutilizzare silenziosamente l'anno precedente. |

Non sono fallback: valori predefiniti esplicitamente configurati, snapshot storici del preventivo, modifiche manuali e override espliciti.

### 23.2 Aggiornamenti atomici

Ogni esecuzione di “Aggiorna con valori correnti” deve produrre un unico esito: successo completo oppure nessuna modifica. Cash non deve lasciare un preventivo aggiornato solo in parte.

Anche le operazioni composte sul catalogo, il cambio di variante e l'esportazione devono validare integralmente i dati prima di modificare lo stato locale. Un errore deve identificare campo o sorgente, operazione fallita e azione richiesta all'utente.

### 23.3 Utente, autenticazione e permessi

Cash è concepito inizialmente come strumento monoutente. Non sono previsti utenti multipli, ruoli o autorizzazioni.

L'autenticazione applicativa non è un requisito dell'MVP. Cash opera in un contesto locale e fidato senza login, account o sessioni proprie. L'autorizzazione a Fatture in Cloud è una credenziale dell'integrazione esterna e non introduce utenti o ruoli Cash.

### 23.4 Modifica ed eliminazione di dati già usati

La modifica di profili, costi, Clienti locali, veicoli, Sedi, sottovoci di catalogo o template vale soltanto per utilizzi futuri. I preventivi esistenti restano invariati finché l'utente non modifica direttamente il preventivo o esegue “Aggiorna con valori correnti”.

L'eliminazione è consentita quando non lascia riferimenti vivi invalidi. Se l'elemento è usato da template o configurazioni correnti, Cash elenca i riferimenti e blocca l'eliminazione. Gli snapshot dei preventivi non sono riferimenti vivi: conservano copie autonome e non impediscono l'eliminazione dell'origine.

### 23.5 Obbligatorietà per fase

Un preventivo può essere salvato mentre è incompleto, anche senza cliente, purché il file dati resti strutturalmente valido. Gli errori di completezza sono visibili e bloccano solo le operazioni che richiedono il calcolo o l'esportazione. Per calcolare una voce servono almeno una sottovoce che produca tempo, Tempo stimato maggiore di zero e Valore medio da generare valido. Gli indicatori complessivi non possono ignorare voci non calcolabili; quelli dipendenti dal prezzo richiedono il Prezzo scelto per tutte le voci considerate. Per esportare servono inoltre modulo Fatture in Cloud attivo, collegamento valido sulla postazione, cliente remoto appartenente all'azienda configurata e prezzo scelto per ogni voce selezionata. Nessuno di tali requisiti esterni è necessario per il normale uso locale.

## 24. Esecuzione locale e architettura vincolante

### 24.1 Forma dell'applicazione

Cash è un client desktop locale per Windows con interfaccia realizzata in HTML, CSS e JavaScript. Il pacchetto include il motore di visualizzazione necessario oppure usa il WebView di sistema. Un host nativo incorporato espone alla sola interfaccia le funzioni minime per filesystem, credenziali e rete; non è un processo server e non è raggiungibile tramite HTTP. Cash non avvia un server HTTP, non apre porte locali e non richiede Node.js, Python, PHP, un database o container installati dall'utente.

Il client desktop è necessario per garantire accesso affidabile al file dati e salvataggi atomici; quando il modulo Fatture in Cloud è attivo garantisce anche custodia delle credenziali nel sistema operativo e chiamate alle API. Una pagina aperta direttamente con `file://` non è il runtime canonico dell'MVP: non offre le garanzie richieste sul file e l'API Fatture in Cloud non espone gli header CORS necessari alle chiamate dal browser; non è lecito introdurre un proxy server.

Il frontend può essere sviluppato come un'unica applicazione HTML/JavaScript semplice. HTMX non viene incluso nell'MVP perché il prodotto non riceve frammenti HTML da un server e il suo impiego non risolverebbe filesystem, credenziali o CORS. Un'eventuale introduzione futura richiede un caso d'uso locale verificabile e una nuova decisione architetturale; non può simulare un backend tramite `hx-get`, `hx-post` o richieste equivalenti verso file locali.

### 24.2 Rete e funzionamento offline

L'host nativo del client esegue richieste HTTPS soltanto verso gli endpoint ufficiali necessari di ISTAT, MIMIT e, se l'integrazione è attiva, Fatture in Cloud; restituisce all'interfaccia dati strutturati validati. La WebView non chiama direttamente tali API e non riceve accesso generico alla rete o al filesystem. Cash non usa proxy, servizi intermedi o API proprietarie di Cash. Google Drive viene usato tramite il normale filesystem sincronizzato da Drive for Desktop; Cash non richiede Google Drive API né OAuth Google.

Senza connessione internet l'utente può aprire e modificare profili, Clienti locali, Sedi, catalogo e preventivi già salvati. Sono bloccate, con errore esplicito, le sole operazioni che richiedono dati live: acquisizione di nuovi indici FOI o prezzi carburante e, quando il modulo è attivo, ricerca clienti remoti, verifica prodotto ed esportazione Fatture in Cloud. Gli snapshot esistenti restano consultabili e ricalcolabili con i propri dati storici.

### 24.3 Aggiornamenti del client e compatibilità dati

Ogni versione del client dichiara le versioni di schema dati che può leggere e scrivere. Se il file usa uno schema più nuovo, Cash lo apre in sola lettura e richiede l'aggiornamento del client. Se serve una migrazione da uno schema precedente, Cash mostra cosa verrà aggiornato, crea una copia di sicurezza e applica la migrazione atomicamente solo dopo conferma esplicita.

Quando uno schema precedente non contiene lo stato esplicito dell'integrazione, la migrazione imposta Fatture in Cloud su `Disattivata` e conserva gli eventuali riferimenti non segreti esistenti per una futura riattivazione esplicita. Non trasforma automaticamente snapshot remoti in Clienti locali.

Non è ammesso che due versioni diverse del client scrivano contemporaneamente lo stesso file.

## 25. Persistenza e utilizzo tramite Google Drive

### 25.1 File canonico

Tutti i dati funzionali sono conservati in un unico file UTF-8 denominato per impostazione iniziale `Cash.data.json`. Il nome può essere scelto dall'utente alla creazione ma deve terminare con `.json`. Il file contiene almeno:

- `schemaVersion`;
- `documentId` UUID immutabile;
- `revision` intera crescente, inizialmente 1;
- `createdAt` e `updatedAt` in ISO 8601 UTC;
- impostazioni condivise;
- profili economici e fiscali annuali;
- costi aziendali, Clienti locali, veicoli e Sedi;
- catalogo e template;
- preventivi e relativi snapshot;
- riferimenti non segreti alle esportazioni.

Importi, aliquote, coefficienti, distanze e consumi sono serializzati come stringhe decimali con punto come separatore e unità definita dallo schema. Durate e occorrenze sono interi. Il file contiene l'anagrafica funzionale dei Clienti locali, ma non token, password, cache dell'anagrafica remota o copie nascoste di dati live.

Il file dati è l'unica fonte canonica. All'avvio Cash apre l'ultimo percorso usato sulla postazione se ancora disponibile; in caso contrario chiede di selezionare esplicitamente il file o di crearne uno nuovo. Non crea automaticamente un archivio vuoto quando il file atteso manca.

### 25.2 Google Drive for Desktop

Il file dati e la sua copia di sicurezza devono risiedere in una cartella di “Il mio Drive” sincronizzata da Google Drive for Desktop in modalità **Mirror files / Duplica file**. La modalità mirroring è il modello supportato dall'MVP perché mantiene una copia locale standard anche quando Drive for Desktop non è in esecuzione. La modalità streaming non è supportata come configurazione canonica; marcarne semplicemente il file come disponibile offline non equivale alla garanzia richiesta per salvataggi frequenti.

Google Drive sincronizza file, non esegue l'applicazione e non ospita Cash come sito web. Il client può essere installato su ciascuna postazione; solo i dati vengono sincronizzati.

### 25.3 Salvataggio atomico

Cash salva automaticamente dopo ogni operazione logica completata, serializzando le scritture in modo che ne esista al massimo una in corso. La UI mostra sempre uno dei seguenti stati: `Modifiche non salvate`, `Salvataggio`, `Salvato`, `Errore di salvataggio`, `Conflitto esterno`.

All'apertura Cash conserva in memoria l'impronta SHA-256 dei byte del file insieme a `documentId` e `revision`. Per un file già esistente, prima di ogni sostituzione:

1. rilegge e valida intestazione, `documentId`, `revision` e impronta del file su disco;
2. verifica che coincidano con identificativo, revisione e impronta caricati;
3. costruisce integralmente il nuovo documento in memoria, incrementando `revision` di uno;
4. copia l'ultima versione valida in `<nome-base>.backup.json` nella stessa cartella; con il nome predefinito `Cash.data.json` la copia è `Cash.data.backup.json`;
5. scrive il nuovo contenuto in un file temporaneo nella stessa cartella, lo chiude e ne verifica JSON, schema e identificativo;
6. sostituisce atomicamente il file principale, quindi lo rilegge e ne verifica revisione e contenuto.

Alla creazione iniziale, quando non esiste una versione precedente, Cash genera `documentId` e revisione 1, scrive e valida il file temporaneo e lo sposta atomicamente sul percorso scelto senza creare una copia di sicurezza vuota. Se nel frattempo compare un file nel percorso di destinazione, la creazione viene bloccata. La prima copia di sicurezza nasce al primo salvataggio successivo.

Se uno dei passaggi fallisce, Cash non considera salvata la modifica e mantiene in memoria la versione locale non salvata. Non tronca né sostituisce il file principale con contenuto parziale. La chiusura dell'applicazione con modifiche non salvate richiede una scelta esplicita fra riprovare, salvare una copia di recupero in un percorso scelto dall'utente o annullare le modifiche e chiudere. Una copia di recupero delle modifiche locali nasce come archivio indipendente con nuovo `documentId`, revisione 1 e gli stessi UUID delle entità contenute.

La copia `<nome-base>.backup.json` conserva esclusivamente l'ultima versione valida precedente. Non viene caricata automaticamente: il ripristino è sempre un'azione esplicita e, prima di sostituire il file principale, Cash conserva entrambi i file con nomi datati. Il ripristino crea una nuova linea canonica con un nuovo `documentId`, revisione 1 e gli stessi UUID delle entità recuperate; in questo modo le altre postazioni rilevano esplicitamente la sostituzione dell'archivio invece di confonderla con una revisione successiva. Dopo il ripristino l'utente deve attendere la sincronizzazione e riaprire il nuovo archivio sulle altre postazioni. L'utente può inoltre creare in qualsiasi momento un'esportazione di sicurezza con data e ora nel nome.

### 25.4 Modifiche esterne e conflitti

Cash verifica `documentId`, `revision` e impronta quando la finestra torna in primo piano, prima di ogni salvataggio e almeno ogni 30 secondi mentre il file è aperto. Se il `documentId` è invariato e la revisione su disco è maggiore di quella caricata:

- senza modifiche locali, ricarica il file dopo aver informato l'utente;
- con modifiche locali, blocca ogni sovrascrittura e offre di salvare le modifiche locali come copia di recupero oppure di scartarle e ricaricare;
- non fonde record, non sceglie automaticamente una versione e non usa il timestamp come criterio di verità.

Una revisione su disco inferiore a quella caricata, oppure la stessa revisione con un'impronta diversa, è un conflitto anomalo e non viene mai ricaricata automaticamente, anche in assenza di modifiche locali. Cash blocca la scrittura e offre confronto, selezione esplicita o copia di recupero.

Se il percorso contiene invece un `documentId` diverso, Cash considera che il file sia stato sostituito con un altro archivio: blocca salvataggi e ricaricamenti automatici e chiede di scegliere esplicitamente se aprire il nuovo archivio, ritrovare quello originario o salvare una copia di recupero delle modifiche locali.

Se Google Drive crea due file con nomi diversi a seguito di un conflitto, Cash li tratta come due archivi distinti. Può mostrarne `documentId`, revisione, ultima modifica e conteggi principali per aiutare il confronto, ma l'utente deve scegliere esplicitamente quale mantenere. Prima di sostituire o archiviare una copia, entrambe vengono conservate con nomi distinti.

### 25.5 Uso sequenziale fra postazioni

La collaborazione simultanea non è supportata. Per passare a un'altra postazione l'utente deve chiudere Cash dopo lo stato `Salvato`, attendere il completamento della sincronizzazione Drive sulla prima postazione, quindi attendere il completamento sulla seconda prima di aprire il file.

Il controllo di revisione protegge dai conflitti già sincronizzati, ma non può rendere sicure due sessioni contemporanee che lavorano offline o prima che Drive abbia propagato i cambiamenti. Questa limitazione deve essere mostrata nella configurazione iniziale e nella guida al cambio postazione.

### 25.6 Dati locali non sincronizzati

La singola postazione può conservare localmente soltanto:

- percorso dell'ultimo file aperto;
- dimensione e posizione della finestra e preferenze puramente visive;
- token Fatture in Cloud nel gestore credenziali del sistema operativo;
- identificativo casuale della postazione usato nei messaggi diagnostici.

Nessun dato economico, cliente, catalogo o preventivo può esistere soltanto in una cache locale dopo che la UI indica `Salvato`.

## 26. Impostazioni

Le impostazioni esistono solo per preferenze o dati realmente variabili. Sono divise fra condivise nel file dati e locali alla postazione. Le aree principali sono **Profilo fiscale**, **Pianificazione annuale**, **Trasferte e carburanti**, **Clienti** e **Integrazioni**.

### 26.1 Profilo fiscale

La pagina mostra l'elenco dei profili annuali e consente di crearli, duplicarli esplicitamente, modificarli e confermarli. Il modulo guidato espone all'utente tutti i valori che partecipano al calcolo:

- anno fiscale e codice ATECO;

- coefficiente di redditività;

- aliquota e massimale della Gestione Separata;

- fase dell'attività: nei primi cinque periodi con agevolazione spettante oppure oltre i primi cinque periodi/agevolazione non spettante;

- aliquota sostitutiva agevolata e ordinaria;

- soglia ordinaria e soglia di cessazione nell'anno.

La selezione della fase evidenzia l'aliquota effettiva. In fase agevolata compare la conferma obbligatoria dei requisiti. Il riepilogo mostra formule, valori intermedi e risultati sul Fatturato obiettivo corrente. L'azione **Conferma profilo** resta distinta da **Salva come Da verificare**.

| **Impostazione condivisa** | **Regola** |
| --- | --- |
| Profilo economico/fiscale per anno | Contiene obiettivo, codice ATECO, coefficiente, aliquota e massimale Gestione Separata, fase dell'attività, aliquote sostitutive, soglie fiscali e disponibilità; deve essere confermato per produrre proiezioni fiscali. |
| Spese specifiche annue previste | Importo annuo non negativo e inferiore al Fatturato obiettivo; valore iniziale 0. |
| Ore lavorative al giorno | Maggiori di zero e non superiori a 24. |
| Ferie e malattia/imprevisti | Giorni interi non negativi. |
| Percentuale dedicabile ai lavori | Maggiore di 0% e non superiore a 100%. |
| Festività locali | Elenco facoltativo di date ricorrenti o specifiche per anno. |
| Velocità media di trasferta | Opzionale; maggiore di zero se si usa il tempo automatico. |
| Regione/provincia autonoma carburante | Obbligatoria per i calcoli che usano veicoli. |
| Integrazione Fatture in Cloud | `Disattivata` per impostazione iniziale oppure `Attiva`; non condiziona le funzioni locali. |
| Azienda Fatture in Cloud | Identificativo e nome non segreti; richiesti soltanto per completare l'attivazione. |
| Prodotto “Consulenza” | Identificativo e nome non segreti; richiesti soltanto per completare l'attivazione e verificati live prima dell'invio. |
| Ultima verifica Fatture in Cloud | Data/ora e risultato non segreti dell'ultima verifica; dato diagnostico, non autorizza l'uso di valori remoti obsoleti. |

| **Impostazione locale** | **Regola** |
| --- | --- |
| Token Fatture in Cloud | Facoltativo; richiesto sulla singola postazione soltanto per le funzioni live quando l'integrazione è attiva. Custodito nel gestore credenziali del sistema operativo, mai in Drive. |
| Ultimo file dati | Solo scorciatoia di apertura; se manca viene chiesta una selezione. |
| Preferenze finestra/tema | Non influenzano dati o calcoli. |

### 26.2 Configurazione Fatture in Cloud

La scheda dell'integrazione mostra sempre uno stato comprensibile:

| **Stato** | **Significato** |
| --- | --- |
| Disattivata | Nessuna chiamata al servizio; Cash usa Clienti locali e non mostra azioni live. |
| Richiede configurazione locale | Il file condiviso indica l'integrazione attiva, ma sulla postazione manca o non è valido il token. Le funzioni locali restano disponibili. |
| Attiva | Token verificato sulla postazione, azienda e prodotto selezionati, permessi minimi presenti. |
| Errore collegamento | L'ultima verifica è fallita; sono bloccate solo le funzioni live e viene mostrata l'azione correttiva. |

L'attivazione viene salvata come `Attiva` soltanto dopo il completamento riuscito della procedura guidata; annullarla lascia la configurazione precedente invariata. Cambiare azienda invalida il prodotto selezionato e richiede una nuova selezione. Disattivare e rimuovere il collegamento hanno gli effetti distinti descritti nella sezione 20.1.

### 26.3 Clienti locali

La pagina consente di creare, modificare, cercare ed eliminare l'anagrafica minimale. Un Cliente locale è condiviso nel file dati e non richiede internet né Fatture in Cloud. L'eliminazione non altera gli snapshot dei preventivi; se il Cliente è ancora referenziato direttamente da una Sede, Cash elenca le Sedi coinvolte e richiede prima di rimuovere o sostituire quei riferimenti vivi.

Non sono configurabili: formule economiche, regola di snapshot, atomicità, divieto di fallback, precisione degli arrotondamenti, tipi di sottovoce, indipendenza delle copie e modello monoutente sequenziale.

## 27. Fuori scope

- ERP e gestione amministrativa completa.

- Costo della vita e obiettivi personali di spesa.

- Time tracking e consuntivazione dei lavori.

- Project management, pianificazione di giornate o visite e gestione commesse.

- CRM completo.

- Contabilità e importazione dei costi aziendali da Fatture in Cloud.

- Simulatore fiscale universale per tutti i regimi e professioni.

- Regimi fiscali diversi dal forfettario e gestioni previdenziali diverse dalla Gestione Separata.

- Proiezioni fiscali con più attività ATECO appartenenti a gruppi con coefficienti di redditività diversi.

- Sincronizzazione bidirezionale o importazione massiva dell'anagrafica Fatture in Cloud.

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

- Uso simultaneo o collaborazione multi-postazione sullo stesso file dati.

- Fusione automatica di file o conflitti Google Drive.

- Hosting dell'applicazione su Google Drive o uso di Google Drive come server web.

- Google Drive API, database cloud o sincronizzazione applicativa proprietaria.

- Versioni browser-only che dipendono da `file://` per chiamare API esterne o salvare dati.

- Server locali, proxy CORS, servizi residenti in ascolto e backend remoti di Cash.

## 28. Decisioni ancora aperte

Non rimangono decisioni funzionali o tecniche bloccanti per l'MVP.

I seguenti sono dati di configurazione che l'utente deve fornire quando pertinenti, non decisioni di prodotto: parametri e conferma del profilo fiscale forfettario annuale, festività locale, regione/provincia autonoma per il carburante e percorso del file dati. Token, azienda e prodotto “Consulenza” sono richiesti soltanto se l'utente sceglie di attivare Fatture in Cloud.

## 29. Criteri di accettazione dell'MVP

L'MVP è funzionalmente coerente con questa specifica quando consente almeno quanto segue:

**1.** Impostare Fatturato obiettivo e Spese specifiche annue previste, quindi visualizzare immediatamente Fatturato da generare con il tempo, netto fiscale stimato, costi aziendali annui e disponibile stimato.

**2.** Configurare dalle Impostazioni un profilo annuale esclusivamente forfettario con anno, ATECO, coefficiente di redditività, aliquota e massimale Gestione Separata, fase nei/oltre i primi cinque periodi, aliquote sostitutive e soglie; proporre il preset 2026, mostrare l'anteprima, richiedere le conferme previste e bloccare le proiezioni finché il profilo non è confermato.

**3.** Inserire costi aziendali tramite categoria, descrizione e importo mensile.

**4.** Calcolare giorni/ore disponibili dal calendario italiano dell'anno, incluse le festività nazionali applicabili e le festività locali configurate, senza doppi conteggi con i weekend.

**5.** Associare esplicitamente ogni preventivo a un solo Profilo economico annuale e calcolare il valore medio da generare senza cambiare profilo quando cambia la data.

**6.** Configurare almeno un veicolo e ricavarne il costo chilometrico usando il dato giornaliero MIMIT più recente pubblicato per territorio e carburante, derivando la modalità ufficiale SELF/SERVITO e mostrando la data di riferimento.

**7.** Creare Sedi riutilizzabili con nome, indirizzo, cliente opzionale e distanza di sola andata dalla sede/laboratorio di riferimento.

**8.** Usare una Sede come riferimento della Trasferta senza modellare Partenza e Destinazione separate.

**9.** Quando il preventivo ha una Sede, proporla come Sede della Trasferta e permettere all'utente di sostituirla per la singola Trasferta.

**10.** Calcolare la distanza effettiva della Trasferta dai km della Sede, A/R e numero di occorrenze previste.

**11.** Calcolare il tempo di Trasferta dalla velocità media configurata e permettere un override manuale per singola occorrenza.

**12.** Calcolare il costo della Trasferta dalla distanza effettiva e dal costo veicolo/km.

**13.** Non usare alcun servizio di routing, mappe, traffico o geolocalizzazione.

**14.** Permettere di salvare un preventivo senza cliente, con un Cliente locale oppure con un cliente selezionato live da Fatture in Cloud; conservarne sorgente, identificativi e dati leggibili nello snapshot senza dipendere successivamente dall'origine.

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

**29.** Calcolare tempo, spese, valore teorico, prezzo totale, resa e scostamento per il preventivo complessivo senza omettere voci incomplete e indicando quali impediscono ciascun totale.

**30.** Mostrare un eventuale prezzo di riferimento e il relativo valore aggiornato con indice ISTAT FOI mensile senza tabacchi, salvando periodi, basi e raccordi usati.

**31.** Permettere all'utente di scegliere liberamente il prezzo finale.

**32.** Calcolare resa prevista, scostamento dall'obiettivo e tempo massimo coerente.

**33.** Registrare un eventuale importo di provvigione fuori dal corpo del preventivo e senza effetti sui calcoli.

**34.** Conservare gli input storici e il Profilo economico annuale del preventivo e non aggiornarli o sostituirli automaticamente.

**35.** Offrire un'azione esplicita “Aggiorna con valori correnti” che aggiorni, quando pertinenti, valore medio da generare, costo veicolo/km, distanza corrente della Sede, tempo automatico di Trasferta e rivalutazione per inflazione.

**36.** Mantenere invariato il tempo di Trasferta quando è presente un override manuale.

**37.** Eseguire “Aggiorna con valori correnti” atomicamente: in caso di errore o dato necessario mancante, non modificare alcun valore del preventivo.

**38.** Con integrazione attiva, mostrare l'anteprima e raggruppare/esportare le voci verso Fatture in Cloud usando cliente remoto e prodotto “Consulenza” verificati nella stessa azienda, descrizioni modificabili e quantità 1, senza esportare automaticamente sottovoci, Spese o provvigione; per un Cliente locale richiedere una selezione remota esplicita senza abbinamenti automatici.

**39.** In assenza di un dato o di una sorgente necessari, mostrare un errore esplicito senza utilizzare fallback automatici.

**40.** Funzionare come client desktop monoutente con host nativo incorporato e interfaccia HTML/CSS/JavaScript, senza login Cash, server applicativo, servizio su porta locale, database server o proxy CORS.

**41.** Non introdurre stati, workflow commerciale o numerazione propria dei preventivi; un preventivo salvato resta modificabile anche dopo l'esportazione.

**42.** Conservare tutti i dati funzionali, inclusa l'anagrafica dei Clienti locali, in un unico file JSON UTF-8 versionato, senza credenziali o cache dell'anagrafica remota.

**43.** Salvare automaticamente ogni operazione logica con scrittura temporanea, validazione, sostituzione atomica e incremento della revisione.

**44.** Creare prima di ogni sostituzione una copia di sicurezza dell'ultima versione valida e non ripristinarla mai automaticamente.

**45.** Bloccare il salvataggio se identificativo, revisione o impronta del file su disco non coincidono con quelli caricati, senza sovrascrittura o fusione automatica, e permettere di salvare una copia di recupero.

**46.** Mostrare sempre lo stato di salvataggio e impedire una chiusura silenziosa con modifiche non salvate.

**47.** Usare Google Drive for Desktop in modalità mirroring come trasporto del file fra postazioni e documentare il passaggio sequenziale con attesa della sincronizzazione.

**48.** Conservare il token Fatture in Cloud solo nel gestore credenziali locale del sistema operativo, richiedere una configurazione separata su ogni postazione e rimuoverlo soltanto tramite l'azione esplicita “Rimuovi collegamento”.

**49.** Persistire il tentativo prima dell'invio, gestire un esito remoto o locale incerto senza ritentare automaticamente e avvertire prima di riesportare un preventivo già esportato o con esito da verificare.

**50.** Salvare sempre come nuovo template il contenuto proveniente da un preventivo, tramite anteprima esplicita e copiando solo i dati definiti; le Trasferte riutilizzabili non contengono Sedi, veicoli o valori automatici derivati, ma conservano i minuti per occorrenza se manuali.

**51.** Applicare le regole di precisione e arrotondamento definite, producendo totali uguali alla somma dei componenti monetari visibili.

**52.** Bloccare l'apertura in scrittura di uno schema dati più nuovo e migrare uno schema precedente soltanto con backup, conferma e operazione atomica.

**53.** Consentire l'uso offline di profili, Clienti locali, Sedi, catalogo e preventivi e bloccare selettivamente soltanto le operazioni che richiedono ISTAT, MIMIT o, se attivo, Fatture in Cloud.

**54.** Non includere HTMX nell'MVP e non usarlo per simulare un backend, caricare file locali o aggirare i vincoli CORS.

**55.** Avviare Cash con Fatture in Cloud disattivato, senza richiedere token, azienda o prodotto, e consentire in tale stato l'intero ciclo locale di creazione, calcolo, salvataggio, riapertura e modifica dei preventivi.

**56.** Consentire dalle Impostazioni di attivare Fatture in Cloud con una procedura guidata, visualizzare lo stato per postazione, disattivarlo senza perdere la configurazione e rimuovere esplicitamente collegamento e credenziali senza alterare i dati storici.

**57.** Creare, cercare, modificare ed eliminare Clienti locali con denominazione obbligatoria e partita IVA facoltativa, anche copiando esplicitamente dati da uno snapshot Fatture in Cloud, senza unioni automatiche e rispettando riferimenti vivi delle Sedi e indipendenza degli snapshot dei preventivi.

## 30. Fonti normative e tecniche

Verifica effettuata l'8 settembre 2026. Le fonti sono riferimenti di progettazione; il file dati salva sempre i valori effettivamente usati nei calcoli.

- **Fiscalità 2026:** INPS, [Circolare n. 8 del 3 febbraio 2026](https://www.inps.it/it/it/inps-comunica/atti/circolari-messaggi-e-normativa/dettaglio.circolari-e-messaggi.2026.02.circolare-numero-8-del-03-02-2026_15153.html), per aliquota e massimale della Gestione Separata; Agenzia delle Entrate, [quadro LM](https://infoprecompilata.agenziaentrate.gov.it/portale/quadro-lm) e [istruzioni Redditi PF 2026 - Fascicolo 3](https://infoprecompilata.agenziaentrate.gov.it/portale/documents/d/guest/pf3_istruzioni_2026.pdf), per regime forfettario, principio di cassa, coefficienti collegati al codice ATECO, soglie e imposta sostitutiva; ISTAT, [classificazione ATECO 2025](https://www.istat.it/classificazione/ateco-2025/), per il codice dell'attività. I parametri restano espliciti e devono essere confermati dall'utente per l'anno applicato.

- **Inflazione:** ISTAT, [Indice dei prezzi al consumo per le rivalutazioni monetarie](https://www.istat.it/notizia/indice-dei-prezzi-per-le-rivalutazioni-monetarie/) e servizio [Rivalutazioni](https://www.istat.it/dati/calcolatori/rivalutazioni/), indice FOI generale nazionale senza tabacchi e coefficienti di raccordo ufficiali.

- **Carburanti:** MIMIT, [Prezzi medi dei carburanti](https://www.mimit.gov.it/it/prezzo-medio-carburanti) e [Osservaprezzi carburanti](https://www.mimit.gov.it/it/mercato-e-consumatori/prezzi/mercati-dei-carburanti/osservatorio-carburanti).

- **Festività:** Presidenza del Consiglio dei ministri, [Festività e giornate nazionali](https://presidenza.governo.it/ufficio_cerimoniale/cerimoniale/giornate.html), e [Legge 8 ottobre 2025, n. 151](https://www.normattiva.it/atto/caricaDettaglioAtto?atto.codiceRedazionale=25G00153&atto.dataPubblicazioneGazzetta=2025-10-10&tipoDettaglio=multivigenza), in vigore dal 1° gennaio 2026 per il 4 ottobre.

- **Google Drive:** Google, [Stream & mirror files with Drive for desktop](https://support.google.com/drive/answer/13401938?hl=en). Drive è usato come sincronizzatore di normali file locali. Il precedente hosting web di Drive è stato [discontinuato nel 2016](https://workspaceupdates.googleblog.com/2015/08/deprecating-web-hosting-support-in.html).

- **File locali nel browser:** Chrome for Developers, [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access), e W3C, [Secure Contexts](https://www.w3.org/TR/secure-contexts/). L'API richiede un contesto sicuro e un gesto utente e non offre una base portabile sufficiente per l'intero prodotto.

- **HTMX:** [documentazione ufficiale](https://htmx.org/docs/). Le funzioni centrali inviano richieste HTTP e si aspettano risposte HTML; senza server non costituiscono il modello applicativo di Cash.

- **Fatture in Cloud:** documentazione ufficiale su [autenticazione](https://developers.fattureincloud.it/docs/basics/authentication/), [autenticazione manuale](https://developers.fattureincloud.it/docs/authentication/manual-authentication/) e [scope](https://developers.fattureincloud.it/docs/basics/scopes/). Il 7 settembre 2026 una verifica tecnica delle richieste preflight agli endpoint API con origini `file://`, HTTPS e localhost non ha restituito `Access-Control-Allow-Origin`; pertanto le chiamate vengono eseguite dal client desktop e non dal contesto browser.

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

→ Profilo forfettario annuale configurato + costi aziendali → netto/disponibile stimato

→ Fatturato obiettivo - Spese specifiche annue previste → fatturato da generare con il tempo

→ Calendario + ferie + imprevisti + % dedicabile → ore disponibili per lavori

→ Fatturato da generare con il tempo / ore disponibili → valore medio da generare

→ Preventivo → voci → sottovoci Tempo / Spesa / Trasferta

→ Trasferte: Sede + distanza configurata sulla Sede + A/R + occorrenze + veicolo + tempo automatico/manuale

→ Tempo stimato derivato dalle sottovoci + spese previste → valore teorico

→ Confronto con prezzo di riferimento e rivalutazione per inflazione

→ Prezzo scelto dall'utente

→ Resa prevista + scostamento + tempo massimo coerente

→ Aggregazione delle voci → analisi complessiva del preventivo

→ Eventuale provvigione registrata separatamente, senza effetti sui calcoli

→ Eventuale aggiornamento atomico con valori correnti

→ Eventuale raggruppamento/esportazione verso Fatture in Cloud, solo se l'integrazione è attiva
