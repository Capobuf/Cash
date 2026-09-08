import { describe, expect, it } from 'vitest';
import { createBlankProfile, createEmptyDocument, createFiscalPreset2026, meta } from '../../src/domain/model';
import { cashDocumentSchema } from '../../src/domain/schema';

describe('schema archivio v2',()=>{
  it('accetta un profilo vuoto non confermato ma rifiuta precisioni oltre i limiti',()=>{
    const blank=createEmptyDocument();blank.profiles.push(createBlankProfile(2027));expect(cashDocumentSchema.safeParse(blank).success).toBe(true);
    const invalid=structuredClone(blank);invalid.businessCosts.push({...meta(),category:'Software',description:'Servizio',monthlyAmount:'1.001'});
    expect(cashDocumentSchema.safeParse(invalid).success).toBe(false);
  });
  it('rifiuta profili annuali duplicati, conferme fiscali mancanti e riferimenti locali orfani',()=>{
    const document=createEmptyDocument();const profile=createFiscalPreset2026();profile.confirmed=true;document.profiles.push(profile,{...structuredClone(profile),...meta()});
    document.sites.push({...meta(),name:'Cliente',address:'Via Roma',client:{source:'local',localClientId:meta().id,displayName:'Orfano'}});
    const result=cashDocumentSchema.safeParse(document);expect(result.success).toBe(false);
    if(!result.success)expect(result.error.issues.map(issue=>issue.message)).toEqual(expect.arrayContaining(['esiste già un profilo per questo anno','Cliente locale referenziato inesistente']));
  });
  it('richiede configurazione completa quando Fatture in Cloud è attivo',()=>{const document=createEmptyDocument();document.settings.fic.enabled=true;expect(cashDocumentSchema.safeParse(document).success).toBe(false);});
});
