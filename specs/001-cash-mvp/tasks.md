# Task — Cash MVP v0.6

## Fondazioni e dominio

- [x] T001 Conservare architettura Electron/React, componenti shadcn e confini native esistenti.
- [x] T002 Portare `CashDocument` e schema Zod alla versione 4.
- [x] T003 Rimuovere anagrafica Cliente locale, `oneWayKm` e velocità media dal modello operativo.
- [x] T004 Aggiungere coordinate, posizione risolta, snapshot Sede e Trasferta Partenza/Destinazione.
- [x] T005 Aggiungere default globali univoci per Sede di partenza e Veicolo.
- [x] T006 Implementare formule ORS/A-R/Occorrenze/costo senza doppi conteggi.

## Persistenza e compatibilità

- [x] T007 Aggiornare serializzazione, validazione e intestazione schema.
- [x] T008 Migrare automaticamente solo trasformazioni deterministiche.
- [x] T009 Bloccare prima della scrittura archivi con Clienti locali, `oneWayKm` o Trasferte legacy.
- [x] T010 Conservare backup atomico e file originale sui fallimenti.

## Integrazione OpenRouteService

- [x] T011 Conservare API key nel Credential Manager.
- [x] T012 Aggiungere host ORS alla allowlist HTTPS.
- [x] T013 Implementare forward/reverse geocoding con `Authorization` e coordinate lon/lat.
- [x] T014 Implementare Directions `driving-car`, distanza in metri e durata in secondi.
- [x] T015 Esporre IPC ristretto senza rendere leggibile la chiave al renderer.
- [x] T016 Distinguere autenticazione, rete, rate limit e payload non valido.

## UI e flussi

- [x] T017 Integrare configurazione e verifica reale ORS nelle Impostazioni.
- [x] T018 Integrare ricerca esplicita indirizzo/coordinate nell’editor Sede.
- [x] T019 Richiedere scelta per risultati multipli e invalidare la posizione dopo modifica input.
- [x] T020 Integrare i due default globali nelle viste Sedi e Veicoli.
- [x] T021 Aggiornare la Trasferta con Partenza, Destinazione, Veicolo, A/R e Occorrenze.
- [x] T022 Implementare Calcola/Ricalcola percorso esplicito e conferma di sovrascrittura.
- [x] T023 Lasciare distanza e tempo modificabili indipendentemente e disponibili offline.
- [x] T024 Conservare Trasferte come sole sottovoci facoltative, senza pagina o mappa.

## Snapshot, catalogo e refresh

- [x] T025 Fotografare Sedi, Veicolo, costo e valori percorso nel Preventivo.
- [x] T026 Rendere “Aggiorna con valori correnti” indipendente da ORS.
- [x] T027 Non propagare cambi di default o archivi alle Trasferte esistenti.
- [x] T028 Escludere Sedi, Veicolo e risultati automatici dalle copie di catalogo/template.

## Verifica

- [x] T029 Testare parsing coordinate, invalidazione e default globali.
- [x] T030 Testare adapter ORS al confine di rete senza chiave reale.
- [x] T031 Testare A/R, Occorrenze, costo, snapshot, refresh e assenza di fallback.
- [x] T032 Testare migrazione deterministica e blocco non distruttivo.
- [x] T033 Eseguire typecheck, lint, test e build.
