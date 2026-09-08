import { describe,expect,it } from 'vitest';
import { refreshQuote, snapshotProfile } from '../../src/domain/refresh';
import { createFiscalPreset2026, meta, type FuelEvidence, type Quote, type Site, type Vehicle } from '../../src/domain/model';

describe('snapshot e aggiornamento atomico',()=>{
  const profile=createFiscalPreset2026();Object.assign(profile,{confirmed:true,revenueTarget:'50000.00',specificAnnualExpenses:'1000.00'});profile.capacity.travelSpeedKmh='70';
  const site:Site={...meta(),name:'Cliente',address:'Via Roma',oneWayKm:'35.0'};
  const vehicle:Vehicle={...meta(),name:'Auto',fuel:'Benzina',consumption:'5',consumptionUnit:'l/100km',annualKm:'10000',annualInsurance:'500',annualTax:'200',annualMaintenance:'300'};
  const fuel:FuelEvidence={fuel:'Benzina',mode:'SELF',territory:'Lazio',network:'NON_AUTOSTRADALE',price:'1.900',priceUnit:'EUR/l',referenceDate:'2026-09-07',acquiredAt:'2026-09-08T00:00:00.000Z'};
  const snap=snapshotProfile(profile,[]);if(!snap.ok)throw new Error('snapshot');
  const quote:Quote={...meta(),date:'2026-09-08',profileId:profile.id,profileSnapshot:snap.value,mainSite:{sourceId:site.id,name:site.name,address:site.address,oneWayKm:'30.0'},snapshotRevision:1,exportAttempts:[],items:[{...meta(),name:'Intervento',variantGroups:[],variantSelections:[],subItems:[{...meta(),kind:'travel',description:'Viaggio',site:{sourceId:site.id,name:site.name,address:site.address,oneWayKm:'30.0'},vehicleId:vehicle.id,roundTrip:true,occurrences:1,timeMode:'manual',manualMinutesPerOccurrence:80,totalMinutes:80,totalDistanceKm:'60.0',vehicleCostPerKm:'0.100000',totalCost:'6.00',fuelEvidence:fuel}]}]};
  it('aggiorna distanza principale/trasferta e costo ma conserva il tempo manuale',async()=>{const result=await refreshQuote(quote,{profileById:()=>profile,costs:[],siteById:()=>site,vehicleById:()=>vehicle,fuel:async()=>({ok:true,value:fuel}),foi:async()=>{throw new Error('unused')}});expect(result.ok).toBe(true);if(!result.ok)return;const travel=result.value.items[0]!.subItems[0]!;expect(result.value.mainSite?.oneWayKm).toBe('35.0');expect(travel.kind==='travel'&&travel.totalDistanceKm).toBe('70.0');expect(travel.kind==='travel'&&travel.totalMinutes).toBe(80);expect(quote.items[0]!.subItems[0]!.kind==='travel'&&(quote.items[0]!.subItems[0] as any).totalDistanceKm).toBe('60.0');});
  it('non modifica l’originale se una sorgente manca',async()=>{const before=JSON.stringify(quote);const result=await refreshQuote(quote,{profileById:()=>profile,costs:[],siteById:()=>undefined,vehicleById:()=>vehicle,fuel:async()=>({ok:true,value:fuel}),foi:async()=>{throw new Error('unused')}});expect(result.ok).toBe(false);expect(JSON.stringify(quote)).toBe(before);});
});
