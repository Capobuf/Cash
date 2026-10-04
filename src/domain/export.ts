import Decimal from 'decimal.js';
import {
  err,
  meta,
  ok,
  type ExportAttempt,
  type ExportLine,
  type Quote,
  type Result,
} from './model';

export function buildExportLines(
  quote: Quote,
  groups?: Array<{ itemIds: string[]; description: string }>,
  companyId?: string,
): Result<ExportLine[]> {
  if (!quote.client || quote.client.source !== 'fatture_in_cloud')
    return err({
      code: 'MISSING_DATA',
      field: 'client',
      message: 'Selezionare esplicitamente un cliente Fatture in Cloud.',
    });
  if (companyId && quote.client.companyId !== companyId)
    return err({
      code: 'VALIDATION',
      field: 'client',
      message: 'Il cliente appartiene a un’altra azienda Fatture in Cloud.',
    });
  const byId = new Map(quote.items.map((item) => [item.id, item]));
  const selectedGroups =
    groups ??
    quote.items.map((item) => ({ itemIds: [item.id], description: item.name }));
  if (selectedGroups.length === 0)
    return err({
      code: 'VALIDATION',
      field: 'export.groups',
      message: 'Seleziona almeno una voce da esportare.',
    });
  const used = new Set<string>();
  const lines: ExportLine[] = [];
  for (const group of selectedGroups) {
    if (!group.description.trim() || group.itemIds.length === 0)
      return err({
        code: 'VALIDATION',
        field: 'export.groups',
        message: 'Ogni gruppo richiede descrizione e voci.',
      });
    let amount = new Decimal(0);
    for (const id of group.itemIds) {
      const item = byId.get(id);
      if (!item || used.has(id))
        return err({
          code: 'VALIDATION',
          field: 'export.groups',
          message: 'Voce mancante o presente in più gruppi.',
        });
      if (item.chosenPrice === undefined)
        return err({
          code: 'MISSING_DATA',
          field: 'chosenPrice',
          message: 'Ogni voce esportata richiede un prezzo scelto.',
        });
      used.add(id);
      amount = amount.plus(item.chosenPrice);
    }
    lines.push({
      itemIds: [...group.itemIds],
      description: group.description.trim(),
      amount: amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      quantity: 1,
    });
  }
  return ok(lines);
}

export async function createPendingAttempt(
  companyId: string,
  lines: ExportLine[],
): Promise<ExportAttempt> {
  const snapshot = structuredClone(lines);
  const payloadHash = await sha256Text(
    JSON.stringify({ companyId, lines: snapshot }),
  );
  return {
    ...meta(),
    companyId,
    lines: snapshot,
    payloadHash,
    outcome: 'pending',
  };
}

export async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function needsRepeatWarning(quote: Quote): boolean {
  return quote.exportAttempts.some(
    (attempt) =>
      attempt.outcome === 'success' ||
      attempt.outcome === 'uncertain' ||
      attempt.outcome === 'pending',
  );
}
