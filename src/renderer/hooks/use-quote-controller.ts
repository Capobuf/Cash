import { useFicClients } from './use-fic-clients';
import { isYearMonth } from '../../domain/calendar';
import { parseDecimalInput } from '../../domain/decimal';
import {
  calculateTravel,
  calculateVehicleCost,
} from '../../domain/calculations';
import {
  cloneTemplate,
  canReuseQuoteSubItem,
  reusableFromQuoteSubItem,
  templateFromQuote,
} from '../../domain/catalog';
import { buildExportLines, createPendingAttempt } from '../../domain/export';
import { siteMatchesClient, snapshotSite } from '../../domain/locations';
import {
  meta,
  touch,
  type CashDocument,
  type FicClientSnapshot,
  type Quote,
  type QuoteItem,
  type QuoteSubItem,
  type ReusableSubItem,
  type SubItemDefinition,
} from '../../domain/model';
import { addQuote } from '../../domain/quotes';
import {
  orderedQuoteItems,
  quoteLayout,
  removeQuoteContainer,
} from '../../domain/quote-layout';
import type { QuoteLayoutEntry } from '../../domain/model';
import { refreshQuote, snapshotProfile } from '../../domain/refresh';
import { applyVariantSelections, changeVariant } from '../../domain/variants';
import type { AppState } from '../state';
import type { DeleteTarget } from '../types';
import { decimalInputValue } from '../lib/format';
import { canInsertAt, insertQuoteItems } from '../lib/quote-insertion';

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
  | { kind: 'time'; description: string; minutes?: number }
  | { kind: 'expense'; description: string; amount?: string };

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
  const quote = doc.quotes.find((candidate) => candidate.id === activeQuoteId);
  const archivePath = appState.session?.path;
  const archiveContext = appState.archiveContext;

  const guardQuoteContext = (
    expectedQuote = quote,
    requireUnchanged = true,
  ) => {
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
        (requireUnchanged &&
          (JSON.stringify(current) !== expected ||
            JSON.stringify(appState.document.settings) !== settings))
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
    if (!doc.settings.fuelTerritory) {
      appState.setError({
        code: 'MISSING_DATA',
        field: 'fuelTerritory',
        message:
          'Configura la regione o provincia autonoma MIMIT nelle Impostazioni per calcolare il costo della trasferta.',
      });
      return undefined;
    }
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
      if (!calculated.ok) {
        appState.setError(calculated.error);
        return undefined;
      }
      return {
        ...withTotals,
        ...calculated.value,
        vehicleCostPerKm: previous.vehicleCostPerKm,
        fuelEvidence: previous.fuelEvidence,
      };
    }
    const fuel = await window.cash.mimit.latestFuelPrice({
      territory: doc.settings.fuelTerritory,
      fuel: vehicle.fuel,
    });
    if (!fuel.ok) {
      appState.setError(fuel.error);
      return undefined;
    }
    const vehicleCost = calculateVehicleCost(vehicle, fuel.value);
    if (!vehicleCost.ok) {
      appState.setError(vehicleCost.error);
      return undefined;
    }
    const calculated = calculateTravel({
      distanceKmPerOccurrence: distance,
      travelMinutesPerOccurrence: minutes,
      occurrences: definition.occurrences,
      vehicleCostPerKm: vehicleCost.value.costPerKm,
    });
    if (!calculated.ok) {
      appState.setError(calculated.error);
      return undefined;
    }
    return {
      ...withTotals,
      ...calculated.value,
      vehicleCostPerKm: vehicleCost.value.costPerKm,
      fuelEvidence: fuel.value,
    };
  };

  const newQuote = () => {
    let createdId: string | undefined;
    if (
      !appState.mutate((document) => {
        createdId = addQuote(document).id;
      })
    )
      return false;
    setActiveQuoteId(createdId);
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
    const commission = updates.commission?.trim()
      ? parseDecimalInput(decimalInputValue(updates.commission), 2)
      : undefined;
    if (commission && !commission.ok) {
      appState.setError({ ...commission.error, field: 'commission' });
      return 'invalid';
    }
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
    if (siteId && (!site || !siteMatchesClient(site, quote.client))) {
      appState.setError({
        code: 'VALIDATION',
        field: 'mainSiteId',
        message:
          'Scegli una Sede del Cliente del preventivo oppure una Sede senza Cliente.',
      });
      return 'invalid';
    }
    const updated = appState.mutate((document) => {
      const target = touch(
        document.quotes.find((entry) => entry.id === quote.id)!,
      );
      target.date = date;
      target.profileId = profile?.id;
      target.profileSnapshot = snapshot?.ok ? snapshot.value : undefined;
      target.mainSite = site ? snapshotSite(site) : undefined;
      if (updates.commission !== undefined)
        target.commission = commission?.ok ? commission.value : undefined;
    });
    return updated ? 'updated' : 'invalid';
  };

  const renameQuote = (title: string) => {
    if (!quote) return false;
    return appState.mutate((document) => {
      const target = touch(
        document.quotes.find((entry) => entry.id === quote.id)!,
      );
      const customTitle = title.trim();
      if (customTitle) target.customTitle = customTitle;
      else delete target.customTitle;
    });
  };

  const updateClient = (client?: FicClientSnapshot) => {
    if (!quote) return false;
    return appState.mutate((document) => {
      const target = touch(
        document.quotes.find((entry) => entry.id === quote.id)!,
      );
      const site = document.sites.find(
        (entry) => entry.id === target.mainSite?.sourceId,
      );
      if (target.mainSite && (!site || !siteMatchesClient(site, client)))
        target.mainSite = undefined;
      target.client = client;
    });
  };

  const clients = useFicClients({
    companyId: doc.settings.fic.company?.id,
    enabled: hasToken && doc.settings.fic.enabled,
    contextKey: `${doc.documentId}:${archiveContext}:${archivePath}:${doc.settings.fic.company?.id}:${activeQuoteId}:${hasToken}:${doc.settings.fic.enabled}`,
    appState,
  });
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
    await clients.search(query);
  };

  const hasContainer = (containerId?: string) =>
    !containerId ||
    appState.document?.quotes
      .find((entry) => entry.id === quote?.id)
      ?.layout?.some(
        (entry) => entry.kind === 'container' && entry.id === containerId,
      );

  const saveLayout = (layout: QuoteLayoutEntry[]) => {
    if (!quote || !guardQuoteContext()()) return false;
    if (JSON.stringify(quoteLayout(quote)) === JSON.stringify(layout))
      return true;
    return appState.mutate((document) => {
      touch(document.quotes.find((entry) => entry.id === quote.id)!).layout =
        layout;
    });
  };

  const addContainer = (name = 'Nuovo contenitore') =>
    quote && name.trim()
      ? saveLayout([
          ...quoteLayout(quote),
          {
            kind: 'container',
            id: meta().id,
            name: name.trim(),
            itemIds: [],
          },
        ])
      : false;

  const renameContainer = (id: string, name: string) => {
    if (!quote || !name.trim() || !hasContainer(id)) return false;
    return saveLayout(
      quoteLayout(quote).map((entry) =>
        entry.kind === 'container' && entry.id === id
          ? { ...entry, name: name.trim() }
          : entry,
      ),
    );
  };

  const deleteContainer = (id: string) =>
    quote && hasContainer(id)
      ? saveLayout(removeQuoteContainer(quoteLayout(quote), id))
      : false;

  const addItem = (
    name: string,
    containerId?: string,
    afterItemId?: string,
    input?: SimpleSubInput,
  ) => {
    if (
      !quote ||
      !guardQuoteContext(quote, false)() ||
      !canInsertAt(
        appState.document!.quotes.find((entry) => entry.id === quote.id)!,
        { containerId, afterItemId },
      )
    )
      return false;
    const sub = input ? prepareSimpleSub(input) : undefined;
    if (input && !sub) return false;
    return appState.mutate((document) => {
      const target = touch(
        document.quotes.find((entry) => entry.id === quote.id)!,
      );
      insertQuoteItems(
        target,
        [
          {
            ...meta(),
            name: name.trim(),
            subItems: sub ? [sub] : [],
            variantGroups: [],
            variantSelections: [],
          },
        ],
        { containerId, afterItemId },
      );
    });
  };

  const renameItem = (itemId: string, name: string) => {
    if (!quote || !guardQuoteContext(quote, false)()) return false;
    return appState.mutate((document) => {
      const item = touch(
        touch(
          document.quotes.find((entry) => entry.id === quote.id)!,
        ).items.find((entry) => entry.id === itemId)!,
      );
      item.name = name.trim();
      touch(item);
    });
  };

  const updateChosenPrice = (itemId: string, chosenPrice: string) => {
    if (!quote || !guardQuoteContext(quote, false)()) return false;
    const value = chosenPrice.trim()
      ? parseDecimalInput(decimalInputValue(chosenPrice), 2)
      : undefined;
    if (value && !value.ok) {
      appState.setError({ ...value.error, field: 'chosenPrice' });
      return false;
    }
    if (
      quote.items.find((item) => item.id === itemId)?.chosenPrice ===
      (value?.ok ? value.value : undefined)
    )
      return true;
    return appState.mutate((document) => {
      const item = touch(
        touch(
          document.quotes.find((entry) => entry.id === quote.id)!,
        ).items.find((entry) => entry.id === itemId)!,
      );
      item.chosenPrice = value?.ok ? value.value : undefined;
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
        delete touch(
          touch(
            document.quotes.find((entry) => entry.id === quote.id)!,
          ).items.find((entry) => entry.id === itemId)!,
        ).referencePrice;
      });
    }
    const amount = parseDecimalInput(
      decimalInputValue(referenceAmount ?? ''),
      2,
    );
    if (!amount.ok) {
      appState.setError({ ...amount.error, field: 'referencePrice' });
      return false;
    }
    if (!referenceAmount || !referencePeriod || !isYearMonth(referencePeriod)) {
      appState.setError({
        code: 'VALIDATION',
        field: 'referencePrice',
        message:
          'Completa importo e mese/anno del Prezzo di riferimento, oppure rimuovilo.',
      });
      return false;
    }
    const normalizedAmount = amount.value;
    return appState.mutate((document) => {
      const item = touch(
        touch(
          document.quotes.find((entry) => entry.id === quote.id)!,
        ).items.find((entry) => entry.id === itemId)!,
      );
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

  const prepareSimpleSub = (input: SimpleSubInput) => {
    if (
      input.kind === 'time' &&
      input.minutes !== undefined &&
      (!Number.isFinite(input.minutes) || input.minutes <= 0)
    ) {
      appState.setError({
        code: 'VALIDATION',
        field: 'minutes',
        message: 'La durata deve essere maggiore di zero.',
      });
      return undefined;
    }
    let amount: string | undefined;
    if (input.kind === 'expense' && input.amount?.trim()) {
      const parsed = parseDecimalInput(decimalInputValue(input.amount), 2);
      if (!parsed.ok) {
        appState.setError({ ...parsed.error, field: 'amount' });
        return undefined;
      }
      amount = parsed.value;
    }
    return input.kind === 'time'
      ? {
          ...meta(),
          kind: 'time' as const,
          description: input.description.trim(),
          ...(input.minutes !== undefined ? { minutes: input.minutes } : {}),
        }
      : {
          ...meta(),
          kind: 'expense' as const,
          description: input.description.trim(),
          ...(amount !== undefined ? { amount } : {}),
        };
  };

  const addSubItem = async (
    itemId: string,
    kind: 'time' | 'expense' | 'travel',
  ) => {
    if (!quote) return false;
    const isCurrent = guardQuoteContext(quote, false);
    if (!isCurrent()) return false;
    const current = appState.document!.quotes.find(
      (entry) => entry.id === quote.id,
    )!;
    if (!current.items.some((item) => item.id === itemId)) return false;
    const sub: QuoteSubItem | undefined =
      kind === 'travel'
        ? await materializeTravel(
            { description: '', roundTrip: true, occurrences: 1 },
            current,
          )
        : { ...meta(), kind, description: '' };
    if (
      !sub ||
      !isCurrent() ||
      !appState
        .document!.quotes.find((entry) => entry.id === quote.id)
        ?.items.some((item) => item.id === itemId)
    )
      return false;
    const saved = appState.mutate((document) => {
      const target = touch(
        document.quotes.find((entry) => entry.id === quote.id)!,
      );
      touch(target.items.find((entry) => entry.id === itemId)!).subItems.push(
        sub,
      );
    });
    return saved ? sub.id : false;
  };

  const makeItemGeneric = (expected: QuoteItem) => {
    if (
      !quote ||
      appState.archiveOperationPending ||
      !guardQuoteContext(quote, false)()
    )
      return false;
    const current = appState
      .document!.quotes.find((entry) => entry.id === quote.id)!
      .items.find((entry) => entry.id === expected.id);
    if (JSON.stringify(current) !== JSON.stringify(expected)) {
      appState.setError({
        code: 'CONFLICT',
        message:
          'La riga è cambiata. Riapri il menu del tipo e ripeti la conversione.',
      });
      return false;
    }
    return appState.mutate((document) => {
      const target = touch(
        document.quotes.find((entry) => entry.id === quote.id)!,
      );
      const item = touch(
        target.items.find((entry) => entry.id === expected.id)!,
      );
      item.subItems = [];
      item.variantGroups = [];
      item.variantSelections = [];
    });
  };

  const changeItemType = async (
    itemId: string,
    kind: QuoteSubItem['kind'],
    expectedSub?: QuoteSubItem,
    subId?: string,
  ) => {
    if (!quote || appState.archiveOperationPending) return false;
    const isCurrent = guardQuoteContext(quote, false);
    if (!isCurrent()) return false;
    const current = appState.document!.quotes.find(
      (entry) => entry.id === quote.id,
    )!;
    const item = current.items.find((entry) => entry.id === itemId);
    if (
      !item ||
      (!subId && (item.variantGroups.length || item.subItems.length > 1))
    )
      return false;
    const previous = subId
      ? item.subItems.find((entry) => entry.id === subId)
      : item.subItems[0];
    if (
      (subId && !previous) ||
      JSON.stringify(previous) !== JSON.stringify(expectedSub)
    ) {
      appState.setError({
        code: 'CONFLICT',
        message:
          'La riga è cambiata. Riapri il menu del tipo e ripeti la conversione.',
      });
      return false;
    }
    if (previous?.kind === kind) return previous.id;
    // Build from scratch so fields belonging to the old type cannot survive.
    const built: QuoteSubItem | undefined =
      kind === 'travel'
        ? await materializeTravel(
            {
              description: previous?.description ?? item.name,
              roundTrip: true,
              occurrences: 1,
            },
            current,
          )
        : { ...meta(), kind, description: previous?.description ?? item.name };
    if (!built || !isCurrent() || appState.archiveOperationPending)
      return false;
    const latestItem = appState
      .document!.quotes.find((entry) => entry.id === quote.id)
      ?.items.find((entry) => entry.id === itemId);
    if (JSON.stringify(latestItem) !== JSON.stringify(item)) {
      appState.setError({
        code: 'CONFLICT',
        message:
          'La riga è cambiata durante la conversione. Ripeti l’operazione.',
      });
      return false;
    }
    const converted: QuoteSubItem = previous
      ? {
          ...built,
          id: previous.id,
          createdAt: previous.createdAt,
          ...(previous.variantOwner
            ? { variantOwner: previous.variantOwner, manuallyModified: true }
            : {}),
        }
      : built;
    const saved = appState.mutate((document) => {
      const target = touch(
        document.quotes.find((entry) => entry.id === quote.id)!,
      );
      const targetItem = touch(
        target.items.find((entry) => entry.id === itemId)!,
      );
      if (previous)
        targetItem.subItems[
          targetItem.subItems.findIndex((entry) => entry.id === previous.id)
        ] = converted;
      else targetItem.subItems.push(converted);
    });
    return saved ? converted.id : false;
  };

  const saveSimpleSub = (
    itemId: string,
    input: SimpleSubInput,
    subId?: string,
  ) => {
    if (!quote || !guardQuoteContext(quote, false)()) return false;
    const sub = prepareSimpleSub(input);
    if (!sub) return false;
    return appState.mutate((document) => {
      const item = touch(
        touch(
          document.quotes.find((entry) => entry.id === quote.id)!,
        ).items.find((entry) => entry.id === itemId)!,
      );
      const existing = item.subItems.find((entry) => entry.id === subId);
      if (existing && sub.kind === 'time' && existing.kind === 'time') {
        existing.description = sub.description;
        existing.minutes = sub.minutes;
        if (existing.variantOwner) existing.manuallyModified = true;
        touch(existing);
      } else if (
        existing &&
        sub.kind === 'expense' &&
        existing.kind === 'expense'
      ) {
        existing.description = sub.description;
        existing.amount = sub.amount;
        if (existing.variantOwner) existing.manuallyModified = true;
        touch(existing);
      } else item.subItems.push(sub);
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
      const item = touch(
        touch(
          document.quotes.find((entry) => entry.id === quote.id)!,
        ).items.find((entry) => entry.id === itemId)!,
      );
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
      touch(
        touch(
          document.quotes.find((entry) => entry.id === quote.id)!,
        ).items.find((entry) => entry.id === itemId)!,
      ).subItems.push(sub!),
    );
  };

  const saveSubToCatalog = (itemId: string, subId: string) => {
    const sub = quote?.items
      .find((item) => item.id === itemId)
      ?.subItems.find((entry) => entry.id === subId);
    if (sub && !canReuseQuoteSubItem(sub)) {
      appState.setError({
        code: 'MISSING_DATA',
        message:
          'Completa descrizione e valori della sottoriga prima di salvarla nel catalogo.',
      });
      return false;
    }
    return sub && canReuseQuoteSubItem(sub)
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
        touch(
          touch(
            document.quotes.find((entry) => entry.id === quote.id)!,
          ).items.find((entry) => entry.id === itemId)!,
        ),
        result.value,
      ),
    );
  };

  const insertTemplate = async (
    templateId: string,
    choices: Record<string, string>,
    context: TravelContext,
    containerId?: string,
    afterItemId?: string,
    replacement?: QuoteItem,
  ) => {
    if (
      !quote ||
      appState.archiveOperationPending ||
      !canInsertAt(quote, { containerId, afterItemId })
    )
      return false;
    const isCurrent = guardQuoteContext();
    if (!isCurrent()) return false;
    if (
      replacement &&
      JSON.stringify(
        quote.items.find((entry) => entry.id === replacement.id),
      ) !== JSON.stringify(replacement)
    ) {
      appState.setError({
        code: 'CONFLICT',
        message:
          'La riga è cambiata. Riapri il selettore del template e ripeti la conversione.',
      });
      return false;
    }
    const sourceTemplate = doc.catalog.templates.find(
      (entry) => entry.id === templateId,
    );
    if (!sourceTemplate || (replacement && !sourceTemplate.items.length))
      return false;
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
    if (!isCurrent() || appState.archiveOperationPending) return false;
    return appState.mutate((document) => {
      const target = touch(
        document.quotes.find((entry) => entry.id === quote.id)!,
      );
      if (replacement) {
        const first = prepared[0]!;
        first.id = replacement.id;
        first.createdAt = replacement.createdAt;
        first.chosenPrice = replacement.chosenPrice;
        // Keep the first identity and its layout reference; append the remaining
        // template rows directly after it in the same container.
        const container = quoteLayout(target).find(
          (entry) =>
            entry.kind === 'container' &&
            entry.itemIds.includes(replacement.id),
        );
        target.items[
          target.items.findIndex((entry) => entry.id === replacement.id)
        ] = first;
        if (prepared.length > 1)
          insertQuoteItems(target, prepared.slice(1), {
            containerId:
              container?.kind === 'container' ? container.id : undefined,
            afterItemId: first.id,
          });
      } else insertQuoteItems(target, prepared, { containerId, afterItemId });
    });
  };

  const saveTemplate = (name: string, itemIds: string[]) => {
    if (!quote) return false;
    const items = orderedQuoteItems(quote).filter((item) =>
      itemIds.includes(item.id),
    );
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
    const exportSnapshot = { ...quote, client };
    const built = buildExportLines(exportSnapshot, groups, fic.company.id);
    if (!built.ok) {
      appState.setError(built.error);
      return false;
    }
    if (
      quote.client?.source !== 'fatture_in_cloud' ||
      quote.client.companyId !== client.companyId ||
      quote.client.clientId !== client.clientId
    ) {
      if (!updateClient(client)) return false;
      isCurrent = guardQuoteContext(
        appState.document?.quotes.find((entry) => entry.id === quote.id),
      );
      await appState.save();
      if (!isCurrent() || appState.status !== 'Salvato') return false;
    }
    let attempt: Awaited<ReturnType<typeof createPendingAttempt>>;
    try {
      attempt = await createPendingAttempt(fic.company.id, built.value);
    } catch {
      if (isCurrent())
        appState.setError({
          code: 'VALIDATION',
          message:
            'Impossibile calcolare il fingerprint del preventivo. Invio non eseguito.',
        });
      return false;
    }
    if (!isCurrent()) return false;
    if (
      !appState.mutate((document) =>
        touch(
          document.quotes.find((entry) => entry.id === quote.id)!,
        ).exportAttempts.push(attempt),
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
      const saved = touch(
        document.quotes.find((entry) => entry.id === quote.id)!,
      ).exportAttempts.find((entry) => entry.id === attempt.id)!;
      touch(saved);
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
      appState.setError(
        sent.value.error ?? {
          code: 'VALIDATION',
          source: 'FattureInCloud',
          message:
            sent.value.diagnostic ?? 'Fatture in Cloud ha rifiutato l’invio.',
        },
      );
    }
    if (sent.ok && sent.value.outcome === 'success')
      appState.notifyFicSuccess(
        'Preventivo esportato',
        'Il preventivo è stato creato in Fatture in Cloud.',
      );
    return sent.ok && sent.value.outcome === 'success';
  };

  return {
    quote,
    clientResults: clients.results,
    searchingClients: clients.loading,
    clientSearchError: clients.error,
    cancelClientSearch: clients.cancel,
    nextClientPage: clients.nextPage,
    loadMoreClients: clients.loadMore,
    newQuote,
    updateQuote,
    renameQuote,
    updateClient,
    searchRemoteClients,
    addItem,
    addContainer,
    renameContainer,
    deleteContainer,
    saveLayout,
    renameItem,
    updateChosenPrice,
    updateReferencePrice,
    saveSimpleSub,
    changeItemType,
    makeItemGeneric,
    addSubItem,
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
