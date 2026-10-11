import { calculateItem } from '../../domain/calculations';
import type { QuoteItem } from '../../domain/model';

export type PartialMetric = 'chosen' | 'theoretical' | 'minutes' | 'expenses';
export interface MissingAnalysisTarget {
  id: string;
  itemId?: string;
  message: string;
}

export function missingAnalysisTargets(
  items: QuoteItem[],
  hourly: string | undefined,
  metric: PartialMetric,
): MissingAnalysisTarget[] {
  const targets: MissingAnalysisTarget[] = [];
  for (const item of items) {
    if (metric === 'chosen') {
      if (item.chosenPrice === undefined)
        targets.push({
          id: `chosen-${item.id}`,
          itemId: item.id,
          message: 'Prezzo scelto non inserito.',
        });
      continue;
    }
    const analysis = calculateItem(item, hourly);
    if (
      metric === 'theoretical' &&
      analysis.minutes !== undefined &&
      analysis.timeValue === undefined &&
      !targets.some((target) => target.id === 'quote-profile')
    )
      targets.push({
        id: 'quote-profile',
        message:
          'Associa un profilo confermato e calcolabile per valorizzare il tempo.',
      });
    if (!item.subItems.length) {
      targets.push({
        id: `quote-technical-${item.id}`,
        itemId: item.id,
        message:
          metric === 'minutes'
            ? 'Nessun tempo disponibile in questa voce.'
            : metric === 'expenses'
              ? 'Nessuna stima delle spese disponibile in questa voce.'
              : 'Aggiungi attività o costi per calcolare il valore teorico di questa voce.',
      });
      continue;
    }
    for (const sub of item.subItems) {
      if (sub.kind !== 'travel') continue;
      const missing: string[] = [];
      if (metric === 'theoretical') {
        if (!sub.departure) missing.push('partenza');
        if (!sub.destination) missing.push('destinazione');
        if (!sub.vehicleId) missing.push('veicolo');
      }
      if (metric !== 'expenses' && sub.totalMinutes === undefined)
        missing.push('tempo');
      if (metric !== 'minutes' && sub.totalCost === undefined)
        missing.push('costo');
      if (missing.length)
        targets.push({
          id: `quote-sub-${sub.id}`,
          itemId: item.id,
          message: `Dati trasferta mancanti: ${missing.join(', ')}.`,
        });
    }
  }
  return targets;
}
