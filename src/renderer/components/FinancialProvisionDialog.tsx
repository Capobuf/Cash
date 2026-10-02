import { useState } from 'react';
import { money } from '../../domain/decimal';
import type { FinancialProvision } from '../../domain/model';
import { financialProvisionSchema } from '../../domain/schema';
import type { AppState } from '../state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { decimalInputValue } from '@/lib/format';

export function FinancialProvisionDialog({ year, provision, appState, onClose }: {
  year: number; provision?: FinancialProvision; appState: AppState; onClose(): void;
}) {
  const [balance, setBalance] = useState(provision?.bankBalance?.amount.replace('.', ',') ?? '');
  const [date, setDate] = useState(provision?.bankBalance?.date ?? '');
  const [error, setError] = useState<string>();
  const readOnly = appState.session?.readOnly || appState.status === 'Conflitto esterno';
  const save = () => {
    if (readOnly) return;
    const parsed = financialProvisionSchema.safeParse({ year,
      bankBalance: balance.trim() || date ? { amount: decimalInputValue(balance), date } : undefined });
    if (!parsed.success) {
      setError('Per il saldo servono un importo con massimo due decimali e una data valida.');
      return;
    }
    const value = parsed.data;
    if (value.bankBalance) value.bankBalance.amount = money(value.bankBalance.amount);
    if (appState.mutate(document => {
      document.financialProvisions = [...document.financialProvisions.filter(entry => entry.year !== year), value];
    })) onClose();
    else setError(appState.error?.message ?? 'Modifica non disponibile in questo momento.');
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <form className="contents" onSubmit={event => { event.preventDefault(); save(); }}>
      <DialogHeader><DialogTitle>Saldo bancario · {year}</DialogTitle><DialogDescription>Inserisci il saldo reale del conto e la sua data di riferimento.</DialogDescription></DialogHeader>
      <fieldset className="space-y-3" disabled={readOnly}><legend className="mb-2 text-sm font-medium">Saldo bancario di riferimento</legend>
        <p className="text-xs text-muted-foreground">Inserisci il saldo reale del conto, già comprensivo dei pagamenti effettuati. Aggiornalo manualmente quando cambia: l’importazione delle uscite non lo aggiorna. Lascia entrambi i campi vuoti per rimuoverlo.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="financial-balance">Saldo (€)</Label><Input id="financial-balance" inputMode="decimal" value={balance} onChange={event => setBalance(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="financial-balance-date">Data del saldo</Label><Input id="financial-balance-date" type="date" value={date} onChange={event => setDate(event.target.value)} /></div>
        </div>
      </fieldset>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Annulla</Button><Button type="submit" disabled={readOnly}>Salva situazione</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
