import Decimal from 'decimal.js';
import { err, meta, ok, type ExportAttempt, type ExportLine, type Quote, type Result } from './model';

export function buildExportLines(quote: Quote, groups?: Array<{ itemIds: string[]; description: string }>, companyId?: string): Result<ExportLine[]> {
  if (!quote.client || quote.client.source !== 'fatture_in_cloud') return err({ code: 'MISSING_DATA', field: 'client', message: 'Selezionare esplicitamente un cliente Fatture in Cloud.' });
  if (companyId && quote.client.companyId !== companyId) return err({ code: 'VALIDATION', field: 'client', message: 'Il cliente appartiene a un’altra azienda Fatture in Cloud.' });
  if (quote.items.some(item => item.chosenPrice === undefined)) return err({ code: 'MISSING_DATA', field: 'chosenPrice', message: 'Ogni voce esportata richiede un prezzo scelto.' });
  const byId = new Map(quote.items.map(item => [item.id, item]));
  if (!groups) return ok(quote.items.map(item => ({ itemIds: [item.id], description: item.name, amount: item.chosenPrice!, quantity: 1 })));
  const used = new Set<string>();
  const lines: ExportLine[] = [];
  for (const group of groups) {
    if (!group.description.trim() || group.itemIds.length === 0) return err({ code: 'VALIDATION', field: 'export.groups', message: 'Ogni gruppo richiede descrizione e voci.' });
    let amount = new Decimal(0);
    for (const id of group.itemIds) {
      const item = byId.get(id);
      if (!item || used.has(id)) return err({ code: 'VALIDATION', field: 'export.groups', message: 'Voce mancante o presente in più gruppi.' });
      used.add(id);
      amount = amount.plus(item.chosenPrice!);
    }
    lines.push({ itemIds: [...group.itemIds], description: group.description.trim(), amount: amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2), quantity: 1 });
  }
  if (used.size !== quote.items.length) return err({ code: 'VALIDATION', field: 'export.groups', message: 'Ogni voce deve comparire una volta nell’anteprima.' });
  return ok(lines);
}

export function createPendingAttempt(companyId: string, lines: ExportLine[]): ExportAttempt {
  const payloadHash = sha256Text(JSON.stringify({ companyId, lines }));
  return { ...meta(), companyId, lines: structuredClone(lines), payloadHash, outcome: 'pending' };
}

export function sha256Text(value:string):string {
  const bytes=new TextEncoder().encode(value);const length=Math.ceil((bytes.length+9)/64)*64;const message=new Uint8Array(length);message.set(bytes);message[bytes.length]=0x80;
  const view=new DataView(message.buffer);const bitLength=bytes.length*8;view.setUint32(length-8,Math.floor(bitLength/0x100000000),false);view.setUint32(length-4,bitLength>>>0,false);
  const initial=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const constants=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const hash=[...initial];const words=new Uint32Array(64);const rotr=(word:number,bits:number)=>(word>>>bits)|(word<<(32-bits));
  for(let offset=0;offset<message.length;offset+=64){for(let index=0;index<16;index++)words[index]=view.getUint32(offset+index*4,false);for(let index=16;index<64;index++){const x=words[index-15]!,y=words[index-2]!;const s0=rotr(x,7)^rotr(x,18)^(x>>>3);const s1=rotr(y,17)^rotr(y,19)^(y>>>10);words[index]=(words[index-16]!+s0+words[index-7]!+s1)>>>0;}let[a,b,c,d,e,f,g,h]=hash as [number,number,number,number,number,number,number,number];for(let index=0;index<64;index++){const s1=rotr(e,6)^rotr(e,11)^rotr(e,25);const choice=(e&f)^(~e&g);const temp1=(h+s1+choice+constants[index]!+words[index]!)>>>0;const s0=rotr(a,2)^rotr(a,13)^rotr(a,22);const majority=(a&b)^(a&c)^(b&c);const temp2=(s0+majority)>>>0;h=g;g=f;f=e;e=(d+temp1)>>>0;d=c;c=b;b=a;a=(temp1+temp2)>>>0;}hash[0]=(hash[0]!+a)>>>0;hash[1]=(hash[1]!+b)>>>0;hash[2]=(hash[2]!+c)>>>0;hash[3]=(hash[3]!+d)>>>0;hash[4]=(hash[4]!+e)>>>0;hash[5]=(hash[5]!+f)>>>0;hash[6]=(hash[6]!+g)>>>0;hash[7]=(hash[7]!+h)>>>0;}
  return hash.map(word=>word.toString(16).padStart(8,'0')).join('');
}

export function needsRepeatWarning(quote: Quote): boolean {
  return quote.exportAttempts.some(attempt => attempt.outcome === 'success' || attempt.outcome === 'uncertain' || attempt.outcome === 'pending');
}
