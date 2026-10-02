import { useState } from 'react';
import { isYearMonth } from '../../domain/calendar';
import {
  calculateTravel,
  calculateVehicleCost,
} from '../../domain/calculations';
import {
  cloneTemplate,
  reusableFromQuoteSubItem,
  templateFromQuote,
} from '../../domain/catalog';
import { buildExportLines, createPendingAttempt } from '../../domain/export';
import { snapshotSite } from '../../domain/locations';
import {
  meta,
  type CashDocument,
  type FicClientSnapshot,
  type Quote,
  type QuoteItem,
  type QuoteSubItem,
  type ReusableSubItem,
  type SubItemDefinition,
} from '../../domain/model';
import { createQuote } from '../../domain/quotes';
import { refreshQuote, snapshotProfile } from '../../domain/refresh';
import { applyVariantSelections, changeVariant } from '../../domain/variants';
import type { AppState } from '../state';
import type { DeleteTarget } from '../types';

export interface TravelInput {
  description: string;
  departureSiteId?: string;
  destinationSiteId?: string;
  vehicleId?: string;
  roundTrip: boolean;
  occurrences: number;
  distanceKmPerOccurrence?: string;
  travelMinutesPerOccurrence?: number;
  distanceSource?: 'route' | 'manual';
  durationSource?: 'route' | 'manual';
}

export type SimpleSubInput =
  | { kind: 'time'; description: string; minutes: number }
  | { kind: 'expense'; description: string; amount: string };

interface TravelContext {
  siteId?: string;
  departureSiteId?: string;
  destinationSiteId?: string;
  vehicleId?: string;
}

export function useQuoteController({
  doc,
  hasToken,
  appState,
  activeQuoteId,
  setActiveQuoteId,
  requestDelete,
}: {
  doc: CashDocument;
  hasToken: boolean;
  appState: AppState;
  activeQuoteId?: string;
  setActiveQuoteId: (id?: string) => void;
  requestDelete: (target: DeleteTarget) => void;
}) {
  const [clientResults, setClientResults] = useState<FicClientSnapshot[]>([]);
  const quote = doc.quotes.find((candidate) => candidate.id === activeQuoteId);
  const archivePath = appState.session?.path;
  const archiveContext = appState.archiveContext;

  const guardQuoteContext = (expectedQuote = quote) => {
    const expected = JSON.stringify(expectedQuote);
    const settings = JSON.stringify(doc.settings);
    return () => {
      const current = appState.document?.quotes.find(
        (entry) => entry.id === expectedQuote?.id,
      );
      if (
        !current ||
        appState.archiveContext !== archiveContext ||
        appState.session?.path !== archivePath ||
        appState.document?.documentId !== doc.documentId ||
        appState.session?.readOnly ||
        appState.status === 'Conflitto esterno' ||
        JSON.stringify(current) !== expected ||
        JSON.stringify(appState.document.settings) !== settings
      ) {
        appState.setError({
          code: 'CONFLICT',
          message:
            'Archivio, preventivo o impostazioni cambiati durante l’operazione. Verifica i dati prima di ripetere l’azione.',
        });
        return false;
      }
      return true;
    };
  };

  const materializeTravel = async (
    definition: Extract<SubItemDefinition, { kind: 'travel' }> | TravelInput,
    targetQuote: Quote,
    context?: TravelContext,
    previous?: Extract<QuoteSubItem, { kind: 'travel' }>,
  ): Promise<QuoteSubItem | undefined> => {
    const direct = 'departureSiteId' in definition ? definition : undefined;
    const departureId =
      direct?.departureSiteId ||
      context?.departureSiteId ||
      doc.settings.defaultDepartureSiteId;
    const destinationId =
      direct?.destinationSiteId ||
      context?.destinationSiteId ||
      context?.siteId ||
      targetQuote.mainSite?.sourceId;
    const vehicleId =
      direct?.vehicleId || context?.vehicleId || doc.settings.defaultVehicleId;
    const departure = doc.sites.find((entry) => entry.id === departureId);
    const destination = doc.sites.find((entry) => entry.id === destinationId);
    const vehicle = doc.vehicles.find((entry) => entry.id === vehicleId);
    if (direct?.destinationSiteId && !destination) {
      appState.setError({
        code: 'MISSING_DATA',
        field: 'destination',
        message: 'La Sede di destinazione selezionata non esiste più.',
      });
      return undefined;
    }
    const distance = definition.distanceKmPerOccurrence;
    const minutes = definition.travelMinutesPerOccurrence;
    const travel: Extract<QuoteSubItem, { kind: 'travel' }> = {
      ...meta(),
      kind: 'travel',
      description: definition.description.trim(),
      ...(departure ? { departure: snapshotSite(departure) } : {}),
      ...(destination ? { destination: snapshotSite(destination) } : {}),
      ...(vehicle ? { vehicleId: vehicle.id, vehicleName: vehicle.name } : {}),
      roundTrip: definition.roundTrip,
      occurrences: definition.occurrences,
      ...(distance !== undefined
        ? {
            distanceKmPerOccurrence: distance,
            distanceSource: direct?.distanceSource ?? ('manual' as const),
          }
        : {}),
      ...(minutes !== undefined
        ? {
            travelMinutesPerOccurrence: minutes,
            durationSource: direct?.durationSource ?? ('manual' as const),
          }
        : {}),
    };
    if (distance === undefined && minutes === undefined) return travel;
    const totals = calculateTravel({
      distanceKmPerOccurrence: distance,
      travelMinutesPerOccurrence: minutes,
      occurrences: definition.occurrences,
    });
    if (!totals.ok) {
      appState.setError(totals.error);
      return undefined;
    }
    const withTotals = { ...travel, ...totals.value };
    if (!vehicle || distance === undefined) return withTotals;
    if (
      previous?.vehicleId === vehicle.id &&
      previous.vehicleCostPerKm &&
      previous.fuelEvidence
    ) {
      const calculated = calculateTravel({
        distanceKmPerOccurrence: distance,
        travelMinutesPerOccurrence: minutes,
        occurrences: definition.occurrences,
        vehicleCostPerKm: previous.vehicleCostPerKm,
      });
      if (calculated.ok)
        return {
          ...withTotals,
          ...calculated.value,
          vehicleCostPerKm: previous.vehicleCostPerKm,
          fuelEvidence: previous.fuelEvidence,
        };
    }
    if (!doc.settings.fuelTerritory) return withTotals;
    const fuel = await window.cash.mimit.latestFuelPrice({
      territory: doc.settings.fuelTerritory,
      fuel: vehicle.fuel,
    });
    if (!fuel.ok) {
      appState.setError(fuel.error);
      return withTotals;
    }
    const vehicleCost = calculateVehicleCost(vehicle, fuel.value);
    if (!vehicleCost.ok) {
      appState.setError(vehicleCost.error);
      return withTotals;
    }
    const calculated = calculateTravel({
      distanceKmPerOccurrence: distance,
      travelMinutesPerOccurrence: minutes,
      occurrences: definition.occurrences,
      vehicleCostPerKm: vehicleCost.value.costPerKm,
    });
    if (!calculated.ok) {
      appState.setError(calculated.error);
      return withTotals;
    }
    return {
      ...withTotals,
      ...calculated.value,
      vehicleCostPerKm: vehicleCost.value.costPerKm,
      fuelEvidence: fuel.value,
    };
  };

  const newQuote = () => {
    const created = createQuote(doc);
    if (!appState.mutate((document) => document.quotes.push(created)))
      return false;
    setActiveQuoteId(created.id);
    return true;
  };

  const updateQuote = (
    updates: {
      date?: string;
      profileId?: string;
      mainSiteId?: string;
      commission?: string;
    },
    allowYearMismatch = false,
  ): 'updated' | 'year-mismatch' | 'invalid' => {
    if (!quote) return 'invalid';
    const date = updates.date ?? quote.date;
    const profileId =
      updates.profileId === undefined
        ? quote.profileId
        : updates.profileId || undefined;
    const profile = doc.profiles.find((entry) => entry.id === profileId);
    if (
      profile &&
      profile.year !== Number(date.slice(0, 4)) &&
      !allowYearMismatch
    )
      return 'year-mismatch';
    const snapshot = profile
      ? snapshotProfile(profile, doc.businessCosts)
      : undefined;
    if (profile && !snapshot?.ok) {
      appState.setError(
        snapshot?.error ?? {
          code: 'MISSING_DATA',
          message: 'Il profilo selezionato non è calcolabile.',
        },
      );
      return 'invalid';
    }
    const siteId =
      updates.mainSiteId === undefined
        ? quote.mainSite?.sourceId
        : updates.mainSiteId || undefined;
    const site = doc.sites.find((entry) => entry.id === siteId);
    const updated = appState.mutate((document) => {
      const target = document.quotes.find((entry) => entry.id === quote.id)!;
      target.date = date;
      target.profileId = profile?.id;
      target.profileSnapshot = snapshot?.ok ? snapshot.value : undefined;
      target.mainSite = site ? snapshotSite(site) : undefined;
      if (updates.commission !== undefined)
        target.commission = updates.commission
          ? Number(updates.commission).toFixed(2)
          : undefined;
    });
    return updated ? 'updated' : 'invalid';
  };

  const searchRemoteClients = async (query: string) => {
    if (!hasToken) {
      appState.setError({
        code: 'CREDENTIALS',
        source: 'FattureInCloud',
        message:
          'Richiede configurazione locale: collega questa postazione nelle Impostazioni.',
      });
      return;
    }
    const isCurrent = guardQuoteContext();
    if (!isCurrent()) return;
    const companyId = doc.settings.fic.company?.id;
    if (!doc.settings.fic.enabled || !companyId) {
      appState.setError({
        code: 'MISSING_DATA',
        source: 'FattureInCloud',
        message: 'Fatture in Cloud non è attivo.',
        action:
          'Completa la configurazione nelle Impostazioni per recuperare i clienti.',
      });
      return;
    }
    const result = await window.cash.fic.searchClients({ companyId, query });
    if (!isCurrent()) return;
    if (!result.ok) {
      appState.setError(result.error);
      return;
    }
    setClientResults(result.value);
  };

  const addItem = (name: string) => {
    if (!quote || !name.trim()) return false;
    return appState.mutate((document) =>
      document.quotes
        .find((entry) => entry.id === quote.id)!
        .items.push({
          ...meta(),
          name: name.trim(),
          subItems: [],
          variantGroups: [],
          variantSelections: [],
        }),
    );
  };

  const renameItem = (itemId: string, name: string) => {
    if (!quote || !name.trim()) return false;
    return appState.mutate((document) => {
      const item = document.quotes
        .find((entry) => entry.id === quote.id)!
        .items.find((entry) => entry.id === itemId)!;
      item.name = name.trim();
      item.updatedAt = new Date().toISOString();
    });
  };

  const updateChosenPrice = (itemId: string, chosenPrice: string) => {
    if (!quote) return false;
    const value = chosenPrice.trim();
    if (value && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      appState.setError({
        code: 'VALIDATION',
        field: 'chosenPrice',
        message: 'Il Prezzo scelto deve essere un importo non negativo.',
      });
      return false;
    }
    return appState.mutate((document) => {
      const item = document.quotes
        .find((entry) => entry.id === quote.id)!
        .items.find((entry) => entry.id === itemId)!;
      item.chosenPrice = value ? Number(value).toFixed(2) : undefined;
    });
  };

  const updateReferencePrice = (
    itemId: string,
    referenceAmount?: string,
    referencePeriod?: string,
  ) => {
    if (!quote) return false;
    if (!referenceAmount && !referencePeriod) {
      return appState.mutate((document) => {
        delete document.quotes
          .find((entry) => entry.id === quote.id)!
          .items.find((entry) => entry.id === itemId)!.referencePrice;
      });
    }
    if (
      !referenceAmount ||
      !referencePeriod ||
      !Number.isFinite(Number(referenceAmount)) ||
      Number(referenceAmount) < 0 ||
      !isYearMonth(referencePeriod)
    ) {
      appState.setError({
        code: 'VALIDATION',
        field: 'referencePrice',
        message:
          'Completa importo e mese/anno del Prezzo di riferimento, oppure rimuovilo.',
      });
      return false;
    }
    const normalizedAmount = Number(referenceAmount).toFixed(2);
    return appState.mutate((document) => {
      const item = document.quotes
        .find((entry) => entry.id === quote.id)!
        .items.find((entry) => entry.id === itemId)!;
      if (
        item.referencePrice?.amount === normalizedAmount &&
        item.referencePrice.period === referencePeriod
      )
        return;
      item.referencePrice = {
        amount: normalizedAmount,
        period: referencePeriod,
      };
    });
  };

  const saveSimpleSub = (
    itemId: string,
    input: SimpleSubInput,
    subId?: string,
  ) => {
    if (!quote || !input.description.trim()) return false;
    if (
      input.kind === 'time' &&
      (!Number.isFinite(input.minutes) || input.minutes <= 0)
    ) {
      appState.setError({
        code: 'VALIDATION',
        field: 'minutes',
        message: 'La durata deve essere maggiore di zero.',
      });
      return false;
    }
    if (
      input.kind === 'expense' &&
      (!Number.isFinite(Number(input.amount)) || Number(input.amount) < 0)
    ) {
      appState.setError({
        code: 'VALIDATION',
        field: 'amount',
        message: 'L’importo della spesa non è valido.',
      });
      return false;
    }
    return appState.mutate((document) => {
      const item = document.quotes
        .find((entry) => entry.id === quote.id)!
        .items.find((entry) => entry.id === itemId)!;
      const existing = item.subItems.find((entry) => entry.id === subId);
      if (existing && input.kind === 'time' && existing.kind === 'time') {
        existing.description = input.description.trim();
        existing.minutes = input.minutes;
        if (existing.variantOwner) existing.manuallyModified = true;
        existing.updatedAt = new Date().toISOString();
      } else if (
        existing &&
        input.kind === 'expense' &&
        existing.kind === 'expense'
      ) {
        existing.description = input.description.trim();
        existing.amount = Number(input.amount).toFixed(2);
        if (existing.variantOwner) existing.manuallyModified = true;
        existing.updatedAt = new Date().toISOString();
      } else
        item.subItems.push(
          input.kind === 'time'
            ? {
                ...meta(),
                kind: 'time',
                description: input.description.trim(),
                minutes: input.minutes,
              }
            : {
                ...meta(),
                kind: 'expense',
                description: input.description.trim(),
                amount: Number(input.amount).toFixed(2),
              },
        );
    });
  };

  const saveTravel = async (
    itemId: string,
    input: TravelInput,
    subId?: string,
  ) => {
    if (!quote) return false;
    const isCurrent = guardQuoteContext();
    if (!isCurrent()) return false;
    const previous = quote.items
      .find((entry) => entry.id === itemId)
      ?.subItems.find((entry) => entry.id === subId);
    const built = await materializeTravel(
      input,
      quote,
      undefined,
      previous?.kind === 'travel' ? previous : undefined,
    );
    if (!isCurrent()) return false;
    if (!built) return false;
    return appState.mutate((document) => {
      const item = document.quotes
        .find((entry) => entry.id === quote.id)!
        .items.find((entry) => entry.id === itemId)!;
      const index = item.subItems.findIndex((entry) => entry.id === subId);
      if (index >= 0) {
        const previous = item.subItems[index]!;
        item.subItems[index] = {
          ...built,
          id: previous.id,
          createdAt: previous.createdAt,
          updatedAt: new Date().toISOString(),
          ...(previous.variantOwner
            ? { variantOwner: previous.variantOwner, manuallyModified: true }
            : {}),
        };
      } else item.subItems.push(built);
    });
  };

  const addReusable = async (
    itemId: string,
    reusable: ReusableSubItem,
    context?: TravelContext,
  ) => {
    if (!quote) return false;
    const isCurrent = guardQuoteContext();
    if (!isCurrent()) return false;
    let sub: QuoteSubItem | undefined;
    if (reusable.kind === 'time')
      sub = {
        ...meta(),
        kind: 'time',
        description: reusable.description,
        minutes: reusable.minutes,
      };
    else if (reusable.kind === 'expense')
      sub = {
        ...meta(),
        kind: 'expense',
        description: reusable.description,
        amount: reusable.amount,
      };
    else sub = await materializeTravel(reusable, quote, context);
    if (!isCurrent()) return false;
    if (!sub) return false;
    return appState.mutate((document) =>
      document.quotes
        .find((entry) => entry.id === quote.id)!
        .items.find((entry) => entry.id === itemId)!
        .subItems.push(sub!),
    );
  };

  const saveSubToCatalog = (itemId: string, subId: string) => {
    const sub = quote?.items
      .find((item) => item.id === itemId)
      ?.subItems.find((entry) => entry.id === subId);
    return sub
      ? appState.mutate((document) =>
          document.catalog.subItems.push(reusableFromQuoteSubItem(sub)),
        )
      : false;
  };

  const switchVariant = async (
    itemId: string,
    groupId: string,
    optionId: string,
    context: TravelContext,
    force: boolean,
  ) => {
    if (!quote) return false;
    const isCurrent = guardQuoteContext();
    if (!isCurrent()) return false;
    const item = quote.items.find((entry) => entry.id === itemId);
    const option = item?.variantGroups
      .find((entry) => entry.id === groupId)
      ?.options.find((entry) => entry.id === optionId);
    if (!item || !option) return false;
    const queue: QuoteSubItem[] = [];
    for (const definition of option.subItems)
      if (definition.kind === 'travel') {
        const travel = await materializeTravel(definition, quote, context);
        if (!isCurrent() || !travel) return false;
        queue.push(travel);
      }
    const result = changeVariant(item, groupId, optionId, force, {
      materializeTravel: () => {
        const travel = queue.shift();
        return travel
          ? { ok: true, value: travel }
          : {
              ok: false,
              error: {
                code: 'MISSING_DATA',
                message: 'Dati della trasferta non disponibili.',
              },
            };
      },
    });
    if (!result.ok) {
      appState.setError(result.error);
      return false;
    }
    return appState.mutate((document) =>
      Object.assign(
        document.quotes
          .find((entry) => entry.id === quote.id)!
          .items.find((entry) => entry.id === itemId)!,
        result.value,
      ),
    );
  };

  const insertTemplate = async (
    templateId: string,
    choices: Record<string, string>,
    context: TravelContext,
  ) => {
    if (!quote) return false;
    const isCurrent = guardQuoteContext();
    if (!isCurrent()) return false;
    const sourceTemplate = doc.catalog.templates.find(
      (entry) => entry.id === templateId,
    );
    if (!sourceTemplate) return false;
    // The dialog returns IDs from the catalog template. Cloning deliberately
    // regenerates every group/option ID, so preserve the user's choices by
    // position and resolve them against the cloned identities below.
    const selectedOptionIndexes = sourceTemplate.items.map((item) =>
      item.variantGroups.map((group) => {
        const selectedId = choices[group.id] || group.defaultOptionId;
        return group.options.findIndex((option) => option.id === selectedId);
      }),
    );
    const template = cloneTemplate(sourceTemplate);
    const prepared: QuoteItem[] = [];
    for (const [itemIndex, source] of template.items.entries()) {
      const item: QuoteItem = {
        ...meta(),
        name: source.name,
        subItems: [],
        variantGroups: source.variantGroups,
        variantSelections: [],
        ...(source.referencePrice
          ? { referencePrice: { ...source.referencePrice } }
          : {}),
      };
      for (const reusable of source.subItems) {
        if (reusable.kind === 'time')
          item.subItems.push({
            ...meta(),
            kind: 'time',
            description: reusable.description,
            minutes: reusable.minutes,
          });
        else if (reusable.kind === 'expense')
          item.subItems.push({
            ...meta(),
            kind: 'expense',
            description: reusable.description,
            amount: reusable.amount,
          });
        else {
          const travel = await materializeTravel(reusable, quote, context);
          if (!isCurrent() || !travel) return false;
          item.subItems.push(travel);
        }
      }
      const resolved: Record<string, string> = {};
      const queue: QuoteSubItem[] = [];
      for (const [groupIndex, group] of item.variantGroups.entries()) {
        const optionIndex =
          selectedOptionIndexes[itemIndex]?.[groupIndex] ?? -1;
        const option =
          optionIndex >= 0 ? group.options[optionIndex] : undefined;
        if (!option) {
          appState.setError({
            code: 'MISSING_DATA',
            message: `Scegli un’opzione per ${group.name}.`,
          });
          return false;
        }
        resolved[group.id] = option.id;
        for (const definition of option.subItems)
          if (definition.kind === 'travel') {
            const travel = await materializeTravel(definition, quote, context);
            if (!isCurrent() || !travel) return false;
            queue.push(travel);
          }
      }
      const applied = applyVariantSelections(item, resolved, {
        materializeTravel: () => {
          const travel = queue.shift();
          return travel
            ? { ok: true, value: travel }
            : {
                ok: false,
                error: {
                  code: 'MISSING_DATA',
                  message: 'Dati della trasferta non disponibili.',
                },
              };
        },
      });
      if (!applied.ok) {
        appState.setError(applied.error);
        return false;
      }
      prepared.push(applied.value);
    }
    return appState.mutate((document) =>
      document.quotes
        .find((entry) => entry.id === quote.id)!
        .items.push(...prepared),
    );
  };

  const saveTemplate = (name: string, itemIds: string[]) => {
    if (!quote) return false;
    const items = quote.items.filter((item) => itemIds.includes(item.id));
    const built = templateFromQuote(name, items);
    if (!built.ok) {
      appState.setError(built.error);
      return false;
    }
    return appState.mutate((document) =>
      document.catalog.templates.push(built.value),
    );
  };

  const performRefresh = async () => {
    if (!quote) return false;
    const isCurrent = guardQuoteContext();
    if (!isCurrent()) return false;
    const result = await refreshQuote(quote, {
      profileById: (id) => doc.profiles.find((entry) => entry.id === id),
      costs: doc.businessCosts,
      vehicleById: (id) => doc.vehicles.find((entry) => entry.id === id),
      fuel: (vehicle) =>
        doc.settings.fuelTerritory
          ? window.cash.mimit.latestFuelPrice({
              territory: doc.settings.fuelTerritory,
              fuel: vehicle.fuel,
            })
          : Promise.resolve({
              ok: false,
              error: {
                code: 'MISSING_DATA',
                field: 'fuelTerritory',
                message: 'Regione MIMIT non configurata.',
              },
            }),
      foi: (amount, period) =>
        window.cash.istat.revalue({ amount, fromPeriod: period }),
    });
    if (!isCurrent()) return false;
    if (!result.ok) {
      appState.setError(result.error);
      return false;
    }
    return appState.mutate((document) => {
      document.quotes[
        document.quotes.findIndex((entry) => entry.id === quote.id)
      ] = result.value;
    });
  };

  const performExport = async (
    client: FicClientSnapshot,
    groups: Array<{ itemIds: string[]; description: string }>,
  ) => {
    if (!hasToken) {
      appState.setError({
        code: 'CREDENTIALS',
        source: 'FattureInCloud',
        message:
          'Richiede configurazione locale: collega questa postazione nelle Impostazioni.',
      });
      return false;
    }
    if (!quote) return false;
    let isCurrent = guardQuoteContext();
    if (!isCurrent()) return false;
    const fic = doc.settings.fic;
    if (!fic.enabled || !fic.company || !fic.product) {
      appState.setError({
        code: 'MISSING_DATA',
        source: 'FattureInCloud',
        message: 'Fatture in Cloud non è configurato.',
        action: 'Completa la procedura guidata nelle Impostazioni.',
      });
      return false;
    }
    const product = await window.cash.fic.verifyProduct({
      companyId: fic.company.id,
      productId: fic.product.id,
    });
    if (!isCurrent()) return false;
    if (!product.ok) {
      appState.setError(product.error);
      return false;
    }
    const exportSnapshot = { ...quote, client };
    const built = buildExportLines(exportSnapshot, groups, fic.company.id);
    if (!built.ok) {
      appState.setError(built.error);
      return false;
    }
    if (
      quote.client?.source !== 'fatture_in_cloud' ||
      quote.client.clientId !== client.clientId
    ) {
      if (
        !appState.mutate((document) => {
          document.quotes.find((entry) => entry.id === quote.id)!.client =
            client;
        })
      )
        return false;
      isCurrent = guardQuoteContext(
        appState.document?.quotes.find((entry) => entry.id === quote.id),
      );
      await appState.save();
      if (!isCurrent() || appState.status !== 'Salvato') return false;
    }
    const attempt = createPendingAttempt(fic.company.id, built.value);
    if (
      !appState.mutate((document) =>
        document.quotes
          .find((entry) => entry.id === quote.id)!
          .exportAttempts.push(attempt),
      )
    )
      return false;
    isCurrent = guardQuoteContext(
      appState.document?.quotes.find((entry) => entry.id === quote.id),
    );
    await appState.save();
    if (!isCurrent() || appState.status !== 'Salvato') return false;
    let sent: Awaited<ReturnType<typeof window.cash.fic.exportQuote>>;
    try {
      sent = await window.cash.fic.exportQuote({
        companyId: fic.company.id,
        clientId: client.clientId,
        productId: fic.product.id,
        lines: built.value,
        attemptId: attempt.id,
      });
    } catch (cause) {
      sent = {
        ok: false,
        error: {
          code: 'EXPORT_UNCERTAIN',
          source: 'FattureInCloud',
          message: 'Risposta all’invio non disponibile.',
          details: [String(cause)],
        },
      };
    }
    const reportUnpersistedOutcome = () => {
      const rejected = sent.ok && sent.value.outcome === 'rejected';
      const persistenceError = appState.error;
      const sameArchive =
        appState.archiveContext === archiveContext &&
        appState.session?.path === archivePath &&
        appState.document?.documentId === doc.documentId;
      const retained =
        !rejected &&
        sameArchive &&
        appState.markExportForVerification(quote.id, attempt.id);
      appState.setError({
        code: rejected ? 'IO' : 'EXPORT_UNCERTAIN',
        source: 'FattureInCloud',
        message: rejected
          ? 'Invio rifiutato da Fatture in Cloud, ma esito non salvato localmente.'
          : 'Esito esportazione da verificare: il documento remoto potrebbe essere stato creato, ma l’esito non è stato salvato localmente.',
        action:
          'Controlla Fatture in Cloud prima di avviare una nuova esportazione. Non è stato eseguito alcun reinvio automatico.',
        details: [
          `Tentativo: ${attempt.id}`,
          ...(sent.ok && sent.value.remoteDocumentId
            ? [`Documento FIC: ${sent.value.remoteDocumentId}`]
            : []),
          ...(sent.ok && sent.value.diagnostic ? [sent.value.diagnostic] : []),
          ...(!sent.ok
            ? [sent.error.message, ...(sent.error.details ?? [])]
            : []),
          ...(persistenceError
            ? [persistenceError.message, ...(persistenceError.details ?? [])]
            : []),
          ...(!retained && !rejected
            ? [
                'Il tentativo non è stato modificato nell’archivio corrente; verifica l’archivio di origine.',
              ]
            : []),
        ],
      });
      return false;
    };
    if (!isCurrent()) return reportUnpersistedOutcome();
    const recorded = appState.mutate((document) => {
      const saved = document.quotes
        .find((entry) => entry.id === quote.id)!
        .exportAttempts.find((entry) => entry.id === attempt.id)!;
      saved.updatedAt = new Date().toISOString();
      if (sent.ok) {
        saved.outcome = sent.value.outcome;
        saved.remoteDocumentId = sent.value.remoteDocumentId;
        saved.diagnostic = sent.value.diagnostic;
      } else {
        saved.outcome = 'uncertain';
        saved.diagnostic = sent.error.message;
      }
    });
    if (!recorded) return reportUnpersistedOutcome();
    isCurrent = guardQuoteContext(
      appState.document?.quotes.find((entry) => entry.id === quote.id),
    );
    try {
      await appState.save();
    } catch (cause) {
      appState.setError({
        code: 'IO',
        source: 'archive',
        message: 'Salvataggio dell’esito export interrotto.',
        details: [String(cause)],
      });
      return reportUnpersistedOutcome();
    }
    if (appState.status !== 'Salvato' || !isCurrent())
      return reportUnpersistedOutcome();
    if (!sent.ok || sent.value.outcome === 'uncertain') {
      appState.setError({
        code: 'EXPORT_UNCERTAIN',
        source: 'FattureInCloud',
        message:
          'Esito esportazione da verificare: il documento remoto potrebbe essere stato creato.',
        action: 'Controlla Fatture in Cloud prima di inviare nuovamente.',
        details: [
          sent.ok
            ? (sent.value.diagnostic ?? 'Risposta remota incerta.')
            : sent.error.message,
        ],
      });
    } else if (sent.value.outcome === 'rejected') {
      appState.setError({
        code: 'VALIDATION',
        source: 'FattureInCloud',
        message: 'Fatture in Cloud ha rifiutato l’invio.',
        details: sent.value.diagnostic ? [sent.value.diagnostic] : [],
      });
    }
    return sent.ok && sent.value.outcome === 'success';
  };

  return {
    quote,
    clientResults,
    newQuote,
    updateQuote,
    searchRemoteClients,
    setClientResults,
    addItem,
    renameItem,
    updateChosenPrice,
    updateReferencePrice,
    saveSimpleSub,
    saveTravel,
    addReusable,
    saveSubToCatalog,
    switchVariant,
    insertTemplate,
    saveTemplate,
    performRefresh,
    performExport,
    requestDelete,
  };
}
