import { createHash } from 'node:crypto';
import { err, meta, ok, type ExportAttempt, type ExportLine, type Quote, type Result } from './model';

export function buildExportLines(quote: Quote, groups?: Array<{ itemIds: string[]; description: string }>): Result<ExportLine[]> {
  if (!quote.client) return err({ code: 'MISSING_DATA', field: 'client', message: 'Selezionare un cliente Fatture in Cloud.' });
  if (quote.items.some(item => item.chosenPrice === undefined)) return err({ code: 'MISSING_DATA', field: 'chosenPrice', message: 'Ogni voce esportata richiede un prezzo scelto.' });
  const byId = new Map(quote.items.map(item => [item.id, item]));
  if (!groups) return ok(quote.items.map(item => ({ itemIds: [item.id], description: item.name, amount: item.chosenPrice!, quantity: 1 })));
  const used = new Set<string>();
  const lines: ExportLine[] = [];
  for (const group of groups) {
    if (!group.description.trim() || group.itemIds.length === 0) return err({ code: 'VALIDATION', field: 'export.groups', message: 'Ogni gruppo richiede descrizione e voci.' });
    let amount = 0;
    for (const id of group.itemIds) {
      const item = byId.get(id);
      if (!item || used.has(id)) return err({ code: 'VALIDATION', field: 'export.groups', message: 'Voce mancante o presente in più gruppi.' });
      used.add(id);
      amount += Number(item.chosenPrice);
    }
    lines.push({ itemIds: [...group.itemIds], description: group.description.trim(), amount: amount.toFixed(2), quantity: 1 });
  }
  if (used.size !== quote.items.length) return err({ code: 'VALIDATION', field: 'export.groups', message: 'Ogni voce deve comparire una volta nell’anteprima.' });
  return ok(lines);
}

export function createPendingAttempt(companyId: string, lines: ExportLine[]): ExportAttempt {
  const payloadHash = createHash('sha256').update(JSON.stringify({ companyId, lines })).digest('hex');
  return { ...meta(), companyId, lines: structuredClone(lines), payloadHash, outcome: 'pending' };
}

export function needsRepeatWarning(quote: Quote): boolean {
  return quote.exportAttempts.some(attempt => attempt.outcome === 'success' || attempt.outcome === 'uncertain' || attempt.outcome === 'pending');
}
