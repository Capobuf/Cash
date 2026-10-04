import { describe, expect, it } from 'vitest';
import {
  createEmptyDocument,
  createFiscalPreset2026,
  createManualProfile,
  meta,
} from '../../src/domain/model';
import { cashDocumentSchema } from '../../src/domain/schema';
import { parseTemplatePack } from '../../src/domain/template-pack';
import { prepareBankExpenseCategory } from '../../src/domain/bank-expense-editing';
import { calculateFinancialOverview } from '../../src/domain/financial-overview';
import { selectableYears } from '../../src/renderer/App';

describe('open issue domain regressions', () => {
  it('keeps the current year selectable with historical-only data', () => {
    const doc = createEmptyDocument();
    doc.profiles = [createManualProfile(2025), createManualProfile(2028)];
    expect(selectableYears(doc, 2026)).toEqual([2028, 2026, 2025]);
    expect(selectableYears(createEmptyDocument(), 2026)).toEqual([2026]);
  });
  it('offers the manual 2026 preset and leaves other years blank', () => {
    const profile = createManualProfile(2026);
    expect(profile.fiscal).toEqual(createFiscalPreset2026().fiscal);
    expect(profile.capacity).toEqual(createFiscalPreset2026().capacity);
    expect(profile.confirmed).toBe(false);
    for (const year of [2025, 2027]) {
      expect(createManualProfile(year)).toMatchObject({
        year,
        confirmed: false,
        fiscal: { atecoCode: '', contributionRate: '0' },
      });
    }
  });
  it('rejects blank local names and descriptions at the archive/import boundaries', () => {
    for (const text of ['   ', '\t\n']) {
      const doc = createEmptyDocument();
      doc.sites.push({ ...meta(), name: text });
      expect(cashDocumentSchema.safeParse(doc).success).toBe(false);
      doc.sites = [];
      doc.catalog.subItems.push({
        ...meta(),
        kind: 'time',
        description: text,
        minutes: 30,
      });
      expect(cashDocumentSchema.safeParse(doc).success).toBe(false);
      expect(
        parseTemplatePack({
          format: 'cash-template-pack',
          formatVersion: 1,
          templates: [
            {
              name: 'Template',
              items: [
                {
                  name: 'Item',
                  subItems: [{ kind: 'time', description: text, minutes: 30 }],
                  variantGroups: [],
                },
              ],
            },
          ],
        }).ok,
      ).toBe(false);
    }
    const valid = createEmptyDocument();
    valid.sites.push({ ...meta(), name: '  Roma  ' });
    expect(cashDocumentSchema.safeParse(valid).success).toBe(true);
  });
  it('keeps the system tax category a leaf while allowing normal children and renames', () => {
    const doc = createEmptyDocument();
    const tax = doc.bankExpenseCategories[0]!;
    tax.name = 'Tributi';
    expect(
      prepareBankExpenseCategory(doc.bankExpenseCategories, 'F24', tax.id).ok,
    ).toBe(false);
    doc.bankExpenseCategories.push({
      ...meta(),
      name: 'F24',
      parentId: tax.id,
    });
    expect(cashDocumentSchema.safeParse(doc).success).toBe(false);
    doc.bankExpenseCategories.pop();
    const parent = { ...meta(), name: 'Costi' };
    doc.bankExpenseCategories.push(parent, {
      ...meta(),
      name: 'Servizi',
      parentId: parent.id,
    });
    expect(cashDocumentSchema.safeParse(doc).success).toBe(true);
  });
  it('does not apply tax metadata from company B to snapshot A, including offline', () => {
    const doc = createEmptyDocument();
    doc.profiles = [{ ...createFiscalPreset2026(), confirmed: true }];
    doc.financialSnapshot = {
      source: 'fatture_in_cloud',
      company: { id: 'A', name: 'A' },
      acquiredAt: '2026-10-01T00:00:00Z',
      issuedDocuments: [],
      receivedDocuments: [],
    };
    doc.settings.fic = {
      enabled: true,
      company: { id: 'B', name: 'B' },
      taxProfile: {
        acquiredAt: '2026-10-01T00:00:00Z',
        companyType: 'company',
      },
    };
    const result = () => calculateFinancialOverview(doc, 2026, '2026-10-04');
    expect(result().analysis?.fiscalProjection).toBeDefined();
    doc.financialSnapshot.company = { id: 'B', name: 'B' };
    expect(result().analysis?.fiscalProjection).toBeUndefined();
    doc.settings.fic = { enabled: false };
    expect(result().analysis?.fiscalProjection).toBeDefined();
  });
});
