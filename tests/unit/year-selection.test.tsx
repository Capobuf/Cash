import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createBlankProfile,
  createEmptyDocument,
  createFiscalPreset2026,
} from '../../src/domain/model';
import { AppShell } from '../../src/renderer/components/Layout';
import { DashboardView } from '../../src/renderer/views/DashboardView';
import { AppState } from '../../src/renderer/state';

describe('selezione anno', () => {
  it('mostra il selettore condiviso sotto il logo in ogni sezione', () => {
    const appState = new AppState();
    for (const view of ['dashboard', 'quotes', 'financial-analysis'] as const) {
      const html = renderToStaticMarkup(
        <AppShell
          appState={appState}
          view={view}
          onView={() => {}}
          years={[2026, 2025]}
          selectedYear={2025}
          onYearChange={() => {}}
        >
          <div>Contenuto</div>
        </AppShell>,
      );
      expect(html.includes('id="app-year"')).toBe(true);
      expect(html.indexOf('aria-label="Cash"')).toBeLessThan(
        html.indexOf('id="app-year"'),
      );
      expect(html.includes('value="2025" selected="">2025</option>')).toBe(
        true,
      );
    }
  });

  it('usa il profilo dell’anno scelto nella panoramica', () => {
    const doc = createEmptyDocument();
    const profile2025 = createBlankProfile(2025);
    profile2025.revenueTarget = '12345.00';
    const profile2026 = createFiscalPreset2026();
    profile2026.revenueTarget = '67890.00';
    doc.profiles.push(profile2025, profile2026);

    const html = renderToStaticMarkup(
      <DashboardView
        doc={doc}
        year={2025}
        appState={new AppState()}
        onEditProfile={() => {}}
        onOpenQuote={() => {}}
        onNewQuote={() => {}}
      />,
    );

    expect(html).toContain('Profilo 2025');
    expect(html).toContain('12.345,00');
    expect(html).not.toContain('67.890,00');
  });
});
