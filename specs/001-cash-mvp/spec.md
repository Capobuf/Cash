# Specifica tecnica attiva — Cash MVP

**Fonte autorevole:** `Cash_Specifica_Funzionale_v0.6.md`

**Schema persistente:** 4

**Stato:** implementato

Questo documento traduce la v0.6 in requisiti tecnici verificabili senza duplicarne il testo.

## Ambito

- Applicazione desktop locale-first con archivio JSON condivisibile, salvataggio atomico, backup e controllo concorrenza.
- Profili economici annuali, costi aziendali, Veicoli, Sedi, catalogo, Preventivi e integrazione facoltativa Fatture in Cloud.
- I Clienti provengono esclusivamente da Fatture in Cloud; Cash non mantiene un’anagrafica Cliente locale.
- Le Sedi possono appartenere a un Cliente FIC o essere indipendenti in “Altre sedi”.
- OpenRouteService è l’unico provider di geocodifica, reverse geocoding e routing stradale.

## Requisiti funzionali

1. Una Sede conserva nome, indirizzo facoltativo, riferimento Cliente FIC facoltativo e posizione risolta con coordinate e input di origine.
2. La posizione viene risolta solo con l’azione esplicita “Cerca”. Per indirizzi con più risultati l’utente sceglie; l’input manuale delle coordinate usa il formato Google Maps `latitudine, longitudine`, convertito internamente nell’ordine richiesto da OpenRouteService.
3. Modificare l’input di origine invalida immediatamente l’utilizzabilità della posizione precedente, senza introdurre uno stato permanente verificato/non verificato.
4. Le Impostazioni consentono di salvare in Credential Manager una API key ORS e verificarla con una richiesta autenticata reale.
5. Esistono al massimo una Sede di partenza globale predefinita e un Veicolo globale predefinito. Sono solo precompilazioni per nuove Trasferte.
6. Una Trasferta è una sottovoce facoltativa del Preventivo e contiene snapshot indipendenti di Partenza e Destinazione, snapshot/identità del Veicolo, A/R, Occorrenze, valori per occorrenza, origini manuale/percorso e totali.
7. La nuova Trasferta propone la partenza globale, la Sede principale/del Cliente come destinazione e il Veicolo globale, senza renderli vincoli.
8. “Calcola percorso” invia a ORS un solo percorso di andata. Cash applica il fattore A/R una sola volta e popola distanza e durata per occorrenza.
9. Distanza e tempo restano modificabili indipendentemente. “Ricalcola percorso” chiede conferma prima di sostituire valori esistenti; l’annullamento li conserva.
10. Nessuna chiamata ORS avviene durante la digitazione, al cambio Cliente, al salvataggio ordinario o con “Aggiorna con valori correnti”.
11. L’aggiornamento di un Preventivo rinnova profilo, FOI, dati economici del Veicolo e MIMIT; conserva snapshot di Sedi e valori del percorso.
12. Errori di credenziali, rete, rate limit e payload non valido sono distinti quando possibile e non attivano fallback.
13. Non sono ammessi distanza in linea d’aria, velocità media, provider alternativi, riuso silenzioso di percorsi o valori inventati.

## Formule normative

- `fattoreAR = A/R ? 2 : 1`
- `distanzaPerOccorrenzaKm = roundHalfUp(distanzaAndataMetri × fattoreAR / 1000, 1)`
- `tempoPerOccorrenzaMin = roundHalfUp(durataAndataSecondi × fattoreAR / 60, 0)`
- `distanzaTotaleKm = distanzaPerOccorrenzaKm × occorrenze`
- `tempoTotaleMin = tempoPerOccorrenzaMin × occorrenze`
- `costoTrasferta = distanzaTotaleKm × costoVeicoloPerKm`, arrotondato a centesimi

Il fattore A/R e le Occorrenze sono applicati una sola volta. Non sono consentiti arrotondamenti intermedi aggiuntivi.

## Compatibilità

Lo schema 4 rimuove `oneWayKm`, velocità media, Cliente locale e Trasferta a Sede singola. Migrazioni deterministiche restano automatiche. Se un archivio 1–3 contiene uno di questi dati ambigui, l’anteprima espone i blocker e la migrazione termina senza scrivere: nessun significato Partenza/Destinazione viene inventato.

## Criteri di accettazione essenziali

- Schema, UI, calcoli e test non usano il modello precedente.
- ORS usa autenticazione `Authorization`, coordinate `[longitudine, latitudine]`, metri e secondi.
- Le impostazioni globali sono uniche e non retroattive.
- Snapshot e valori manuali restano stabili finché l’utente non esegue un’azione esplicita.
- Non esistono pagina Trasferte autonoma, mappe o fallback.
