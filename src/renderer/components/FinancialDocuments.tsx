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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { dateIt, eur } from '@/lib/format';

type RegisteredDocument = FicIssuedDocument | FicReceivedDocument;
type Selection =
  | { kind: 'registered'; document: RegisteredDocument }
  | { kind: 'pending'; document: FicPendingReceivedDocument };
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
  const [selected, setSelected] = useState<Selection>();
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
            <TabsList className="h-auto max-w-full flex-wrap justify-start">
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {[
                          'Data / numero',
                          'Cliente / fornitore',
                          'Importo',
                          'Pagato',
                          'Residuo',
                          'Stato',
                          '',
                        ].map((label, index) => (
                          <TableHead key={index}>{label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.documents.map((document) => {
                        const summary = financialPaymentSummary(
                          document,
                          today,
                        );
                        return (
                          <TableRow
                            key={`${document.type}:${document.id}`}
                            className="cursor-pointer"
                            onClick={() =>
                              setSelected({ kind: 'registered', document })
                            }
                          >
                            <TableCell>
                              {dateIt(document.date)}
                              <p className="text-xs text-muted-foreground">
                                {numberOf(document) ?? '—'}
                              </p>
                            </TableCell>
                            <TableCell className="max-w-60 whitespace-normal">
                              {document.entityName ?? '—'}
                              {group.id === 'credits' ? (
                                <p className="text-xs text-muted-foreground">
                                  {typeLabels[document.type]}
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {eur(document.amountGross)}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {eur(summary.paid)}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {eur(summary.outstanding)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  summary.status === 'Scaduta'
                                    ? 'destructive'
                                    : 'secondary'
                                }
                              >
                                {statusOf(document, today)}
                              </Badge>
                            </TableCell>
                            <TableCell>
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
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        'Data',
                        'Fornitore / oggetto',
                        'Sorgente',
                        'Importo',
                        '',
                      ].map((label, index) => (
                        <TableHead key={index}>{label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((document) => (
                      <TableRow
                        key={`${document.source}:${document.id}`}
                        className="cursor-pointer"
                        onClick={() =>
                          setSelected({ kind: 'pending', document })
                        }
                      >
                        <TableCell>
                          {document.date ? dateIt(document.date) : '—'}
                        </TableCell>
                        <TableCell className="max-w-80 whitespace-normal">
                          {document.supplierName ?? '—'}
                          <p className="text-xs text-muted-foreground">
                            {document.subject}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{document.source}</Badge>
                        </TableCell>
                        <TableCell>
                          {document.amountGross === undefined
                            ? '—'
                            : eur(document.amountGross)}
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {[
                            'Importo',
                            'Stato FIC',
                            'Scadenza',
                            'Pagamento',
                          ].map((label) => (
                            <TableHead key={label}>{label}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selected.document.payments.map((payment, index) => (
                          <TableRow key={index}>
                            <TableCell>{eur(payment.amount)}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {payment.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {payment.dueDate ? dateIt(payment.dueDate) : '—'}
                            </TableCell>
                            <TableCell>
                              {payment.paidDate
                                ? dateIt(payment.paidDate)
                                : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
