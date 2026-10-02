import { useState } from 'react';
import { money } from '../../domain/decimal';
import { newId, type FinancialProvision } from '../../domain/model';
import { financialProvisionSchema } from '../../domain/schema';
import type { AppState } from '../state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { decimalInputValue } from '@/lib/format';

export function FinancialProvisionDialog({ year, provision, appState, onClose }: {
  year: number; provision?: FinancialProvision; appState: AppState; onClose(): void;
}) {
  const [covered, setCovered] = useState(provision?.covered.replace('.', ',') ?? '0,00');
  const [additions, setAdditions] = useState(() => (provision?.additions ?? []).map(row => ({ ...row, amount: row.amount.replace('.', ','), key: newId() })));
  const [balance, setBalance] = useState(provision?.bankBalance?.amount.replace('.', ',') ?? '');
  const [date, setDate] = useState(provision?.bankBalance?.date ?? '');
  const [error, setError] = useState<string>();
  const readOnly = appState.session?.readOnly || appState.status === 'Conflitto esterno';
  const save = () => {
    if (readOnly) return;
    const parsed = financialProvisionSchema.safeParse({ year, covered: decimalInputValue(covered),
      additions: additions.map(row => ({ description: row.description, amount: decimalInputValue(row.amount) })),
      bankBalance: balance.trim() || date ? { amount: decimalInputValue(balance), date } : undefined });
    if (!parsed.success) {
      setError('Controlla descrizioni e importi: copertura e integrazioni devono essere non negativi, con massimo due decimali. Per il saldo servono sia importo sia data valida.');
      return;
    }
    const value = parsed.data;
    value.covered = money(value.covered);
    value.additions = value.additions.map(row => ({ ...row, amount: money(row.amount) }));
    if (value.bankBalance) value.bankBalance.amount = money(value.bankBalance.amount);
    if (appState.mutate(document => {
      document.financialProvisions = [...document.financialProvisions.filter(entry => entry.year !== year), value];
    })) onClose();
    else setError(appState.error?.message ?? 'Modifica non disponibile in questo momento.');
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
    <form className="contents" onSubmit={event => { event.preventDefault(); save(); }}>
      <DialogHeader><DialogTitle>Situazione fiscale · {year}</DialogTitle><DialogDescription>Modifica la previsione finanziaria dell’anno selezionato. Le modifiche vengono applicate con Salva.</DialogDescription></DialogHeader>
      <div className="space-y-2"><Label htmlFor="fiscal-covered">Già coperto (€)</Label>
        <Input id="fiscal-covered" inputMode="decimal" required value={covered} disabled={readOnly} onChange={event => setCovered(event.target.value)} />
        <p className="text-xs text-muted-foreground">Solo la parte della previsione già soddisfatta, indicata da te. I pagamenti bancari non aggiornano questo valore automaticamente.</p>
      </div>
      <Separator />
      <fieldset className="space-y-3" disabled={readOnly}><legend className="mb-2 text-sm font-medium">Integrazioni manuali</legend>
        <p className="text-xs text-muted-foreground">Importi noti non compresi nella stima automatica, ad esempio un acconto futuro o il bollo previsto.</p>
        {additions.map((row, index) => <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
          <div className="space-y-2"><Label htmlFor={`addition-description-${row.key}`}>Descrizione {index + 1}</Label><Input id={`addition-description-${row.key}`} required value={row.description} onChange={event => setAdditions(rows => rows.map(item => item.key === row.key ? { ...item, description: event.target.value } : item))} /></div>
          <div className="space-y-2"><Label htmlFor={`addition-amount-${row.key}`}>Importo (€)</Label><Input id={`addition-amount-${row.key}`} inputMode="decimal" required value={row.amount} onChange={event => setAdditions(rows => rows.map(item => item.key === row.key ? { ...item, amount: event.target.value } : item))} /></div>
          <Button type="button" variant="outline" aria-label={`Rimuovi integrazione ${index + 1}`} onClick={() => setAdditions(rows => rows.filter(item => item.key !== row.key))}>Rimuovi</Button>
        </div>)}
        <Button type="button" variant="outline" onClick={() => setAdditions(rows => [...rows, { key: newId(), description: '', amount: '' }])}>Aggiungi integrazione</Button>
      </fieldset>
      <Separator />
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
