import { describe,expect,it } from 'vitest';
import { parseMimitCsv } from '../../src/native/integrations/mimit';
import { parseFoiSdmxCsv,revalueFromSeries } from '../../src/native/integrations/foi';

describe('fonti ufficiali',()=>{
  it('normalizza il CSV regionale MIMIT esatto',()=>{const csv='Aggiornamento 07-09-2026\nREGIONE;TIPOLOGIA;EROGAZIONE;PREZZO MEDIO\nLazio;Benzina;SELF;1.900\n';const result=parseMimitCsv(csv,'Lazio','Benzina','2026-09-08T00:00:00.000Z');expect(result.ok&&result.value.referenceDate).toBe('2026-09-07');expect(result.ok&&result.value.price).toBe('1.900');});
  it('rifiuta combinazioni non disponibili senza fallback',()=>{const csv='Aggiornamento 07-09-2026\nREGIONE;TIPOLOGIA;EROGAZIONE;PREZZO MEDIO\nLazio;Benzina;SELF;1.900\n';const result=parseMimitCsv(csv,'Lazio','GPL');expect(result.ok).toBe(false);});
  it('calcola FOI solo da osservazioni valide e confrontabili',()=>{const parsed=parseFoiSdmxCsv('TIME_PERIOD,OBS_VALUE,BASE_PER\n2024-01,100.0,2015=100\n2026-07,110.0,2015=100');expect(parsed.ok).toBe(true);if(!parsed.ok)return;const result=revalueFromSeries('100.00','2024-01',parsed.value,'2026-09-08T00:00:00.000Z');expect(result.ok&&result.value.revaluedAmount).toBe('110.00');});
});
