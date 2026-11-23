import type { DatabaseSync } from 'node:sqlite';

// Rebuilds a current archive as storage v2: no bank accounts, no accountId.
export function downgradeToStorageV2(db: DatabaseSync): void {
  db.exec(`
    PRAGMA foreign_keys=OFF;
    BEGIN IMMEDIATE;
    DROP TABLE bank_accounts;
    CREATE TABLE bank_expenses_v2 (id TEXT PRIMARY KEY, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, position INTEGER NOT NULL, date TEXT NOT NULL, description TEXT NOT NULL, amount TEXT NOT NULL, excludedFromCalculations INTEGER, UNIQUE(date, description, amount)) STRICT;
    INSERT INTO bank_expenses_v2 SELECT id, createdAt, updatedAt, position, date, description, amount, excludedFromCalculations FROM bank_expenses;
    DROP TABLE bank_expenses;
    ALTER TABLE bank_expenses_v2 RENAME TO bank_expenses;
    CREATE INDEX bank_expenses_date ON bank_expenses(date);
    CREATE INDEX bank_expenses_position ON bank_expenses(position);
    PRAGMA user_version=2;
    COMMIT;
    PRAGMA foreign_keys=ON;
  `);
}
