import { useState, type FormEvent } from "react";
import { calculateTravel, calculateVehicleCost } from "../../domain/calculations";
import {
  cloneTemplate,
  previewTemplate,
  reusableFromQuoteSubItem,
  templateFromQuote,
} from "../../domain/catalog";
import {
  buildExportLines,
  createPendingAttempt,
  needsRepeatWarning,
} from "../../domain/export";
import {
  meta,
  type CashDocument,
  type FicClientSnapshot,
  type Quote,
  type QuoteItem,
  type QuoteSubItem,
  type SiteSnapshot,
  type SubItemDefinition,
} from "../../domain/model";
import { refreshQuote, snapshotProfile } from "../../domain/refresh";
import {
  applyVariantSelections,
  changeVariant,
  validateVariantGroups,
} from "../../domain/variants";
import type { QuoteItemActions } from "@/components/QuoteItemCard";
import { decimalInputValue, eur, formReader } from "@/lib/format";
import type { AppState } from "../state";
import type { DeleteTarget } from "../types";

const promptRequired = (message: string, initial = ""): string | undefined =>
  window.prompt(message, initial)?.trim() || undefined;
const siteSnapshot = (
  doc: CashDocument,
  id: string,
): SiteSnapshot | undefined => {
  const site = doc.sites.find((candidate) => candidate.id === id);
  return site
    ? {
        sourceId: site.id,
        name: site.name,
        address: site.address,
        ...(site.oneWayKm !== undefined ? { oneWayKm: site.oneWayKm } : {}),
      }
    : undefined;
};

export function useQuoteController({
  doc,
  appState,
  activeQuoteId,
  setActiveQuoteId,
  requestDelete,
}: {
  doc: CashDocument;
  appState: AppState;
  activeQuoteId?: string;
  setActiveQuoteId: (id?: string) => void;
  requestDelete: (target: DeleteTarget) => void;
}) {
  const [clientResults, setClientResults] = useState<FicClientSnapshot[]>([]);
  const quote = doc.quotes.find((candidate) => candidate.id === activeQuoteId);

  const materializeTemplateTravel = async (
    definition: Extract<SubItemDefinition, { kind: "travel" }>,
    targetQuote: Quote,
  ): Promise<QuoteSubItem | undefined> => {
    const profile = doc.profiles.find(
      (candidate) => candidate.id === targetQuote.profileId,
    );
    if (
      !doc.settings.fuelTerritory ||
      !doc.sites.length ||
      !doc.vehicles.length
    ) {
      window.alert(
        "Per inserire una Trasferta servono territorio MIMIT, Sede e veicolo.",
      );
      return undefined;
    }
    const proposed =
      Math.max(
        0,
        doc.sites.findIndex(
          (site) => site.id === targetQuote.mainSite?.sourceId,
        ),
      ) + 1;
    const site =
      doc.sites[
        Number(
          promptRequired(
            `Sede per “${definition.description}”:\n${doc.sites.map((candidate, index) => `${index + 1}. ${candidate.name}`).join("\n")}`,
            String(proposed),
          ),
        ) - 1
      ];
    const vehicle =
      doc.vehicles[
        Number(
          promptRequired(
            `Veicolo per “${definition.description}”:\n${doc.vehicles.map((candidate, index) => `${index + 1}. ${candidate.name}`).join("\n")}`,
            "1",
          ),
        ) - 1
      ];
    if (!site || !vehicle) return undefined;
    const fuel = await window.cash.mimit.latestFuelPrice({
      territory: doc.settings.fuelTerritory,
      fuel: vehicle.fuel,
    });
    if (!fuel.ok) {
      appState.setError(fuel.error);
      return undefined;
    }
    const cost = calculateVehicleCost(vehicle, fuel.value);
    if (!cost.ok) {
      appState.setError(cost.error);
      return undefined;
    }
    const travel = calculateTravel({
      oneWayKm: site.oneWayKm,
      roundTrip: definition.roundTrip,
      occurrences: definition.occurrences,
      vehicleCostPerKm: cost.value.costPerKm,
      ...(definition.timeMode === "manual"
        ? { manualMinutesPerOccurrence: definition.manualMinutesPerOccurrence }
        : { speedKmh: profile?.capacity.travelSpeedKmh }),
    });
    if (!travel.ok) {
      appState.setError(travel.error);
      return undefined;
    }
    return {
      ...meta(),
      kind: "travel",
      description: definition.description,
      site: {
        sourceId: site.id,
        name: site.name,
        address: site.address,
        ...(site.oneWayKm !== undefined ? { oneWayKm: site.oneWayKm } : {}),
      },
      vehicleId: vehicle.id,
      roundTrip: definition.roundTrip,
      occurrences: definition.occurrences,
      timeMode: definition.timeMode,
      ...(definition.manualMinutesPerOccurrence
        ? { manualMinutesPerOccurrence: definition.manualMinutesPerOccurrence }
        : {}),
      ...travel.value,
      vehicleCostPerKm: cost.value.costPerKm,
      fuelEvidence: fuel.value,
    };
  };

  const newQuote = () => {
    const profile = doc.profiles.find((candidate) => candidate.confirmed);
    let snap;
    if (profile) {
      const value = snapshotProfile(profile, doc.businessCosts);
      if (value.ok) snap = value.value;
    }
    const created: Quote = {
      ...meta(),
      date: new Date().toISOString().slice(0, 10),
      ...(profile ? { profileId: profile.id } : {}),
      ...(snap ? { profileSnapshot: snap } : {}),
      items: [],
      snapshotRevision: 0,
      exportAttempts: [],
    };
    appState.mutate((document) => document.quotes.push(created));
    setActiveQuoteId(created.id);
  };

  const saveQuote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quote) return;
    const { get, money } = formReader(event.currentTarget);
    const profile = doc.profiles.find(
      (candidate) => candidate.id === get("profileId"),
    );
    const quoteYear = Number(get("date").slice(0, 4));
    if (
      profile &&
      profile.year !== quoteYear &&
      !window.confirm(
        `La data è nel ${quoteYear}, ma il profilo selezionato è ${profile.year}. Mantenere questa associazione esplicita?`,
      )
    )
      return;
    const snap = profile
      ? snapshotProfile(profile, doc.businessCosts)
      : undefined;
    if (profile && !snap?.ok) {
      appState.setError(
        snap?.error ?? {
          code: "MISSING_DATA",
          message: "Profilo non calcolabile.",
        },
      );
      return;
    }
    appState.mutate((document) => {
      const target = document.quotes.find(
        (candidate) => candidate.id === quote.id,
      )!;
      target.date = get("date");
      target.commission = get("commission")
        ? Number(money("commission")).toFixed(2)
        : undefined;
      target.profileId = profile?.id;
      target.profileSnapshot = snap?.ok ? snap.value : undefined;
      target.mainSite = get("mainSiteId")
        ? siteSnapshot(doc, get("mainSiteId"))
        : undefined;
    });
  };

  const searchRemoteClients = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const companyId = doc.settings.fic.company?.id;
    if (!doc.settings.fic.enabled || !companyId) {
      window.alert("Attivare prima Fatture in Cloud.");
      return;
    }
    const result = await window.cash.fic.searchClients({
      companyId,
      query: formReader(event.currentTarget).get("query"),
    });
    if (!result.ok) {
      appState.setError(result.error);
      return;
    }
    setClientResults(result.value);
  };

  const addTravel = async (itemId: string) => {
    if (!quote) return;
    const profile = doc.profiles.find(
      (candidate) => candidate.id === quote.profileId,
    );
    if (!doc.settings.fuelTerritory) {
      window.alert("Configura prima la regione MIMIT.");
      return;
    }
    if (!doc.sites.length || !doc.vehicles.length) {
      window.alert("Configura almeno una Sede e un veicolo.");
      return;
    }
    const proposed =
      Math.max(
        0,
        doc.sites.findIndex((site) => site.id === quote.mainSite?.sourceId),
      ) + 1;
    const site =
      doc.sites[
        Number(
          promptRequired(
            `Sede:\n${doc.sites.map((entry, index) => `${index + 1}. ${entry.name}`).join("\n")}`,
            String(proposed),
          ),
        ) - 1
      ];
    const vehicle =
      doc.vehicles[
        Number(
          promptRequired(
            `Veicolo:\n${doc.vehicles.map((entry, index) => `${index + 1}. ${entry.name}`).join("\n")}`,
            "1",
          ),
        ) - 1
      ];
    if (!site || !vehicle) return;
    const description = promptRequired(
      "Descrizione trasferta",
      `Trasferta ${site.name}`,
    );
    if (!description) return;
    const occurrences = Number(promptRequired("Occorrenze previste", "1"));
    const roundTrip = window.confirm("Andata e ritorno?");
    const manual = promptRequired(
      "Minuti manuali per occorrenza (lascia vuoto per automatico)",
      "",
    );
    const fuel = await window.cash.mimit.latestFuelPrice({
      territory: doc.settings.fuelTerritory,
      fuel: vehicle.fuel,
    });
    if (!fuel.ok) {
      appState.setError(fuel.error);
      return;
    }
    const cost = calculateVehicleCost(vehicle, fuel.value);
    if (!cost.ok) {
      appState.setError(cost.error);
      return;
    }
    const travel = calculateTravel({
      oneWayKm: site.oneWayKm,
      roundTrip,
      occurrences,
      vehicleCostPerKm: cost.value.costPerKm,
      ...(manual
        ? { manualMinutesPerOccurrence: Number(manual) }
        : { speedKmh: profile?.capacity.travelSpeedKmh }),
    });
    if (!travel.ok) {
      appState.setError(travel.error);
      return;
    }
    appState.mutate((document) =>
      document.quotes
        .find((candidate) => candidate.id === quote.id)!
        .items.find((item) => item.id === itemId)!
        .subItems.push({
          ...meta(),
          kind: "travel",
          description,
          site: {
            sourceId: site.id,
            name: site.name,
            address: site.address,
            ...(site.oneWayKm !== undefined ? { oneWayKm: site.oneWayKm } : {}),
          },
          vehicleId: vehicle.id,
          roundTrip,
          occurrences,
          timeMode: manual ? "manual" : "automatic",
          ...(manual ? { manualMinutesPerOccurrence: Number(manual) } : {}),
          ...travel.value,
          vehicleCostPerKm: cost.value.costPerKm,
          fuelEvidence: fuel.value,
        }),
    );
  };

  const addVariant = async (itemId: string) => {
    if (!quote) return;
    const source = quote.items.find((item) => item.id === itemId);
    if (!source) return;
    const name = promptRequired("Nome gruppo variante");
    const names = promptRequired(
      "Nomi delle opzioni, uno per riga",
      "Nessuna\nStandard",
    );
    if (!name || !names) return;
    const options = [];
    for (const optionName of names
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)) {
      const raw = window.prompt(
        `Sottovoci prodotte da “${optionName}”, una per riga.\nFormati:\ntempo|Descrizione|minuti\nspesa|Descrizione|euro\ntrasferta|Descrizione|AR o A|occorrenze|automatic o manual|minuti manuali`,
        optionName === "Nessuna" ? "" : `tempo|${name} · ${optionName}|30`,
      );
      if (raw === null) return;
      const definitions: SubItemDefinition[] = [];
      for (const line of raw
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean)) {
        const [kind, description, value, occurrences, timeMode, manualMinutes] =
          line.split("|").map((value) => value?.trim());
        if (!description) {
          window.alert(`Definizione non valida: ${line}`);
          return;
        }
        if (
          kind === "tempo" &&
          Number.isInteger(Number(value)) &&
          Number(value) > 0
        )
          definitions.push({
            kind: "time",
            description,
            minutes: Number(value),
          });
        else if (kind === "spesa" && Number(value) >= 0)
          definitions.push({
            kind: "expense",
            description,
            amount: Number(value).toFixed(2),
          });
        else if (
          kind === "trasferta" &&
          Number.isInteger(Number(occurrences)) &&
          Number(occurrences) > 0 &&
          (timeMode === "automatic" || timeMode === "manual")
        )
          definitions.push({
            kind: "travel",
            description,
            roundTrip: value?.toLocaleUpperCase("it") === "AR",
            occurrences: Number(occurrences),
            timeMode,
            ...(timeMode === "manual" && Number(manualMinutes) > 0
              ? { manualMinutesPerOccurrence: Number(manualMinutes) }
              : {}),
          });
        else {
          window.alert(`Definizione non valida: ${line}`);
          return;
        }
      }
      options.push({ ...meta(), name: optionName, subItems: definitions });
    }
    const defaultRaw = window.prompt(
      `Opzione predefinita (numero, lascia vuoto per nessun default):\n${options.map((option, index) => `${index + 1}. ${option.name}`).join("\n")}`,
      "1",
    );
    if (defaultRaw === null) return;
    const defaultOption = defaultRaw.trim()
      ? options[Number(defaultRaw) - 1]
      : undefined;
    if (defaultRaw.trim() && !defaultOption) {
      window.alert("Opzione predefinita non valida.");
      return;
    }
    const group = {
      ...meta(),
      name,
      options,
      ...(defaultOption ? { defaultOptionId: defaultOption.id } : {}),
    };
    const validation = validateVariantGroups([...source.variantGroups, group]);
    if (!validation.ok) {
      appState.setError(validation.error);
      return;
    }
    let selected = defaultOption;
    if (!selected) {
      const selectedRaw = promptRequired(
        `Questo gruppo non ha default: scegli esplicitamente l’opzione iniziale.\n${options.map((option, index) => `${index + 1}. ${option.name}`).join("\n")}`,
      );
      selected = selectedRaw ? options[Number(selectedRaw) - 1] : undefined;
      if (!selected) return;
    }
    const travelQueue: QuoteSubItem[] = [];
    for (const definition of selected.subItems)
      if (definition.kind === "travel") {
        const travel = await materializeTemplateTravel(definition, quote);
        if (!travel) return;
        travelQueue.push(travel);
      }
    const draft = structuredClone(source);
    draft.variantGroups.push(group);
    const applied = changeVariant(draft, group.id, selected.id, true, {
      materializeTravel: () => {
        const travel = travelQueue.shift();
        return travel
          ? { ok: true, value: travel }
          : {
              ok: false,
              error: {
                code: "MISSING_DATA",
                message: "Dati Trasferta non disponibili.",
              },
            };
      },
    });
    if (!applied.ok) {
      appState.setError(applied.error);
      return;
    }
    appState.mutate((document) =>
      Object.assign(
        document.quotes
          .find((candidate) => candidate.id === quote.id)!
          .items.find((item) => item.id === itemId)!,
        applied.value,
      ),
    );
  };

  const changeVariantFromUi = async (
    itemId: string,
    groupId: string,
    optionId: string,
  ) => {
    if (!quote) return;
    const item = quote.items.find((candidate) => candidate.id === itemId);
    const group = item?.variantGroups.find(
      (candidate) => candidate.id === groupId,
    );
    const option = group?.options.find(
      (candidate) => candidate.id === optionId,
    );
    if (!item || !group || !option) return;
    const warning = item.subItems.some(
      (sub) => sub.variantOwner?.groupId === group.id && sub.manuallyModified,
    );
    if (
      warning &&
      !window.confirm(
        "Le modifiche manuali alle sottovoci della variante verranno perse. Continuare?",
      )
    )
      return;
    const travelQueue: QuoteSubItem[] = [];
    for (const definition of option.subItems)
      if (definition.kind === "travel") {
        const travel = await materializeTemplateTravel(definition, quote);
        if (!travel) return;
        travelQueue.push(travel);
      }
    const changed = changeVariant(item, group.id, option.id, true, {
      materializeTravel: () => {
        const travel = travelQueue.shift();
        return travel
          ? { ok: true, value: travel }
          : {
              ok: false,
              error: {
                code: "MISSING_DATA",
                message: "Dati Trasferta non disponibili.",
              },
            };
      },
    });
    if (!changed.ok) {
      appState.setError(changed.error);
      return;
    }
    appState.mutate((document) =>
      Object.assign(
        document.quotes
          .find((candidate) => candidate.id === quote.id)!
          .items.find((candidate) => candidate.id === item.id)!,
        changed.value,
      ),
    );
  };

  const insertTemplate = async () => {
    if (!quote) return;
    const selected =
      doc.catalog.templates[
        Number(
          promptRequired(
            `Template:\n${doc.catalog.templates.map((template, index) => `${index + 1}. ${template.name}`).join("\n")}`,
          ),
        ) - 1
      ];
    if (!selected) return;
    const template = cloneTemplate(selected);
    const prepared: QuoteItem[] = [];
    for (const source of template.items) {
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
        if (reusable.kind === "time")
          item.subItems.push({
            ...meta(),
            kind: "time",
            description: reusable.description,
            minutes: reusable.minutes,
          });
        else if (reusable.kind === "expense")
          item.subItems.push({
            ...meta(),
            kind: "expense",
            description: reusable.description,
            amount: reusable.amount,
          });
        else {
          const travel = await materializeTemplateTravel(reusable, quote);
          if (!travel) return;
          item.subItems.push(travel);
        }
      }
      const choices: Record<string, string> = {};
      const travelQueue: QuoteSubItem[] = [];
      for (const group of item.variantGroups) {
        let optionId = group.defaultOptionId;
        if (!optionId) {
          const option =
            group.options[
              Number(
                promptRequired(
                  `Opzione per ${group.name}:\n${group.options.map((candidate, index) => `${index + 1}. ${candidate.name}`).join("\n")}`,
                ),
              ) - 1
            ];
          if (!option) return;
          optionId = option.id;
        }
        choices[group.id] = optionId;
        const option = group.options.find(
          (candidate) => candidate.id === optionId,
        )!;
        for (const definition of option.subItems)
          if (definition.kind === "travel") {
            const travel = await materializeTemplateTravel(definition, quote);
            if (!travel) return;
            travelQueue.push(travel);
          }
      }
      const applied = applyVariantSelections(item, choices, {
        materializeTravel: () => {
          const travel = travelQueue.shift();
          return travel
            ? { ok: true, value: travel }
            : {
                ok: false,
                error: {
                  code: "MISSING_DATA",
                  message: "Dati Trasferta non disponibili.",
                },
              };
        },
      });
      if (!applied.ok) {
        appState.setError(applied.error);
        return;
      }
      prepared.push(applied.value);
    }
    if (
      window.confirm(
        `Inserire una copia indipendente del template “${selected.name}” con ${prepared.length} voci?`,
      )
    )
      appState.mutate((document) =>
        document.quotes
          .find((candidate) => candidate.id === quote.id)!
          .items.push(...prepared),
      );
  };

  const saveTemplate = () => {
    if (!quote) return;
    const name = promptRequired("Nome del nuovo template");
    if (!name) return;
    const raw = promptRequired(
      `Voci da includere (numeri separati da virgola):\n${quote.items.map((item, index) => `${index + 1}. ${item.name}`).join("\n")}`,
      quote.items.map((_item, index) => index + 1).join(","),
    );
    if (!raw) return;
    const items = [
      ...new Set(
        raw
          .split(",")
          .map((value) => quote.items[Number(value.trim()) - 1])
          .filter((item): item is QuoteItem => Boolean(item)),
      ),
    ];
    const built = templateFromQuote(name, items);
    if (!built.ok) {
      appState.setError(built.error);
      return;
    }
    const preview = previewTemplate(name, items);
    const changed = items.flatMap((item) =>
      item.subItems
        .filter((sub) => sub.variantOwner && sub.manuallyModified)
        .map((sub) => `${item.name} / ${sub.description}`),
    );
    if (
      !window.confirm(
        `Anteprima del nuovo template (sempre una copia):\n${preview.items.map((item) => `${item.name}: ${item.subItems.join(", ") || "nessuna sottovoce base"}${item.variants.length ? ` · varianti ${item.variants.map((variant) => variant.group).join(", ")}` : ""}`).join("\n")}${changed.length ? `\n\nLe modifiche manuali seguenti saranno applicate alle rispettive opzioni:\n${changed.join("\n")}` : ""}\n\nSalvare?`,
      )
    )
      return;
    appState.mutate((document) => document.catalog.templates.push(built.value));
  };

  const performRefresh = async () => {
    if (!quote) return;
    const result = await refreshQuote(quote, {
      profileById: (id) => doc.profiles.find((entry) => entry.id === id),
      costs: doc.businessCosts,
      siteById: (id) => doc.sites.find((entry) => entry.id === id),
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
                code: "MISSING_DATA",
                field: "fuelTerritory",
                message: "Regione MIMIT non configurata.",
              },
            }),
      foi: (amount, period) =>
        window.cash.istat.revalue({ amount, fromPeriod: period }),
    });
    if (!result.ok) {
      appState.setError(result.error);
      return;
    }
    appState.mutate((document) => {
      const index = document.quotes.findIndex((entry) => entry.id === quote.id);
      document.quotes[index] = result.value;
    });
  };

  const performExport = async () => {
    if (!quote) return;
    const fic = doc.settings.fic;
    if (!fic.enabled || !fic.company || !fic.product) {
      window.alert(
        "Fatture in Cloud è disattivato o non configurato. Il preventivo resta utilizzabile localmente.",
      );
      return;
    }
    let remoteClient = quote.client;
    if (
      !remoteClient ||
      remoteClient.source !== "fatture_in_cloud" ||
      remoteClient.companyId !== fic.company.id
    ) {
      const query = promptRequired(
        "Cerca e seleziona esplicitamente il cliente remoto per questa esportazione",
        quote.client?.displayName ?? "",
      );
      if (!query) return;
      const found = await window.cash.fic.searchClients({
        companyId: fic.company.id,
        query,
      });
      if (!found.ok) {
        appState.setError(found.error);
        return;
      }
      const selected =
        found.value[
          Number(
            promptRequired(
              `Cliente remoto:\n${found.value.map((entry, index) => `${index + 1}. ${entry.displayName} · ${entry.vatNumber ?? "P.IVA assente"}`).join("\n")}`,
            ),
          ) - 1
        ];
      if (!selected) return;
      if (
        !window.confirm(
          `Sostituire lo snapshot cliente del preventivo con “${selected.displayName}”? Il Cliente locale originario non verrà modificato.`,
        )
      )
        return;
      remoteClient = selected;
      appState.mutate((document) => {
        document.quotes.find((entry) => entry.id === quote.id)!.client =
          selected;
      });
      await appState.save();
      if (appState.status !== "Salvato") return;
    }
    const exportQuoteSnapshot = { ...quote, client: remoteClient };
    if (
      needsRepeatWarning(exportQuoteSnapshot) &&
      !window.confirm(
        "Preventivo già esportato o con esito da verificare. Confermi una nuova esportazione?",
      )
    )
      return;
    const product = await window.cash.fic.verifyProduct({
      companyId: fic.company.id,
      productId: fic.product.id,
    });
    if (!product.ok) {
      appState.setError(product.error);
      return;
    }
    let groups: Array<{ itemIds: string[]; description: string }> | undefined;
    if (
      quote.items.length > 1 &&
      window.confirm(
        "Raggruppare tutte le voci in una sola riga di esportazione?",
      )
    ) {
      const description = promptRequired(
        "Descrizione modificabile della riga",
        quote.items.map((item) => item.name).join(" + "),
      );
      if (!description) return;
      groups = [{ itemIds: quote.items.map((item) => item.id), description }];
    } else {
      groups = [];
      for (const item of quote.items) {
        const description = promptRequired(
          `Descrizione riga per “${item.name}”`,
          item.name,
        );
        if (!description) return;
        groups.push({ itemIds: [item.id], description });
      }
    }
    const built = buildExportLines(exportQuoteSnapshot, groups, fic.company.id);
    if (!built.ok) {
      appState.setError(built.error);
      return;
    }
    if (
      !window.confirm(
        `Anteprima definitiva:\n${built.value.map((line) => `${line.description}: ${eur(line.amount)} · quantità 1`).join("\n")}\n\nInviare?`,
      )
    )
      return;
    const attempt = createPendingAttempt(fic.company.id, built.value);
    appState.mutate((document) =>
      document.quotes
        .find((entry) => entry.id === quote.id)!
        .exportAttempts.push(attempt),
    );
    await appState.save();
    if (appState.status !== "Salvato") return;
    const sent = await window.cash.fic.exportQuote({
      companyId: fic.company.id,
      clientId: remoteClient.clientId,
      productId: fic.product.id,
      lines: built.value,
      attemptId: attempt.id,
    });
    appState.mutate((document) => {
      const saved = document.quotes
        .find((entry) => entry.id === quote.id)!
        .exportAttempts.find((entry) => entry.id === attempt.id)!;
      if (sent.ok) {
        saved.outcome = sent.value.outcome;
        if (sent.value.remoteDocumentId)
          saved.remoteDocumentId = sent.value.remoteDocumentId;
        if (sent.value.diagnostic) saved.diagnostic = sent.value.diagnostic;
      } else {
        saved.outcome = "uncertain";
        saved.diagnostic = sent.error.message;
      }
    });
  };

  const itemActions: QuoteItemActions = {
    rename: (item) => {
      const title = promptRequired("Nome della voce commerciale", item.name);
      if (title)
        appState.mutate((document) => {
          const target = document.quotes
            .find((candidate) => candidate.id === quote?.id)!
            .items.find((candidate) => candidate.id === item.id)!;
          target.name = title;
          target.updatedAt = new Date().toISOString();
        });
    },
    savePrices: (item, form) => {
      if (!quote) return;
      const { get, money } = formReader(form);
      appState.mutate((document) => {
        const target = document.quotes
          .find((candidate) => candidate.id === quote.id)!
          .items.find((candidate) => candidate.id === item.id)!;
        target.chosenPrice = get("chosenPrice")
          ? Number(money("chosenPrice")).toFixed(2)
          : undefined;
        target.referencePrice =
          get("referenceAmount") && get("referencePeriod")
            ? {
                amount: Number(money("referenceAmount")).toFixed(2),
                period: get("referencePeriod"),
              }
            : undefined;
      });
    },
    editSub: (itemId, subId) => {
      const sub = quote?.items
        .find((item) => item.id === itemId)
        ?.subItems.find((candidate) => candidate.id === subId);
      if (!sub) return;
      const description = promptRequired("Descrizione", sub.description);
      if (!description) return;
      const value =
        sub.kind === "time"
          ? promptRequired("Minuti", String(sub.minutes))
          : sub.kind === "expense"
            ? promptRequired("Importo (€)", sub.amount)
            : undefined;
      if ((sub.kind === "time" || sub.kind === "expense") && !value) return;
      appState.mutate((document) => {
        const target = document.quotes
          .find((candidate) => candidate.id === quote?.id)!
          .items.find((item) => item.id === itemId)!
          .subItems.find((candidate) => candidate.id === subId)!;
        target.description = description;
        if (target.kind === "time") target.minutes = Number(value);
        else if (target.kind === "expense")
          target.amount = Number(decimalInputValue(value!)).toFixed(2);
        if (target.variantOwner) target.manuallyModified = true;
        target.updatedAt = new Date().toISOString();
      });
    },
    saveSub: (itemId, subId) => {
      const sub = quote?.items
        .find((item) => item.id === itemId)
        ?.subItems.find((candidate) => candidate.id === subId);
      if (
        sub &&
        window.confirm(
          `Salvare “${sub.description}” come nuova copia indipendente nel catalogo?`,
        )
      )
        appState.mutate((document) =>
          document.catalog.subItems.push(reusableFromQuoteSubItem(sub)),
        );
    },
    changeVariant: (itemId, groupId, optionId) =>
      void changeVariantFromUi(itemId, groupId, optionId),
    addTimeOrExpense: (kind, itemId) => {
      const description = promptRequired("Descrizione");
      const value = promptRequired(
        kind === "time" ? "Durata in minuti" : "Importo (€)",
        kind === "time" ? "30" : "0.00",
      );
      if (description && value)
        appState.mutate((document) => {
          const item = document.quotes
            .find((candidate) => candidate.id === quote?.id)!
            .items.find((candidate) => candidate.id === itemId)!;
          item.subItems.push(
            kind === "time"
              ? { ...meta(), kind: "time", description, minutes: Number(value) }
              : {
                  ...meta(),
                  kind: "expense",
                  description,
                  amount: Number(decimalInputValue(value)).toFixed(2),
                },
          );
        });
    },
    addTravel: (itemId) => void addTravel(itemId),
    addCatalog: (itemId) => {
      const raw = promptRequired(
        `Scegli il numero:\n${doc.catalog.subItems.map((entry, index) => `${index + 1}. ${entry.description}`).join("\n")}`,
      );
      const source = raw ? doc.catalog.subItems[Number(raw) - 1] : undefined;
      if (source)
        appState.mutate((document) => {
          const item = document.quotes
            .find((candidate) => candidate.id === quote?.id)!
            .items.find((candidate) => candidate.id === itemId)!;
          if (source.kind === "time")
            item.subItems.push({
              ...meta(),
              kind: "time",
              description: source.description,
              minutes: source.minutes,
            });
          else if (source.kind === "expense")
            item.subItems.push({
              ...meta(),
              kind: "expense",
              description: source.description,
              amount: source.amount,
            });
        });
    },
    addVariant: (itemId) => void addVariant(itemId),
    requestDelete,
  };
  return {
    quote,
    clientResults,
    newQuote,
    saveQuote,
    searchRemoteClients,
    insertTemplate,
    saveTemplate,
    performRefresh,
    performExport,
    itemActions,
  };
}
