import { describe, expect, it } from 'vitest';
import { calculateItem, calculateQuote, calculateTravel, calculateVehicleCost, routeValuesRequireOverwriteConfirmation, valuesFromRoute } from '../../src/domain/calculations';
import { meta, type FuelEvidence, type QuoteItem, type Vehicle } from '../../src/domain/model';

const evidence: FuelEvidence = { fuel:'Benzina',mode:'SELF',territory:'Lazio',network:'NON_AUTOSTRADALE',price:'1.900',priceUnit:'EUR/l',referenceDate:'2026-09-07',acquiredAt:'2026-09-08T10:00:00.000Z' };
const vehicle: Vehicle = { ...meta(), name:'Auto',fuel:'Benzina',consumption:'20.00',consumptionUnit:'km/l',annualKm:'10000',annualInsurance:'500',annualTax:'200',annualMaintenance:'300' };

describe('preventivo', () => {
  it('converte il percorso A/R senza arrotondamenti intermedi', () => {
    expect(valuesFromRoute({ distanceMeters:'35025', durationSeconds:'2400' }, true)).toEqual({ ok:true, value:{ distanceKmPerOccurrence:'70.1', travelMinutesPerOccurrence:80 } });
    expect(valuesFromRoute({ distanceMeters:'1250', durationSeconds:'75' }, false)).toEqual({ ok:true, value:{ distanceKmPerOccurrence:'1.3', travelMinutesPerOccurrence:1 } });
  });
  it('calcola costo veicolo e totali usando i valori per occorrenza', () => {
    const cost = calculateVehicleCost(vehicle, evidence); expect(cost).toEqual({ ok:true,value:{fuelCostPerKm:'0.095000',annualCostPerKm:'0.100000',costPerKm:'0.195000'} });
    expect(calculateTravel({distanceKmPerOccurrence:'70.0',travelMinutesPerOccurrence:80,occurrences:2,vehicleCostPerKm:'0.195000'})).toEqual({ok:true,value:{totalDistanceKm:'140.0',totalMinutes:160,totalCost:'27.30'}});
  });
  it('mantiene disponibili i totali di distanza e tempo offline senza inventare il costo',()=>{expect(calculateTravel({distanceKmPerOccurrence:'12.5',travelMinutesPerOccurrence:20,occurrences:3})).toEqual({ok:true,value:{totalDistanceKm:'37.5',totalMinutes:60}});});
  it('tratta distanza e tempo manuali in modo indipendente',()=>{expect(calculateTravel({distanceKmPerOccurrence:'10.0',occurrences:2})).toEqual({ok:true,value:{totalDistanceKm:'20.0'}});expect(calculateTravel({distanceKmPerOccurrence:'0.0',occurrences:2,vehicleCostPerKm:'0.2'})).toEqual({ok:true,value:{totalDistanceKm:'0.0',totalCost:'0.00'}});expect(calculateTravel({travelMinutesPerOccurrence:15,occurrences:2})).toEqual({ok:true,value:{totalMinutes:30}});});
  it('richiede conferma prima di sovrascrivere distanza o tempo esistenti',()=>{expect(routeValuesRequireOverwriteConfirmation('', '')).toBe(false);expect(routeValuesRequireOverwriteConfirmation('10.0', '')).toBe(true);expect(routeValuesRequireOverwriteConfirmation('', 20)).toBe(true);});
  it('blocca una trasferta incompleta invece di inventare valori',()=>{const item:QuoteItem={...meta(),name:'Lavoro',variantGroups:[],variantSelections:[],subItems:[{...meta(),kind:'travel',description:'Viaggio',roundTrip:true,occurrences:1}]};const result=calculateItem(item,'100');expect(result.blockers.join(' ')).toContain('partenza');expect(result.blockers.join(' ')).toContain('costo');});
  it('deriva analisi voce e disavanzo', () => {const item:QuoteItem={...meta(),name:'Lavoro',variantGroups:[],variantSelections:[],chosenPrice:'50.00',subItems:[{...meta(),kind:'time',description:'Tecnica',minutes:60},{...meta(),kind:'expense',description:'Materiale',amount:'70.00'}]};const result=calculateItem(item,'100.00');expect(result.theoreticalValue).toBe('170.00');expect(result.deficit).toBe('20.00');});
  it('non espone totali completi se una voce è incompleta',()=>{const complete:QuoteItem={...meta(),name:'A',variantGroups:[],variantSelections:[],chosenPrice:'100',subItems:[{...meta(),kind:'time',description:'T',minutes:60}]};const incomplete:QuoteItem={...meta(),name:'B',variantGroups:[],variantSelections:[],chosenPrice:'10',subItems:[]};const result=calculateQuote([complete,incomplete],'100');expect(result.blockingItems[0]).toContain('B');expect(result.theoreticalValue).toBeUndefined();});
});
