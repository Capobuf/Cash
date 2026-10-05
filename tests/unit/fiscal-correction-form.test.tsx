import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FiscalCorrectionForm } from '../../src/renderer/components/FiscalCorrectionForm';
import { FiscalCorrectionDialog } from '../../src/renderer/components/FiscalCorrectionDialog';

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
    expect(html).not.toContain('<details');
    expect(html).toContain('<form');
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

  it('usa il trigger Imposta o Modifica in base al totale annuale', () => {
    const render = (total?: string) =>
      renderToStaticMarkup(
        createElement(FiscalCorrectionDialog, {
          year: 2026,
          total,
          onSave: () => true,
        }),
      );
    expect(render()).toContain('Imposta');
    expect(render('0.00')).toContain('Modifica');
  });
});
