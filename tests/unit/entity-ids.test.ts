import { expect, it } from 'vitest';
import { cloneTemplate } from '../../src/domain/catalog';
import { createEmptyDocument, meta } from '../../src/domain/model';
import { cashDocumentSchema } from '../../src/domain/schema';

function fixture() {
  const doc = createEmptyDocument();
  doc.sites.push({ ...meta(), name: 'Office' });
  doc.vehicles.push({
    ...meta(),
    name: 'Car',
    fuel: 'Benzina',
    consumption: '20',
    consumptionUnit: 'km/l',
    annualKm: '1000',
    annualInsurance: '0',
    annualTax: '0',
    annualMaintenance: '0',
  });
  const option = { ...meta(), name: 'Standard', subItems: [] };
  const item = {
    ...meta(),
    name: 'Work',
    subItems: [
      { ...meta(), kind: 'time' as const, description: 'Work', minutes: 60 },
    ],
    variantGroups: [
      {
        ...meta(),
        name: 'Mode',
        options: [option],
        defaultOptionId: option.id,
      },
    ],
  };
  doc.catalog.templates.push({ ...meta(), name: 'Template', items: [item] });
  doc.quotes.push({
    ...meta(),
    date: '2026-10-02',
    items: [],
    snapshotRevision: 0,
    exportAttempts: [],
  });
  return doc;
}

it.each(['sites', 'vehicles', 'quotes'] as const)(
  'rejects duplicate %s identities',
  (key) => {
    const doc = fixture();
    expect(cashDocumentSchema.safeParse(doc).success).toBe(true);
    doc[key] = [...doc[key], structuredClone(doc[key][0])] as never;
    const result = cashDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: [key, 1, 'id'] }),
      );
  },
);

it('rejects nested UUID collisions across collections', () => {
  const doc = fixture();
  doc.catalog.templates[0]!.items[0]!.variantGroups[0]!.options[0]!.id =
    doc.sites[0]!.id;
  const result = cashDocumentSchema.safeParse(doc);
  expect(result.success).toBe(false);
  if (!result.success)
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: [
          'catalog',
          'templates',
          0,
          'items',
          0,
          'variantGroups',
          0,
          'options',
          0,
          'id',
        ],
      }),
    );
});

it('accepts independent copies and repeated source and remote references', () => {
  const doc = fixture();
  doc.catalog.templates.push(cloneTemplate(doc.catalog.templates[0]!));
  const site = doc.sites[0]!;
  site.client = {
    source: 'fatture_in_cloud',
    companyId: site.id,
    clientId: site.id,
    displayName: 'Client',
  };
  doc.quotes[0]!.mainSite = { sourceId: site.id, name: site.name };
  doc.quotes.push({ ...structuredClone(doc.quotes[0]!), ...meta() });
  expect(cashDocumentSchema.safeParse(doc).success).toBe(true);
});
