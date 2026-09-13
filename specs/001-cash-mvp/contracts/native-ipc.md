# Contratto IPC native — schema 4

Il preload espone solo funzioni tipizzate; `contextIsolation` resta attivo. Token e API key vengono risolti nel processo native e non sono restituiti al renderer.

## OpenRouteService

- `ors.hasApiKey() -> Result<boolean>`
- `ors.setApiKey(apiKey) -> Result<void>`
- `ors.verify() -> Result<void>`
- `ors.searchAddress(address) -> Result<GeocodingResult[]>`
- `ors.reverseCoordinates({ longitude, latitude }) -> Result<GeocodingResult[]>`
- `ors.route({ departure, destination }) -> Result<RouteResult>`

`GeocodingResult` contiene `id`, etichetta e coordinate normalizzate. `RouteResult` contiene distanza in metri e durata in secondi come stringhe decimali. L’adapter classifica credenziali non valide, indisponibilità di rete, rate limit e risposta non valida senza includere la chiave.

## Altri confini

- Archivio: create/open/openLast/save/recovery/restore/inspect con token di concorrenza.
- Credential Manager: token FIC e API key ORS gestiti da funzioni distinte.
- MIMIT e ISTAT: risultati normalizzati con evidenza della fonte.
- FIC: attivazione, Clienti, dettaglio, prodotto Consulenza ed esportazione deliberata.

## Regole

- Solo endpoint HTTPS allowlistati.
- Nessuna chiamata ORS implicita dal caricamento, refresh o digitazione.
- Un errore IPC è un `CashError` azionabile; non abilita fallback.
