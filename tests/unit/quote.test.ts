import { describe, expect, it } from 'vitest';
import { calculateItem, calculateQuote, calculateTravel, calculateVehicleCost } from '../../src/domain/calculations';
import { meta, type FuelEvidence, type QuoteItem, type Vehicle } from '../../src/domain/model';

const evidence: FuelEvidence = { fuel:'Benzina',mode:'SELF',territory:'Lazio',network:'NON_AUTOSTRADALE',price:'1.900',priceUnit:'EUR/l',referenceDate:'2026-09-07',acquiredAt:'2026-09-08T10:00:00.000Z' };
const vehicle: Vehicle = { ...meta(), name:'Auto',fuel:'Benzina',consumption:'20.00',consumptionUnit:'km/l',annualKm:'10000',annualInsurance:'500',annualTax:'200',annualMaintenance:'300' };

describe('preventivo', () => {
  it('calcola costo veicolo e trasferta con arrotondamento', () => {
    const cost = calculateVehicleCost(vehicle, evidence); expect(cost).toEqual({ ok:true,value:{fuelCostPerKm:'0.095000',annualCostPerKm:'0.100000',costPerKm:'0.195000'} });
    const travel = calculateTravel({oneWayKm:'35.0',roundTrip:true,occurrences:2,speedKmh:'70',vehicleCostPerKm:'0.195000'});
    expect(travel).toEqual({ok:true,value:{totalDistanceKm:'140.0',totalMinutes:120,totalCost:'27.30'}});
  });

  it('deriva analisi voce e disavanzo senza durata negativa', () => {
    const item:QuoteItem={...meta(),name:'Lavoro',variantGroups:[],variantSelections:[],chosenPrice:'50.00',subItems:[{...meta(),kind:'time',description:'Tecnica',minutes:60},{...meta(),kind:'expense',description:'Materiale',amount:'70.00'}]};
    const result=calculateItem(item,'100.00');expect(result.minutes).toBe(60);expect(result.theoreticalValue).toBe('170.00');expect(result.yieldPerHour).toBe('-20.00');expect(result.deficit).toBe('20.00');expect(result.coherentMinutes).toBeUndefined();
  });

  it('non omette voci incomplete e non espone totali parziali',()=>{const complete:QuoteItem={...meta(),name:'A',variantGroups:[],variantSelections:[],chosenPrice:'100',subItems:[{...meta(),kind:'time',description:'T',minutes:60}]};const incomplete:QuoteItem={...meta(),name:'B',variantGroups:[],variantSelections:[],chosenPrice:'10',subItems:[]};const result=calculateQuote([complete,incomplete],'100');expect(result.blockingItems[0]).toContain('B');expect(result.theoreticalValue).toBeUndefined();expect(result.chosenTotal).toBeUndefined();});
  it('richiede almeno una voce e conserva i totali base se manca solo un prezzo',()=>{expect(calculateQuote([],'100').theoreticalValue).toBeUndefined();const item:QuoteItem={...meta(),name:'A',variantGroups:[],variantSelections:[],subItems:[{...meta(),kind:'time',description:'T',minutes:60}]};const result=calculateQuote([item],'100');expect(result.theoreticalValue).toBe('100.00');expect(result.chosenTotal).toBeUndefined();});
});
