# Modello dati — schema 4

## Aggregato CashDocument

Contiene `settings`, Profili economici, Costi aziendali, Veicoli, Sedi, Catalogo e Preventivi. Non contiene Clienti locali.

## Impostazioni

`SharedSettings` conserva:

- `fuelTerritory?`;
- `defaultDepartureSiteId?`, riferimento a una sola Sede esistente;
- `defaultVehicleId?`, riferimento a un solo Veicolo esistente;
- configurazione condivisa FIC senza segreti.

API key ORS e token FIC risiedono nel Credential Manager della postazione.

## Sede

`Site` contiene metadati, `name`, `address?`, `client?: FicClientRef` e `location?: ResolvedLocation`.

`ResolvedLocation` contiene coordinate decimali, `inputKind` (`address` o `coordinates`) e `inputValue`. La posizione è utilizzabile solo se l’input corrente coincide con quello che l’ha prodotta.

`SiteSnapshot` contiene ID di origine, nome, indirizzo e coordinate. Le modifiche alla Sede corrente non aggiornano lo snapshot.

## Trasferta

`TravelSubItem` contiene:

- `departure?` e `destination?` come `SiteSnapshot`;
- `vehicleId?` e `vehicleName?`;
- `roundTrip`, `occurrences`;
- `distanceKmPerOccurrence?`, `travelMinutesPerOccurrence?`;
- origine indipendente di distanza e durata (`route` o `manual`);
- `totalDistanceKm?`, `totalMinutes?`, `vehicleCostPerKm?`, `totalCost?`, `fuelEvidence?`.

I campi facoltativi permettono di salvare una bozza, ma una Trasferta incompleta blocca l’analisi completa e l’esportazione. Catalogo e definizioni variante non conservano Sedi, Veicolo, evidenza carburante o risultato automatico; possono conservare solo valori manuali di partenza.

## Invarianti

- UUID e metadati immutabili secondo le regole esistenti.
- Al massimo un profilo per anno.
- I riferimenti default devono esistere.
- Coordinate entro longitudine ±180 e latitudine ±90, massimo 7 decimali.
- Occorrenze e minuti sono interi positivi; importi e distanze non negativi.
- I due valori per occorrenza e i relativi totali sono coerenti a coppie.
