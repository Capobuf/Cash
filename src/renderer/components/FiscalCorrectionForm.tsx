import { useState, type FormEvent } from 'react';
import { d, money } from '../../domain/decimal';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { decimalInputValue, moneyInputValue } from '@/lib/format';

export function FiscalCorrectionForm({
  year,
  total,
  disabled,
  onSave,
}: {
  year: number;
  total?: string;
  disabled?: boolean;
  onSave: (total: string | undefined) => boolean;
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
    } catch {
      setError(
        'Inserisci un totale non negativo, con al massimo due decimali. Per tornare al calcolo automatico usa «Torna alla stima».',
      );
    }
  };
  return (
    <details
      className="rounded-lg border p-4"
      open={total !== undefined ? true : undefined}
    >
      <summary className="cursor-pointer font-medium">
        Correzione con il prospetto del commercialista
      </summary>
      <div
        id="fiscal-correction-help"
        className="mt-3 space-y-3 text-sm text-muted-foreground"
      >
        <p>
          Inserisci il <strong>totale da versare nel {year}</strong>,
          comprensivo di quanto hai già pagato nell’anno. Questo importo
          sostituisce la stima nel calcolo del residuo: Cash sottrae già i
          movimenti {year} della categoria di sistema Imposte P.IVA.
        </p>
        <p>
          <strong>Includi:</strong> saldo imposta e saldo INPS {year - 1}, primo
          e secondo acconto {year}. Se previsti, includi anche bollo e
          maggiorazioni/interessi relativi a questi versamenti, purché i
          relativi pagamenti siano nella stessa categoria.
        </p>
        <p>
          <strong>Non sommare due volte:</strong> usa il totale del prospetto
          oppure la somma delle rate effettive. Non aggiungere le colonne I, II,
          III… al totale della stessa voce. Il secondo acconto va incluso se è
          esposto separatamente e non è già nel totale.
        </p>
        <p>
          <strong>Escludi:</strong> compenso del commercialista, altri tributi
          personali o estranei all’attività, versamenti previsti per altri anni
          e vecchi acconti già scomputati dal saldo. Anche i pagamenti estranei
          vanno esclusi dalla categoria Imposte P.IVA.
        </p>
        <p>
          <strong>Bollo e crediti:</strong> il bollo della stima non viene
          aggiunto automaticamente alla correzione; includilo una sola volta se
          pertinente. Usa gli importi da addebitare dopo le compensazioni già
          applicate nel prospetto, senza sottrarre di nuovo quei crediti.
        </p>
        <p>
          Se il documento riporta soltanto il residuo da pagare, aggiungi i
          versamenti dell’anno già effettuati e presenti in Cash. Se il totale
          annuale da versare è zero, inserisci 0; l’eventuale credito non va
          inserito come importo negativo.
        </p>
        <p>
          La stima segue gli incassi; la correzione segue i versamenti del
          prospetto. Non modifica aliquote, contributi deducibili o movimenti e
          non viene copiata negli anni successivi.
        </p>
      </div>
      <form className="mt-4 space-y-3" onSubmit={submit} noValidate>
        <fieldset disabled={disabled} className="space-y-3">
          <Field className="max-w-sm">
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
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Applica totale annuale</Button>
            {total !== undefined ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!onSave(undefined))
                    setError(
                      'Correzione non rimossa. Verifica lo stato dell’archivio.',
                    );
                }}
              >
                Torna alla stima
              </Button>
            ) : null}
          </div>
        </fieldset>
      </form>
    </details>
  );
}
