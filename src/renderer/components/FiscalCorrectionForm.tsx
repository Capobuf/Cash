import { useState, type FormEvent } from 'react';
import { d, money } from '../../domain/decimal';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { decimalInputValue, moneyInputValue } from '@/lib/format';

export function FiscalCorrectionForm({
  year,
  total,
  disabled,
  onSave,
  onSaved,
  onCancel,
}: {
  year: number;
  total?: string;
  disabled?: boolean;
  onSave: (total: string | undefined) => boolean;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(moneyInputValue(total));
  const [error, setError] = useState<string>();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    try {
      const amount = d(decimalInputValue(value));
      if (!amount.isFinite() || amount.lt(0) || amount.decimalPlaces() > 2)
        throw new Error();
      if (!onSave(money(amount))) {
        setError('Correzione non salvata. Verifica lo stato dell’archivio.');
        return;
      }
      setError(undefined);
      onSaved?.();
    } catch {
      setError(
        'Inserisci un totale non negativo, con al massimo due decimali. Per rimuovere il totale usa «Rimuovi totale annuale».',
      );
    }
  };
  return (
    <form className="contents" onSubmit={submit} noValidate>
      <div className="min-h-0 space-y-4 overflow-y-auto px-1 pb-1">
        <div
          id="fiscal-correction-help"
          className="space-y-3 text-sm text-muted-foreground"
        >
          <p>
            Inserisci il <strong>totale da versare nel {year}</strong>,
            comprensivo di quanto hai già pagato nell’anno. Questo importo
            abilita «Ancora da versare» e «Disponibilità stimata»: Cash sottrae
            i movimenti {year} della categoria di sistema Imposte P.IVA dal
            totale annuale.
          </p>
          <p>
            <strong>Includi:</strong> saldo imposta e saldo INPS {year - 1},
            primo e secondo acconto {year}. Se previsti, includi anche bollo e
            maggiorazioni/interessi relativi a questi versamenti, purché i
            relativi pagamenti siano nella stessa categoria.
          </p>
          <p>
            <strong>Non sommare due volte:</strong> usa il totale del prospetto
            oppure la somma delle rate effettive. Non aggiungere le colonne I,
            II, III… al totale della stessa voce. Il secondo acconto va incluso
            se è esposto separatamente e non è già nel totale.
          </p>
          <p>
            <strong>Escludi:</strong> compenso del commercialista, altri tributi
            personali o estranei all’attività, versamenti previsti per altri
            anni e vecchi acconti già scomputati dal saldo. Anche i pagamenti
            estranei vanno esclusi dalla categoria Imposte P.IVA.
          </p>
          <p>
            <strong>Bollo e crediti:</strong> il bollo della stima non viene
            aggiunto automaticamente alla correzione; includilo una sola volta
            se pertinente. Usa gli importi da addebitare dopo le compensazioni
            già applicate nel prospetto, senza sottrarre di nuovo quei crediti.
          </p>
          <p>
            Se il documento riporta soltanto il residuo da pagare, aggiungi i
            versamenti dell’anno già effettuati e presenti in Cash. Se il totale
            annuale da versare è zero, inserisci 0; l’eventuale credito non va
            inserito come importo negativo.
          </p>
          <p>
            La stima segue gli incassi; la correzione segue i versamenti del
            prospetto. Non modifica aliquote, contributi deducibili o movimenti
            e non viene copiata negli anni successivi.
          </p>
        </div>
        <fieldset disabled={disabled} className="space-y-3">
          <Field>
            <FieldLabel htmlFor="fiscal-correction-total">
              Totale annuale del commercialista · {year} (€)
            </FieldLabel>
            <Input
              id="fiscal-correction-total"
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError(undefined);
              }}
              inputMode="decimal"
              placeholder="Es. 12.582,66"
              aria-describedby="fiscal-correction-help"
              aria-invalid={Boolean(error)}
            />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </fieldset>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annulla
        </Button>
        {total !== undefined ? (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              if (!onSave(undefined)) {
                setError(
                  'Correzione non rimossa. Verifica lo stato dell’archivio.',
                );
                return;
              }
              setError(undefined);
              onSaved?.();
            }}
          >
            Rimuovi totale annuale
          </Button>
        ) : null}
        <Button type="submit" disabled={disabled}>
          Applica totale annuale
        </Button>
      </DialogFooter>
    </form>
  );
}
