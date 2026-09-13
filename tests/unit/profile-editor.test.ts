import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument, createFiscalPreset2026 } from '../../src/domain/model';
import { ProfileEditor } from '../../src/renderer/components/ProfileEditor';
import type { AppState } from '../../src/renderer/state';

describe('editor del profilo', () => {
  it('mantiene nel form i campi di tutte le schede', () => {
    const profile = createFiscalPreset2026();
    profile.revenueTarget = '50000.00';
    const doc = createEmptyDocument();
    doc.profiles.push(profile);

    const markup = renderToStaticMarkup(React.createElement(ProfileEditor, {
      profile,
      doc,
      appState: {} as AppState,
      onCopy: () => undefined,
    }));

    expect(markup).toContain('name="revenueTarget"');
    expect(markup).toContain('name="hoursPerDay"');
    expect(markup).toContain('name="atecoCode"');
  });
});
