import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FiscalCorrectionForm } from '../../src/renderer/components/FiscalCorrectionForm';

describe('correzione annuale del commercialista', () => {
  it('spiega il perimetro annuale e consente di rimuovere il totale anche con zero', () => {
    const html = renderToStaticMarkup(
      createElement(FiscalCorrectionForm, {
        year: 2026,
        total: '0.00',
        onSave: () => true,
      }),
    );
    expect(html).toContain('saldo INPS 2025');
    expect(html).toContain('primo e secondo acconto 2026');
    expect(html).toContain('Non sommare due volte');
    expect(html).toContain('compenso del commercialista');
    expect(html).toContain('compensazioni');
    expect(html).toContain('Rimuovi totale annuale');
    expect(html).toContain(
      'abilita «Ancora da versare» e «Disponibilità stimata»',
    );
    expect(html).toContain('value="0,00"');
  });

  it('disabilita il form quando l’archivio non può essere modificato', () => {
    const html = renderToStaticMarkup(
      createElement(FiscalCorrectionForm, {
        year: 2026,
        disabled: true,
        onSave: () => true,
      }),
    );
    expect(html).toContain('<fieldset disabled=""');
  });
});
