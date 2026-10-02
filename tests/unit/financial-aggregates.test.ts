import { describe, expect, it } from 'vitest';
import {
  calculateFinancialAnalysis,
  calendarDaysBetween,
} from '../../src/domain/financial-analysis';
import type {
  FicFinancialSnapshot,
  FicIssuedDocument,
  FicReceivedDocument,
} from '../../src/domain/model';

const invoice = (
  id: string,
  values: Partial<FicIssuedDocument> = {},
): FicIssuedDocument => ({
  id,
  type: 'invoice',
  date: '2026-01-01',
  amountGross: '100.00',
  payments: [],
  ...values,
});
const expense = (
  id: string,
  values: Partial<FicReceivedDocument> = {},
): FicReceivedDocument => ({
  id,
  type: 'expense',
  date: '2026-01-01',
  amountGross: '100.00',
  payments: [],
  ...values,
});
const analyze = (
  issuedDocuments: FicIssuedDocument[] = [],
  receivedDocuments: FicReceivedDocument[] = [],
  today = '2026-04-10',
) =>
  calculateFinancialAnalysis(
    {
      source: 'fatture_in_cloud',
      company: { id: '1', name: 'Studio' },
      acquiredAt: '2026-04-10T10:00:00Z',
      issuedDocuments,
      receivedDocuments,
    } satisfies FicFinancialSnapshot,
    2026,
    undefined,
    [],
    today,
  );

describe('clienti e identità FIC', () => {
  it('aggrega per ID, distingue ID omonimi e raggruppa per nome i documenti senza ID', () => {
    const a = analyze([
      invoice('1', {
        entityId: '10',
        entityName: 'Omonimo',
        payments: [
          { amount: '40.00', status: 'paid', paidDate: '2026-02-01' },
          { amount: '60.00', status: 'not_paid', dueDate: '2026-03-01' },
        ],
      }),
      invoice('2', {
        entityId: '10',
        entityName: 'Nome aggiornato',
        payments: [
          { amount: '100.00', status: 'paid', paidDate: '2026-02-01' },
        ],
      }),
      invoice('3', { entityId: '20', entityName: 'Omonimo' }),
      invoice('4', { entityName: 'Omonimo' }),
      invoice('5', { entityName: 'Omonimo' }),
      invoice('6', { entityId: '10', type: 'credit_note' }),
      invoice('7', { entityId: '10', date: '2025-01-01' }),
    ]);
    expect(a.clientAnalysis).toHaveLength(3);
    expect(a.clientAnalysis[0]).toMatchObject({
      entityId: '10',
      invoiceCount: 2,
      issuedRevenue: '200.00',
      collectedRevenue: '140.00',
      outstandingRevenue: '60.00',
      overdueRevenue: '60.00',
      revenueShare: '40.00',
    });
    expect(
      a.clientAnalysis.find((row) => row.key === 'name:omonimo'),
    ).toMatchObject({
      entityId: undefined,
      ungroupedDocumentId: undefined,
      invoiceCount: 2,
      issuedRevenue: '200.00',
    });
    expect(a).toMatchObject({
      invoiceCount: 5,
      outstandingInvoiceCount: 4,
      overdueInvoiceCount: 1,
    });
  });

  it('raggruppa nomi senza ID prima di ordinare e selezionare i primi dieci clienti', () => {
    const docs = [
      ...Array.from({ length: 11 }, (_, index) =>
        invoice(`other-${index}`, {
          entityName: `Altro ${index}`,
          amountGross: '150.00',
        }),
      ),
      invoice('1', {
        entityName: '  Studio   Caffè  ',
        payments: [
          { amount: '40.00', status: 'paid', paidDate: '2026-02-01' },
          { amount: '60.00', status: 'not_paid', dueDate: '2026-03-01' },
        ],
      }),
      invoice('2', {
        entityName: 'STUDIO CAFFE\u0300',
        payments: [
          { amount: '100.00', status: 'paid', paidDate: '2026-02-01' },
        ],
      }),
    ];
    const before = structuredClone(docs);
    const a = analyze(docs);
    expect(a.clientAnalysis).toHaveLength(12);
    expect(a.clientAnalysis.slice(0, 10)[0]).toMatchObject({
      key: 'name:studio caffè',
      name: 'Studio Caffè',
      invoiceCount: 2,
      issuedRevenue: '200.00',
      collectedRevenue: '140.00',
      outstandingRevenue: '60.00',
      overdueRevenue: '60.00',
      revenueShare: '10.81',
    });
    expect(a.clientPaymentAnalysis).toHaveLength(12);
    expect(docs).toEqual(before);
  });

  it('collega i nomi a un ID univoco anche se il documento senza ID viene prima', () => {
    const docs = [
      invoice('1', { entityName: ' studio alfa ' }),
      invoice('2', { entityId: '10', entityName: 'Studio Alfa' }),
      invoice('3', { entityId: '10', entityName: 'Nome aggiornato' }),
      invoice('4', { entityName: 'NOME AGGIORNATO' }),
    ];
    for (const ordered of [docs, [...docs].reverse()]) {
      const a = analyze(ordered);
      expect(a.clientAnalysis).toHaveLength(1);
      expect(a.clientAnalysis[0]).toMatchObject({
        key: 'entity:10',
        entityId: '10',
        ungroupedDocumentId: undefined,
        invoiceCount: 4,
        issuedRevenue: '400.00',
      });
      expect(a.clientPaymentAnalysis).toHaveLength(1);
      expect(a.clientPaymentAnalysis[0]).toMatchObject({
        key: 'entity:10',
        entityId: '10',
      });
    }
  });

  it('mantiene separati i documenti senza ID e senza nome', () => {
    const a = analyze([
      invoice('1'),
      invoice('2', { entityName: '   ' }),
      invoice('3', { entityName: 'Cliente' }),
    ]);
    expect(a.clientAnalysis).toHaveLength(3);
    expect(
      a.clientAnalysis
        .filter((row) => row.ungroupedDocumentId)
        .map((row) => row.ungroupedDocumentId),
    ).toEqual(['1', '2']);
    expect(a.clientPaymentAnalysis).toHaveLength(3);
  });

  it('separa il cohort documentale dai flussi di cassa annuali', () => {
    const a = analyze([
      invoice('1', {
        entityId: '10',
        date: '2025-12-01',
        payments: [
          { amount: '100.00', status: 'paid', paidDate: '2026-01-01' },
        ],
      }),
      invoice('2', {
        entityId: '10',
        payments: [
          { amount: '100.00', status: 'paid', paidDate: '2027-01-01' },
        ],
      }),
    ]);
    expect(a.collectedRevenue).toBe('100.00');
    expect(a.monthly[0]?.collectedRevenue).toBe('100.00');
    expect(a.clientAnalysis[0]).toMatchObject({
      invoiceCount: 1,
      collectedRevenue: '100.00',
      outstandingRevenue: '0.00',
    });
  });
});

describe('ritardi storici e insoluti attuali', () => {
  it('calcola il ritardo del cliente su tutti i pagamenti delle fatture raggruppate per nome', () => {
    const a = analyze([
      invoice('1', {
        entityName: 'Studio Alfa',
        payments: [
          {
            amount: '30.00',
            status: 'paid',
            dueDate: '2026-03-01',
            paidDate: '2026-03-01',
          },
          {
            amount: '30.00',
            status: 'paid',
            dueDate: '2026-03-01',
            paidDate: '2026-03-01',
          },
          { amount: '40.00', status: 'not_paid', dueDate: '2026-03-01' },
        ],
      }),
      invoice('2', {
        entityName: ' STUDIO  ALFA ',
        payments: [
          {
            amount: '80.00',
            status: 'paid',
            dueDate: '2026-03-01',
            paidDate: '2026-03-31',
          },
          { amount: '20.00', status: 'not_paid', dueDate: '2026-03-20' },
        ],
      }),
      invoice('3', {
        entityName: 'Beta',
        payments: [
          {
            amount: '100.00',
            status: 'paid',
            dueDate: '2026-03-01',
            paidDate: '2026-03-13',
          },
        ],
      }),
    ]);
    expect(a.clientPaymentAnalysis).toHaveLength(2);
    expect(a.clientPaymentAnalysis.map((row) => row.name)).toEqual([
      'Beta',
      'Studio Alfa',
    ]);
    expect(a.clientPaymentAnalysis[1]).toMatchObject({
      analyzedPaymentCount: 3,
      averageDelayDays: 10,
      maxDelayDays: 30,
      onTimePercentage: '66.67',
      overdueRevenue: '60.00',
      overdueInvoiceCount: 2,
      oldestOpenDueDays: 40,
    });
  });

  it('calcola media semplice, massimo e puntuali escludendo pagamenti non analizzabili', () => {
    const a = analyze([
      invoice('1', {
        entityId: '10',
        amountGross: '1010.00',
        payments: [
          {
            amount: '1.00',
            status: 'paid',
            dueDate: '2026-03-10',
            paidDate: '2026-03-01',
          },
          {
            amount: '1.00',
            status: 'paid',
            dueDate: '2026-03-10',
            paidDate: '2026-03-10',
          },
          {
            amount: '1000.00',
            status: 'paid',
            dueDate: '2026-03-10',
            paidDate: '2026-03-20',
          },
          { amount: '1.00', status: 'paid', paidDate: '2026-03-20' },
          {
            amount: '3.00',
            status: 'not_paid',
            dueDate: '2026-03-10',
            paidDate: '2026-03-20',
          },
          {
            amount: '4.00',
            status: 'reversed',
            dueDate: '2026-03-30',
            paidDate: '2026-04-01',
          },
          { amount: '0.00', status: 'not_paid', dueDate: '2025-01-01' },
        ],
      }),
    ]);
    expect(a.clientPaymentAnalysis[0]).toMatchObject({
      analyzedPaymentCount: 3,
      averageDelayDays: 10 / 3,
      maxDelayDays: 10,
      onTimePercentage: '66.67',
      overdueRevenue: '7.00',
      overdueInvoiceCount: 1,
      oldestOpenDueDays: 31,
    });
  });

  it.each([
    ['2026-03-09', 0],
    ['2026-03-10', 0],
    ['2026-03-20', 10],
  ] as const)('pagamento del %s: %s giorni', (paidDate, delay) => {
    expect(
      analyze([
        invoice('1', {
          payments: [
            {
              amount: '100.00',
              status: 'paid',
              dueDate: '2026-03-10',
              paidDate,
            },
          ],
        }),
      ]).clientPaymentAnalysis[0],
    ).toMatchObject({
      averageDelayDays: delay,
      maxDelayDays: delay,
      onTimePercentage: delay ? '0.00' : '100.00',
      overdueRevenue: '0.00',
      overdueInvoiceCount: 0,
      oldestOpenDueDays: undefined,
    });
  });

  it('mantiene insoluti senza storico e ordina lo storico per media poi importo scaduto', () => {
    const late = {
      amount: '10.00',
      status: 'paid' as const,
      dueDate: '2026-03-01',
      paidDate: '2026-03-11',
    };
    const open = {
      amount: '90.00',
      status: 'not_paid' as const,
      dueDate: '2026-03-20',
    };
    const docs = [
      invoice('1', { entityId: '1', payments: [late] }),
      invoice('2', { entityId: '2', payments: [late, open] }),
      invoice('3', { entityId: '3', payments: [open] }),
    ];
    const rows = analyze(docs).clientPaymentAnalysis;
    expect(rows.map((row) => row.entityId)).toEqual(['2', '1', '3']);
    expect(rows[2]).toMatchObject({
      analyzedPaymentCount: 0,
      averageDelayDays: undefined,
      maxDelayDays: undefined,
      onTimePercentage: undefined,
      overdueRevenue: '90.00',
      overdueInvoiceCount: 1,
      oldestOpenDueDays: 21,
    });
    expect(
      analyze(docs, [], '2026-04-11').clientPaymentAnalysis[0]
        ?.oldestOpenDueDays,
    ).toBe(22);
    expect(
      analyze(docs, [], '2026-03-20').clientPaymentAnalysis[0]?.overdueRevenue,
    ).toBe('0.00');
  });

  it('usa giorni di calendario anche nei cambi ora, anno e negli anni bisestili', () => {
    expect(calendarDaysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(calendarDaysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(calendarDaysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(calendarDaysBetween('2024-02-28', '2024-03-01')).toBe(2);
  });
});

describe('costi, fornitori e incidenze', () => {
  it('aggrega solo spese annuali per categoria FIC e fornitore, separa omonimi e dati mancanti', () => {
    const a = analyze(
      [],
      [
        expense('1', {
          category: 'Software',
          entityId: '10',
          entityName: 'Omonimo',
          payments: [
            { amount: '40.00', status: 'paid', paidDate: '2026-02-01' },
            { amount: '60.00', status: 'not_paid' },
          ],
        }),
        expense('2', {
          category: 'Software',
          entityId: '10',
          entityName: 'Nome cambiato',
        }),
        expense('3', { entityId: '20', entityName: 'Omonimo' }),
        expense('4', { entityName: 'Omonimo', category: '' }),
        expense('5', { entityName: 'Omonimo' }),
        expense('6', { type: 'passive_credit_note', category: 'Software' }),
        expense('7', { date: '2025-01-01', category: 'Software' }),
      ],
    );
    expect(a.costDocumentCount).toBe(5);
    expect(a.costCategoryAnalysis).toEqual([
      {
        key: 'missing',
        category: 'Senza categoria',
        documentCount: 3,
        documentedCosts: '300.00',
        paidCosts: '0.00',
        outstandingCosts: '300.00',
        costShare: '60.00',
      },
      {
        key: 'category:Software',
        category: 'Software',
        documentCount: 2,
        documentedCosts: '200.00',
        paidCosts: '40.00',
        outstandingCosts: '160.00',
        costShare: '40.00',
      },
    ]);
    expect(a.supplierAnalysis).toHaveLength(4);
    expect(a.supplierAnalysis[0]).toMatchObject({
      entityId: '10',
      documentCount: 2,
      documentedCosts: '200.00',
      paidCosts: '40.00',
      outstandingCosts: '160.00',
    });
    expect(
      a.supplierAnalysis.filter((row) => row.ungroupedDocumentId),
    ).toHaveLength(2);
  });

  it('usa decimal.js per incidenze e importi, restituisce indisponibile con denominatore zero', () => {
    const a = analyze(
      [
        invoice('1', {
          amountGross: '0.30',
          payments: [
            { amount: '0.10', status: 'paid', paidDate: '2026-01-01' },
            { amount: '0.20', status: 'paid', paidDate: '2026-01-01' },
          ],
        }),
      ],
      [
        expense('1', {
          amountGross: '0.10',
          payments: [
            { amount: '0.06', status: 'paid', paidDate: '2026-01-01' },
            { amount: '0.04', status: 'not_paid' },
          ],
        }),
      ],
    );
    expect(a).toMatchObject({
      collectedRevenue: '0.30',
      costIncidenceOnIssued: '33.33',
      paidCostIncidenceOnCollected: '20.00',
    });
    expect(analyze()).toMatchObject({
      costIncidenceOnIssued: undefined,
      paidCostIncidenceOnCollected: undefined,
    });
    expect(analyze([invoice('1')])).toMatchObject({
      costIncidenceOnIssued: '0.00',
      paidCostIncidenceOnCollected: undefined,
    });
  });

  it('non inventa percentuali sui totali nulli e non muta i documenti', () => {
    const doc = invoice('1', { amountGross: '0.00' });
    const cost = expense('1', { amountGross: '0.00' });
    const before = structuredClone([doc, cost]);
    const a = analyze([doc], [cost]);
    expect(a.clientAnalysis[0]?.revenueShare).toBeUndefined();
    expect(a.costCategoryAnalysis[0]?.costShare).toBeUndefined();
    expect([doc, cost]).toEqual(before);
  });
});
