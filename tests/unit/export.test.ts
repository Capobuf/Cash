import { describe,expect,it } from 'vitest';
import { buildExportLines, createPendingAttempt, needsRepeatWarning, sha256Text } from '../../src/domain/export';
import { meta, type Quote } from '../../src/domain/model';

const quote:Quote={...meta(),date:'2026-09-08',client:{source:'fatture_in_cloud',companyId:'1',clientId:'2',displayName:'Rossi',vatNumber:'IT12345678901'},snapshotRevision:0,exportAttempts:[],items:[{...meta(),name:'A',chosenPrice:'100.00',subItems:[],variantGroups:[],variantSelections:[]},{...meta(),name:'B',chosenPrice:'50.00',subItems:[],variantGroups:[],variantSelections:[]}]};
describe('esportazione deliberata',()=>{
  it('crea righe commerciali senza dettagli interni e raggruppa integralmente',()=>{const lines=buildExportLines(quote,[{itemIds:quote.items.map(x=>x.id),description:'Consulenza'}]);expect(lines).toEqual({ok:true,value:[{itemIds:quote.items.map(x=>x.id),description:'Consulenza',amount:'150.00',quantity:1}]});});
  it('crea evidenza pending prima dell’invio e avvisa sui tentativi',()=>{const lines=buildExportLines(quote);if(!lines.ok)throw new Error('lines');const attempt=createPendingAttempt('1',lines.value);expect(attempt.outcome).toBe('pending');expect(attempt.payloadHash).toMatch(/^[a-f0-9]{64}$/);expect(needsRepeatWarning({...quote,exportAttempts:[attempt]})).toBe(true);});
  it('blocca cliente o prezzo mancante',()=>{expect(buildExportLines({...quote,client:undefined}).ok).toBe(false);expect(buildExportLines({...quote,items:[{...quote.items[0]!,chosenPrice:undefined}]}).ok).toBe(false);});
  it('blocca cliente locale e cliente di azienda diversa',()=>{expect(buildExportLines({...quote,client:{source:'local',localClientId:meta().id,displayName:'Locale'} as const}).ok).toBe(false);expect(buildExportLines(quote,undefined,'altra').ok).toBe(false);});
  it('produce SHA-256 standard anche nel renderer',()=>{expect(sha256Text('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');});
});
