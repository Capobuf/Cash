import { mkdtemp, stat, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync, backup } from 'node:sqlite';
import { calculateQuote } from '../../src/domain/calculations';
import {
  createEmptyDocument,
  meta,
  type QuoteItem,
} from '../../src/domain/model';
import {
  createArchive,
  saveArchive,
  openArchive,
  closeAllArchives,
  closeArchive,
  importJsonArchive,
  backupPathFor,
} from '../../src/native/persistence';

const directories: string[] = [];
afterEach(async () => {
  closeAllArchives();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe('obiettivi prestazionali MVP', () => {
  it('ricalcola 100 voci in meno di 100 ms', () => {
    const items: QuoteItem[] = Array.from({ length: 100 }, (_, index) => ({
      ...meta(),
      name: `Voce ${index + 1}`,
      chosenPrice: '150.00',
      variantGroups: [],
      variantSelections: [],
      subItems: [
        {
          ...meta(),
          kind: 'time' as const,
          description: 'Lavoro',
          minutes: 60,
        },
        {
          ...meta(),
          kind: 'expense' as const,
          description: 'Materiale',
          amount: '25.00',
        },
      ],
    }));
    calculateQuote(items, '80.00');
    const started = performance.now();
    for (let run = 0; run < 10; run++) calculateQuote(items, '80.00');
    const elapsed = (performance.now() - started) / 10;
    expect(elapsed).toBeLessThan(100);
  });

  it('valida e salva un archivio di almeno 10 MB in meno di un secondo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cash-performance-'));
    directories.push(dir);
    const path = join(dir, 'Cash.sqlite');
    const document = createEmptyDocument();
    document.businessCosts.push({
      ...meta(),
      category: 'Dati',
      description: `Archivio ${'x'.repeat(10 * 1024 * 1024)}`,
      monthlyAmount: '0.00',
    });
    const created = await createArchive(path, document);
    if (!created.ok) throw new Error(created.error.message);
    expect((await stat(path)).size).toBeGreaterThanOrEqual(10 * 1024 * 1024);
    const started = performance.now();
    const saved = await saveArchive(
      path,
      created.value.document!,
      created.value.token,
    );
    const elapsed = performance.now() - started;
    expect(saved.ok).toBe(true);
    expect(elapsed).toBeLessThan(1000);
  }, 5000);

  it('misura creazione, apertura, modifica minima, import e backup su 5000 movimenti', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cash-performance-bank-'));
    directories.push(dir);
    const path = join(dir, 'Cash.sqlite');
    const document = createEmptyDocument();
    document.bankExpenses = Array.from({ length: 5000 }, (_, index) => ({
      ...meta(),
      date: '2026-10-01',
      description: `Movimento ${index}`,
      amount: '1234.56',
      categoryIds: [document.bankExpenseCategories[0]!.id],
    }));
    let started = performance.now();
    const created = await createArchive(path, document);
    if (!created.ok) throw new Error(created.error.message);
    const createMs = performance.now() - started;
    closeArchive(path);
    started = performance.now();
    const opened = await openArchive(path);
    if (!opened.ok) throw new Error(opened.error.message);
    const openMs = performance.now() - started;
    const changed = structuredClone(opened.value.document!);
    changed.bankExpenses[2500]!.excludedFromCalculations = true;
    started = performance.now();
    const saved = await saveArchive(path, changed, opened.value.token);
    if (!saved.ok) throw new Error(saved.error.message);
    const saveWithRollingBackupMs = performance.now() - started;
    const source = join(dir, 'historic.json');
    await writeFile(source, JSON.stringify(document));
    started = performance.now();
    const imported = await importJsonArchive(
      source,
      join(dir, 'import.sqlite'),
    );
    if (!imported.ok) throw new Error(imported.error.message);
    const importMs = performance.now() - started;
    const db = new DatabaseSync(path, { readOnly: true });
    started = performance.now();
    try {
      await backup(db, join(dir, 'measured-backup.sqlite'));
    } finally {
      db.close();
    }
    const backupApiMs = performance.now() - started;
    expect(
      saved.value.document!.bankExpenses[2500]!.excludedFromCalculations,
    ).toBe(true);
    expect(imported.value.document!.bankExpenses).toEqual(
      document.bankExpenses,
    );
    console.log(
      'SQLite performance',
      JSON.stringify({
        records: 5000,
        createMs,
        openMs,
        saveWithRollingBackupMs,
        importMs,
        backupApiMs,
        databaseBytes: (await stat(path)).size,
        rollingBackupBytes: (await stat(backupPathFor(path))).size,
      }),
    );
  }, 15000);
});
