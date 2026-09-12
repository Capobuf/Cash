import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDocument, meta, ok, type CashDocument } from '../../src/domain/model';
import type { ArchiveSession } from '../../src/native/persistence';
import { AppState } from '../../src/renderer/state';

const session=(document:CashDocument,revision=1):ArchiveSession=>({path:'C:\\Cash.data.json',document,readOnly:false,token:{documentId:document.documentId,revision,fingerprint:`hash-${revision}`}});

describe('coordinatore autosalvataggio',()=>{
  beforeEach(()=>vi.useFakeTimers());
  afterEach(()=>vi.useRealTimers());

  it('non perde una mutazione arrivata mentre un salvataggio è in corso',async()=>{
    let completeFirst!:(value:ReturnType<typeof ok<ArchiveSession>>)=>void;
    const first=new Promise<ReturnType<typeof ok<ArchiveSession>>>(resolve=>{completeFirst=resolve;});
    const save=vi.fn()
      .mockImplementationOnce(async(_path:string,document:CashDocument)=>first.then(()=>ok(session({...structuredClone(document),revision:2},2))))
      .mockImplementationOnce(async(_path:string,document:CashDocument)=>ok(session({...structuredClone(document),revision:3},3)));
    const cash={archive:{save},setDirty:vi.fn()} as unknown as Window['cash'];
    vi.stubGlobal('window',{cash,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,prompt:vi.fn()});
    const appState=new AppState();appState.acceptNativeSession(session(createEmptyDocument()));
    appState.mutate(document=>{document.settings.fuelTerritory='Lazio';});const saving=appState.save();await Promise.resolve();await Promise.resolve();
    appState.mutate(document=>{document.settings.fuelTerritory='Sicilia';});completeFirst(ok(session(createEmptyDocument(),2)));await saving;await vi.runAllTimersAsync();await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(2);expect(appState.document?.settings.fuelTerritory).toBe('Sicilia');expect(appState.session?.token.revision).toBe(3);expect(appState.status).toBe('Salvato');
    vi.unstubAllGlobals();
  });

  it('rifiuta una modifica non valida prima che raggiunga l’autosalvataggio',()=>{
    const save=vi.fn();
    const cash={archive:{save},setDirty:vi.fn()} as unknown as Window['cash'];
    vi.stubGlobal('window',{cash,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,prompt:vi.fn()});
    const appState=new AppState();appState.acceptNativeSession(session(createEmptyDocument()));
    appState.mutate(document=>document.vehicles.push({...meta(),name:'',fuel:'Benzina',consumption:'6.00',consumptionUnit:'l/100km',annualKm:'10000',annualInsurance:'0.00',annualTax:'0.00',annualMaintenance:'0.00'}));
    expect(appState.document?.vehicles).toHaveLength(0);
    expect(appState.error?.code).toBe('VALIDATION');
    expect(appState.error?.details).toContain('Veicoli · 1 · nome: campo obbligatorio');
    expect(save).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
