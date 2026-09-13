import { calculateProfile, calculateTravel, calculateVehicleCost } from './calculations';
import { err, nowIso, ok, type BusinessCost, type EconomicProfile, type FoiEvidence, type FuelEvidence, type Quote, type Result, type Vehicle } from './model';

export interface RefreshSources {
  profileById(id: string): EconomicProfile | undefined;
  costs: BusinessCost[];
  vehicleById(id: string): Vehicle | undefined;
  fuel(vehicle: Vehicle): Promise<Result<FuelEvidence>>;
  foi(amount: string, period: string): Promise<Result<FoiEvidence>>;
}

export function snapshotProfile(profile: EconomicProfile, costs: BusinessCost[]) {
  const analysis = calculateProfile(profile, costs); if (!analysis.ok) return analysis;
  return ok({ sourceId: profile.id, year: profile.year, revision: profile.revision, revenueTarget: analysis.value.revenueTarget,
    specificAnnualExpenses: profile.specificAnnualExpenses, revenueFromTime: analysis.value.revenueFromTime,
    availableClientMinutes: analysis.value.availableClientMinutes, hourlyTarget: analysis.value.hourlyTarget,
    fiscal: structuredClone(profile.fiscal) });
}

export async function refreshQuote(quote: Quote, sources: RefreshSources): Promise<Result<Quote>> {
  const next = structuredClone(quote);
  if (!quote.profileId) return err({ code: 'MISSING_DATA', field: 'profileId', message: 'Il preventivo non ha un profilo associato.' });
  const profile = sources.profileById(quote.profileId); if (!profile) return err({ code: 'MISSING_DATA', field: 'profileId', message: 'Il profilo di origine non esiste più.' });
  const profileSnapshot = snapshotProfile(profile, sources.costs); if (!profileSnapshot.ok) return profileSnapshot;
  next.profileSnapshot = profileSnapshot.value;
  for (const item of next.items) {
    if (item.referencePrice) { const evidence = await sources.foi(item.referencePrice.amount, item.referencePrice.period); if (!evidence.ok) return evidence; item.referencePrice.foiEvidence = evidence.value; }
    for (const sub of item.subItems) {
      if (sub.kind !== 'travel') continue;
      if (!sub.vehicleId) return err({ code: 'MISSING_DATA', field: 'vehicle', message: `Veicolo non selezionato per “${sub.description}”.` });
      const vehicle = sources.vehicleById(sub.vehicleId);
      if (!vehicle) return err({ code: 'MISSING_DATA', field: 'vehicle', message: `Veicolo di origine non trovato per “${sub.description}”.` });
      const fuel = await sources.fuel(vehicle); if (!fuel.ok) return fuel;
      const vehicleCost = calculateVehicleCost(vehicle, fuel.value); if (!vehicleCost.ok) return vehicleCost;
      sub.vehicleName = vehicle.name; sub.vehicleCostPerKm = vehicleCost.value.costPerKm; sub.fuelEvidence = fuel.value;
      if (sub.distanceKmPerOccurrence !== undefined || sub.travelMinutesPerOccurrence !== undefined) {
        const travel = calculateTravel({ distanceKmPerOccurrence: sub.distanceKmPerOccurrence, travelMinutesPerOccurrence: sub.travelMinutesPerOccurrence, occurrences: sub.occurrences, vehicleCostPerKm: vehicleCost.value.costPerKm });
        if (!travel.ok) return travel;
        sub.totalDistanceKm = travel.value.totalDistanceKm; sub.totalMinutes = travel.value.totalMinutes; sub.totalCost = travel.value.totalCost;
      }
    }
  }
  next.snapshotRevision += 1; next.snapshotUpdatedAt = nowIso(); return ok(next);
}
