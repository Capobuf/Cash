import { describe, expect, it } from 'vitest';
import { createBlankProfile, createEmptyDocument, createFiscalPreset2026, meta } from '../../src/domain/model';
import { cashDocumentSchema } from '../../src/domain/schema';

describe('schema archivio v6',()=>{
  it('inizializza solo raccolte bancarie assenti, senza mascherare valori corrotti', () => {
    const document = createEmptyDocument();
    expect(cashDocumentSchema.parse({ ...document, bankExpenses: undefined, bankExpenseCategories: undefined, bankExpenseRules: undefined })).toEqual(document);
    for (const field of ['bankExpenses', 'bankExpenseCategories', 'bankExpenseRules']) {
      for (const value of [null, {}, 'invalid']) expect(cashDocumentSchema.safeParse({ ...document, [field]: value }).success).toBe(false);
    }
  });
  it('conserva categorie manuali vecchie e nuove e rifiuta riferimenti legacy invalidi', () => {
    const document = createEmptyDocument();
    const first = { ...meta(), name: 'Uno' }; const second = { ...meta(), name: 'Due' };
    document.bankExpenseCategories = [first, second];
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
