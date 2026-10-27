import { siteOptions } from '@/lib/site-options';
import { SearchableSelect } from '@/components/ui/selection-field';
import { Route, Plus, ListChecks, ReceiptEuro, Check, X } from 'lucide-react';
import { quoteColumns } from './QuoteItemRow';
import { useState, type FormEvent } from 'react';
import {
  routeValuesRequireOverwriteConfirmation,
  valuesFromRoute,
} from '../../../domain/calculations';
import { parseDuration } from '../../../domain/duration';
import { parseDecimalInput } from '../../../domain/decimal';
import { siteHasUsableLocation } from '../../../domain/locations';
import {
  type CashDocument,
  type QuoteSubItem,
  type FicClientSnapshot,
} from '../../../domain/model';
import { SiteDialog, VehicleDialog } from '@/components/EntityDialogs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { formReader, hours, moneyInputValue } from '@/lib/format';
import type { TravelInput, SimpleSubInput } from '@/hooks/use-quote-controller';
import type { AppState } from '../../state';

export function SubItemDialog({
  sub,
  initialKind,
  doc,
  appState,
  defaultDestinationSiteId,
  client,
  initialDescription,
  onClose,
  onSaveSimple,
  onSaveTravel,
  inline = false,
  disabled = false,
}: {
  inline?: boolean;
  disabled?: boolean;
  sub?: QuoteSubItem;
  initialKind?: 'time' | 'expense' | 'travel';
  doc: CashDocument;
  appState: AppState;
  defaultDestinationSiteId?: string;
  client?: FicClientSnapshot;
  initialDescription?: string;
  onClose: () => void;
  onSaveSimple: (input: SimpleSubInput) => boolean;
  onSaveTravel: (input: TravelInput) => Promise<boolean>;
}) {
  const kind = sub?.kind ?? initialKind ?? 'time';
  const travel = sub?.kind === 'travel' ? sub : undefined;
  const [departureSiteId, setDepartureSiteId] = useState(
    travel?.departure?.sourceId ?? doc.settings.defaultDepartureSiteId ?? '',
  );
  const [destinationSiteId, setDestinationSiteId] = useState(
    travel?.destination?.sourceId ?? defaultDestinationSiteId ?? '',
  );
  const [vehicleId, setVehicleId] = useState(
    travel?.vehicleId ?? doc.settings.defaultVehicleId ?? '',
  );
  const [roundTrip, setRoundTrip] = useState(travel?.roundTrip ?? true);
  const [distance, setDistance] = useState(
    travel?.distanceKmPerOccurrence ?? '',
  );
  const [minutes, setMinutes] = useState(
    travel?.travelMinutesPerOccurrence === undefined
      ? ''
      : hours(travel.travelMinutesPerOccurrence),
  );
  const [distanceSource, setDistanceSource] = useState<
    'route' | 'manual' | undefined
  >(travel?.distanceSource);
  const [durationSource, setDurationSource] = useState<
    'route' | 'manual' | undefined
  >(travel?.durationSource);
  const [siteOpen, setSiteOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [confirmRecalculation, setConfirmRecalculation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [durationError, setDurationError] = useState<string>();
  const calculateRoute = async (overwrite = false) => {
    const departure = doc.sites.find((site) => site.id === departureSiteId);
    const destination = doc.sites.find((site) => site.id === destinationSiteId);
    if (
      !departure ||
      !destination ||
      !siteHasUsableLocation(departure) ||
      !siteHasUsableLocation(destination)
    ) {
      appState.setError({
        code: 'MISSING_DATA',
        source: 'OpenRouteService',
        message: 'Partenza e Destinazione devono avere coordinate risolte.',
        action: 'Apri la Sede, esegui Cerca e scegli un risultato.',
      });
      return;
    }
    if (
      routeValuesRequireOverwriteConfirmation(distance, minutes) &&
      !overwrite
    ) {
      setConfirmRecalculation(true);
      return;
    }
    setBusy(true);
    const result = await window.cash.ors.route({
      departure: departure.location!.coordinates,
      destination: destination.location!.coordinates,
    });
    if (!result.ok) appState.setError(result.error);
    else {
      const values = valuesFromRoute(result.value, roundTrip);
      if (!values.ok) appState.setError(values.error);
      else {
        setDistance(values.value.distanceKmPerOccurrence);
        setMinutes(String(values.value.travelMinutesPerOccurrence));
        setDistanceSource('route');
        setDurationSource('route');
      }
    }
    setBusy(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || busy) return;
    const { get, money } = formReader(event.currentTarget);
    if (kind === 'time') {
      const duration = parseDuration(get('minutes'));
      if (!duration.ok) {
        setDurationError(duration.error.message);
        return;
      }
      if (
        onSaveSimple({
          kind,
          description: get('description'),
          minutes: duration.value,
        })
      )
        onClose();
      return;
    }
    if (kind === 'expense') {
      if (
        onSaveSimple({
          kind,
          description: get('description'),
          amount: money('amount'),
        })
      )
        onClose();
      return;
    }
    const parsedTravelDuration = minutes ? parseDuration(minutes) : undefined;
    if (parsedTravelDuration && !parsedTravelDuration.ok) {
      setDurationError(parsedTravelDuration.error.message);
      return;
    }
    const occurrences = Number(get('occurrences'));
    const parsedDistance = distance
      ? parseDecimalInput(distance, 1)
      : undefined;
    if (parsedDistance && !parsedDistance.ok) {
      appState.setError({ ...parsedDistance.error, field: 'travel.distance' });
      return;
    }
    const distanceValue = parsedDistance?.ok ? parsedDistance.value : undefined;
    const minutesValue = parsedTravelDuration?.ok
      ? parsedTravelDuration.value
      : undefined;
    if (
      !Number.isInteger(occurrences) ||
      occurrences <= 0 ||
      (minutesValue !== undefined &&
        (!Number.isInteger(minutesValue) || minutesValue <= 0))
    ) {
      appState.setError({
        code: 'VALIDATION',
        field: 'travel',
        message:
          'Occorrenze, distanza o tempo della Trasferta non sono validi.',
      });
      return;
    }
    setBusy(true);
    const saved = await onSaveTravel({
      description: get('description'),
      departureSiteId: departureSiteId || undefined,
      destinationSiteId: destinationSiteId || undefined,
      vehicleId: vehicleId || undefined,
      roundTrip,
      occurrences,
      ...(distanceValue !== undefined
        ? {
            distanceKmPerOccurrence: distanceValue,
            distanceSource: distanceSource ?? 'manual',
          }
        : {}),
      ...(minutesValue !== undefined
        ? {
            travelMinutesPerOccurrence: minutesValue,
            durationSource: durationSource ?? 'manual',
          }
        : {}),
    });
    setBusy(false);
    if (saved) onClose();
  };

  const dialogTitle = sub
    ? `Modifica ${kind === 'time' ? 'attività' : kind === 'expense' ? 'spesa' : 'trasferta'}`
    : `Aggiungi ${kind === 'time' ? 'attività' : kind === 'expense' ? 'spesa' : 'trasferta'}`;
  if (inline && kind !== 'travel') {
    const Icon = kind === 'time' ? ListChecks : ReceiptEuro;
    return (
      <form
        role="row"
        data-quote-sub-editor={kind}
        aria-label={dialogTitle}
        className={`${quoteColumns} min-h-12 border-b bg-muted/20 py-1`}
        onSubmit={(event) => void submit(event)}
      >
        <fieldset disabled={disabled || busy} className="contents">
          <div
            role="cell"
            className="flex h-full items-center justify-end border-r pr-3"
          >
            <Icon className="size-3.5 text-muted-foreground" />
          </div>
          <div role="cell" className="min-w-0 pl-2">
            <Input
              id="sub-description"
              name="description"
              aria-label="Descrizione sottoriga"
              placeholder="Descrizione sottoriga…"
              defaultValue={sub?.description ?? initialDescription}
              autoFocus
              required
              className="text-foreground"
            />
            {durationError ? (
              <p role="alert" className="text-xs text-destructive">
                {durationError}
              </p>
            ) : null}
          </div>
          <div role="cell">
            {kind === 'time' ? (
              <Input
                id="sub-minutes"
                name="minutes"
                aria-label="Durata sottoriga"
                placeholder="Durata"
                defaultValue={
                  sub?.kind === 'time' && sub.minutes !== undefined
                    ? hours(sub.minutes)
                    : ''
                }
                onChange={() => setDurationError(undefined)}
                required
                className="text-right text-foreground"
              />
            ) : null}
          </div>
          <div role="cell">
            {kind === 'expense' ? (
              <Input
                id="sub-amount"
                name="amount"
                aria-label="Importo sottoriga"
                placeholder="Importo"
                defaultValue={
                  sub?.kind === 'expense' ? moneyInputValue(sub.amount) : ''
                }
                inputMode="decimal"
                required
                className="text-right text-foreground"
              />
            ) : null}
          </div>
          <div
            role="cell"
            className="text-right text-sm text-muted-foreground"
          />
          <div
            role="cell"
            className="text-right text-sm text-muted-foreground"
          />
          <div role="cell" className="flex justify-end">
            <Button
              type="submit"
              size="icon-sm"
              aria-label="Conferma sottoriga"
              title="Conferma sottoriga"
            >
              <Check />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Annulla sottoriga"
              title="Annulla sottoriga"
              onClick={onClose}
            >
              <X />
            </Button>
          </div>
        </fieldset>
      </form>
    );
  }
  const Header = inline ? 'div' : DialogHeader;
  const Title = inline ? 'h4' : DialogTitle;
  const Description = inline ? 'p' : DialogDescription;
  const Footer = inline ? 'div' : DialogFooter;
  const form = (
    <form
      onSubmit={(event) => void submit(event)}
      className={inline ? 'space-y-3 p-3' : 'contents'}
      data-quote-sub-editor={kind}
    >
      <Header className={inline ? 'space-y-1' : undefined}>
        <Title className={inline ? 'text-sm font-medium' : undefined}>
          {dialogTitle}
        </Title>
        {kind === 'travel' ? (
          <Description
            className={inline ? 'text-xs text-muted-foreground' : undefined}
          >
            Il percorso viene calcolato solo su richiesta e i valori manuali
            restano indipendenti.
          </Description>
        ) : null}
      </Header>
      <fieldset disabled={disabled || busy} className="contents">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="sub-description">
              Descrizione{kind === 'travel' ? ' (opzionale)' : ''}
            </FieldLabel>
            <Input
              id="sub-description"
              name="description"
              defaultValue={sub?.description ?? initialDescription}
              autoFocus
              required={kind !== 'travel'}
            />
          </Field>
          {kind === 'time' ? (
            <Field>
              <FieldLabel htmlFor="sub-minutes">Durata</FieldLabel>
              <Input
                id="sub-minutes"
                name="minutes"
                defaultValue={
                  sub?.kind === 'time' && sub.minutes !== undefined
                    ? hours(sub.minutes)
                    : ''
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
              <FieldLabel htmlFor="sub-amount">Importo</FieldLabel>
              <Input
                id="sub-amount"
                name="amount"
                defaultValue={
                  sub?.kind === 'expense' ? moneyInputValue(sub.amount) : ''
                }
                inputMode="decimal"
                required
              />
            </Field>
          ) : null}
          {kind === 'travel' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="travel-departure">Partenza</FieldLabel>
                  <SearchableSelect
                    id="travel-departure"
                    value={departureSiteId}
                    onValueChange={(value) => setDepartureSiteId(value)}
                    options={[
                      { value: '', label: 'Scegli sede' },
                      ...siteOptions(doc.sites, client),
                    ]}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="travel-destination">
                    Destinazione
                  </FieldLabel>
                  <SearchableSelect
                    id="travel-destination"
                    value={destinationSiteId}
                    onValueChange={(value) => setDestinationSiteId(value)}
                    options={[
                      { value: '', label: 'Scegli sede' },
                      ...siteOptions(doc.sites, client),
                    ]}
                  />
                </Field>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field>
                  <FieldLabel htmlFor="travel-vehicle">Veicolo</FieldLabel>
                  <SearchableSelect
                    id="travel-vehicle"
                    value={vehicleId}
                    onValueChange={(value) => setVehicleId(value)}
                    options={[
                      { value: '', label: 'Scegli veicolo' },
                      ...doc.vehicles.map((vehicle) => ({
                        value: vehicle.id,
                        label: [vehicle.name, '·', vehicle.fuel].join(''),
                      })),
                    ]}
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setVehicleOpen(true)}
                >
                  <Plus />
                  Nuovo veicolo
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="travel-occurrences">
                    Occorrenze
                  </FieldLabel>
                  <Input
                    id="travel-occurrences"
                    name="occurrences"
                    type="number"
                    defaultValue={travel?.occurrences ?? 1}
                    min={1}
                    step={1}
                    required
                  />
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="travel-roundtrip"
                    checked={roundTrip}
                    onCheckedChange={(checked) => {
                      setRoundTrip(Boolean(checked));
                      setDistance('');
                      setMinutes('');
                      setDistanceSource(undefined);
                      setDurationSource(undefined);
                      setDurationError(undefined);
                    }}
                  />
                  <FieldLabel htmlFor="travel-roundtrip">
                    Andata e ritorno
                  </FieldLabel>
                </Field>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void calculateRoute()}
                disabled={busy}
              >
                <Route />
                {distanceSource === 'route' || durationSource === 'route'
                  ? 'Ricalcola percorso'
                  : 'Calcola percorso'}
              </Button>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="travel-distance">
                    {roundTrip ? 'Distanza A/R' : 'Distanza andata'}
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="travel-distance"
                      value={distance}
                      onChange={(event) => {
                        setDistance(event.target.value);
                        setDistanceSource('manual');
                      }}
                      inputMode="decimal"
                      placeholder="0"
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>km</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor="travel-duration">
                    {roundTrip
                      ? 'Tempo di viaggio A/R'
                      : 'Tempo di viaggio andata'}
                  </FieldLabel>
                  <Input
                    id="travel-duration"
                    value={minutes}
                    onChange={(event) => {
                      setMinutes(event.target.value);
                      setDurationSource('manual');
                      setDurationError(undefined);
                    }}
                    placeholder="es. 45m"
                  />
                  {durationError ? (
                    <FieldDescription className="text-destructive">
                      {durationError}
                    </FieldDescription>
                  ) : null}
                </Field>
              </div>
              <FieldDescription>
                Valori per singola occorrenza, modificabili indipendentemente.
                Le modifiche manuali non vengono sovrascritte senza conferma.
              </FieldDescription>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSiteOpen(true)}
              >
                <Plus />
                Nuova sede
              </Button>
            </>
          ) : null}
        </FieldGroup>
        <Footer className={inline ? 'flex justify-end gap-2' : undefined}>
          <Button type="button" variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button type="submit" disabled={busy}>
            {busy
              ? 'Elaborazione…'
              : sub
                ? 'Aggiorna'
                : kind === 'time'
                  ? 'Aggiungi attività'
                  : 'Aggiungi'}
          </Button>
        </Footer>
      </fieldset>
    </form>
  );
  return (
    <>
      {inline ? (
        <div role="row">
          <div role="cell" aria-colspan={7} className="border-b bg-muted/15">
            {form}
          </div>
        </div>
      ) : (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
        >
          <DialogContent
            className={kind === 'travel' ? 'sm:max-w-2xl' : undefined}
          >
            {form}
          </DialogContent>
        </Dialog>
      )}
      {siteOpen ? (
        <div role={inline ? 'row' : undefined}>
          <div
            role={inline ? 'cell' : undefined}
            aria-colspan={inline ? 7 : undefined}
            className={inline ? 'px-3' : undefined}
          >
            <SiteDialog
              inline={inline}
              open
              onOpenChange={setSiteOpen}
              appState={appState}
              doc={doc}
            />
          </div>
        </div>
      ) : null}
      {vehicleOpen ? (
        <div role={inline ? 'row' : undefined}>
          <div
            role={inline ? 'cell' : undefined}
            aria-colspan={inline ? 7 : undefined}
            className={inline ? 'px-3' : undefined}
          >
            <VehicleDialog
              inline={inline}
              open
              onOpenChange={setVehicleOpen}
              appState={appState}
              onSaved={setVehicleId}
            />
          </div>
        </div>
      ) : null}
      <AlertDialog
        open={confirmRecalculation}
        onOpenChange={setConfirmRecalculation}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ricalcolare il percorso?</AlertDialogTitle>
            <AlertDialogDescription>
              Distanza e tempo correnti verranno sostituiti dai nuovi valori
              OpenRouteService.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => void calculateRoute(true)}>
              Ricalcola e sostituisci
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
