# Costituzione del progetto Cash

## I. Specifica canonica

`Cash_Specifica_Funzionale_v0.6.md` prevale su codice e artefatti derivati. Una decisione non definita non viene inventata; un conflitto realmente bloccante richiede una scelta esplicita.

## II. Dominio deterministico

Formule monetarie e temporali usano aritmetica decimale e arrotondamenti espliciti. Nessun fallback può essere presentato come dato reale. A/R e Occorrenze devono essere applicati una sola volta.

## III. Local-first e persistenza sicura

Il documento JSON è validato e versionato. Scritture e migrazioni sono atomiche, con concorrenza ottimistica e backup. Trasformazioni semantiche ambigue vengono bloccate prima della scrittura.

## IV. Snapshot non retroattivi

I Preventivi fotografano i dati usati. Modifiche a Sedi, coordinate, Veicoli, default o risposte future delle fonti non alterano record già salvati. Gli aggiornamenti avvengono solo tramite azioni esplicite e nel perimetro previsto.

## V. Confini esterni minimi

MIMIT, ISTAT, Fatture in Cloud e OpenRouteService sono chiamati dal processo native su endpoint HTTPS allowlistati. Token e API key restano nel Credential Manager e non compaiono in archivio, log o messaggi d’errore.

## VI. Clienti, Sedi e routing

I Clienti sono esclusivamente Fatture in Cloud. Le Sedi Cash possono essere associate o indipendenti. ORS è l’unico provider di geocodifica e routing; le richieste partono solo da azioni esplicite. Non sono ammessi mappe, distanza in linea d’aria, velocità media o provider alternativi.

## VII. UI proporzionata

Si riusano pattern e componenti shadcn esistenti. Le Trasferte restano sottovoci facoltative; non si crea una sezione autonoma. Feedback ed errori sono locali all’azione e comprensibili.

## VIII. Qualità verificabile

Ogni modifica di dominio include test mirati e simulazione delle integrazioni al confine di rete. Typecheck, lint, test e build costituiscono il gate prima della consegna.

**Versione:** 1.1.0

**Ratificata:** 2026-09-13

**Ultima modifica:** 2026-09-13
