import { describe,expect,it,vi } from 'vitest';
import { refreshQuote, snapshotProfile } from '../../src/domain/refresh';
import { createFiscalPreset2026, meta, type FuelEvidence, type Quote, type Vehicle } from '../../src/domain/model';

describe('snapshot e aggiornamento atomico',()=>{
  const profile=createFiscalPreset2026();Object.assign(profile,{confirmed:true,revenueTarget:'50000.00',specificAnnualExpenses:'1000.00'});
  const vehicle:Vehicle={...meta(),name:'Auto',fuel:'Benzina',consumption:'20',consumptionUnit:'km/l',annualKm:'10000',annualInsurance:'500',annualTax:'200',annualMaintenance:'300'};
  const fuel:FuelEvidence={fuel:'Benzina',mode:'SELF',territory:'Lazio',network:'NON_AUTOSTRADALE',price:'1.900',priceUnit:'EUR/l',referenceDate:'2026-09-07',acquiredAt:'2026-09-08T00:00:00.000Z'};
  const snap=snapshotProfile(profile,[]);if(!snap.ok)throw new Error('snapshot');
  const departure={sourceId:meta().id,name:'Studio',address:'Roma',coordinates:{longitude:'12.4964',latitude:'41.9028'}};
  const destination={sourceId:meta().id,name:'Cliente',address:'Milano',coordinates:{longitude:'9.1900',latitude:'45.4642'}};
  const quote:Quote={...meta(),date:'2026-09-08',profileId:profile.id,profileSnapshot:snap.value,mainSite:destination,snapshotRevision:1,exportAttempts:[],items:[{...meta(),name:'Intervento',variantGroups:[],variantSelections:[],subItems:[{...meta(),kind:'travel',description:'Viaggio',departure,destination,vehicleId:vehicle.id,vehicleName:'Vecchia auto',roundTrip:true,occurrences:1,distanceKmPerOccurrence:'60.0',travelMinutesPerOccurrence:80,distanceSource:'manual',durationSource:'manual',totalMinutes:80,totalDistanceKm:'60.0',vehicleCostPerKm:'0.100000',totalCost:'6.00',fuelEvidence:fuel}]}]};
  it('aggiorna solo fonti economiche e conserva luogo, distanza e tempo',async()=>{const fuelSource=vi.fn(async()=>({ok:true as const,value:fuel}));const result=await refreshQuote(quote,{profileById:()=>profile,costs:[],vehicleById:()=>vehicle,fuel:fuelSource,foi:async()=>{throw new Error('unused')}});expect(result.ok).toBe(true);if(!result.ok)return;const travel=result.value.items[0]!.subItems[0]!;expect(travel.kind==='travel'&&travel.departure).toEqual(departure);expect(travel.kind==='travel'&&travel.distanceKmPerOccurrence).toBe('60.0');expect(travel.kind==='travel'&&travel.travelMinutesPerOccurrence).toBe(80);expect(travel.kind==='travel'&&travel.totalCost).toBe('11.70');expect(fuelSource).toHaveBeenCalledOnce();});
  it('non modifica l’originale se una sorgente manca',async()=>{const before=JSON.stringify(quote);const result=await refreshQuote(quote,{profileById:()=>profile,costs:[],vehicleById:()=>undefined,fuel:async()=>({ok:true,value:fuel}),foi:async()=>{throw new Error('unused')}});expect(result.ok).toBe(false);expect(JSON.stringify(quote)).toBe(before);});
});
