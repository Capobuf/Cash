import { useState, type FormEvent } from 'react';
import { parseDecimalInput } from '../../../domain/decimal';
import { parseDuration } from '../../../domain/duration';
import { type SubItemDefinition } from '../../../domain/model';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { formReader, hours, moneyInputValue } from '@/lib/format';

export function DefinitionDialog({
  value,
  initialKind,
  lockKind = false,
  onClose,
  onSave,
  onDelete,
}: {
  value?: SubItemDefinition;
  initialKind?: SubItemDefinition['kind'];
  lockKind?: boolean;
  onClose: () => void;
  onSave: (value: SubItemDefinition) => void;
  onDelete?: () => void;
}) {
  const [kind, setKind] = useState<SubItemDefinition['kind']>(
    value?.kind ?? initialKind ?? 'time',
  );
  const [durationError, setDurationError] = useState<string>();
  const [decimalError, setDecimalError] = useState<string>();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { data, get, money } = formReader(event.currentTarget);
    setDecimalError(undefined);
    if (kind === 'time') {
      const duration = parseDuration(get('minutes'));
      if (!duration.ok) {
        setDurationError(duration.error.message);
        return;
      }
      onSave({
        kind,
        description: get('description'),
        minutes: duration.value,
      });
    } else if (kind === 'expense') {
      const amount = parseDecimalInput(money('amount'), 2);
      if (!amount.ok) {
        setDecimalError(amount.error.message);
        return;
      }
      onSave({
        kind,
        description: get('description'),
        amount: amount.value,
      });
    } else {
      const distance = get('distance')
        ? parseDecimalInput(get('distance'), 1)
        : undefined;
      if (distance && !distance.ok) {
        setDecimalError(distance.error.message);
        return;
      }
      const minutes = get('travelMinutes');
      const duration = minutes ? parseDuration(minutes) : undefined;
      if (duration && !duration.ok) {
        setDurationError(duration.error.message);
        return;
      }
      onSave({
        kind,
        description: get('description'),
        roundTrip: data.get('roundTrip') === 'on',
        occurrences: Number(get('occurrences')),
        ...(distance?.ok
          ? {
              distanceKmPerOccurrence: distance.value,
            }
          : {}),
        ...(duration?.ok ? { travelMinutesPerOccurrence: duration.value } : {}),
      });
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>
              {value
                ? 'Modifica effetto'
                : kind === 'time'
                  ? 'Aggiungi attività'
                  : 'Aggiungi effetto'}
            </DialogTitle>
            {kind === 'travel' ? (
              <DialogDescription>
                Sedi, Veicolo e percorso verranno scelti quando il Template sarà
                usato.
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <FieldGroup>
            {decimalError ? (
              <FieldDescription role="alert" className="text-destructive">
                {decimalError}
              </FieldDescription>
            ) : null}
            {!lockKind && !value ? (
              <Field>
                <FieldLabel htmlFor="definition-kind">Tipo</FieldLabel>
                <NativeSelect
                  id="definition-kind"
                  value={kind}
                  onChange={(event) => {
                    setKind(event.target.value as SubItemDefinition['kind']);
                    setDurationError(undefined);
                  }}
                >
                  <NativeSelectOption value="time">Attività</NativeSelectOption>
                  <NativeSelectOption value="expense">Spesa</NativeSelectOption>
                  <NativeSelectOption value="travel">
                    Trasferta
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="definition-description">
                Descrizione
              </FieldLabel>
              <Input
                id="definition-description"
                name="description"
                defaultValue={value?.description}
                autoFocus
                required
              />
            </Field>
            {kind === 'time' ? (
              <Field>
                <FieldLabel htmlFor="definition-minutes">Durata</FieldLabel>
                <Input
                  id="definition-minutes"
                  name="minutes"
                  defaultValue={
                    value?.kind === 'time' ? hours(value.minutes) : ''
                  }
                  placeholder="es. 2h 30m"
                  onChange={() => setDurationError(undefined)}
                  required
                />
                {durationError ? (
                  <FieldDescription className="text-destructive">
                    {durationError}
                  </FieldDescription>
                ) : (
                  <FieldDescription>
                    Puoi usare minuti oppure ore e minuti.
                  </FieldDescription>
                )}
              </Field>
            ) : null}
            {kind === 'expense' ? (
              <Field>
                <FieldLabel htmlFor="definition-amount">Importo</FieldLabel>
                <Input
                  id="definition-amount"
                  name="amount"
                  defaultValue={
                    value?.kind === 'expense'
                      ? moneyInputValue(value.amount)
                      : ''
                  }
                  required
                />
              </Field>
            ) : null}
            {kind === 'travel' ? (
              <>
                <Field>
                  <FieldLabel htmlFor="definition-occurrences">
                    Occorrenze
                  </FieldLabel>
                  <Input
                    id="definition-occurrences"
                    name="occurrences"
                    type="number"
                    defaultValue={
                      value?.kind === 'travel' ? value.occurrences : 1
                    }
                    min={1}
                    required
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="definition-distance">
                      Distanza manuale/occ.
                    </FieldLabel>
                    <Input
                      id="definition-distance"
                      name="distance"
                      defaultValue={
                        value?.kind === 'travel'
                          ? value.distanceKmPerOccurrence
                          : ''
                      }
                      inputMode="decimal"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="definition-travel-minutes">
                      Tempo manuale/occ.
                    </FieldLabel>
                    <Input
                      id="definition-travel-minutes"
                      name="travelMinutes"
                      defaultValue={
                        value?.kind === 'travel' &&
                        value.travelMinutesPerOccurrence !== undefined
                          ? hours(value.travelMinutesPerOccurrence)
                          : ''
                      }
                      placeholder="es. 45m"
                      onChange={() => setDurationError(undefined)}
                    />
                    {durationError ? (
                      <FieldDescription className="text-destructive">
                        {durationError}
                      </FieldDescription>
                    ) : null}
                  </Field>
                </div>
                <Field orientation="horizontal">
                  <Checkbox
                    id="definition-roundtrip"
                    name="roundTrip"
                    defaultChecked={
                      value?.kind === 'travel' ? value.roundTrip : true
                    }
                  />
                  <FieldLabel htmlFor="definition-roundtrip">
                    Andata e ritorno
                  </FieldLabel>
                </Field>
              </>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            {onDelete ? (
              <Button
                type="button"
                variant="destructive"
                className="mr-auto"
                onClick={onDelete}
              >
                Elimina
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit">Conferma</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
