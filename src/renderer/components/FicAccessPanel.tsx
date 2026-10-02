import { useState } from 'react';
import type { FicAccessVerification } from '../../domain/integration';
import type { AppState } from '../state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function permissionRows(
  permissions: Record<string, unknown>,
  prefix = '',
): Array<[string, string]> {
  return Object.entries(permissions).flatMap(([key, value]) => {
    const name = prefix ? `${prefix} → ${key}` : key;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? permissionRows(value as Record<string, unknown>, name)
      : [
          [
            name,
            value == null
              ? 'Non esposto'
              : typeof value === 'string'
                ? value
                : JSON.stringify(value),
          ],
        ];
  });
}

export function FicAccessPanel({
  companyId,
  enabled,
  appState,
}: {
  companyId?: string;
  enabled: boolean;
  appState: AppState;
}) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<FicAccessVerification>();
  const verify = async () => {
    if (!companyId || !enabled || busy) return;
    setBusy(true);
    setReport(undefined);
    try {
      const result = await window.cash.fic.verifyPermissions({ companyId });
      if (result.ok) setReport(result.value);
      else appState.setError(result.error);
    } catch {
      appState.setError({
        code: 'SOURCE_UNAVAILABLE',
        message: 'Verifica permessi non riuscita. Ripeti l’operazione.',
      });
    } finally {
      setBusy(false);
    }
  };
  const currentReport =
    enabled && report?.company.id === companyId ? report : undefined;
  return (
    <section
      className="space-y-3 border-t pt-4"
      aria-label="Verifica permessi Fatture in Cloud"
    >
      <Button
        variant="outline"
        disabled={!enabled || !companyId || busy}
        onClick={() => void verify()}
      >
        {busy ? 'Verifica in corso…' : 'Verifica permessi'}
      </Button>
      <p className="text-sm text-muted-foreground">
        Fatture in Cloud espone i permessi dell’utente sull’azienda. Gli scope
        del token manuale non sono esposti come lista interrogabile da Cash;
        l’accesso effettivo viene confermato dalle richieste API.
      </p>
      {currentReport ? (
        <>
          <p className="text-xs text-muted-foreground">
            {currentReport.company.name} · verifica live del{' '}
            {new Date(currentReport.checkedAt).toLocaleString('it-IT')}
          </p>
          <h3 className="font-medium">Accessi richiesti da Cash</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funzione / scope richiesto</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Evidenza</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentReport.requiredAccess.map((access) => (
                <TableRow key={access.scope}>
                  <TableCell className="whitespace-normal">
                    <p className="font-medium">{access.label}</p>
                    <code className="text-xs break-all text-muted-foreground">
                      {access.scope}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        access.status === 'available'
                          ? 'default'
                          : access.status === 'unavailable'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {access.status === 'available'
                        ? 'Disponibile'
                        : access.status === 'unavailable'
                          ? 'Non disponibile'
                          : 'Non verificabile direttamente'}
                    </Badge>
                  </TableCell>
                  <TableCell className="min-w-48 whitespace-normal text-muted-foreground">
                    {access.detail}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Collapsible>
            <CollapsibleTrigger render={<Button variant="ghost" />}>
              Permessi azienda · mostra / nascondi
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Permesso FIC</TableHead>
                    <TableHead>Livello</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {permissionRows(currentReport.companyPermissions).map(
                    ([key, value]) => (
                      <TableRow key={key}>
                        <TableCell className="whitespace-normal break-all">
                          {key}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              value === 'none'
                                ? 'destructive'
                                : value === 'write'
                                  ? 'default'
                                  : value === 'read' || value === 'detailed'
                                    ? 'secondary'
                                    : 'outline'
                            }
                          >
                            {value}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </CollapsibleContent>
          </Collapsible>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Gli scope richiesti dalla configurazione non attestano gli accessi
          concessi. Avvia la verifica per consultarne l’esito.
        </p>
      )}
    </section>
  );
}
