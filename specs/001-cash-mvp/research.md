# Ricerca tecnica — OpenRouteService

> Documento storico della fase MVP v0.6 / schema 4. Non descrive il prodotto corrente: per i requisiti attivi e lo schema 10 consultare la [specifica canonica v0.7](../../Cash_Specifica_Funzionale_v0.7.md).

## Decisione

OpenRouteService è l’unico provider per geocodifica, reverse geocoding e routing stradale.

## Contratto verificato

- Autenticazione tramite header HTTP `Authorization` contenente la API key; non HTTP Basic.
- Forward geocoding: `GET https://api.openrouteservice.org/geocode/search`, parametro `text`.
- Reverse geocoding: `GET https://api.openrouteservice.org/geocode/reverse`, parametri `point.lon` e `point.lat`.
- Routing: `POST https://api.openrouteservice.org/v2/directions/driving-car`, JSON `coordinates` nell’ordine `[longitudine, latitudine]`.
- Il riepilogo del percorso espone distanza in metri e durata in secondi.

Fonti ufficiali: documentazione API ORS Geocoder e Directions richiamata dalla specifica canonica.

## Scelte applicative

- Il processo native legge la chiave dal Credential Manager e costruisce la richiesta.
- Il renderer riceve solo risultati normalizzati o errori tipizzati.
- Timeout e allowlist HTTPS riusano l’infrastruttura di rete esistente.
- Una ricerca indirizzo può restituire più candidati; nessuno viene scelto implicitamente.
- Nessun caching usato come fallback e nessun provider alternativo.

## Alternative escluse

Distanza euclidea, stima da velocità media, secondo routing di ritorno, traffico, percorsi alternativi e geocodifica durante la digitazione non soddisfano la v0.6.
