import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, Mail, MapPin, Settings2, UserRound } from 'lucide-react';
import type { CashError, FicClientSnapshot } from '../../domain/model';
import { ficCreateClientSchema } from '../../shared/fic';
import type { AppState } from '../state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/selection-field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

const identificationFields = [
  ['code', 'Codice cliente interno'],
  ['tax_code', 'Codice fiscale'],
  ['contact_person', 'Referente'],
  ['first_name', 'Nome'],
  ['last_name', 'Cognome'],
] as const;
const invoicingFields = [
  ['certified_email', 'PEC', 'email'],
  ['ei_code', 'Codice destinatario'],
] as const;
const additionalAddressFields = [
  ['address_extra', 'Note indirizzo'],
  ['shipping_address', 'Indirizzo di spedizione'],
] as const;
const bankFields = [
  ['bank_name', 'Banca'],
  ['bank_iban', 'IBAN'],
  ['bank_swift_code', 'SWIFT/BIC'],
] as const;

function ClientTextField({
  name,
  label,
  type = 'text',
}: {
  name: string;
  label: string;
  type?: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={`new-client-${name}`}>{label}</FieldLabel>
      <Input
        id={`new-client-${name}`}
        name={name}
        type={type}
        className="h-9"
      />
    </Field>
  );
}

export function CreateFicClientDialog({
  companyId,
  companyName,
  appState,
  onClose,
  onCreated,
}: {
  companyId: string;
  companyName: string;
  appState: AppState;
  onClose: () => void;
  onCreated: (client: FicClientSnapshot) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<CashError>();
  const [uncertain, setUncertain] = useState<string>();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || uncertain) return;
    const form = new FormData(event.currentTarget);
    const data: Record<string, unknown> = {};
    for (const [key, value] of form) {
      if (typeof value !== 'string' || !value.trim()) continue;
      data[key] =
        key === 'e_invoice'
          ? value === 'true'
          : key === 'default_payment_terms' || key === 'default_discount'
            ? Number(value)
            : value.trim();
    }
    const parsed = ficCreateClientSchema.safeParse(data);
    if (!parsed.success) {
      setError({
        code: 'VALIDATION',
        message: 'Controlla i dati del cliente.',
        details: parsed.error.issues.map((issue) => issue.message),
      });
      if (
        parsed.error.issues.some(
          (issue) => issue.path[0] !== 'name' && issue.path[0] !== 'type',
        )
      )
        setAdvancedOpen(true);
      return;
    }
    const context = appState.archiveContext;
    const documentId = appState.document?.documentId;
    const isCurrent = () =>
      mounted.current &&
      appState.archiveContext === context &&
      appState.document?.documentId === documentId &&
      appState.document?.settings.fic.enabled &&
      appState.document.settings.fic.company?.id === companyId;
    inFlight.current = true;
    setSaving(true);
    setError(undefined);
    try {
      const result = await window.cash.fic.createClient({
        companyId,
        client: parsed.data,
      });
      if (!isCurrent()) return;
      if (!result.ok) setError(result.error);
      else if (result.value.outcome === 'uncertain')
        setUncertain(result.value.diagnostic);
      else onCreated(result.value.client);
    } catch {
      if (isCurrent())
        setUncertain(
          'Non è possibile confermare la creazione. Verifica se il cliente è presente in Fatture in Cloud prima di ripetere l’operazione.',
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !inFlight.current) onClose();
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton={!saving}
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={submit}
          aria-busy={saving}
        >
          <DialogHeader className="shrink-0 border-b px-6 py-5 pr-12">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <UserRound aria-hidden="true" className="size-5 text-primary" />
              Nuovo cliente
            </DialogTitle>
            <DialogDescription>
              Aggiungi un cliente a {companyName} in Fatture in Cloud.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
            {error ? (
              <Alert variant="destructive" role="alert">
                <AlertTitle>{error.message}</AlertTitle>
                <AlertDescription>
                  {error.details?.join(' ')} {error.action}
                </AlertDescription>
              </Alert>
            ) : null}
            {uncertain ? (
              <Alert role="alert">
                <AlertTitle>Creazione da verificare</AlertTitle>
                <AlertDescription>{uncertain}</AlertDescription>
              </Alert>
            ) : null}
            <FieldSet
              disabled={saving || Boolean(uncertain)}
              className="min-w-0 gap-5"
            >
              <FieldSet className="gap-3">
                <FieldLegend className="text-sm">Anagrafica</FieldLegend>
                <FieldDescription>
                  Denominazione e tipo cliente sono obbligatori.
                </FieldDescription>
                <div className="grid gap-4 sm:grid-cols-[1.4fr_1.2fr_1fr]">
                  <Field>
                    <FieldLabel htmlFor="new-client-name">
                      Denominazione *
                    </FieldLabel>
                    <Input
                      id="new-client-name"
                      name="name"
                      required
                      className="h-9"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="new-client-type">
                      Tipo cliente *
                    </FieldLabel>
                    <SelectField
                      id="new-client-type"
                      name="type"
                      required
                      defaultValue=""
                      className="h-9 w-full"
                      onValueChange={() => setError(undefined)}
                      options={[
                        {
                          value: '',
                          label: 'Seleziona il tipo',
                          disabled: true,
                        },
                        { value: 'company', label: 'Azienda / professionista' },
                        { value: 'person', label: 'Privato' },
                        { value: 'pa', label: 'Pubblica amministrazione' },
                        { value: 'condo', label: 'Condominio' },
                      ]}
                    />
                  </Field>
                  <ClientTextField name="vat_number" label="Partita IVA" />
                </div>
              </FieldSet>
              <Separator />
              <FieldSet className="gap-3">
                <FieldLegend className="flex items-center gap-2 text-sm">
                  <Mail
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  Recapiti
                </FieldLegend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ClientTextField name="email" label="Email" type="email" />
                  <ClientTextField name="phone" label="Telefono" type="tel" />
                </div>
              </FieldSet>
              <Separator />
              <FieldSet className="gap-3">
                <FieldLegend className="flex items-center gap-2 text-sm">
                  <MapPin
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  Indirizzo
                </FieldLegend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ClientTextField
                    name="address_street"
                    label="Indirizzo e numero civico"
                  />
                  <ClientTextField name="country" label="Paese" />
                </div>
                <div className="grid gap-4 sm:grid-cols-[1fr_2fr_1fr]">
                  <ClientTextField name="address_postal_code" label="CAP" />
                  <ClientTextField name="address_city" label="Città" />
                  <ClientTextField name="address_province" label="Provincia" />
                </div>
              </FieldSet>
              <Collapsible
                open={advancedOpen}
                onOpenChange={setAdvancedOpen}
                className="rounded-xl border bg-muted/20"
              >
                <CollapsibleTrigger
                  id="new-client-advanced-trigger"
                  className="group flex w-full items-center justify-between gap-3 rounded-xl p-4 text-left outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Settings2
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                    Opzioni avanzate
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 text-muted-foreground transition-transform group-aria-expanded:rotate-180"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent
                  keepMounted
                  className="space-y-5 border-t p-4 data-closed:hidden"
                  onInvalidCapture={() => setAdvancedOpen(true)}
                >
                  <FieldSet>
                    <FieldLegend className="text-sm">
                      Dati aggiuntivi
                    </FieldLegend>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {identificationFields.map(([name, label]) => (
                        <ClientTextField key={name} name={name} label={label} />
                      ))}
                    </div>
                  </FieldSet>
                  <Separator />
                  <FieldSet>
                    <FieldLegend className="text-sm">
                      Fatturazione elettronica
                    </FieldLegend>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {invoicingFields.map(([name, label, ...type]) => (
                        <ClientTextField
                          key={name}
                          name={name}
                          label={label}
                          type={type[0]}
                        />
                      ))}
                      <Field>
                        <FieldLabel htmlFor="new-client-e_invoice">
                          Fatturazione elettronica
                        </FieldLabel>
                        <SelectField
                          id="new-client-e_invoice"
                          name="e_invoice"
                          className="h-9 w-full"
                          defaultValue=""
                          options={[
                            { value: '', label: 'Impostazione FIC' },
                            { value: 'true', label: 'Attiva' },
                            { value: 'false', label: 'Disattiva' },
                          ]}
                        />
                      </Field>
                    </div>
                  </FieldSet>
                  <Separator />
                  <FieldSet>
                    <FieldLegend className="text-sm">
                      Condizioni di pagamento
                    </FieldLegend>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="new-client-payment-terms">
                          Termini di pagamento (giorni)
                        </FieldLabel>
                        <Input
                          id="new-client-payment-terms"
                          name="default_payment_terms"
                          type="number"
                          min={0}
                          step={1}
                          className="h-9"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="new-client-payment-type">
                          Decorrenza pagamento
                        </FieldLabel>
                        <SelectField
                          id="new-client-payment-type"
                          name="default_payment_terms_type"
                          className="h-9 w-full"
                          defaultValue=""
                          options={[
                            { value: '', label: 'Impostazione FIC' },
                            { value: 'standard', label: 'Data documento' },
                            { value: 'end_of_month', label: 'Fine mese' },
                          ]}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="new-client-discount">
                          Sconto predefinito (%)
                        </FieldLabel>
                        <Input
                          id="new-client-discount"
                          name="default_discount"
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          className="h-9"
                        />
                      </Field>
                    </div>
                  </FieldSet>
                  <Separator />
                  <FieldSet>
                    <FieldLegend className="text-sm">
                      Coordinate bancarie
                    </FieldLegend>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {bankFields.map(([name, label]) => (
                        <ClientTextField key={name} name={name} label={label} />
                      ))}
                    </div>
                  </FieldSet>
                  <Separator />
                  <FieldSet>
                    <FieldLegend className="text-sm">
                      Indirizzo e note
                    </FieldLegend>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {additionalAddressFields.map(([name, label]) => (
                        <ClientTextField key={name} name={name} label={label} />
                      ))}
                    </div>
                    <Field>
                      <FieldLabel htmlFor="new-client-notes">Note</FieldLabel>
                      <Textarea id="new-client-notes" name="notes" />
                    </Field>
                  </FieldSet>
                </CollapsibleContent>
              </Collapsible>
            </FieldSet>
          </div>
          <DialogFooter className="mx-0 mb-0 shrink-0 px-6 py-4">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={onClose}
            >
              {uncertain ? 'Chiudi' : 'Annulla'}
            </Button>
            <Button type="submit" disabled={saving || Boolean(uncertain)}>
              {saving ? <Spinner aria-hidden="true" /> : null}
              {saving ? 'Creazione…' : 'Crea su FIC'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
