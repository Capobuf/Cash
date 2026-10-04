import { useEffect, useState } from 'react';
import type { AppState } from '../../state';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

export function OpenRouteServiceCard({ appState }: { appState: AppState }) {
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState<boolean>();
  const [keyReadError, setKeyReadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string }>();
  useEffect(() => {
    let active = true;
    void window.cash.ors.hasApiKey().then((result) => {
      if (!active) return;
      if (result.ok) setHasKey(result.value);
      else {
        setKeyReadError(true);
        setOutcome({ ok: false, message: result.error.message });
        appState.setError(result.error);
      }
    });
    return () => {
      active = false;
    };
  }, [appState]);
  const verify = async () => {
    setBusy(true);
    setOutcome(undefined);
    if (apiKey.trim()) {
      const saved = await window.cash.ors.setApiKey(apiKey);
      if (!saved.ok) {
        setBusy(false);
        appState.setError(saved.error);
        return;
      }
      setHasKey(true);
      setKeyReadError(false);
      setApiKey('');
    }
    const result = await window.cash.ors.verify();
    setBusy(false);
    setOutcome(
      result.ok
        ? {
            ok: true,
            message:
              'Connessione verificata con una richiesta autenticata reale.',
          }
        : {
            ok: false,
            message: [result.error.message, result.error.action]
              .filter(Boolean)
              .join(' '),
          },
    );
  };
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>OpenRouteService</CardTitle>
          <CardDescription>
            Geocodifica e percorso stradale. La chiave resta nel Gestore
            credenziali locale.
          </CardDescription>
        </div>
        <CardAction>
          <Badge
            variant={outcome?.ok ? 'default' : hasKey ? 'secondary' : 'outline'}
          >
            {outcome?.ok
              ? 'Verificata'
              : keyReadError
                ? 'Non verificabile'
                : hasKey === undefined
                  ? 'Verifica credenziali…'
                  : hasKey
                    ? 'Chiave presente'
                    : 'Da configurare'}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field>
          <FieldLabel htmlFor="ors-key">API key</FieldLabel>
          <Input
            id="ors-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              hasKey
                ? 'Inserisci solo per sostituire la chiave'
                : 'Inserisci la API key'
            }
          />
          <FieldDescription>
            Non viene registrata nei log né salvata nell’archivio condiviso.
          </FieldDescription>
        </Field>
        <Button
          onClick={() => void verify()}
          disabled={busy || (!hasKey && !apiKey.trim())}
        >
          {busy ? 'Verifica…' : 'Verifica connessione'}
        </Button>
        {outcome ? (
          <Alert variant={outcome.ok ? 'default' : 'destructive'}>
            <AlertDescription>{outcome.message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
