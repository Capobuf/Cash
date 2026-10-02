import { describe, expect, it } from 'vitest';
import { createBlankProfile, createEmptyDocument, createFiscalPreset2026, meta } from '../../src/domain/model';
import { cashDocumentSchema, foiEvidenceSchema } from '../../src/domain/schema';
import { parseTemplatePack } from '../../src/domain/template-pack';

describe('periodi mensili', () => {
  const periods = [
    ...Array.from({ length: 12 }, (_, index) => ({ period: `2026-${String(index + 1).padStart(2, '0')}`, valid: true })),
    ...['2026-00', '2026-13', '2026-1', '26-01', '2026/01', '2026-01-01', '', '2026-01\n'].map(period => ({ period, valid: false })),
  ];
  it.each(periods)('valida $period coerentemente in archivio, template pack e snapshot FOI', ({ period, valid }) => {
    const referencePrice = { amount: '100.00', period };
    const document = createEmptyDocument();
    document.quotes.push({ ...meta(), date: '2026-01-01', snapshotRevision: 0, exportAttempts: [],
      items: [{ ...meta(), name: 'Lavoro', referencePrice, subItems: [], variantGroups: [], variantSelections: [] }] });
    expect(cashDocumentSchema.safeParse(document).success).toBe(valid);
    document.quotes = [];
    document.catalog.templates.push({ ...meta(), name: 'Modello', items: [{ ...meta(), name: 'Lavoro', referencePrice, subItems: [], variantGroups: [] }] });
    expect(cashDocumentSchema.safeParse(document).success).toBe(valid);
    expect(parseTemplatePack({ format: 'cash-template-pack', formatVersion: 1, templates: [{ name: 'Modello',
      items: [{ name: 'Lavoro', referencePrice, subItems: [{ kind: 'time', description: 'Lavoro', minutes: 60 }], variantGroups: [] }] }] }).ok).toBe(valid);
    const evidence = { fromPeriod: '2026-01', toPeriod: '2026-12', fromIndex: '100', toIndex: '101',
      fromBase: '2025', toBase: '2025', fromLinkFactor: '1', toLinkFactor: '1', revaluedAmount: '101.00', acquiredAt: '2026-10-02T10:00:00Z' };
    expect(foiEvidenceSchema.safeParse({ ...evidence, fromPeriod: period }).success).toBe(valid);
    expect(foiEvidenceSchema.safeParse({ ...evidence, toPeriod: period }).success).toBe(valid);
  });
});

describe('schema archivio v9',()=>{
  it('richiede una sola categoria di sistema e conserva il significato dopo rename', () => {
    const doc = createEmptyDocument();
    expect(doc.bankExpenseCategories).toHaveLength(1);
    expect(doc.bankExpenseCategories[0]).toMatchObject({ name: 'Imposte P.IVA', systemRole: 'vat_taxes' });
    doc.bankExpenseCategories[0]!.name = 'Versamenti';
    expect(cashDocumentSchema.parse(doc).bankExpenseCategories[0]!.systemRole).toBe('vat_taxes');
    expect(cashDocumentSchema.safeParse({ ...doc, bankExpenseCategories: [] }).success).toBe(false);
    expect(cashDocumentSchema.safeParse({ ...doc, bankExpenseCategories: [...doc.bankExpenseCategories, { ...doc.bankExpenseCategories[0], ...meta(), name: 'Duplicato' }] }).success).toBe(false);
  });
  it('inizializza solo raccolte bancarie assenti, senza mascherare valori corrotti', () => {
    const document = createEmptyDocument();
    expect(cashDocumentSchema.parse({ ...document, bankExpenses: undefined, bankExpenseRules: undefined })).toEqual(document);
    for (const field of ['bankExpenses', 'bankExpenseCategories', 'bankExpenseRules']) {
      for (const value of [null, {}, 'invalid']) expect(cashDocumentSchema.safeParse({ ...document, [field]: value }).success).toBe(false);
    }
  });
  it('conserva categorie manuali vecchie e nuove e rifiuta riferimenti legacy invalidi', () => {
    const document = createEmptyDocument();
    const first = { ...meta(), name: 'Uno' }; const second = { ...meta(), name: 'Due' };
    document.bankExpenseCategories = [first, second, ...document.bankExpenseCategories];
    const row = { ...meta(), date: '2026-01-01', description: 'Test', amount: '1.00' };
    const parse = (fields: Record<string, unknown>) => cashDocumentSchema.safeParse({ ...document, bankExpenses: [{ ...row, ...fields }] });
    const merged = parse({ categoryId: first.id, categoryIds: [second.id] });
    expect(merged.success && merged.data.bankExpenses[0]?.categoryIds).toEqual([second.id, first.id]);
    for (const categoryId of [null, 'invalid', meta().id]) expect(parse({ categoryId }).success).toBe(false);
    expect(parse({ categoryId: first.id, categoryIds: null }).success).toBe(false);
  });
  it('accetta coordinate risolte valide e rifiuta precisioni oltre i limiti',()=>{const document=createEmptyDocument();document.profiles.push(createBlankProfile(2027));document.sites.push({...meta(),name:'Studio',address:'Roma',location:{inputKind:'address',inputValue:'Roma',coordinates:{longitude:'12.4964',latitude:'41.9028'}}});expect(cashDocumentSchema.safeParse(document).success).toBe(true);const invalid=structuredClone(document);invalid.businessCosts.push({...meta(),category:'Software',description:'Servizio',monthlyAmount:'1.001'});expect(cashDocumentSchema.safeParse(invalid).success).toBe(false);});
  it('rifiuta profili annuali duplicati e default orfani',()=>{const document=createEmptyDocument();const profile=createFiscalPreset2026();document.profiles.push(profile,{...structuredClone(profile),...meta()});document.settings.defaultDepartureSiteId=meta().id;document.settings.defaultVehicleId=meta().id;const result=cashDocumentSchema.safeParse(document);expect(result.success).toBe(false);if(!result.success)expect(result.error.issues.map(issue=>issue.message)).toEqual(expect.arrayContaining(['esiste già un profilo per questo anno','Sede di partenza predefinita inesistente','Veicolo predefinito inesistente']));});
  it('rifiuta coordinate fuori intervallo',()=>{const document=createEmptyDocument();document.sites.push({...meta(),name:'Errata',location:{inputKind:'coordinates',inputValue:'200, 45',coordinates:{longitude:'200',latitude:'45'}}});expect(cashDocumentSchema.safeParse(document).success).toBe(false);});
  it('richiede configurazione completa quando Fatture in Cloud è attivo',()=>{const document=createEmptyDocument();document.settings.fic.enabled=true;expect(cashDocumentSchema.safeParse(document).success).toBe(false);});
});
