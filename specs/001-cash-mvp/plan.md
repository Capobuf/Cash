# Piano tecnico — allineamento v0.6

## Architettura

Si mantiene l’architettura Electron esistente:

- `src/domain`: modello, schema Zod, formule, snapshot e regole pure;
- `src/native`: archivio, credenziali OS e adapter di rete allowlistati;
- `src/shared`: contratto IPC ristretto e tipizzato;
- `src/renderer`: UI React/shadcn e orchestrazione delle azioni esplicite.

## Decisioni

1. Portare l’archivio a schema 4, senza dipendenze nuove.
2. Eliminare l’anagrafica Cliente locale; riferimenti e snapshot Cliente sono FIC.
3. Modellare la posizione risolta separatamente dall’input della Sede per riconoscere modifiche incoerenti.
4. Salvare i due default globali come riferimenti nelle impostazioni, non come flag duplicati sulle entità.
5. Modellare la Trasferta con due snapshot di Sede e valori per occorrenza già comprensivi dell’eventuale A/R.
6. Incapsulare ORS nel processo native; il renderer non riceve mai la API key.
7. Separare routing esplicito da aggiornamento economico del Preventivo.
8. Bloccare migrazioni semantiche ambigue prima di qualunque scrittura.

## Sequenza implementativa

1. Modello/schema/migrazione.
2. Adapter ORS, Credential Manager e IPC.
3. Sedi e impostazioni globali.
4. Editor Trasferta e formule.
5. Snapshot/refresh/catalogo.
6. Test di dominio, rete simulata, persistenza e regressione.
7. Typecheck, lint, test, build e verifica dei riferimenti obsoleti.

## Vincoli di sicurezza e UX

- Network solo da native verso host allowlistati HTTPS.
- Chiavi non archiviate nel documento e mai incluse negli errori.
- Nessuna richiesta durante la digitazione.
- I fallimenti non cancellano valori validi presenti.
- Azioni distruttive o di sovrascrittura richiedono conferma.
