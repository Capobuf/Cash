import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { calculateQuote } from '../../src/domain/calculations';
import { createEmptyDocument, meta, type QuoteItem } from '../../src/domain/model';
import { createArchive, saveArchive } from '../../src/native/persistence';

describe('obiettivi prestazionali MVP',()=>{
  it('ricalcola 100 voci in meno di 100 ms',()=>{
    const items:QuoteItem[]=Array.from({length:100},(_,index)=>({...meta(),name:`Voce ${index+1}`,chosenPrice:'150.00',variantGroups:[],variantSelections:[],subItems:[
      {...meta(),kind:'time' as const,description:'Lavoro',minutes:60},
      {...meta(),kind:'expense' as const,description:'Materiale',amount:'25.00'},
    ]}));
    calculateQuote(items,'80.00');
    const started=performance.now();for(let run=0;run<10;run++)calculateQuote(items,'80.00');const elapsed=(performance.now()-started)/10;
    expect(elapsed).toBeLessThan(100);
  });

  it('valida e salva un archivio di almeno 10 MB in meno di un secondo',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'cash-performance-'));const path=join(dir,'Cash.data.json');const document=createEmptyDocument();
    document.localClients.push({...meta(),displayName:`Cliente ${'x'.repeat(10*1024*1024)}`});
    const created=await createArchive(path,document);if(!created.ok)throw new Error(created.error.message);
    expect((await stat(path)).size).toBeGreaterThanOrEqual(10*1024*1024);
    const started=performance.now();const saved=await saveArchive(path,created.value.document!,created.value.token);const elapsed=performance.now()-started;
    expect(saved.ok).toBe(true);expect(elapsed).toBeLessThan(1000);
  },5000);
});
