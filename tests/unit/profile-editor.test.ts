import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  createEmptyDocument,
  createFiscalPreset2026,
} from '../../src/domain/model';
import { ProfileEditor } from '../../src/renderer/components/ProfileEditor';
import type { AppState } from '../../src/renderer/state';
import { copyProfileToYear } from '../../src/domain/profiles';

describe('editor del profilo', () => {
  it.each([false, true])(
    'lascia le conferme fiscali modificabili con FIC (confermate: %s)',
    (confirmed) => {
      const profile = createFiscalPreset2026();
      profile.fiscal.reducedEligibilityConfirmed = confirmed;
      profile.fiscal.ordinaryApplicabilityConfirmed = confirmed;
      const doc = createEmptyDocument();
      doc.profiles.push(profile);
      doc.settings.fic.taxProfile = {
        acquiredAt: '2026-09-01T12:00:00Z',
        regime: 'forfettario_5',
        profitCoefficient: '78',
      };
      const markup = renderToStaticMarkup(
        React.createElement(ProfileEditor, {
          profile,
          doc,
          appState: {} as AppState,
          onCopy: () => undefined,
        }),
      );
      for (const name of [
        'reducedEligibilityConfirmed',
        'ordinaryApplicabilityConfirmed',
      ]) {
        const control = markup.match(
          new RegExp(`<[^>]*id="${name}"[^>]*>`),
        )?.[0];
        expect(control).toBeDefined();
        expect(control).not.toMatch(/\s(?:disabled|aria-disabled)=/i);
        expect(markup).not.toMatch(
          new RegExp(`<input[^>]*type="hidden"[^>]*name="${name}"`),
        );
      }
      expect(
        markup.match(/<select[^>]*id="activityPhase"[^>]*>/)?.[0],
      ).toContain('disabled');
      expect(
        markup.match(/<input[^>]*id="profitabilityCoefficient"[^>]*>/)?.[0],
      ).toMatch(/readonly/i);
    },
  );
  it('mantiene nel form i campi di tutte le schede', () => {
    const profile = createFiscalPreset2026();
    profile.revenueTarget = '50000.00';
    const doc = createEmptyDocument();
    doc.profiles.push(profile);

    const markup = renderToStaticMarkup(
      React.createElement(ProfileEditor, {
        profile,
        doc,
        appState: {} as AppState,
        onCopy: () => undefined,
      }),
    );

    expect(markup).toContain('name="revenueTarget"');
    expect(markup).toContain('name="hoursPerDay"');
    expect(markup).toContain('name="atecoCode"');
  });

  it('lascia modificare una aliquota INPS zero importata da FIC e mostra come configurarla', () => {
    const profile = createFiscalPreset2026();
    profile.confirmed = true;
    profile.fiscal.contributionRate = '0';
    const doc = createEmptyDocument();
    doc.profiles.push(profile);
    doc.settings.fic.taxProfile = {
      acquiredAt: '2026-09-01T12:00:00Z',
      contributionsPercentage: '0',
    };
    const markup = renderToStaticMarkup(
      React.createElement(ProfileEditor, {
        profile,
        doc,
        appState: {} as AppState,
        onCopy: () => undefined,
      }),
    );
    const input = markup.match(
      /<input\b[^>]*name="contributionRate"[^>]*>/,
    )?.[0];
    expect(input).toBeDefined();
    expect(input).not.toMatch(/\s(?:readonly|disabled)=/i);
    expect(input).toContain('value=""');
    expect(markup).toContain('Configura INPS');
    expect(markup).toContain('inps.it');
  });

  it('mostra avviso e istruzioni riferiti al nuovo anno copiato', () => {
    const copied = copyProfileToYear(createFiscalPreset2026(), 2027);
    if (!copied.ok) throw new Error('Copia non riuscita');
    const doc = createEmptyDocument();
    doc.profiles.push(copied.value);
    const markup = renderToStaticMarkup(
      React.createElement(ProfileEditor, {
        profile: copied.value,
        doc,
        appState: {} as AppState,
        onCopy: () => undefined,
      }),
    );
    expect(markup).toContain('Verifica l’aliquota INPS per il 2027');
    expect(markup).toContain('Gestione Separata aliquote contributive 2027');
    expect(markup).toContain('Configura INPS');
  });
});
