import { SelectField } from '@/components/ui/selection-field';
import { useState, type FormEvent } from 'react';
import { parseDecimalInput } from '../../domain/decimal';
import { coordinatesInput, parseCoordinates } from '../../domain/locations';
import {
  meta,
  type BusinessCost,
  type CashDocument,
  type FicClientSnapshot,
  type GeocodingResult,
  type ResolvedLocation,
  type Site,
  type Vehicle,
} from '../../domain/model';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import { formReader, moneyInputValue } from '@/lib/format';
import type { AppState } from '../state';

interface DialogBaseProps {
  inline?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (id: string) => void;
}

export function CostDialog({
  open,
  onOpenChange,
  appState,
  cost,
}: DialogBaseProps & { appState: AppState; cost?: BusinessCost }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { get, money } = formReader(event.currentTarget);
    const amount = parseDecimalInput(money('monthlyAmount'), 2);
    if (!amount.ok) {
      appState.setError(amount.error);
      return;
    }
    if (!get('category') || !get('description')) {
      appState.setError({
        code: 'VALIDATION',
        message: 'Completa categoria, descrizione e importo mensile.',
      });
      return;
    }
    const id = cost?.id ?? meta().id;
    if (
      !appState.mutate((document) => {
        if (cost)
          Object.assign(
            document.businessCosts.find((entry) => entry.id === cost.id)!,
            {
              category: get('category'),
              description: get('description'),
              monthlyAmount: amount.value,
              updatedAt: new Date().toISOString(),
            },
          );
        else
          document.businessCosts.push({
            ...meta(),
            id,
            category: get('category'),
            description: get('description'),
            monthlyAmount: amount.value,
          });
      })
    )
      return;
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          key={cost?.id ?? 'new-cost'}
          onSubmit={submit}
          className="contents"
        >
          <DialogHeader>
            <DialogTitle>
              {cost ? 'Modifica costo' : 'Nuovo costo aziendale'}
            </DialogTitle>
            <DialogDescription>
              Indica il valore medio mensile; Cash calcola il totale annuale.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cost-category">Categoria</FieldLabel>
              <Input
                id="cost-category"
                name="category"
                defaultValue={cost?.category}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cost-description">Descrizione</FieldLabel>
              <Input
                id="cost-description"
                name="description"
                defaultValue={cost?.description}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cost-amount">Importo mensile</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>€</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="cost-amount"
                  name="monthlyAmount"
                  defaultValue={moneyInputValue(cost?.monthlyAmount ?? '0.00')}
                  required
                />
              </InputGroup>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Annulla
            </Button>
            <Button type="submit">Salva</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SiteDialog({
  open,
  inline = false,
  onOpenChange,
  appState,
  site,
  fixedClient,
  onSaved,
}: DialogBaseProps & {
  appState: AppState;
  doc: CashDocument;
  site?: Site;
  fixedClient?: FicClientSnapshot;
}) {
  const [mode, setMode] = useState<'address' | 'coordinates'>(
    site?.location?.inputKind ?? 'address',
  );
  const [address, setAddress] = useState(site?.address ?? '');
  const [coordinateText, setCoordinateText] = useState(
    site?.location ? coordinatesInput(site.location.coordinates) : '',
  );
  const [resolved, setResolved] = useState<ResolvedLocation | undefined>(() =>
    site?.location?.inputKind === 'coordinates'
      ? {
          ...site.location,
          inputValue: coordinatesInput(site.location.coordinates),
        }
      : site?.location,
  );
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [id] = useState(() => site?.id ?? meta().id);
  const [archiveContext] = useState(appState.archiveContext);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const choose = (result: GeocodingResult) => {
    setAddress(result.label);
    setCoordinateText(coordinatesInput(result.coordinates));
    setResolved({
      coordinates: result.coordinates,
      inputKind: 'address',
      inputValue: result.label,
    });
    setResults([]);
    setSearchError('');
  };
  const search = async () => {
    setSearching(true);
    setSearchError('');
    setResults([]);
    const parsed = parseCoordinates(
      mode === 'coordinates' ? coordinateText : address,
    );
    if (mode === 'address' && !parsed.ok) {
      const response = await window.cash.ors.searchAddress(address);
      setSearching(false);
      if (!response.ok) {
        setSearchError(response.error.message);
        return;
      }
      if (!response.value.length) {
        setSearchError('Nessun risultato trovato per l’indirizzo.');
        return;
      }
      setResults(response.value);
      return;
    }
    if (!parsed.ok) {
      setSearching(false);
      setSearchError(parsed.error.message);
      return;
    }
    if (mode === 'address') {
      setMode('coordinates');
      setCoordinateText(coordinatesInput(parsed.value));
      setAddress('');
    }
    const response = await window.cash.ors.reverseCoordinates(parsed.value);
    setSearching(false);
    if (!response.ok) {
      setSearchError(response.error.message);
      return;
    }
    const label = response.value[0]?.label;
    if (label) setAddress(label);
    const normalized = coordinatesInput(parsed.value);
    setCoordinateText(normalized);
    setResolved({
      coordinates: parsed.value,
      inputKind: 'coordinates',
      inputValue: normalized,
    });
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || appState.archiveContext !== archiveContext) return;
    const name = String(
      new FormData(event.currentTarget).get('name') ?? '',
    ).trim();
    if (!name) {
      appState.setError({
        code: 'VALIDATION',
        message: 'Inserisci il nome della Sede.',
      });
      return;
    }
    let location = resolved;
    const parsed = parseCoordinates(
      mode === 'coordinates' ? coordinateText : address,
    );
    if (mode === 'coordinates' || parsed.ok) {
      if (!parsed.ok) {
        appState.setError(parsed.error);
        return;
      }
      location = {
        coordinates: parsed.value,
        inputKind: 'coordinates',
        inputValue: coordinatesInput(parsed.value),
      };
    }
    if (
      location?.inputKind === 'address' &&
      location.inputValue !== address.trim()
    )
      location = undefined;
    if (
      mode !== 'coordinates' &&
      !parsed.ok &&
      location?.inputKind === 'coordinates' &&
      location.inputValue !== coordinateText.trim()
    )
      location = undefined;
    if (
      !appState.mutate((document) => {
        const values = {
          name,
          address:
            mode === 'address' && parsed.ok
              ? undefined
              : address.trim() || undefined,
          location,
          client: fixedClient
            ? {
                source: 'fatture_in_cloud' as const,
                companyId: fixedClient.companyId,
                clientId: fixedClient.clientId,
                displayName: fixedClient.displayName,
              }
            : site?.client,
        };
        const existing = document.sites.find((entry) => entry.id === id);
        if (existing)
          Object.assign(existing, values, {
            updatedAt: new Date().toISOString(),
          });
        else document.sites.push({ ...meta(), id, ...values });
      })
    )
      return;
    setSaving(true);
    setSaveError('');
    await appState.save();
    setSaving(false);
    if (appState.archiveContext !== archiveContext) return;
    if (appState.status !== 'Salvato') {
      setSaveError(
        appState.error?.message ??
          'Salvataggio della sede non riuscito. Riprova.',
      );
      return;
    }
    onSaved?.(id);
    onOpenChange(false);
  };
  const Header = inline ? 'div' : DialogHeader;
  const Title = inline ? 'h4' : DialogTitle;
  const Description = inline ? 'p' : DialogDescription;
  const Footer = inline ? 'div' : DialogFooter;
  const form = (
    <form
      key={site?.id ?? 'new-site'}
      onSubmit={submit}
      className={inline ? 'space-y-4 border-y py-3' : 'contents'}
    >
      <Header>
        <Title>{site ? 'Modifica sede' : 'Nuova sede'}</Title>
        <Description>
          Localizza la Sede con un’azione esplicita. Nessuna ricerca viene
          eseguita mentre digiti.
        </Description>
      </Header>
      <fieldset disabled={saving} className="contents">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="site-name">Nome</FieldLabel>
            <Input
              id="site-name"
              autoFocus={inline}
              name="name"
              defaultValue={site?.name}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="site-mode">Cerca tramite</FieldLabel>
            <SelectField
              id="site-mode"
              value={mode}
              onValueChange={(value) => setMode(value as typeof mode)}
              options={[
                { value: 'address', label: 'Indirizzo o coordinate' },
                { value: 'coordinates', label: 'Coordinate' },
              ]}
            />
          </Field>
          {mode === 'address' ? (
            <Field>
              <FieldLabel htmlFor="site-address">
                Indirizzo o coordinate
              </FieldLabel>
              <Input
                id="site-address"
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value);
                  setResolved(undefined);
                }}
                placeholder="Via, città oppure 41.9028, 12.4964"
              />
              <FieldDescription>
                Le coordinate nel formato latitudine, longitudine vengono
                riconosciute automaticamente. Per un indirizzo, premi Cerca e
                scegli un risultato.
              </FieldDescription>
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="site-coordinates">Coordinate</FieldLabel>
              <Input
                id="site-coordinates"
                value={coordinateText}
                onChange={(event) => {
                  setCoordinateText(event.target.value);
                  setResolved(undefined);
                }}
                placeholder="41.4682252, 14.5621986"
              />
              <FieldDescription>
                Formato Google Maps: latitudine, longitudine.
              </FieldDescription>
            </Field>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => void search()}
            disabled={searching}
          >
            {searching ? 'Ricerca…' : 'Cerca'}
          </Button>
          {searchError ? (
            <Alert variant="destructive">
              <AlertDescription>{searchError}</AlertDescription>
            </Alert>
          ) : null}
          {results.length ? (
            <div
              className="space-y-2"
              role="listbox"
              aria-label="Risultati indirizzo"
            >
              {results.map((result) => (
                <Button
                  key={result.id}
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-start whitespace-normal py-3 text-left"
                  onClick={() => choose(result)}
                >
                  {result.label}
                </Button>
              ))}
            </div>
          ) : null}
          <Field>
            <FieldLabel>Cliente</FieldLabel>
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              {fixedClient?.displayName ??
                site?.client?.displayName ??
                'Nessuno — Altre sedi'}
            </div>
          </Field>
        </FieldGroup>
        {saveError ? (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}
        <Footer className={inline ? 'flex flex-wrap gap-2' : undefined}>
          {site ? (
            <Button
              type="button"
              variant="secondary"
              className="mr-auto"
              onClick={() =>
                appState.mutate((document) => {
                  document.settings.defaultDepartureSiteId = site.id;
                })
              }
            >
              Imposta come partenza predefinita
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Annulla
          </Button>
          <Button type="submit">
            {saving ? 'Salvataggio…' : 'Salva sede'}
          </Button>
        </Footer>
      </fieldset>
    </form>
  );
  if (inline)
    return open ? (
      <section aria-label="Nuova sede" className="min-w-0 text-sm">
        {form}
      </section>
    ) : null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl">{form}</DialogContent>
    </Dialog>
  );
}

const blankVehicle: Pick<
  Vehicle,
  | 'name'
  | 'fuel'
  | 'consumption'
  | 'annualKm'
  | 'annualInsurance'
  | 'annualTax'
  | 'annualMaintenance'
> = {
  name: '',
  fuel: 'Benzina',
  consumption: '16.67',
  annualKm: '10000',
  annualInsurance: '0.00',
  annualTax: '0.00',
  annualMaintenance: '0.00',
};
export function VehicleDialog({
  open,
  inline = false,
  onOpenChange,
  appState,
  vehicle: existing,
  onSaved,
}: DialogBaseProps & { appState: AppState; vehicle?: Vehicle }) {
  const vehicle = existing ?? blankVehicle;
  const [fuel, setFuel] = useState<Vehicle['fuel']>(vehicle.fuel);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const { get, money } = formReader(event.currentTarget);
    const id = existing?.id ?? meta().id;
    const consumption = parseDecimalInput(get('consumption'), 2);
    if (!consumption.ok) {
      appState.setError(consumption.error);
      return;
    }
    const annualKm = parseDecimalInput(get('annualKm'), 1);
    if (!annualKm.ok) {
      appState.setError(annualKm.error);
      return;
    }
    const amounts: Record<string, string> = {};
    for (const name of ['annualInsurance', 'annualTax', 'annualMaintenance']) {
      const parsed = parseDecimalInput(money(name), 2);
      if (!parsed.ok) {
        appState.setError(parsed.error);
        return;
      }
      amounts[name] = parsed.value;
    }
    if (
      !get('name') ||
      Number(consumption.value) <= 0 ||
      Number(annualKm.value) <= 0
    ) {
      appState.setError({
        code: 'VALIDATION',
        message: 'I dati del veicolo non sono validi.',
      });
      return;
    }
    const values = {
      name: get('name'),
      fuel: get('fuel') as Vehicle['fuel'],
      consumption: consumption.value,
      consumptionUnit:
        get('fuel') === 'Metano' ? ('kg/100km' as const) : ('km/l' as const),
      annualKm: annualKm.value,
      annualInsurance: amounts.annualInsurance!,
      annualTax: amounts.annualTax!,
      annualMaintenance: amounts.annualMaintenance!,
    };
    if (
      !appState.mutate((document) => {
        if (existing)
          Object.assign(
            document.vehicles.find((entry) => entry.id === existing.id)!,
            values,
            { updatedAt: new Date().toISOString() },
          );
        else document.vehicles.push({ ...meta(), id, ...values });
      })
    )
      return;
    onSaved?.(id);
    onOpenChange(false);
  };
  const Header = inline ? 'div' : DialogHeader;
  const Title = inline ? 'h4' : DialogTitle;
  const Description = inline ? 'p' : DialogDescription;
  const Footer = inline ? 'div' : DialogFooter;
  const form = (
    <form
      key={existing?.id ?? 'new-vehicle'}
      onSubmit={submit}
      className={inline ? 'space-y-4 border-y py-3' : 'contents'}
    >
      <Header>
        <Title>{existing ? 'Modifica veicolo' : 'Nuovo veicolo'}</Title>
        <Description>
          I costi annuali confluiscono nel costo chilometrico e non vanno
          duplicati nei costi aziendali.
        </Description>
      </Header>
      <FieldGroup className="grid grid-cols-2">
        <Field>
          <FieldLabel htmlFor="vehicle-name">Nome</FieldLabel>
          <Input
            id="vehicle-name"
            autoFocus={inline}
            name="name"
            defaultValue={vehicle.name}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="vehicle-fuel">Carburante</FieldLabel>
          <SelectField
            id="vehicle-fuel"
            name="fuel"
            value={fuel}
            onValueChange={(value) => setFuel(value as Vehicle['fuel'])}
            options={[
              ...(['Benzina', 'Gasolio', 'GPL', 'Metano'] as const).map(
                (value) => ({ value: String(value), label: value }),
              ),
            ]}
          />
        </Field>
        <NumberInput
          id="consumption"
          label="Consumo medio"
          value={vehicle.consumption}
          suffix={fuel === 'Metano' ? 'kg/100 km' : 'km/l'}
        />
        <NumberInput
          id="annualKm"
          label="Percorrenza annua"
          value={vehicle.annualKm}
          suffix="km"
        />
        {(
          [
            ['annualInsurance', 'Assicurazione annua', vehicle.annualInsurance],
            ['annualTax', 'Bollo annuo', vehicle.annualTax],
            [
              'annualMaintenance',
              'Manutenzione annua',
              vehicle.annualMaintenance,
            ],
          ] as const
        ).map(([name, label, value]) => (
          <Field key={name}>
            <FieldLabel htmlFor={`vehicle-${name}`}>{label}</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>€</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id={`vehicle-${name}`}
                name={name}
                defaultValue={moneyInputValue(value)}
                required
              />
            </InputGroup>
          </Field>
        ))}
      </FieldGroup>
      <Footer className={inline ? 'flex flex-wrap gap-2' : undefined}>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
        >
          Annulla
        </Button>
        <Button type="submit">Salva veicolo</Button>
      </Footer>
    </form>
  );
  if (inline)
    return open ? (
      <section aria-label="Nuovo veicolo" className="min-w-0 text-sm">
        {form}
      </section>
    ) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">{form}</DialogContent>
    </Dialog>
  );
}
function NumberInput({
  id,
  label,
  value,
  suffix,
}: {
  id: string;
  label: string;
  value: string;
  suffix: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={`vehicle-${id}`}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={`vehicle-${id}`}
          name={id}
          type="number"
          defaultValue={value}
          min={0.01}
          step={0.01}
          required
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>{suffix}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}
