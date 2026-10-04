import { Cloud } from 'lucide-react';
import { useEffect, useState } from 'react';
import { disableFic } from '../../../domain/integration';
import type { CashDocument } from '../../../domain/model';
import type { AppState } from '../../state';
import { FicAccessPanel } from '@/components/FicAccessPanel';
import {
  FicWizard,
  FicPermissions,
  ficRegimeLabel,
  type FicUiState,
} from './FicWizard';
import { OpenRouteServiceCard } from './OpenRouteServiceCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { TabsContent } from '@/components/ui/tabs';

export function IntegrationsSettings({
  doc,
  appState,
  ficUi,
}: {
  doc: CashDocument;
  appState: AppState;
  ficUi: FicUiState;
}) {
  // Keep FIC drafts and dialogs above the tab panel, which unmounts when inactive.
  const [removeFicOpen, setRemoveFicOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [clientId, setClientId] = useState(ficUi.setupInfo.clientId);
  const [savingClientId, setSavingClientId] = useState(false);
  const fic = doc.settings.fic;
  const deviceState = !fic.enabled
    ? 'Disattivata'
    : ficUi.connectionError || fic.lastVerification?.result === 'error'
      ? 'Errore collegamento'
      : !ficUi.hasToken
        ? 'Richiede configurazione locale'
        : 'Attiva';

  useEffect(
    () => setClientId(ficUi.setupInfo.clientId),
    [ficUi.setupInfo.clientId],
  );

  const saveClientId = async () => {
    setSavingClientId(true);
    const result = await window.cash.fic.setClientId(clientId);
    setSavingClientId(false);
    if (!result.ok) {
      appState.setError(result.error);
      return;
    }
    ficUi.setSetupInfo({ ...ficUi.setupInfo, clientId: result.value.clientId });
  };

  const removeFic = async () => {
    // The native operation must receive the saved document and its latest token.
    await appState.save();
    if (appState.status !== 'Salvato' || !appState.session?.document) return;
    const removed = await window.cash.fic.removeLink({
      path: appState.session.path,
      document: appState.session.document,
      concurrencyToken: appState.session.token,
    });
    if (!removed.ok) {
      appState.setError(removed.error);
      return;
    }
    ficUi.setHasToken(false);
    appState.acceptNativeSession(removed.value);
  };

  return (
    <>
      <TabsContent value="integrations">
        <div className="space-y-4">
          <OpenRouteServiceCard appState={appState} />
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Fatture in Cloud</CardTitle>
                <CardDescription>
                  Clienti, esportazione preventivi e lettura dei dati
                  finanziari. Gli snapshot restano consultabili anche se
                  disattivata.
                </CardDescription>
              </div>
              <CardAction>
                <Badge
                  variant={
                    deviceState === 'Attiva'
                      ? 'default'
                      : deviceState === 'Errore collegamento'
                        ? 'destructive'
                        : 'secondary'
                  }
                >
                  {deviceState}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-5">
              <Alert>
                <Cloud />
                <AlertTitle>
                  {fic.company?.name ?? 'Azienda non configurata'}
                </AlertTitle>
                <AlertDescription>
                  {fic.enabled
                    ? `${fic.product?.name ?? 'Prodotto non configurato'} · ultima verifica ${fic.lastVerification?.at ?? '—'}`
                    : 'Nessuna chiamata al servizio viene eseguita.'}
                </AlertDescription>
              </Alert>
              <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm">
                <Field className="col-span-2">
                  <FieldLabel htmlFor="fic-client-id">
                    Client ID app privata
                  </FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="fic-client-id"
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                      placeholder="Inserisci il Client ID"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void saveClientId()}
                      disabled={
                        savingClientId ||
                        !clientId.trim() ||
                        clientId.trim() === ficUi.setupInfo.clientId
                      }
                    >
                      {savingClientId ? 'Salvataggio…' : 'Salva'}
                    </Button>
                  </div>
                  <FieldDescription>
                    Salvato solo nelle preferenze locali di questa postazione.
                  </FieldDescription>
                </Field>
                <div>
                  <p className="text-muted-foreground">Token</p>
                  <p className="mt-1 font-medium">
                    {ficUi.hasToken
                      ? 'Presente nel Gestore credenziali'
                      : 'Assente su questa postazione'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">
                    Scope richiesti da Cash
                  </p>
                  <FicPermissions scopes={ficUi.setupInfo.requiredScopes} />
                </div>
                {fic.taxProfile ? (
                  <div className="col-span-2 flex flex-wrap items-center gap-2 border-t pt-4">
                    <span className="text-muted-foreground">
                      Fiscalità aziendale
                    </span>
                    <Badge variant="secondary">
                      {ficRegimeLabel(fic.taxProfile.regime)}
                    </Badge>
                    {fic.taxProfile.profitCoefficient ? (
                      <Badge variant="outline">
                        Redditività {fic.taxProfile.profitCoefficient}%
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      importata da Fatture in Cloud
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {fic.enabled ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      appState.mutate((document) => {
                        document.settings = disableFic(document.settings);
                      })
                    }
                  >
                    Disattiva
                  </Button>
                ) : null}
                {!fic.enabled &&
                fic.company &&
                fic.product &&
                ficUi.hasToken ? (
                  <Button
                    onClick={() =>
                      appState.mutate((document) => {
                        document.settings.fic.enabled = true;
                      })
                    }
                  >
                    Riattiva
                  </Button>
                ) : null}
                <Button onClick={() => setWizardOpen(true)}>
                  {fic.company && fic.product
                    ? ficUi.hasToken
                      ? 'Riconfigura postazione'
                      : 'Configura questa postazione'
                    : 'Configura Fatture in Cloud'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setRemoveFicOpen(true)}
                  disabled={!fic.company && !ficUi.hasToken}
                >
                  Rimuovi collegamento
                </Button>
              </div>
              <FicAccessPanel
                key={`${doc.documentId}:${fic.company?.id}:${ficUi.hasToken}:${fic.enabled}:${wizardOpen}:${fic.lastVerification?.at}`}
                companyId={fic.company?.id}
                enabled={fic.enabled && ficUi.hasToken}
                appState={appState}
              />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <FicWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        appState={appState}
        ficUi={ficUi}
      />
      <AlertDialog open={removeFicOpen} onOpenChange={setRemoveFicOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovere il collegamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Il token locale e la configurazione condivisa saranno rimossi.
              Sedi, preventivi e snapshot storici resteranno invariati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void removeFic()}
            >
              Rimuovi collegamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
