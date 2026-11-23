import { useState } from 'react';
import { Pencil, Plus, Trash2, Upload } from 'lucide-react';
import {
  bankAccountDeletionError,
  bankAccountImportStatus,
  prepareBankAccount,
} from '../../domain/bank-accounts';
import type { BankAccount, CashDocument } from '../../domain/model';
import type { AppState } from '../state';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { dateIt, eur } from '@/lib/format';

// Movimenti: what to download next for each account, and its import button.
export function BankAccountsImportCard({
  doc,
  appState,
  readOnly,
}: {
  doc: CashDocument;
  appState: AppState;
  readOnly: boolean;
}) {
  const importing = appState.bankExpenseImporting;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Importa dai conti</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!doc.bankAccounts.length ? (
          <p className="text-sm text-muted-foreground">
            Per importare i movimenti da file XLSX o CSV, crea prima un conto
            (per esempio Fineco o Revolut) in Impostazioni → Conti bancari.
          </p>
        ) : (
          <ul className="divide-y">
            {doc.bankAccounts.map((account) => {
              const { lastExpense, exportFrom } = bankAccountImportStatus(
                doc,
                account.id,
              );
              return (
                <li
                  key={account.id}
                  className="flex flex-wrap items-center gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-60 flex-1 space-y-1 text-sm">
                    <p className="font-medium">{account.name}</p>
                    <p className="text-muted-foreground">
                      {lastExpense
                        ? `Ultima spesa importata: ${dateIt(lastExpense.date)} · ${lastExpense.description} · ${eur(lastExpense.amount)}`
                        : 'Nessuna spesa importata.'}
                    </p>
                    {exportFrom ? (
                      <p>
                        Scarica il file dal{' '}
                        <strong>{dateIt(exportFrom)}</strong> a oggi.
                        {account.pendingSince === exportFrom
                          ? ' Da questa data c’erano movimenti in attesa, non ancora importati.'
                          : ''}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    disabled={readOnly || importing}
                    onClick={() => void appState.importBankExpenses(account.id)}
                  >
                    {importing ? <Spinner aria-hidden="true" /> : <Upload />}
                    {importing ? 'Importazione in corso…' : 'Importa'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {doc.bankAccounts.length ? (
          <p className="text-xs text-muted-foreground">
            Puoi scaricare anche qualche giorno in più: i movimenti già presenti
            vengono riconosciuti. Si importano solo i movimenti contabilizzati;
            quelli in attesa entrano con un import successivo.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// Impostazioni → Conti bancari: create, rename and delete accounts.
export function BankAccountsSettings({
  doc,
  appState,
}: {
  doc: CashDocument;
  appState: AppState;
}) {
  const [editing, setEditing] = useState<{ account?: BankAccount }>();
  const [deleting, setDeleting] = useState<BankAccount>();
  const readOnly =
    appState.session?.readOnly || appState.status === 'Conflitto esterno';
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>Conti bancari</CardTitle>
        <Button
          variant="outline"
          disabled={readOnly}
          onClick={() => setEditing({})}
        >
          <Plus />
          Nuovo conto
        </Button>
      </CardHeader>
      <CardContent>
        {!doc.bankAccounts.length ? (
          <p className="text-sm text-muted-foreground">
            Crea un conto per ogni banca da cui importi le spese, per esempio
            Fineco o Revolut. L’import si fa da Spese → Movimenti.
          </p>
        ) : (
          <ul className="divide-y">
            {doc.bankAccounts.map((account) => {
              const used = doc.bankExpenses.filter(
                (expense) => expense.accountId === account.id,
              ).length;
              return (
                <li
                  key={account.id}
                  className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 text-sm">
                    <p className="font-medium">{account.name}</p>
                    <p className="text-muted-foreground">
                      {used} movimenti importati
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Rinomina ${account.name}`}
                    disabled={readOnly}
                    onClick={() => setEditing({ account })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Elimina ${account.name}`}
                    disabled={readOnly}
                    onClick={() => {
                      const problem = bankAccountDeletionError(doc, account.id);
                      if (problem)
                        appState.setError({
                          code: 'VALIDATION',
                          message: problem,
                        });
                      else setDeleting(account);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      {editing ? (
        <BankAccountDialog
          doc={doc}
          appState={appState}
          account={editing.account}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminare il conto {deleting?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Il conto non ha movimenti importati. Potrai crearlo di nuovo in
              qualsiasi momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={readOnly}
              onClick={() => {
                if (!deleting || readOnly) return;
                appState.mutate((document) => {
                  document.bankAccounts = document.bankAccounts.filter(
                    (account) => account.id !== deleting.id,
                  );
                });
                setDeleting(undefined);
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// Mounted only while editing, so the draft name resets for each dialog.
function BankAccountDialog({
  doc,
  appState,
  account,
  onClose,
}: {
  doc: CashDocument;
  appState: AppState;
  account?: BankAccount;
  onClose(): void;
}) {
  const [name, setName] = useState(account?.name ?? '');
  const prepared = prepareBankAccount(doc.bankAccounts, name, account?.id);
  const save = () => {
    if (!prepared.ok) return;
    const saved = appState.mutate((document) => {
      const index = document.bankAccounts.findIndex(
        (entry) => entry.id === prepared.value.id,
      );
      if (index >= 0) document.bankAccounts[index] = prepared.value;
      else document.bankAccounts.push(prepared.value);
    });
    if (saved) onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {account ? 'Rinomina conto' : 'Nuovo conto'}
            </DialogTitle>
            <DialogDescription>
              Il nome serve a riconoscere da quale banca arrivano le spese.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="bank-account-name" className="text-sm font-medium">
              Nome del conto
            </label>
            <Input
              id="bank-account-name"
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {!prepared.ok && name.trim() ? (
              <p className="text-sm text-destructive">
                {prepared.error.message}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={!prepared.ok}>
              {account ? 'Salva' : 'Crea conto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
