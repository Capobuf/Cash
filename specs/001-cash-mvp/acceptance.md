# Accettazione — Cash v0.6

## Matrice

| Area | Criterio | Evidenza |
|---|---|---|
| Clienti | Nessuna anagrafica locale; selezione e snapshot FIC | schema, viste Clienti/Preventivi, test export |
| Sedi | Più Sedi per Cliente e Altre sedi | modello e viste risorse |
| Localizzazione | Cerca esplicito per indirizzo o `lon, lat`; scelta multipla | editor Sede, test ORS |
| Coerenza | Modifica input invalida posizione precedente | helper dominio e test unitario |
| ORS | API key sicura, verifica reale, errori distinti | credentials, adapter, IPC, Impostazioni |
| Default | Una Partenza globale e un Veicolo globale, entrambi facoltativi | settings, helper, UI e schema |
| Trasferta | Sottovoce facoltativa con Partenza/Destinazione/Veicolo | editor e modello |
| Routing | Un solo percorso di andata; A/R applicato una volta | adapter e `valuesFromRoute` |
| Manuale | Distanza e tempo indipendenti; conferma prima del ricalcolo | editor Trasferta |
| Totali | Occorrenze e costo applicati una volta | calcoli e test unitari |
| Snapshot | Modifiche correnti non retroattive | snapshot e test refresh |
| Refresh | Nessuna chiamata ORS; rinnovo solo dati previsti | `refreshQuote` e test con sorgenti ristrette |
| Offline | Errore esplicito, valori esistenti conservati, nessun fallback | adapter/controller |
| Migrazione | Dati ambigui bloccati prima della scrittura | persistence e test integrazione |
| UX | Nessuna pagina Trasferte, mappa o stato permanente “verificato” | struttura renderer |

## Gate automatici

- TypeScript senza errori.
- ESLint senza errori.
- Suite Vitest completa verde, incluse unit, integration, security e performance.
- Build renderer/native completata.
- Ricerca dei riferimenti legacy limitata alla logica/test di migrazione storica.
