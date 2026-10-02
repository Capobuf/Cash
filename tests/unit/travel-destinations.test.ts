import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyDocument, meta, type Quote } from '../../src/domain/model';
import { SubItemDialog } from '../../src/renderer/components/quotes/SubItemDialog';
import {
  InsertTemplateDialog,
  VariantChangeDialog,
} from '../../src/renderer/components/quotes/CatalogInsertDialogs';
import { AppState } from '../../src/renderer/state';

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
    'mostra tutte le sedi e conserva la proposta iniziale (cliente: %s)',
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
      doc.sites.push(main, supplier);
      const quote: Quote = {
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
            defaultDestinationSiteId: quote.mainSite?.sourceId,
            onClose: close,
            onSaveSimple: () => true,
            onSaveTravel: async () => true,
          }),
          'travel-destination',
        ],
        [
          createElement(InsertTemplateDialog, {
            doc,
            quote,
            onClose: close,
            onInsert: async () => true,
          }),
          'template-site',
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
          new RegExp(`<select[^>]*id="${id}"[^>]*>[\\s\\S]*?</select>`),
        )?.[0];
        expect(select).toContain('Fornitore ABC');
        expect(select).toContain('Sede cliente');
        if (withClient)
          expect(select).toContain(`value="${main.id}" selected=""`);
      }
    },
  );
});
