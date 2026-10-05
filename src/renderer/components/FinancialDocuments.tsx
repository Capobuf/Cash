import { useState } from 'react';
import { financialPaymentSummary } from '../../domain/financial-analysis';
import { d, sumMoney } from '../../domain/decimal';
import type {
  FicFinancialSnapshot,
  FicIssuedDocument,
  FicReceivedDocument,
  FicPendingReceivedDocument,
} from '../../domain/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dateIt, eur } from '@/lib/format';

type RegisteredDocument = FicIssuedDocument | FicReceivedDocument;
type Selection =
  | { kind: 'registered'; document: RegisteredDocument }
  | { kind: 'pending'; document: FicPendingReceivedDocument };
type SelectionKey = { companyId: string; id: string } & (
  | { kind: 'registered'; type: RegisteredDocument['type'] }
  | { kind: 'pending'; source: FicPendingReceivedDocument['source'] }
);
const typeLabels = {
  invoice: 'Fattura emessa',
  credit_note: 'Nota di credito emessa',
  expense: 'Costo registrato',
  passive_credit_note: 'Nota di credito ricevuta',
};
const numberOf = (document: RegisteredDocument) =>
  'invoiceNumber' in document
    ? document.invoiceNumber
    : 'number' in document
      ? `${document.number ?? ''}${document.numeration ?? ''}` || undefined
      : undefined;
const statusOf = (document: RegisteredDocument, today: string) => {
  const status = financialPaymentSummary(document, today).status;
  return status === 'Da incassare' &&
    (document.type === 'expense' || document.type === 'passive_credit_note')
    ? 'Da pagare'
    : status;
};

export function FinancialDocuments({
  snapshot,
  year,
  today,
}: {
  snapshot: FicFinancialSnapshot;
  year?: number;
  today: string;
}) {
  const [selection, setSelection] = useState<SelectionKey>();
  const setSelected = (value: Selection | undefined) =>
    setSelection(
      value
        ? {
            companyId: snapshot.company.id,
            id: value.document.id,
            ...(value.kind === 'registered'
              ? { kind: value.kind, type: value.document.type }
              : { kind: value.kind, source: value.document.source }),
          }
        : undefined,
    );
  // Resolve details from the latest snapshot, including updated payments.
  const selected: Selection | undefined = (() => {
    if (!selection || selection.companyId !== snapshot.company.id) return;
    if (selection.kind === 'pending') {
      const document = snapshot.pendingReceivedDocuments?.find(
        (document) =>
          document.id === selection.id && document.source === selection.source,
      );
      return document ? { kind: 'pending', document } : undefined;
    }
    const document = [
      ...snapshot.issuedDocuments,
      ...snapshot.receivedDocuments,
    ].find(
      (document) =>
        document.id === selection.id && document.type === selection.type,
    );
    return document ? { kind: 'registered', document } : undefined;
  })();
  const annual = (document: RegisteredDocument) =>
    document.date.slice(0, 4) === String(year);
  const invoices = snapshot.issuedDocuments.filter(
    (document) => document.type === 'invoice' && annual(document),
  );
  const groups: Array<{
    id: string;
    label: string;
    documents: RegisteredDocument[];
  }> = [
    { id: 'invoices', label: 'Fatture emesse', documents: invoices },
    {
      id: 'outstanding',
      label: 'Da incassare',
      documents: invoices.filter((document) =>
        d(financialPaymentSummary(document, today).outstanding).gt(0),
      ),
    },
    {
      id: 'overdue',
      label: 'Scadute',
      documents: invoices.filter((document) =>
        d(financialPaymentSummary(document, today).overdue).gt(0),
      ),
    },
    {
      id: 'costs',
      label: 'Costi registrati',
      documents: snapshot.receivedDocuments.filter(
        (document) => document.type === 'expense' && annual(document),
      ),
    },
    {
      id: 'credits',
      label: 'Note di credito',
      documents: [
        ...snapshot.issuedDocuments,
        ...snapshot.receivedDocuments,
      ].filter(
        (document) =>
          (document.type === 'credit_note' ||
            document.type === 'passive_credit_note') &&
          annual(document),
      ),
    },
  ];
  // Pending is an inbox, including undated documents and all years; never annual costs.
  const pending = snapshot.pendingReceivedDocuments ?? [];
  const amounts = pending.flatMap((document) =>
    document.amountGross === undefined ? [] : [document.amountGross],
  );
  const detail =
    selected?.kind === 'registered'
      ? financialPaymentSummary(selected.document, today)
      : undefined;
  const fields: Array<[string, string | undefined]> = !selected
    ? []
    : selected.kind === 'pending'
      ? [
          ['ID FIC', selected.document.id],
          ['Tipo', selected.document.documentType],
          ['Sorgente pending', selected.document.source],
          [
            'Data',
            selected.document.date ? dateIt(selected.document.date) : undefined,
          ],
          ['Fornitore', selected.document.supplierName],
          [
            'Importo',
            selected.document.amountGross === undefined
              ? undefined
              : eur(selected.document.amountGross),
          ],
          ['Oggetto', selected.document.subject],
          ['Categoria', selected.document.category],
          ['Stato', 'Da registrare in Fatture in Cloud'],
        ]
      : [
          ['ID FIC', selected.document.id],
          ['Tipo', typeLabels[selected.document.type]],
          ['Data', dateIt(selected.document.date)],
          ['Numero', numberOf(selected.document)],
          ['Cliente / fornitore', selected.document.entityName],
          ['Importo', eur(selected.document.amountGross)],
          [
            'Descrizione',
            'description' in selected.document
              ? selected.document.description
              : undefined,
          ],
          [
            'Categoria',
            'category' in selected.document
              ? selected.document.category
              : undefined,
          ],
          ['Stato derivato', statusOf(selected.document, today)],
          ['Totale pagato', eur(detail?.paid)],
          ['Residuo', eur(detail?.outstanding)],
        ];
  const registeredColumns = (
    groupId: string,
  ): DataTableColumn<RegisteredDocument>[] => [
    {
      id: 'date',
      header: 'Data / numero',
      value: (document) =>
        `${document.date} ${numberOf(document) ?? ''}`.trim(),
      cell: (document) => (
        <>
          {dateIt(document.date)}
          <p className="text-xs text-muted-foreground">
            {numberOf(document) ?? '—'}
          </p>
        </>
      ),
    },
    {
      id: 'entity',
      header: 'Cliente / fornitore',
      value: (document) => document.entityName,
      cell: (document) => (
        <>
          {document.entityName ?? '—'}
          {groupId === 'credits' ? (
            <p className="text-xs text-muted-foreground">
              {typeLabels[document.type]}
            </p>
          ) : null}
        </>
      ),
      className: 'max-w-60 whitespace-normal',
    },
    {
      id: 'amount',
      header: 'Importo',
      value: (document) => Number(document.amountGross),
      cell: (document) => eur(document.amountGross),
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
    },
    {
      id: 'paid',
      header: 'Pagato',
      value: (document) =>
        Number(financialPaymentSummary(document, today).paid),
      cell: (document) => eur(financialPaymentSummary(document, today).paid),
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
    },
    {
      id: 'outstanding',
      header: 'Residuo',
      value: (document) =>
        Number(financialPaymentSummary(document, today).outstanding),
      cell: (document) =>
        eur(financialPaymentSummary(document, today).outstanding),
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
    },
    {
      id: 'status',
      header: 'Stato',
      value: (document) => statusOf(document, today),
      cell: (document) => {
        const status = financialPaymentSummary(document, today).status;
        return (
          <Badge variant={status === 'Scaduta' ? 'destructive' : 'secondary'}>
            {statusOf(document, today)}
          </Badge>
        );
      },
    },
    {
      id: 'details',
      header: 'Dettagli',
      value: () => 'Dettaglio',
      cell: (document) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Apri documento ${numberOf(document) ?? dateIt(document.date)}${document.entityName ? ` · ${document.entityName}` : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            setSelected({ kind: 'registered', document });
          }}
        >
          Dettaglio
        </Button>
      ),
    },
  ];
  const pendingColumns: DataTableColumn<FicPendingReceivedDocument>[] = [
    {
      id: 'date',
      header: 'Data',
      value: (document) => document.date,
      cell: (document) => (document.date ? dateIt(document.date) : '—'),
    },
    {
      id: 'supplier',
      header: 'Fornitore / oggetto',
      value: (document) =>
        `${document.supplierName ?? ''} ${document.subject ?? ''}`.trim(),
      cell: (document) => (
        <>
          {document.supplierName ?? '—'}
          <p className="text-xs text-muted-foreground">{document.subject}</p>
        </>
      ),
      className: 'max-w-80 whitespace-normal',
    },
    {
      id: 'source',
      header: 'Sorgente',
      value: (document) => document.source,
      cell: (document) => <Badge variant="outline">{document.source}</Badge>,
    },
    {
      id: 'amount',
      header: 'Importo',
      value: (document) =>
        document.amountGross === undefined
          ? undefined
          : Number(document.amountGross),
      cell: (document) =>
        document.amountGross === undefined ? '—' : eur(document.amountGross),
      className: 'text-right tabular-nums',
      headClassName: 'text-right',
    },
    {
      id: 'details',
      header: 'Dettagli',
      value: () => 'Dettaglio',
      cell: (document) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Apri documento in ingresso${document.supplierName ? ` · ${document.supplierName}` : ''}${document.subject ? ` · ${document.subject}` : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            setSelected({ kind: 'pending', document });
          }}
        >
          Dettaglio
        </Button>
      ),
    },
  ];
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Documenti {year ? `· ${year}` : ''}</CardTitle>
          <CardDescription>
            Pagato e residuo includono tutti i pagamenti dello snapshot. In
            ingresso raccoglie i documenti da registrare di tutti gli anni.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="invoices">
            <TabsList
              variant="line"
              className="h-auto max-w-full flex-wrap justify-start"
            >
              {groups.slice(0, 4).map((group) => (
                <TabsTrigger key={group.id} value={group.id}>
                  {group.label} ({group.documents.length})
                </TabsTrigger>
              ))}
              <TabsTrigger value="pending">
                In ingresso ({pending.length})
              </TabsTrigger>
              <TabsTrigger value="credits">
                Note di credito ({groups[4]!.documents.length})
              </TabsTrigger>
            </TabsList>
            {groups.map((group) => (
              <TabsContent key={group.id} value={group.id}>
                {group.documents.length ? (
                  <DataTable
                    data={group.documents}
                    columns={registeredColumns(group.id)}
                    getRowKey={(document) => `${document.type}:${document.id}`}
                    emptyMessage="Nessun documento in questa sezione per l’anno selezionato."
                    searchPlaceholder="Cerca documenti…"
                    initialSort={{ id: 'date', direction: 'desc' }}
                    onRowClick={(document) =>
                      setSelected({ kind: 'registered', document })
                    }
                    getRowAriaLabel={(document) =>
                      `Apri documento ${numberOf(document) ?? dateIt(document.date)}`
                    }
                  />
                ) : (
                  <p className="py-6 text-sm text-muted-foreground">
                    Nessun documento in questa sezione per l’anno selezionato.
                  </p>
                )}
              </TabsContent>
            ))}
            <TabsContent value="pending">
              <div className="space-y-2 py-4">
                <h3 className="font-medium">
                  Da registrare in Fatture in Cloud
                </h3>
                <p className="text-sm">
                  {pending.length} documenti ·{' '}
                  {amounts.length
                    ? `${eur(sumMoney(amounts))} su ${amounts.length} documenti con importo disponibile`
                    : 'Importo complessivo non disponibile'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Solo informativi: esclusi da costi documentati, costi pagati e
                  stima fiscale.
                </p>
                {snapshot.pendingReceivedDocuments === undefined ? (
                  <p className="text-sm text-muted-foreground">
                    Questo snapshot non include ancora i documenti in ingresso.
                    Esegui un aggiornamento completo.
                  </p>
                ) : null}
              </div>
              {pending.length ? (
                <DataTable
                  data={pending}
                  columns={pendingColumns}
                  getRowKey={(document) => `${document.source}:${document.id}`}
                  emptyMessage="Nessun documento in ingresso nello snapshot."
                  searchPlaceholder="Cerca documenti in ingresso…"
                  initialSort={{ id: 'date', direction: 'desc' }}
                  onRowClick={(document) =>
                    setSelected({ kind: 'pending', document })
                  }
                  getRowAriaLabel={(document) =>
                    `Apri documento in ingresso ${document.supplierName ?? document.subject ?? document.id}`
                  }
                />
              ) : (
                <p className="pb-4 text-sm text-muted-foreground">
                  Nessun documento in ingresso nello snapshot.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
          <SheetHeader className="pr-12">
            <SheetTitle>Dettaglio documento</SheetTitle>
            <SheetDescription>
              Sola lettura · {snapshot.company.name}. I documenti si gestiscono
              in Fatture in Cloud.
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-6 px-4 pb-6">
              <dl className="grid grid-cols-2 gap-4">
                {fields.map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 break-words">{value ?? '—'}</dd>
                  </div>
                ))}
              </dl>
              {selected?.kind === 'registered' ? (
                <section>
                  <h3 className="mb-2 font-medium">Pagamenti e scadenze</h3>
                  {selected.document.payments.length ? (
                    <DataTable
                      data={selected.document.payments}
                      columns={[
                        {
                          id: 'amount',
                          header: 'Importo',
                          value: (payment) => Number(payment.amount),
                          cell: (payment) => eur(payment.amount),
                          className: 'text-right tabular-nums',
                          headClassName: 'text-right',
                        },
                        {
                          id: 'status',
                          header: 'Stato FIC',
                          value: (payment) => payment.status,
                          cell: (payment) => (
                            <Badge variant="secondary">{payment.status}</Badge>
                          ),
                        },
                        {
                          id: 'dueDate',
                          header: 'Scadenza',
                          value: (payment) => payment.dueDate,
                          cell: (payment) =>
                            payment.dueDate ? dateIt(payment.dueDate) : '—',
                        },
                        {
                          id: 'paidDate',
                          header: 'Pagamento',
                          value: (payment) => payment.paidDate,
                          cell: (payment) =>
                            payment.paidDate ? dateIt(payment.paidDate) : '—',
                        },
                      ]}
                      getRowKey={(payment, index) =>
                        `${payment.amount}:${payment.status}:${payment.dueDate ?? ''}:${payment.paidDate ?? ''}:${index}`
                      }
                      emptyMessage="Nessun pagamento o scadenza disponibile."
                      initialSort={{ id: 'dueDate', direction: 'asc' }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nessun pagamento o scadenza disponibile.
                    </p>
                  )}
                </section>
              ) : null}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}
