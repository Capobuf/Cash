# Quickstart di verifica — v0.6

## Preparazione

```powershell
npm install
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

## Scenario manuale essenziale

1. Crea o apri un archivio schema 4.
2. In Impostazioni inserisci una API key ORS e usa “Verifica connessione”. Controlla esito positivo e casi chiave errata/rete/rate limit.
3. Crea una Sede indipendente incollando le coordinate nel formato Google Maps `latitudine, longitudine`; premi “Cerca”.
4. Crea una Sede Cliente da un risultato FIC, inserisci un indirizzo, premi “Cerca” e scegli uno dei risultati.
5. Modifica l’input di una Sede già risolta e verifica che il routing chieda una nuova ricerca.
6. Imposta una Sede di partenza e un Veicolo predefiniti; verifica che la nuova scelta sostituisca la precedente.
7. Crea un Preventivo e una sottovoce Trasferta: controlla precompilazioni, A/R attivo e Occorrenze `1`.
8. Premi “Calcola percorso”; verifica Distanza A/R e Tempo A/R, quindi modifica un solo valore manualmente.
9. Premi “Ricalcola percorso”, annulla la conferma e verifica che entrambi i valori restino invariati.
10. Disconnetti la rete: verifica errore esplicito, nessun fallback e possibilità di continuare la modifica manuale.
11. Usa “Aggiorna con valori correnti” e verifica che percorso, snapshot di Sedi e valori manuali non cambino.

## Migrazione

Apri un archivio 1–3. Se contiene `oneWayKm`, Clienti locali o Trasferte legacy, l’anteprima deve mostrare blocker e la migrazione deve lasciare il file intatto. Per dati deterministici, conferma e verifica la copia `.backup.json` e lo schema 4.
