import { Spinner } from '@/components/ui/spinner';
import { Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FicAccessVerification } from '../../domain/integration';
import type { AppState } from '../state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<FicAccessVerification>();
  const verify = async () => {
    if (!companyId || !enabled || busy) return;
    setBusy(true);
    setReport(undefined);
    try {
      const result = await window.cash.fic.verifyPermissions({ companyId });
      if (!active.current) return;
      if (result.ok) {
        setReport(result.value);
        appState.notifyFicSuccess(
          'Verifica accessi completata',
          'Consulta il report per gli accessi disponibili e quelli da verificare.',
        );
      } else appState.setError(result.error);
    } catch {
      if (!active.current) return;
      appState.setError({
        source: 'FattureInCloud',
        code: 'SOURCE_UNAVAILABLE',
        message: 'Verifica permessi non riuscita. Ripeti l’operazione.',
      });
    } finally {
      if (active.current) setBusy(false);
    }
  };
  const currentReport =
    enabled && report?.company.id === companyId ? report : undefined;
  return (
    <section
      className="space-y-3 border-t pt-4"
      aria-label="Verifica permessi Fatture in Cloud"
    >
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          disabled={!enabled || !companyId || busy}
          onClick={() => void verify()}
        >
          {busy ? <Spinner aria-hidden="true" /> : null}
          {busy ? 'Verifica in corso…' : 'Verifica permessi'}
        </Button>
        <Tooltip>
          <TooltipTrigger
            render={<Button type="button" variant="ghost" size="icon-sm" />}
            aria-label="Informazioni sulla verifica permessi"
          >
            <Info />
          </TooltipTrigger>
          <TooltipContent>
            Controlla quali funzioni sono disponibili per l’azienda collegata. I
            permessi richiesti in configurazione possono differire da quelli
            effettivamente concessi.
          </TooltipContent>
        </Tooltip>
      </div>
      {currentReport ? (
        <>
          <p className="text-xs text-muted-foreground">
            {currentReport.company.name} · ultima verifica{' '}
            {new Date(currentReport.checkedAt).toLocaleString('it-IT')}
          </p>
          <h3 className="font-medium">Accessi richiesti da Cash</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funzione</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Dettagli</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentReport.requiredAccess.map((access) => (
                <TableRow key={access.scope}>
                  <TableCell className="whitespace-normal">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            className="text-left font-medium"
                          />
                        }
                      >
                        {access.label}
                      </TooltipTrigger>
                      <TooltipContent>{access.scope}</TooltipContent>
                    </Tooltip>
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
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                          />
                        }
                        aria-label={`Dettagli: ${access.label}`}
                      >
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent>{access.detail}</TooltipContent>
                    </Tooltip>
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
      ) : null}
    </section>
  );
}
