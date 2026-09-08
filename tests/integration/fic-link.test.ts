import { describe, expect, it, vi } from 'vitest';
import { createEmptyDocument, err, ok, type CashDocument } from '../../src/domain/model';
import { commitFicActivation, removeFicLinkAtomically, type FicLinkServices } from '../../src/native/fic-link';
import type { ArchiveSession, ConcurrencyToken } from '../../src/native/persistence';

const token:ConcurrencyToken={documentId:'6dadb063-1796-429d-9a8a-ad9a0ec9827b',revision:1,fingerprint:'hash'};
const input=(document:CashDocument)=>({token:'nuovo',companyId:'1',productId:'2',path:'Cash.data.json',document,concurrencyToken:token});
const session=(document:CashDocument):ArchiveSession=>({path:'Cash.data.json',document,readOnly:false,token:{...token,revision:2,fingerprint:'hash-2'}});

function services(overrides:Partial<FicLinkServices>={}):FicLinkServices{
  return {verify:vi.fn(async()=>ok({company:{id:'1',name:'Studio'},product:{id:'2',name:'Consulenza'}})),hasToken:vi.fn(async()=>ok(true)),readToken:vi.fn(async()=>ok('precedente')),writeToken:vi.fn(async()=>ok(undefined)),deleteToken:vi.fn(async()=>ok(undefined)),save:vi.fn(async(_path,document)=>ok(session(document))),...overrides};
}

describe('collegamento Fatture in Cloud atomico',()=>{
  it('non cambia credenziali o archivio quando la verifica fallisce o viene annullata prima della conferma',async()=>{const api=services({verify:vi.fn(async()=>err({code:'CREDENTIALS',message:'Token non valido'}))});const result=await commitFicActivation(input(createEmptyDocument()),api);expect(result.ok).toBe(false);expect(api.writeToken).not.toHaveBeenCalled();expect(api.save).not.toHaveBeenCalled();});
  it('attiva soltanto dopo verifica e salva insieme azienda e prodotto',async()=>{const api=services();const result=await commitFicActivation(input(createEmptyDocument()),api);expect(result.ok).toBe(true);expect(api.writeToken).toHaveBeenCalledWith('nuovo');const saved=vi.mocked(api.save).mock.calls[0]?.[1];expect(saved?.settings.fic.enabled).toBe(true);expect(saved?.settings.fic.company?.id).toBe('1');expect(saved?.settings.fic.product?.name).toBe('Consulenza');});
  it('ripristina il token precedente se il salvataggio di attivazione fallisce',async()=>{const api=services({save:vi.fn(async()=>err({code:'CONFLICT',message:'Conflitto'}))});expect((await commitFicActivation(input(createEmptyDocument()),api)).ok).toBe(false);expect(api.writeToken).toHaveBeenNthCalledWith(1,'nuovo');expect(api.writeToken).toHaveBeenNthCalledWith(2,'precedente');});
  it('rimuove configurazione e token insieme e ripristina il token se il file non viene salvato',async()=>{const document=createEmptyDocument();document.settings.fic={enabled:true,company:{id:'1',name:'Studio'},product:{id:'2',name:'Consulenza'}};const failing=services({save:vi.fn(async()=>err({code:'IO',message:'Disco non disponibile'}))});expect((await removeFicLinkAtomically(input(document),failing)).ok).toBe(false);expect(failing.writeToken).toHaveBeenCalledWith('precedente');const successful=services();const result=await removeFicLinkAtomically(input(document),successful);expect(result.ok).toBe(true);const saved=vi.mocked(successful.save).mock.calls[0]?.[1];expect(saved?.settings.fic).toEqual({enabled:false});});
});
