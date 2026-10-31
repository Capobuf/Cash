import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyDocument, meta, type Quote } from '../../src/domain/model';
import { SubItemDialog } from '../../src/renderer/components/quotes/SubItemDialog';
import {
  InsertTemplateEditor,
  VariantChangeDialog,
} from '../../src/renderer/components/quotes/CatalogInsertDialogs';
import { AppState } from '../../src/renderer/state';

vi.mock('@/components/ui/selection-field', () => ({
  SearchableSelect: ({
    id,
    value,
    options,
  }: {
    id: string;
    value: string;
    options: { value: string; label: string }[];
  }) =>
    createElement(
      'div',
      { id, 'data-selected-value': value },
      options.map((option) =>
        createElement('span', { key: option.value }, option.label),
      ),
    ),
}));

vi.mock('@/components/ui/dialog', () => {
  const content = ({ children }: { children: ReactNode }) => children;
  return Object.fromEntries(
    [
      'Dialog',
      'DialogContent',
      'DialogHeader',
      'DialogTitle',
      'DialogDescription',
      'DialogFooter',
    ].map((name) => [name, content]),
  );
});
vi.mock('@/components/ui/alert-dialog', () => {
  const content = ({ children }: { children: ReactNode }) => children;
  return Object.fromEntries(
    [
      'AlertDialog',
      'AlertDialogContent',
      'AlertDialogHeader',
      'AlertDialogTitle',
      'AlertDialogDescription',
      'AlertDialogFooter',
      'AlertDialogAction',
      'AlertDialogCancel',
    ].map((name) => [name, content]),
  );
});
vi.mock('@/components/EntityDialogs', () => ({
  SiteDialog: () => null,
  VehicleDialog: () => null,
}));

describe('destinazioni delle trasferte', () => {
  it.each([false, true])(
    'mostra le sedi compatibili con il cliente e conserva la proposta iniziale (cliente: %s)',
    (withClient) => {
      const doc = createEmptyDocument();
      const client = {
        source: 'fatture_in_cloud' as const,
        companyId: '1',
        clientId: '2',
        displayName: 'Cliente',
      };
      const main = { ...meta(), name: 'Sede cliente', client };
      const supplier = { ...meta(), name: 'Fornitore ABC' };
      const other = {
        ...meta(),
        name: 'Altro cliente',
        client: { ...client, clientId: '3' },
      };
      doc.sites.push(main, supplier, other);
      const quote: Quote = {
        number: 1,
        ...meta(),
        date: '2026-10-02',
        items: [],
        snapshotRevision: 0,
        exportAttempts: [],
        ...(withClient
          ? { client, mainSite: { sourceId: main.id, name: main.name } }
          : {}),
      };
      const travel = {
        ...meta(),
        kind: 'travel' as const,
        description: 'Visita',
        roundTrip: true,
        occurrences: 1,
      };
      const option = { ...meta(), name: 'Visita', subItems: [travel] };
      const group = { ...meta(), name: 'Modalita', options: [option] };
      doc.catalog.templates.push({
        ...meta(),
        name: 'Template',
        items: [
          { ...meta(), name: 'Lavoro', subItems: [travel], variantGroups: [] },
        ],
      });
      const close = () => undefined;
      const views = [
        [
          createElement(SubItemDialog, {
            doc,
            appState: new AppState(),
            initialKind: 'travel',
            client: quote.client,
            defaultDestinationSiteId: quote.mainSite?.sourceId,
            onClose: close,
            onSaveSimple: () => true,
            onSaveTravel: async () => true,
          }),
          'travel-destination',
        ],
        [
          createElement(VariantChangeDialog, {
            doc,
            quote,
            group,
            optionId: option.id,
            hasManualChanges: false,
            onClose: close,
            onChange: async () => true,
          }),
          'change-site',
        ],
      ] as const;
      for (const [element, id] of views) {
        const markup = renderToStaticMarkup(element);
        const select = markup.match(
          new RegExp(`<div[^>]*id="${id}"[^>]*>[\\s\\S]*?</div>`),
        )?.[0];
        expect(select).toContain('Fornitore ABC');
        expect(select).not.toContain('Altro cliente');
        if (withClient) {
          expect(select).toContain('Sede cliente');
          expect(select).toContain(`data-selected-value="${main.id}"`);
        } else {
          expect(select).not.toContain('Sede cliente');
          expect(select).toContain('data-selected-value=""');
        }
      }
    },
  );
  it('non apre un’anteprima o una configurazione trasferte prima di scegliere un template', () => {
    const doc = createEmptyDocument();
    const quote: Quote = {
      ...meta(),
      number: 1,
      date: '2026-10-27',
      items: [],
      snapshotRevision: 0,
      exportAttempts: [],
    };
    doc.catalog.templates.push({
      ...meta(),
      name: 'Template',
      items: [{ ...meta(), name: 'Lavoro', subItems: [], variantGroups: [] }],
    });
    const markup = renderToStaticMarkup(
      createElement(InsertTemplateEditor, {
        doc,
        quote,
        disabled: false,
        onClose: vi.fn(),
        onInsert: vi.fn(),
      }),
    );
    expect(markup).toContain('Scegli template');
    expect(markup).not.toContain('Anteprima ·');
    expect(markup).not.toContain('id="template-site"');
    expect(markup).not.toContain('Cerca template da inserire');
  });
});
