import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  FileSpreadsheet,
  Info,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  bankAccountDeletionError,
  bankAccountImportStatus,
  bankImportConfigFromDraft,
  bankImportDraft,
  bankImportPresetName,
  bankImportPresets,
  prepareBankAccount,
  type BankImportDraft,
} from '../../domain/bank-accounts';
import {
  bankExpenseIdentity,
  deduplicateBankExpenses,
} from '../../domain/bank-expenses';
import {
  err,
  touch,
  type BankAccount,
  type BankExpensePreview,
  type BankImportConfig,
  type CashDocument,
  type CashError,
  type Result,
} from '../../domain/model';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/selection-field';
import { Spinner } from '@/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  const [choosing, setChoosing] = useState<BankAccount>();
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
                    onClick={() =>
                      account.importConfig
                        ? void appState.importBankExpenses(account.id)
                        : setChoosing(account)
                    }
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
      {choosing ? (
        <BankFormatChoice
          account={choosing}
          appState={appState}
          onClose={() => setChoosing(undefined)}
        />
      ) : null}
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
  const [openId, setOpenId] = useState<string>();
  const readOnly =
    appState.session?.readOnly || appState.status === 'Conflitto esterno';
  const open = doc.bankAccounts.find((account) => account.id === openId);
  if (open)
    return (
      <BankAccountPage
        key={open.id}
        doc={doc}
        account={open}
        appState={appState}
        onClose={() => setOpenId(undefined)}
      />
    );
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
            Fineco o Revolut. Apri un conto per scegliere come leggere i suoi
            file; l’import si fa da Spese → Movimenti.
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
                  <button
                    type="button"
                    className="-mx-2 flex flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-label={`Apri ${account.name}`}
                    onClick={() => setOpenId(account.id)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-medium">
                        {account.name}
                        <Badge
                          variant={
                            account.importConfig ? 'secondary' : 'outline'
                          }
                        >
                          Formato:{' '}
                          {bankImportPresetName(account.importConfig) ??
                            'da scegliere'}
                        </Badge>
                      </span>
                      <span className="block text-muted-foreground">
                        {used} movimenti importati
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                  </button>
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

const sampleLabels = (cells: string[] = []) => [
  ...new Set(cells.filter(Boolean)),
];
// The header is usually the widest of the first rows; the user can change it.
const widestRow = (rows: string[][]) =>
  rows
    .slice(0, 30)
    .reduce(
      (best, cells, index) =>
        sampleLabels(cells).length > sampleLabels(rows[best]).length
          ? index
          : best,
      0,
    );

function saveImportConfig(
  appState: AppState,
  accountId: string,
  config: BankImportConfig,
): boolean {
  return appState.mutate((document) => {
    const target = document.bankAccounts.find(
      (entry) => entry.id === accountId,
    );
    if (!target) return;
    target.importConfig = config;
    touch(target);
  });
}

// Movimenti → Importa on an account without a format: pick a preset, or
// configure another bank from its page in Impostazioni.
function BankFormatChoice({
  account,
  appState,
  onClose,
}: {
  account: BankAccount;
  appState: AppState;
  onClose(): void;
}) {
  const presetNames = Object.keys(
    bankImportPresets,
  ) as (keyof typeof bankImportPresets)[];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Che file usa {account.name}?</DialogTitle>
          <DialogDescription>
            Scegli il formato una volta sola: Cash lo ricorda per questo conto.
            Per un’altra banca apri il conto in Impostazioni → Conti bancari e
            carica un file di prova.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Annulla
          </Button>
          {presetNames.map((name) => (
            <Button
              key={name}
              type="button"
              onClick={() => {
                const saved = saveImportConfig(
                  appState,
                  account.id,
                  bankImportPresets[name],
                );
                onClose();
                if (saved) void appState.importBankExpenses(account.id);
              }}
            >
              {name}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type MappingKey =
  | 'date'
  | 'dateFallback'
  | 'time'
  | 'description'
  | 'descriptionFallback'
  | 'amount'
  | 'extra'
  | 'status'
  | 'currency';
interface CashField {
  key: MappingKey;
  label: string;
  /** Amount fields also decide how the outflow is written. */
  kind?: BankImportDraft['kind'];
}
// The Cash fields a file column can feed, in menu order.
const cashFields: CashField[][] = [
  [
    { key: 'date', label: 'Data' },
    { key: 'dateFallback', label: 'Data di riserva' },
    { key: 'time', label: 'Ora' },
  ],
  [
    { key: 'description', label: 'Descrizione' },
    { key: 'descriptionFallback', label: 'Descrizione di riserva' },
  ],
  [
    { key: 'amount', kind: 'debit', label: 'Uscite' },
    { key: 'extra', kind: 'debit', label: 'Entrate' },
    { key: 'amount', kind: 'signed', label: 'Importo con segno (+/−)' },
    { key: 'extra', kind: 'signed', label: 'Commissione' },
  ],
  [
    { key: 'status', label: 'Stato' },
    { key: 'currency', label: 'Valuta' },
  ],
];
const columnOf = (draft: BankImportDraft, field: CashField) =>
  !field.kind || field.kind === draft.kind ? draft[field.key] : '';

type RowOutcome =
  'Nuova' | 'Già in Cash' | 'Ripetuta nel file' | 'In attesa' | 'Entrata';
const outcomeVariant = {
  Nuova: 'default',
  'Già in Cash': 'secondary',
  'Ripetuta nel file': 'secondary',
  'In attesa': 'outline',
  Entrata: 'outline',
} as const;

// Rows shown under the header while assigning the columns.
const MAPPING_ROWS = 5;
// shortcut: the import tables show the first 50 rows, enough to check a
// bank export; add paging if a sample ever needs more.
const SAMPLE_ROWS = 50;
// The box scrolls the table, not the table container, so the header can stick.
const tableBox =
  'h-[28rem] overflow-auto rounded-lg border [&_[data-slot=table-container]]:overflow-visible';

function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button type="button" variant="ghost" size="icon-xs" />}
        aria-label={label}
      >
        <Info />
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{children}</TooltipContent>
    </Tooltip>
  );
}

// Impostazioni → Conti bancari → conto: the file's columns linked to Cash
// fields, then the sample file next to what would enter Cash.
function BankAccountPage({
  doc,
  account,
  appState,
  onClose,
}: {
  doc: CashDocument;
  account: BankAccount;
  appState: AppState;
  onClose(): void;
}) {
  const readOnly =
    appState.session?.readOnly || appState.status === 'Conflitto esterno';
  const [draft, setDraft] = useState(() =>
    bankImportDraft(account.importConfig),
  );
  const [sample, setSample] = useState<{ name: string; rows: string[][] }>();
  const [sampleError, setSampleError] = useState<CashError>();
  const [headerRow, setHeaderRow] = useState(0);
  const [preview, setPreview] = useState<{
    json: string;
    result: Result<BankExpensePreview>;
  }>();
  const [loading, setLoading] = useState(false);
  const config = bankImportConfigFromDraft(draft);
  const json = config && JSON.stringify(config);
  const savedConfig =
    account.importConfig &&
    bankImportConfigFromDraft(bankImportDraft(account.importConfig));
  const unchanged = !!savedConfig && JSON.stringify(savedConfig) === json;
  const preset = bankImportPresetName(config);
  const previewed = preview?.json === json ? preview?.result : undefined;
  const needsPreview = preset === 'Personalizzato' && previewed?.ok !== true;
  const canSave = !readOnly && !!config && !unchanged && !needsPreview;
  // Re-read the sample whenever the rules change, so the result stays current.
  useEffect(() => {
    if (!sample || !json) return;
    let current = true;
    window.cash.bankExpenses
      .previewSample(JSON.parse(json) as BankImportConfig)
      .catch(() =>
        err({ code: 'IO', message: 'Impossibile leggere il file di prova.' }),
      )
      .then((result) => {
        if (current) setPreview({ json, result });
      });
    return () => {
      current = false;
    };
  }, [sample, json]);
  const set = (change: Partial<BankImportDraft>) =>
    setDraft((current) => ({ ...current, ...change }));
  const assign = (field: CashField, column: string) =>
    setDraft((current) => ({
      ...current,
      // Switching between "Uscite" and "Importo" drops the other amount columns.
      ...(field.kind && field.kind !== current.kind
        ? { kind: field.kind, amount: '', extra: '' }
        : {}),
      [field.key]: column,
      ...(field.key === 'status' ? { booked: [] } : {}),
      ...(field.key === 'currency' ? { currencyValue: '' } : {}),
    }));
  const unassign = (column: string) =>
    setDraft((current) => {
      const next = { ...current };
      for (const field of cashFields.flat())
        if (columnOf(next, field) === column) next[field.key] = '';
      if (!next.status) next.booked = [];
      if (!next.currency) next.currencyValue = '';
      return next;
    });
  const rowWith = (rows: string[][], headers: string[]) =>
    headers.length
      ? rows.findIndex((cells) => headers.every((h) => cells.includes(h)))
      : -1;
  const usePreset = (name: keyof typeof bankImportPresets) => {
    setDraft(bankImportDraft(bankImportPresets[name]));
    const row = sample
      ? rowWith(sample.rows, bankImportPresets[name].headers)
      : -1;
    if (row >= 0) setHeaderRow(row);
  };
  const moveHeader = (step: 1 | -1) => {
    if (!sample) return;
    let row = headerRow + step;
    while (sample.rows[row] && !sample.rows[row]!.some(Boolean)) row += step;
    if (!sample.rows[row]) return;
    setHeaderRow(row);
    setDraft({
      ...bankImportDraft(),
      decimal: draft.decimal,
      headers: sampleLabels(sample.rows[row]),
    });
  };
  // Without a sample the saved header labels still show the mapping.
  const headerCells = sample?.rows[headerRow] ?? draft.headers;
  // Sample rows sit at index row number − 1; empty rows are hidden.
  const body = (sample?.rows ?? [])
    .map((cells, index) => ({ cells, number: index + 1 }))
    .slice(headerRow + 1)
    .filter(({ cells }) => cells.some(Boolean));
  const valuesOf = (column: string, current: string[]) => {
    const index = column ? headerCells.indexOf(column) : -1;
    const found = index < 0 ? [] : body.map(({ cells }) => cells[index] ?? '');
    return [...new Set([...current, ...found].filter(Boolean))];
  };
  const loadSample = async () => {
    setLoading(true);
    try {
      const result = await window.cash.bankExpenses.openSample();
      if (!result.ok) {
        if (result.error.code !== 'CANCELLED') setSampleError(result.error);
        return;
      }
      const { rows } = result.value;
      const known = rowWith(rows, draft.headers);
      const row = known >= 0 ? known : widestRow(rows);
      setSampleError(undefined);
      setSample(result.value);
      setHeaderRow(row);
      if (known < 0)
        setDraft({ ...bankImportDraft(), headers: sampleLabels(rows[row]) });
    } finally {
      setLoading(false);
    }
  };
  const disabled = readOnly || loading;
  const rolesOf = (column: string) =>
    column
      ? cashFields
          .flat()
          .filter((field) => columnOf(draft, field) === column)
          .map((field) => field.label)
      : [];
  const missing = [
    !draft.date && 'Data',
    !draft.description && 'Descrizione',
    !draft.amount && 'Uscite o Importo',
    draft.status && !draft.booked.length && 'valori contabilizzati',
    draft.currency && !draft.currencyValue && 'valuta ammessa',
  ].filter(Boolean);
  const presetNames = Object.keys(
    bankImportPresets,
  ) as (keyof typeof bankImportPresets)[];
  const result = previewed?.ok
    ? deduplicateBankExpenses(doc.bankExpenses, previewed.value.rows)
    : undefined;
  // The same checks as the import, row by row, to label the sample file.
  const outcomes = new Map<number, RowOutcome>();
  if (previewed?.ok) {
    const present = new Set(doc.bankExpenses.map(bankExpenseIdentity));
    const seen = new Set<string>();
    for (const outcome of previewed.value.outcomes) {
      if (outcome.kind !== 'expense') {
        outcomes.set(
          outcome.row,
          outcome.kind === 'income' ? 'Entrata' : 'In attesa',
        );
        continue;
      }
      const key = bankExpenseIdentity(outcome.expense);
      outcomes.set(
        outcome.row,
        present.has(key)
          ? 'Già in Cash'
          : seen.has(key)
            ? 'Ripetuta nel file'
            : 'Nuova',
      );
      seen.add(key);
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft />
          Conti bancari
        </Button>
        <div className="h-6 w-px bg-border" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <h2 className="truncate text-lg font-semibold">{account.name}</h2>
          <Badge variant="secondary">
            Formato:{' '}
            {bankImportPresetName(account.importConfig) ?? 'da scegliere'}
          </Badge>
          {config && !unchanged ? (
            <Badge variant="outline">Modifiche non salvate</Badge>
          ) : null}
        </div>
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => void loadSample()}
        >
          {loading ? <Spinner aria-hidden="true" /> : <Upload />}
          Carica file di prova
        </Button>
        <Button
          disabled={!canSave}
          title={
            config && needsPreview && !unchanged
              ? 'Carica un file di prova letto senza errori per salvare'
              : undefined
          }
          onClick={() => {
            if (canSave) saveImportConfig(appState, account.id, config);
          }}
        >
          <Save />
          Salva formato
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Colonne del file</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-48 space-y-1.5">
              <label htmlFor="bank-import-preset" className="font-medium">
                Modello
              </label>
              <SelectField
                id="bank-import-preset"
                className="w-full"
                disabled={disabled}
                value={preset ?? ''}
                onValueChange={(name) => {
                  if (name in bankImportPresets)
                    usePreset(name as keyof typeof bankImportPresets);
                }}
                options={[
                  ...(preset ? [] : [{ value: '', label: 'Scegli…' }]),
                  ...presetNames.map((name) => ({ value: name, label: name })),
                  ...(preset === 'Personalizzato'
                    ? [
                        {
                          value: 'Personalizzato',
                          label: 'Personalizzato',
                          disabled: true,
                        },
                      ]
                    : []),
                ]}
              />
            </div>
            <div className="w-40 space-y-1.5">
              <label htmlFor="bank-import-decimal" className="font-medium">
                Importi scritti come
              </label>
              <SelectField
                id="bank-import-decimal"
                className="w-full"
                disabled={disabled}
                value={draft.decimal}
                onValueChange={(decimal) =>
                  set({ decimal: decimal as BankImportDraft['decimal'] })
                }
                options={[
                  { value: ',', label: '1.234,56' },
                  { value: '.', label: '1234.56' },
                ]}
              />
            </div>
            {sample ? (
              <div className="flex items-center gap-1 pb-0.5">
                <span className="mr-1 text-muted-foreground">
                  Intestazione alla riga {headerRow + 1}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Intestazione alla riga precedente"
                  title="Intestazione alla riga precedente"
                  disabled={disabled}
                  onClick={() => moveHeader(-1)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Intestazione alla riga successiva"
                  title="Intestazione alla riga successiva"
                  disabled={disabled}
                  onClick={() => moveHeader(1)}
                >
                  <ChevronDown />
                </Button>
              </div>
            ) : null}
          </div>

          {headerCells.length ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {sample ? <TableHead className="w-10" /> : null}
                    {headerCells.map((label, index) => (
                      <TableHead key={index} className="h-auto pt-2 pb-1">
                        <div className="flex min-h-5 flex-wrap gap-1">
                          {rolesOf(label).length ? (
                            rolesOf(label).map((role) => (
                              <Badge key={role}>{role}</Badge>
                            ))
                          ) : (
                            <span className="text-xs font-normal text-muted-foreground">
                              Non importata
                            </span>
                          )}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                  <TableRow className="hover:bg-transparent">
                    {sample ? (
                      <TableHead className="text-xs font-normal text-muted-foreground tabular-nums">
                        {headerRow + 1}
                      </TableHead>
                    ) : null}
                    {headerCells.map((label, index) => (
                      <TableHead key={index} className="py-1">
                        {label ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              disabled={disabled}
                              aria-label={`Collega ${label}`}
                              render={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="-ml-2.5 font-semibold"
                                />
                              }
                            >
                              {label}
                              <ChevronDown />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-60">
                              <DropdownMenuGroup>
                                <DropdownMenuLabel>
                                  Campo di Cash per {label}
                                </DropdownMenuLabel>
                              </DropdownMenuGroup>
                              {cashFields.map((group, groupIndex) => (
                                <DropdownMenuGroup key={groupIndex}>
                                  <DropdownMenuSeparator />
                                  {group.map((field) => (
                                    <DropdownMenuCheckboxItem
                                      key={field.label}
                                      checked={columnOf(draft, field) === label}
                                      onCheckedChange={(checked) => {
                                        if (checked) assign(field, label);
                                        else
                                          set({
                                            [field.key]: '',
                                            ...(field.key === 'status'
                                              ? { booked: [] }
                                              : {}),
                                            ...(field.key === 'currency'
                                              ? { currencyValue: '' }
                                              : {}),
                                          });
                                      }}
                                    >
                                      {field.label}
                                    </DropdownMenuCheckboxItem>
                                  ))}
                                </DropdownMenuGroup>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => unassign(label)}>
                                Non importare
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sample ? (
                    body.slice(0, MAPPING_ROWS).map(({ cells, number }) => (
                      <TableRow key={number}>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {number}
                        </TableCell>
                        {headerCells.map((label, index) => (
                          <TableCell
                            key={index}
                            title={cells[index]}
                            className={
                              rolesOf(label).length
                                ? 'max-w-64 truncate'
                                : 'max-w-64 truncate text-muted-foreground'
                            }
                          >
                            {cells[index]}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={headerCells.length}
                        className="py-4 text-muted-foreground"
                      >
                        Carica un file di prova per vedere le righe.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileSpreadsheet />
                </EmptyMedia>
                <EmptyTitle>Carica un file di prova</EmptyTitle>
                <EmptyDescription>
                  Un export XLSX o CSV della banca. Viene solo letto, non
                  importato.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void loadSample()}
                >
                  <Upload />
                  Carica file di prova
                </Button>
              </EmptyContent>
            </Empty>
          )}

          {draft.status ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Movimenti contabilizzati</span>
              <InfoTip label="Cosa sono i movimenti contabilizzati">
                Cash importa solo le righe con questi valori in “{draft.status}
                ”. Le altre (per esempio “Autorizzato”) possono cambiare data o
                descrizione quando la banca le registra: Cash le salta e le
                importa con un file successivo.
              </InfoTip>
              {valuesOf(draft.status, draft.booked).map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1 has-data-checked:border-primary has-data-checked:bg-primary/10"
                >
                  <Checkbox
                    disabled={disabled}
                    checked={draft.booked.includes(value)}
                    onCheckedChange={(checked) =>
                      set({
                        booked: checked
                          ? [...draft.booked, value]
                          : draft.booked.filter((entry) => entry !== value),
                      })
                    }
                  />
                  {value}
                </label>
              ))}
            </div>
          ) : null}
          {draft.currency ? (
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="bank-import-currency-value"
                className="font-medium"
              >
                Valuta ammessa
              </label>
              <InfoTip label="Cosa fa la valuta ammessa">
                Un’uscita in un’altra valuta annulla l’importazione, così non
                entrano importi in valute diverse.
              </InfoTip>
              <SelectField
                id="bank-import-currency-value"
                className="w-32"
                disabled={disabled}
                value={draft.currencyValue}
                onValueChange={(currencyValue) => set({ currencyValue })}
                options={[
                  { value: '', label: 'Scegli…' },
                  ...valuesOf(
                    draft.currency,
                    draft.currencyValue ? [draft.currencyValue] : [],
                  ).map((value) => ({ value, label: value })),
                ]}
              />
            </div>
          ) : null}
          {headerCells.length && missing.length ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              <CircleAlert className="size-4" aria-hidden="true" />
              Da collegare: {missing.join(', ')}. Clicca sull’intestazione di
              una colonna per scegliere il campo di Cash.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {sampleError ? (
        <p className="text-sm text-destructive">{sampleError.message}</p>
      ) : null}
      {sample ? (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>File originale</CardTitle>
              <CardDescription className="truncate">
                {sample.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className={tableBox}>
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead>Esito</TableHead>
                      {headerCells.map((label, index) => (
                        <TableHead
                          key={index}
                          className={
                            rolesOf(label).length
                              ? undefined
                              : 'font-normal text-muted-foreground'
                          }
                        >
                          {label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {body.slice(0, SAMPLE_ROWS).map(({ cells, number }) => {
                      const outcome = outcomes.get(number);
                      return (
                        <TableRow key={number}>
                          <TableCell>
                            {outcome ? (
                              <Badge variant={outcomeVariant[outcome]}>
                                {outcome}
                              </Badge>
                            ) : null}
                          </TableCell>
                          {headerCells.map((label, index) => (
                            <TableCell
                              key={index}
                              title={cells[index]}
                              className={
                                rolesOf(label).length
                                  ? 'max-w-64 truncate'
                                  : 'max-w-64 truncate text-muted-foreground'
                              }
                            >
                              {cells[index]}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Importazione in Cash</CardTitle>
              <CardDescription>
                {result ? `${result.added.length} spese nuove` : ' '}
              </CardDescription>
            </CardHeader>
            <CardContent aria-live="polite">
              {!config ? (
                <p className="text-muted-foreground">
                  Collega le colonne per vedere il risultato.
                </p>
              ) : !previewed ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Spinner aria-hidden="true" />
                  Lettura del file di prova…
                </p>
              ) : !previewed.ok ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                  <p className="font-medium">{previewed.error.message}</p>
                  {previewed.error.details?.map((detail) => (
                    <p key={detail}>{detail}</p>
                  ))}
                </div>
              ) : (
                <div className={tableBox}>
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Descrizione</TableHead>
                        <TableHead className="text-right">Importo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result?.added.map((expense) => (
                        <TableRow
                          // ids are new on every render; the row identity is unique here.
                          key={bankExpenseIdentity(expense)}
                        >
                          <TableCell className="tabular-nums">
                            {dateIt(expense.date)}
                            {expense.time ? (
                              <span className="ml-1.5 text-muted-foreground">
                                {expense.time}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell
                            className="w-full max-w-0 truncate"
                            title={expense.description}
                          >
                            {expense.description}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {eur(expense.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!result?.added.length ? (
                        <TableRow className="hover:bg-transparent">
                          <TableCell
                            colSpan={3}
                            className="py-4 text-muted-foreground"
                          >
                            Nessuna spesa nuova in questo file.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
