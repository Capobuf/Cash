import { describe, expect, it } from 'vitest';
import { disableFic, ficDeviceState, removeFicLink, requireActiveFic } from '../../src/domain/integration';
import type { SharedSettings } from '../../src/domain/model';

const active: SharedSettings = { fuelTerritory:'Lazio', fic:{ enabled:true, company:{id:'1',name:'Uno'}, product:{id:'2',name:'Consulenza'}, lastVerification:{at:'2026-09-08T00:00:00.000Z',result:'success'} } };
describe('stato Fatture in Cloud v0.6',()=>{
  it('parte disattivato e blocca prima di una chiamata live',()=>{const settings:SharedSettings={fic:{enabled:false}};expect(ficDeviceState(settings,false)).toBe('disabled');expect(requireActiveFic(settings,'1').ok).toBe(false);});
  it('distingue configurazione locale, attivo ed errore',()=>{expect(ficDeviceState(active,false)).toBe('requires_local_configuration');expect(ficDeviceState(active,true)).toBe('active');expect(ficDeviceState({...active,fic:{...active.fic,lastVerification:{at:'2026-09-08T00:00:00.000Z',result:'error'}}},true)).toBe('connection_error');});
  it('disabilita conservando riferimenti e rimuove il link',()=>{expect(disableFic(active).fic.company?.id).toBe('1');const removed=removeFicLink(active);expect(removed.fic).toEqual({enabled:false});expect(removed.fuelTerritory).toBe('Lazio');});
});
