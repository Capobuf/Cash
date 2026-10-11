import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { calculateProfile } from '../../src/domain/calculations';
import {
  createEmptyDocument,
  createFiscalPreset2026,
  meta,
  type CashDocument,
} from '../../src/domain/model';
import { DashboardView } from '../../src/renderer/views/DashboardView';
import { AppState } from '../../src/renderer/state';
import { eur, formatNumber, hours } from '../../src/renderer/lib/format';

const fixture = () => {
  const doc = createEmptyDocument();
  const profile = createFiscalPreset2026();
  Object.assign(profile, { confirmed: true, revenueTarget: '50000.00' });
  doc.profiles.push(profile);
  return doc;
};
const render = (doc: CashDocument, year = 2026) =>
  renderToStaticMarkup(
    createElement(DashboardView, {
      doc,
      year,
      appState: new AppState(),
      onEditProfile: vi.fn(),
      onOpenQuote: vi.fn(),
      onNewQuote: vi.fn(),
    }),
  );

describe('Panoramica iniziale', () => {
  it('uses confirmed calculations and shows the hourly reference only in the hero', () => {
    const doc = fixture();
    const result = calculateProfile(doc.profiles[0]!, doc.businessCosts);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const html = render(doc);
    expect(html).toContain(formatNumber(result.value.hourlyTarget, 2));
    expect(html).toContain(eur(result.value.fiscalNet));
    expect(html).toContain(hours(result.value.availableClientMinutes));
    expect(html.match(/Valore orario obiettivo/g)).toHaveLength(1);
    expect(html.match(/Nuovo preventivo/g)).toHaveLength(1);
    expect(html).toContain('non una tariffa obbligatoria');
    expect(html).not.toContain('Riprendi il lavoro');
  });

  it('keeps creation available without a profile and shows an explicit unavailable value', () => {
    const html = render(createEmptyDocument());
    expect(html).toContain('Profilo annuale mancante');
    expect(html).toContain('Crea profilo 2026');
    expect(html).toContain('Nuovo preventivo');
    expect(html).toContain('Nessun preventivo');
    expect(html).not.toContain('>0,00<');
  });

  it('labels draft targets and does not calculate an unconfirmed profile', () => {
    const doc = fixture();
    doc.profiles[0]!.confirmed = false;
    const html = render(doc);
    expect(html).toContain('Obiettivo del profilo da verificare');
    expect(html).toContain('Profilo da verificare');
    expect(html).toContain('Verifica profilo');
    expect(html).not.toContain('37.551,57');
  });

  it('reports calculation errors without replacing missing results with zero', () => {
    const doc = fixture();
    doc.profiles[0]!.capacity.clientTimePercentage = '0';
    const result = calculateProfile(doc.profiles[0]!, []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const html = render(doc);
    expect(html).toContain('Calcolo non disponibile');
    expect(html).toContain(result.error.message);
    expect(html).not.toContain('>0,00<');
    expect(html).toContain('Nuovo preventivo');
  });

  it('keeps fiscal unavailability and profile warnings visible above the cessation threshold', () => {
    const doc = fixture();
    doc.profiles[0]!.revenueTarget = '100000.01';
    const html = render(doc);
    expect(html).toContain('Proiezione fiscale non disponibile');
    expect(html).toContain('Superata la soglia di cessazione');
    expect(html).toContain('Indicazioni sul profilo');
  });

  it('preserves the six most recent quotes in reverse order and enables resuming', () => {
    const doc = fixture();
    doc.quotes = Array.from({ length: 7 }, (_, index) => ({
      ...meta(),
      date: '2026-10-01',
      snapshotRevision: 0,
      exportAttempts: [],
      items: [
        { ...meta(), name: `Lavoro ${index}`, subItems: [], variantGroups: [] },
      ],
    }));
    const html = render(doc);
    expect(html).toContain('Riprendi il lavoro');
    expect(html).not.toContain('Lavoro 0');
    expect(html.indexOf('Lavoro 6')).toBeLessThan(html.indexOf('Lavoro 5'));
    expect(html.match(/Apri preventivo/g)).toHaveLength(6);
  });

  it('does not reuse a confirmed profile from another year', () => {
    const html = render(fixture(), 2027);
    expect(html).toContain('Crea profilo 2027');
    expect(html).toContain('Profilo annuale mancante');
    expect(html).not.toContain('50.000');
  });
});
