import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { parseDocument, documentHeaderSchema } from '../domain/schema';
import type { CashDocument } from '../domain/model';
import type { ConcurrencyToken } from '../shared/archive';

export const STORAGE_VERSION = 1;
export const APPLICATION_ID = 0x43415348;

type Row = Record<string, SQLInputValue>;
interface Table {
  name: string;
  fields: string;
  keys: string[];
  json?: string[];
  booleans?: string[];
  constraints?: string;
}
const meta =
  'id TEXT PRIMARY KEY, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, position INTEGER NOT NULL';
const paymentFields =
  'documentId TEXT NOT NULL, position INTEGER NOT NULL, id TEXT, amount TEXT NOT NULL, dueDate TEXT, paidDate TEXT, status TEXT NOT NULL';

// Column names follow the domain model. NULL represents an absent optional;
// decimals stay TEXT, and nested payloads never duplicate explicit columns.
const tables: Table[] = [
  {
    name: 'archive_metadata',
    fields:
      'singleton INTEGER PRIMARY KEY CHECK(singleton=1), schemaVersion INTEGER NOT NULL, documentId TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0), createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, fiscalOverridesPresent INTEGER NOT NULL',
    keys: ['singleton'],
    booleans: ['fiscalOverridesPresent'],
  },
  {
    name: 'shared_settings',
    fields:
      'singleton INTEGER PRIMARY KEY CHECK(singleton=1), settings TEXT NOT NULL',
    keys: ['singleton'],
    json: ['settings'],
  },
  {
    name: 'profiles',
    fields: `${meta}, year INTEGER NOT NULL UNIQUE, revision INTEGER NOT NULL, confirmed INTEGER NOT NULL, revenueTarget TEXT NOT NULL, specificAnnualExpenses TEXT NOT NULL, fiscal TEXT NOT NULL, capacity TEXT NOT NULL`,
    keys: ['id'],
    json: ['fiscal', 'capacity'],
    booleans: ['confirmed'],
  },
  {
    name: 'business_costs',
    fields: `${meta}, category TEXT NOT NULL, description TEXT NOT NULL, monthlyAmount TEXT NOT NULL`,
    keys: ['id'],
  },
  {
    name: 'vehicles',
    fields: `${meta}, name TEXT NOT NULL, fuel TEXT NOT NULL, consumption TEXT NOT NULL, consumptionUnit TEXT NOT NULL, annualKm TEXT NOT NULL, annualInsurance TEXT NOT NULL, annualTax TEXT NOT NULL, annualMaintenance TEXT NOT NULL`,
    keys: ['id'],
  },
  {
    name: 'sites',
    fields: `${meta}, name TEXT NOT NULL, address TEXT, client TEXT, location TEXT`,
    keys: ['id'],
    json: ['client', 'location'],
  },
  {
    name: 'catalog_subitems',
    fields: `${meta}, kind TEXT NOT NULL, description TEXT NOT NULL, payload TEXT NOT NULL`,
    keys: ['id'],
  },
  {
    name: 'catalog_templates',
    fields: `${meta}, name TEXT NOT NULL, items TEXT NOT NULL`,
    keys: ['id'],
    json: ['items'],
  },
  {
    name: 'quotes',
    fields: `${meta}, date TEXT NOT NULL, payload TEXT NOT NULL`,
    keys: ['id'],
  },
  {
    name: 'fiscal_payment_overrides',
    fields:
      'year INTEGER PRIMARY KEY, position INTEGER NOT NULL, total TEXT NOT NULL',
    keys: ['year'],
  },
  {
    name: 'bank_expense_categories',
    fields: `${meta}, name TEXT NOT NULL, parentId TEXT REFERENCES bank_expense_categories(id) DEFERRABLE INITIALLY DEFERRED, systemRole TEXT, excludedFromCalculations INTEGER`,
    keys: ['id'],
    booleans: ['excludedFromCalculations'],
  },
  {
    name: 'bank_expenses',
    fields: `${meta}, date TEXT NOT NULL, description TEXT NOT NULL, amount TEXT NOT NULL, excludedFromCalculations INTEGER`,
    keys: ['id'],
    booleans: ['excludedFromCalculations'],
    constraints: ', UNIQUE(date, description, amount)',
  },
  {
    name: 'bank_expense_manual_categories',
    fields:
      'expenseId TEXT NOT NULL REFERENCES bank_expenses(id) DEFERRABLE INITIALLY DEFERRED, categoryId TEXT NOT NULL REFERENCES bank_expense_categories(id) DEFERRABLE INITIALLY DEFERRED, position INTEGER NOT NULL',
    keys: ['expenseId', 'categoryId'],
    constraints: ', PRIMARY KEY(expenseId, categoryId)',
  },
  {
    name: 'bank_expense_rules',
    fields: `${meta}, matchText TEXT NOT NULL, categoryId TEXT NOT NULL REFERENCES bank_expense_categories(id) DEFERRABLE INITIALLY DEFERRED`,
    keys: ['id'],
  },
  {
    name: 'fic_snapshot_metadata',
    fields:
      'singleton INTEGER PRIMARY KEY CHECK(singleton=1), source TEXT NOT NULL, company TEXT NOT NULL, acquiredAt TEXT NOT NULL, pendingPresent INTEGER NOT NULL',
    keys: ['singleton'],
    json: ['company'],
    booleans: ['pendingPresent'],
  },
  {
    name: 'fic_issued_documents',
    fields:
      'id TEXT PRIMARY KEY, position INTEGER NOT NULL, type TEXT NOT NULL, date TEXT NOT NULL, number TEXT, numeration TEXT, description TEXT, entityId TEXT, entityName TEXT, amountGross TEXT NOT NULL, stampDuty TEXT',
    keys: ['id'],
  },
  {
    name: 'fic_received_documents',
    fields:
      'id TEXT PRIMARY KEY, position INTEGER NOT NULL, type TEXT NOT NULL, date TEXT NOT NULL, invoiceNumber TEXT, entityId TEXT, entityName TEXT, description TEXT, category TEXT, amountGross TEXT NOT NULL',
    keys: ['id'],
  },
  {
    name: 'fic_pending_received_documents',
    fields:
      'source TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL, documentType TEXT, date TEXT, subject TEXT, supplierName TEXT, amountGross TEXT, category TEXT',
    keys: ['source', 'id'],
    constraints: ', PRIMARY KEY(source, id)',
  },
  {
    name: 'fic_issued_payments',
    fields: paymentFields,
    keys: ['documentId', 'position'],
    constraints:
      ', PRIMARY KEY(documentId, position), FOREIGN KEY(documentId) REFERENCES fic_issued_documents(id) DEFERRABLE INITIALLY DEFERRED',
  },
  {
    name: 'fic_received_payments',
    fields: paymentFields,
    keys: ['documentId', 'position'],
    constraints:
      ', PRIMARY KEY(documentId, position), FOREIGN KEY(documentId) REFERENCES fic_received_documents(id) DEFERRABLE INITIALLY DEFERRED',
  },
];

export function createSchema(db: DatabaseSync): void {
  for (const table of tables)
    db.exec(
      `CREATE TABLE ${table.name} (${table.fields}${table.constraints ?? ''}) STRICT;`,
    );
  db.exec(`
    CREATE INDEX bank_expenses_date ON bank_expenses(date);
    CREATE INDEX bank_expenses_position ON bank_expenses(position);
    CREATE INDEX manual_categories_category ON bank_expense_manual_categories(categoryId);
    CREATE INDEX bank_rules_category ON bank_expense_rules(categoryId);
    CREATE INDEX quotes_date ON quotes(date);
    CREATE INDEX issued_documents_date ON fic_issued_documents(date);
    CREATE INDEX received_documents_date ON fic_received_documents(date);
    CREATE INDEX issued_payments_paid_date ON fic_issued_payments(paidDate, status);
    CREATE INDEX received_payments_paid_date ON fic_received_payments(paidDate, status);
    PRAGMA application_id=${APPLICATION_ID};
    PRAGMA user_version=${STORAGE_VERSION};
  `);
}

const columns = (table: Table): string[] =>
  table.fields.split(',').map((field) => field.trim().split(' ')[0]!);
const keyOf = (table: Table, row: Row): string =>
  JSON.stringify(table.keys.map((key) => row[key]));
export type DocumentRows = Map<string, Map<string, Row>>;

export function documentRows(document: CashDocument): DocumentRows {
  const snapshot = document.financialSnapshot;
  const collections: Record<string, object[]> = {
    archive_metadata: [
      {
        singleton: 1,
        schemaVersion: document.schemaVersion,
        documentId: document.documentId,
        revision: document.revision,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        fiscalOverridesPresent: document.fiscalPaymentOverrides !== undefined,
      },
    ],
    shared_settings: [{ singleton: 1, settings: document.settings }],
    profiles: document.profiles,
    business_costs: document.businessCosts,
    vehicles: document.vehicles,
    sites: document.sites,
    catalog_subitems: document.catalog.subItems,
    catalog_templates: document.catalog.templates,
    quotes: document.quotes,
    fiscal_payment_overrides: document.fiscalPaymentOverrides ?? [],
    bank_expense_categories: document.bankExpenseCategories,
    bank_expenses: document.bankExpenses,
    bank_expense_manual_categories: document.bankExpenses.flatMap((expense) =>
      expense.categoryIds.map((categoryId, position) => ({
        expenseId: expense.id,
        categoryId,
        position,
      })),
    ),
    bank_expense_rules: document.bankExpenseRules,
    fic_snapshot_metadata: snapshot
      ? [
          {
            singleton: 1,
            source: snapshot.source,
            company: snapshot.company,
            acquiredAt: snapshot.acquiredAt,
            pendingPresent: snapshot.pendingReceivedDocuments !== undefined,
          },
        ]
      : [],
    fic_issued_documents: snapshot?.issuedDocuments ?? [],
    fic_received_documents: snapshot?.receivedDocuments ?? [],
    fic_pending_received_documents: snapshot?.pendingReceivedDocuments ?? [],
    fic_issued_payments:
      snapshot?.issuedDocuments.flatMap((document) =>
        document.payments.map((payment, position) => ({
          ...payment,
          documentId: document.id,
          position,
        })),
      ) ?? [],
    fic_received_payments:
      snapshot?.receivedDocuments.flatMap((document) =>
        document.payments.map((payment, position) => ({
          ...payment,
          documentId: document.id,
          position,
        })),
      ) ?? [],
  };
  const result: DocumentRows = new Map();
  for (const table of tables) {
    const fields = columns(table);
    const rows = new Map<string, Row>();
    collections[table.name]!.forEach((object, position) => {
      const entity = object as Record<string, unknown>;
      const row: Row = {};
      for (const field of fields) {
        const value =
          field === 'position' ? (entity.position ?? position) : entity[field];
        row[field] =
          field === 'payload'
            ? JSON.stringify(
                Object.fromEntries(
                  Object.entries(entity).filter(
                    ([key]) => !fields.includes(key),
                  ),
                ),
              )
            : value === undefined
              ? null
              : table.json?.includes(field)
                ? JSON.stringify(value)
                : table.booleans?.includes(field)
                  ? Number(value)
                  : (value as SQLInputValue);
      }
      rows.set(keyOf(table, row), row);
    });
    result.set(table.name, rows);
  }
  return result;
}

export function writeDocumentRows(
  db: DatabaseSync,
  next: DocumentRows,
  previous?: DocumentRows,
  expected?: ConcurrencyToken,
): void {
  if (expected) {
    const row = [...next.get('archive_metadata')!.values()][0]!;
    const fields = columns(tables[0]!).filter((field) => field !== 'singleton');
    const updated = db
      .prepare(
        `UPDATE archive_metadata SET ${fields.map((field) => `${field}=?`).join(',')} WHERE singleton=1 AND documentId=? AND revision=?`,
      )
      .run(
        ...fields.map((field) => row[field]!),
        expected.documentId,
        expected.revision,
      );
    if (updated.changes !== 1)
      throw new Error('Confronto della revisione SQLite fallito.');
  }
  // Remove only changed unique-key rows before inserting their replacements.
  // Deferred FKs keep the complete domain mutation atomic, including reordering.
  for (const table of [...tables].reverse()) {
    const remove = db.prepare(
      `DELETE FROM ${table.name} WHERE ${table.keys.map((key) => `${key}=?`).join(' AND ')}`,
    );
    for (const [key, old] of previous?.get(table.name) ?? []) {
      const replacement = next.get(table.name)!.get(key);
      if (
        !replacement ||
        (table.name === 'profiles' && old.year !== replacement.year) ||
        (table.name === 'bank_expenses' &&
          ['date', 'description', 'amount'].some(
            (field) => old[field] !== replacement[field],
          ))
      ) {
        remove.run(...table.keys.map((key) => old[key]!));
      }
    }
  }
  for (const table of tables) {
    if (expected && table.name === 'archive_metadata') continue;
    const fields = columns(table);
    const insert = db.prepare(
      `INSERT INTO ${table.name} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')}) ON CONFLICT(${table.keys.join(',')}) DO UPDATE SET ${fields
        .filter((field) => !table.keys.includes(field))
        .map((field) => `${field}=excluded.${field}`)
        .join(',')}`,
    );
    for (const [key, row] of next.get(table.name)!) {
      const old = previous?.get(table.name)?.get(key);
      if (!old || fields.some((field) => old[field] !== row[field]))
        insert.run(...fields.map((field) => row[field]!));
    }
  }
}

export function readHeader(db: DatabaseSync) {
  return documentHeaderSchema.parse(
    db
      .prepare(
        'SELECT schemaVersion, documentId, revision, createdAt, updatedAt FROM archive_metadata WHERE singleton=1',
      )
      .get(),
  );
}

export function readDocument(db: DatabaseSync): CashDocument {
  const data: Record<string, Record<string, any>[]> = {};
  for (const table of tables) {
    data[table.name] = db
      .prepare(
        `SELECT * FROM ${table.name}${columns(table).includes('position') ? ' ORDER BY position' : ''}`,
      )
      .all()
      .map((raw) => {
        const entity: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(raw)) {
          if (value === null || field === 'position') continue;
          if (field === 'payload') {
            const payload = JSON.parse(String(value));
            if (
              !payload ||
              Array.isArray(payload) ||
              typeof payload !== 'object' ||
              Object.keys(payload).some((key) => columns(table).includes(key))
            )
              throw new Error('Dati annidati SQLite non validi o duplicati.');
            Object.assign(entity, payload);
          } else
            entity[field] = table.json?.includes(field)
              ? JSON.parse(String(value))
              : table.booleans?.includes(field)
                ? Boolean(value)
                : value;
        }
        return entity;
      });
  }
  const metadata = data.archive_metadata![0]!;
  const header = readHeader(db);
  const categories = data.bank_expense_manual_categories!;
  const snapshot = data.fic_snapshot_metadata![0];
  if (
    (!metadata.fiscalOverridesPresent &&
      data.fiscal_payment_overrides!.length) ||
    (!snapshot &&
      tables.some(
        (table) => table.name.startsWith('fic_') && data[table.name]!.length,
      )) ||
    (snapshot &&
      !snapshot.pendingPresent &&
      data.fic_pending_received_documents!.length)
  )
    throw new Error('Dati SQLite presenti senza i relativi metadati.');
  const withPayments = (kind: 'issued' | 'received') => {
    const payments = new Map<string, object[]>();
    for (const payment of data[`fic_${kind}_payments`]!) {
      const { documentId, ...fields } = payment;
      const group = payments.get(documentId) ?? [];
      group.push(fields);
      payments.set(documentId, group);
    }
    return data[`fic_${kind}_documents`]!.map((document) => ({
      ...document,
      payments: payments.get(document.id) ?? [],
    }));
  };
  const manual = new Map<string, string[]>();
  for (const link of categories) {
    const group = manual.get(link.expenseId) ?? [];
    group.push(link.categoryId);
    manual.set(link.expenseId, group);
  }
  return parseDocument({
    ...header,
    settings: data.shared_settings![0]!.settings,
    profiles: data.profiles,
    businessCosts: data.business_costs,
    vehicles: data.vehicles,
    sites: data.sites,
    catalog: {
      subItems: data.catalog_subitems,
      templates: data.catalog_templates,
    },
    quotes: data.quotes,
    ...(metadata.fiscalOverridesPresent
      ? { fiscalPaymentOverrides: data.fiscal_payment_overrides }
      : {}),
    bankExpenseCategories: data.bank_expense_categories,
    bankExpenses: data.bank_expenses!.map((expense) => ({
      ...expense,
      categoryIds: manual.get(expense.id) ?? [],
    })),
    bankExpenseRules: data.bank_expense_rules,
    ...(snapshot
      ? {
          financialSnapshot: {
            source: snapshot.source,
            company: snapshot.company,
            acquiredAt: snapshot.acquiredAt,
            issuedDocuments: withPayments('issued'),
            receivedDocuments: withPayments('received'),
            ...(snapshot.pendingPresent
              ? {
                  pendingReceivedDocuments: data.fic_pending_received_documents,
                }
              : {}),
          },
        }
      : {}),
  });
}

export function checkIntegrity(db: DatabaseSync, full = false): void {
  const rows = db
    .prepare(`PRAGMA ${full ? 'integrity_check' : 'quick_check'}`)
    .all();
  if (
    rows.length !== 1 ||
    Object.values(rows[0]!)[0] !== 'ok' ||
    db.prepare('PRAGMA foreign_key_check').all().length
  )
    throw new Error(
      'Integrità SQLite non valida. Seleziona esplicitamente un backup verificato.',
    );
}
