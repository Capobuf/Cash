# Cash Template Pack v1

`cash-template-pack` è il formato JSON esterno per importare Template utente nel Catalogo. È indipendente dalla versione dell’archivio Cash e non contiene identità o metadati interni.

## Struttura

Il documento radice contiene esattamente:

- `format`: valore letterale `"cash-template-pack"`;
- `formatVersion`: valore letterale `1`;
- `templates`: array non vuoto di Template.

Un Template contiene `name` (stringa non vuota) e `items` (array non vuoto). I nomi dei Template devono essere univoci nel pack ignorando maiuscole/minuscole e spazi esterni.

Una voce contiene esattamente:

- `name`: stringa non vuota;
- `referencePrice`, facoltativo, con `amount` decimale non negativo in formato stringa (massimo 2 decimali) e `period` nel formato `YYYY-MM`;
- `subItems`: array obbligatorio;
- `variantGroups`: array obbligatorio.

Ogni voce deve contenere almeno un elemento `time` o `travel`, tra gli elementi sempre inclusi oppure in almeno un’opzione variante.

Un gruppo variante contiene `name`, `options` (almeno una) e l’eventuale `defaultOption`, che deve coincidere esattamente con il nome di un’opzione. I nomi dei gruppi nella stessa voce e i nomi delle opzioni nello stesso gruppo devono essere univoci ignorando maiuscole/minuscole e spazi esterni. Un’opzione contiene `name` e `subItems`, che può essere vuoto; “Nessuna” non ha un significato speciale.

Le sole definizioni ammesse sono:

```json
{ "kind": "time", "description": "Attività", "minutes": 30 }
{ "kind": "expense", "description": "Materiale", "amount": "12.50" }
{ "kind": "travel", "description": "Trasferta", "roundTrip": true, "occurrences": 1, "distanceKmPerOccurrence": "25.0", "travelMinutesPerOccurrence": 35 }
```

`description` è una stringa non vuota. `minutes`, `occurrences` e `travelMinutesPerOccurrence` sono interi maggiori di zero. `amount` è una stringa decimale non negativa con massimo 2 decimali; `distanceKmPerOccurrence` è una stringa decimale non negativa con massimo 1 decimale. I due valori per occorrenza della Trasferta sono facoltativi.

Tutti gli oggetti sono strict: qualsiasi campo non documentato rende invalido l’intero pack. In particolare non sono ammessi `id`, `createdAt`, `updatedAt` o `defaultOptionId`. L’importazione genera nuove identità Cash e converte `defaultOption` nel riferimento interno alla nuova opzione.

## Esempio valido

```json
{
  "format": "cash-template-pack",
  "formatVersion": 1,
  "templates": [
    {
      "name": "Configurazione server",
      "items": [
        {
          "name": "Installazione server",
          "referencePrice": { "amount": "250.00", "period": "2026-09" },
          "subItems": [
            { "kind": "time", "description": "Preparazione", "minutes": 30 }
          ],
          "variantGroups": [
            {
              "name": "Configurazione RAID",
              "defaultOption": "Media",
              "options": [
                { "name": "Nessuna", "subItems": [] },
                { "name": "Base", "subItems": [{ "kind": "time", "description": "RAID base", "minutes": 10 }] },
                { "name": "Media", "subItems": [{ "kind": "time", "description": "RAID media", "minutes": 30 }] },
                { "name": "Avanzata", "subItems": [{ "kind": "time", "description": "RAID avanzata", "minutes": 60 }] }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```
