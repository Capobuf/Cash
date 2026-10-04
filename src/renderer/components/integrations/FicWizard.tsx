import { ArrowLeft, ArrowRight, Check, Cloud } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FicActivationPreview } from '../../../domain/integration';
import type { AppState } from '../../state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export interface FicUiState {
  hasToken: boolean;
  connectionError: boolean;
  setupInfo: { clientId: string; requiredScopes: string[] };
  setSetupInfo: (value: { clientId: string; requiredScopes: string[] }) => void;
  setHasToken: (value: boolean) => void;
  setConnectionError: (value: boolean) => void;
}

export function FicWizard({
  open,
  onOpenChange,
  appState,
  ficUi,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appState: AppState;
  ficUi: FicUiState;
}) {
  const [step, setStep] = useState(1);
  const [token, setToken] = useState('');
  const [companies, setCompanies] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [companyId, setCompanyId] = useState('');
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [productId, setProductId] = useState('');
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState(ficUi.setupInfo.clientId);
  const company = companies.find((entry) => entry.id === companyId);
  const [preview, setPreview] = useState<FicActivationPreview>();
  const product = products.find((entry) => entry.id === productId);

  useEffect(() => {
    if (open) setClientId(ficUi.setupInfo.clientId);
  }, [open, ficUi.setupInfo.clientId]);

  const next = async () => {
    if (step === 1) {
      setBusy(true);
      const result = await window.cash.fic.setClientId(clientId);
      setBusy(false);
      if (!result.ok) {
        appState.setError(result.error);
        return;
      }
      ficUi.setSetupInfo({
        ...ficUi.setupInfo,
        clientId: result.value.clientId,
      });
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!token.trim()) return;
      setBusy(true);
      const result = await window.cash.credentials.setFicToken(token);
      setBusy(false);
      if (!result.ok) {
        appState.setError(result.error);
        return;
      }
      ficUi.setHasToken(true);
      setStep(3);
      return;
    }
    if (step === 3) {
      setBusy(true);
      const result = await window.cash.fic.listCompaniesForActivation(
        token.trim(),
      );
      setBusy(false);
      if (!result.ok) {
        ficUi.setConnectionError(true);
        appState.setError(result.error);
        return;
      }
      setCompanies(result.value);
      setCompanyId('');
      setStep(4);
      return;
    }
    if (step === 4) {
      if (!companyId) return;
      setBusy(true);
      const result = await window.cash.fic.listProductsForActivation({
        token: token.trim(),
        companyId,
      });
      setBusy(false);
      if (!result.ok) {
        ficUi.setConnectionError(true);
        appState.setError(result.error);
        return;
      }
      setProducts(result.value);
      setProductId(result.value.length === 1 ? result.value[0]!.id : '');
      setStep(5);
      return;
    }
    if (step === 5) {
      if (!productId) return;
      setPreview(undefined);
      setBusy(true);
      const result = await window.cash.fic.previewActivation({
        token: token.trim(),
        companyId,
        productId,
      });
      setBusy(false);
      if (!result.ok) {
        ficUi.setConnectionError(true);
        appState.setError(result.error);
        return;
      }
      setPreview(result.value);
      setStep(6);
      return;
    }
    if (step === 6) {
      setStep(7);
      return;
    }
    if (!preview) return;
    // Save local edits before the native activation uses the concurrency token.
    await appState.save();
    if (appState.status !== 'Salvato' || !appState.session?.document) return;
    setBusy(true);
    const completed = await window.cash.fic.completeActivation({
      preview,
      token: token.trim(),
      companyId,
      productId,
      path: appState.session.path,
      document: appState.session.document,
      concurrencyToken: appState.session.token,
    });
    setBusy(false);
    if (!completed.ok) {
      ficUi.setConnectionError(true);
      appState.setError(completed.error);
      return;
    }
    ficUi.setHasToken(true);
    ficUi.setConnectionError(false);
    appState.acceptNativeSession(completed.value);
    onOpenChange(false);
    setStep(1);
    setToken('');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) setStep(1);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Configura Fatture in Cloud</DialogTitle>
          <DialogDescription>
            Passaggio {step} di 7 ·{' '}
            {
              [
                'Attivazione',
                'Token manuale',
                'Verifica token',
                'Azienda',
                'Prodotto Consulenza',
                'Riepilogo',
                'Conferma',
              ][step - 1]
            }
          </DialogDescription>
        </DialogHeader>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-[width]"
            style={{ width: `${(step / 7) * 100}%` }}
          />
        </div>
        <div className="min-h-52 py-2">
          {step === 1 ? (
            <div className="space-y-4">
              <WizardCopy
                title="Collega questa postazione"
                body="Il collegamento è facoltativo. Client ID e token resteranno soltanto su questa postazione e non entreranno mai nell’archivio condiviso."
              />
              <Field>
                <FieldLabel htmlFor="wizard-fic-client-id">
                  Client ID app privata
                </FieldLabel>
                <Input
                  id="wizard-fic-client-id"
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  placeholder="Inserisci il Client ID"
                  autoFocus
                />
                <FieldDescription>
                  Lo trovi nelle impostazioni dell’app privata in Fatture in
                  Cloud.
                </FieldDescription>
              </Field>
            </div>
          ) : null}
          {step === 2 ? (
            <Field>
              <FieldLabel htmlFor="fic-token">Token manuale</FieldLabel>
              <Input
                id="fic-token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoFocus
              />
              <FieldDescription>
                Genera il token con tutti i permessi elencati. Premendo Continua
                verrà salvato subito nel Gestore credenziali, anche se
                interrompi il wizard in seguito.
              </FieldDescription>
              <FicPermissions scopes={ficUi.setupInfo.requiredScopes} />
            </Field>
          ) : null}
          {step === 3 ? (
            <WizardCopy
              title="Verifica collegamento"
              body="Il token è già salvato su questa postazione. Cash lo verificherà e caricherà l’elenco delle aziende accessibili; nessun preventivo verrà creato."
            />
          ) : null}
          {step === 4 ? (
            <ChoiceList
              title="Scegli l’azienda"
              entries={companies}
              value={companyId}
              onChange={setCompanyId}
              empty="Il token non espone aziende selezionabili."
            />
          ) : null}
          {step === 5 ? (
            <ChoiceList
              title="Scegli il prodotto Consulenza"
              entries={products}
              value={productId}
              onChange={setProductId}
              empty="Nessun prodotto con nome esatto “Consulenza”. Crealo in Fatture in Cloud e ripeti la verifica."
            />
          ) : null}
          {step >= 6 ? (
            <div className="space-y-3 rounded-lg border p-4">
              <FicSummaryRow
                label="Azienda"
                value={preview?.company.name ?? company?.name ?? '—'}
              />
              <FicSummaryRow
                label="Prodotto"
                value={preview?.product.name ?? product?.name ?? '—'}
              />
              {preview ? (
                <>
                  <FicSummaryRow
                    label="Accessi"
                    value="Permessi azienda, fiscalità e prodotto verificati"
                  />
                  <FicSummaryRow
                    label="Anno del profilo"
                    value={String(
                      ficTaxProfileYear(preview.taxProfile.acquiredAt),
                    )}
                  />
                  <FicSummaryRow
                    label="Regime FIC"
                    value={
                      preview.taxProfile.regime
                        ? ficRegimeLabel(preview.taxProfile.regime)
                        : 'Non disponibile; valore attuale conservato'
                    }
                  />
                  <FicSummaryRow
                    label="Redditività"
                    value={
                      preview.taxProfile.profitCoefficient !== undefined
                        ? `${preview.taxProfile.profitCoefficient}%`
                        : 'Non disponibile; valore attuale conservato'
                    }
                  />
                  {preview.taxProfile.regime?.startsWith('forfettario') ? (
                    <FicSummaryRow
                      label="Imposta sostitutiva"
                      value={
                        preview.taxProfile.regime === 'forfettario_5'
                          ? 'Fase ridotta: 5%; ordinaria: 15%'
                          : 'Fase ordinaria: 15%; ridotta: 5%'
                      }
                    />
                  ) : null}
                  <FicSummaryRow
                    label="Contributi FIC"
                    value={
                      preview.taxProfile.contributionsPercentage !== undefined
                        ? `${preview.taxProfile.contributionsPercentage}% (dato di riferimento)`
                        : 'Non esposti'
                    }
                  />
                  <FicSummaryRow
                    label="IVA predefinita"
                    value={
                      preview.taxProfile.defaultVat
                        ? `${preview.taxProfile.defaultVat.description ?? preview.taxProfile.defaultVat.id}${preview.taxProfile.defaultVat.value !== undefined ? ` (${preview.taxProfile.defaultVat.value}%)` : ''}`
                        : 'Non esposta'
                    }
                  />
                  <p className="text-sm text-muted-foreground">
                    Il salvataggio applicherà regime e redditività disponibili
                    al profilo annuale. Aliquota INPS e conferme personali
                    restano a cura dell’utente. I dati saranno ricontrollati
                    alla conferma.
                  </p>
                </>
              ) : null}
              <FicSummaryRow
                label="Token"
                value="Già salvato nel Gestore credenziali locale"
              />
              <div className="flex items-start justify-between gap-4">
                <span className="text-muted-foreground">Scope richiesti</span>
                <FicPermissions
                  scopes={ficUi.setupInfo.requiredScopes}
                  align="end"
                />
              </div>
              {step === 7 ? (
                <Alert>
                  <Check />
                  <AlertTitle>Pronto per l’attivazione</AlertTitle>
                  <AlertDescription>
                    La verifica finale e il salvataggio di azienda e prodotto
                    completeranno l’attivazione. Il token locale resterà salvato
                    anche se l’operazione non riesce.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter className="justify-between">
          <Button
            variant="outline"
            onClick={() =>
              step === 1
                ? onOpenChange(false)
                : setStep((current) => current - 1)
            }
          >
            {step === 1 ? (
              'Annulla'
            ) : (
              <>
                <ArrowLeft />
                Indietro
              </>
            )}
          </Button>
          <Button
            onClick={() => void next()}
            disabled={
              busy ||
              (step === 1 && !clientId.trim()) ||
              (step === 2 && !token.trim()) ||
              (step === 4 && !companyId) ||
              (step === 5 && !productId)
            }
          >
            {busy ? (
              step === 2 ? (
                'Salvataggio…'
              ) : (
                'Verifica…'
              )
            ) : step === 7 ? (
              <>
                <Check />
                Conferma e attiva
              </>
            ) : (
              <>
                Continua <ArrowRight />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WizardCopy({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-lg border bg-muted/20 p-8 text-center">
      <div>
        <Cloud className="mx-auto size-8 text-muted-foreground" />
        <h3 className="mt-3 font-medium">{title}</h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
function ChoiceList({
  title,
  entries,
  value,
  onChange,
  empty,
}: {
  title: string;
  entries: Array<{ id: string; name: string }>;
  value: string;
  onChange: (value: string) => void;
  empty: string;
}) {
  return (
    <div>
      <p className="mb-3 font-medium">{title}</p>
      {entries.length ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <button
              type="button"
              key={entry.id}
              onClick={() => onChange(entry.id)}
              className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm ${value === entry.id ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'}`}
            >
              <span>{entry.name}</span>
              {value === entry.id ? <Check className="size-4" /> : null}
            </button>
          ))}
        </div>
      ) : (
        <Alert variant="destructive">
          <AlertDescription>{empty}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
const ficPermissionLabels: Record<string, string> = {
  'entity.clients:r': 'Clienti · lettura',
  'products:r': 'Prodotti · lettura',
  'settings:r': 'Fiscalità · lettura',
  'issued_documents.quotes:a': 'Preventivi · creazione',
  'issued_documents.invoices:r': 'Fatture · lettura',
  'issued_documents.credit_notes:r': 'Note di credito · lettura',
  'received_documents:r': 'Spese registrate · lettura',
};
export function ficTaxProfileYear(acquiredAt?: string): number | undefined {
  if (!acquiredAt) return undefined;
  const date = new Date(acquiredAt);
  return Number.isNaN(date.valueOf()) ? undefined : date.getFullYear();
}
export function ficRegimeLabel(regime?: string): string {
  return regime === 'forfettario_5'
    ? 'Forfettario 5%'
    : regime?.startsWith('forfettario')
      ? 'Forfettario'
      : regime || 'Regime non indicato';
}
export function FicPermissions({
  scopes,
  align = 'start',
}: {
  scopes: string[];
  align?: 'start' | 'end';
}) {
  return (
    <div
      className={`mt-1.5 flex flex-wrap gap-1.5 ${align === 'end' ? 'justify-end' : ''}`}
    >
      {scopes.map((scope) => (
        <Badge
          key={scope}
          variant="outline"
          className="font-normal"
          title={scope}
          aria-label={`${ficPermissionLabels[scope] ?? scope} (${scope})`}
        >
          {ficPermissionLabels[scope] ?? scope}
        </Badge>
      ))}
    </div>
  );
}
function FicSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <strong className="text-right font-medium">{value}</strong>
    </div>
  );
}
