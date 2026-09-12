import { useState } from "react"
import { calculateTravel, calculateVehicleCost } from "../../domain/calculations"
import { cloneTemplate, reusableFromQuoteSubItem, templateFromQuote } from "../../domain/catalog"
import { buildExportLines, createPendingAttempt } from "../../domain/export"
import { meta, type CashDocument, type FicClientSnapshot, type Quote, type QuoteItem, type QuoteSubItem, type ReusableSubItem, type SubItemDefinition, type VariantGroup } from "../../domain/model"
import { refreshQuote, snapshotProfile } from "../../domain/refresh"
import { applyVariantSelections, changeVariant, validateVariantGroups } from "../../domain/variants"
import type { AppState } from "../state"
import type { DeleteTarget } from "../types"

export interface TravelInput {
  description: string
  siteId: string
  vehicleId: string
  roundTrip: boolean
  occurrences: number
  timeMode: "automatic" | "manual"
  manualMinutesPerOccurrence?: number
}

export type SimpleSubInput =
  | { kind: "time"; description: string; minutes: number }
  | { kind: "expense"; description: string; amount: string }

interface TravelContext { siteId?: string; vehicleId?: string }

export function useQuoteController({ doc, appState, activeQuoteId, setActiveQuoteId, requestDelete }: {
  doc: CashDocument
  appState: AppState
  activeQuoteId?: string
  setActiveQuoteId: (id?: string) => void
  requestDelete: (target: DeleteTarget) => void
}) {
  const [clientResults, setClientResults] = useState<FicClientSnapshot[]>([])
  const quote = doc.quotes.find((candidate) => candidate.id === activeQuoteId)

  const materializeTravel = async (definition: Extract<SubItemDefinition, { kind: "travel" }> | TravelInput, targetQuote: Quote, context?: TravelContext): Promise<QuoteSubItem | undefined> => {
    const siteId = "siteId" in definition ? definition.siteId : context?.siteId
    const vehicleId = "vehicleId" in definition ? definition.vehicleId : context?.vehicleId
    const site = doc.sites.find((entry) => entry.id === siteId)
    const vehicle = doc.vehicles.find((entry) => entry.id === vehicleId)
    const profile = doc.profiles.find((entry) => entry.id === targetQuote.profileId)
    if (!doc.settings.fuelTerritory || !site || !vehicle) {
      appState.setError({ code: "MISSING_DATA", message: "La trasferta non può essere calcolata.", action: "Seleziona una Sede e un Veicolo e configura il territorio MIMIT." })
      return undefined
    }
    const fuel = await window.cash.mimit.latestFuelPrice({ territory: doc.settings.fuelTerritory, fuel: vehicle.fuel })
    if (!fuel.ok) { appState.setError(fuel.error); return undefined }
    const vehicleCost = calculateVehicleCost(vehicle, fuel.value)
    if (!vehicleCost.ok) { appState.setError(vehicleCost.error); return undefined }
    const manualMinutes = definition.timeMode === "manual" ? definition.manualMinutesPerOccurrence : undefined
    const calculated = calculateTravel({
      oneWayKm: site.oneWayKm, roundTrip: definition.roundTrip, occurrences: definition.occurrences,
      vehicleCostPerKm: vehicleCost.value.costPerKm,
      ...(manualMinutes ? { manualMinutesPerOccurrence: manualMinutes } : { speedKmh: profile?.capacity.travelSpeedKmh }),
    })
    if (!calculated.ok) { appState.setError(calculated.error); return undefined }
    return {
      ...meta(), kind: "travel", description: definition.description,
      site: { sourceId: site.id, name: site.name, address: site.address, ...(site.oneWayKm !== undefined ? { oneWayKm: site.oneWayKm } : {}) },
      vehicleId: vehicle.id, roundTrip: definition.roundTrip, occurrences: definition.occurrences, timeMode: definition.timeMode,
      ...(manualMinutes ? { manualMinutesPerOccurrence: manualMinutes } : {}),
      ...calculated.value, vehicleCostPerKm: vehicleCost.value.costPerKm, fuelEvidence: fuel.value,
    }
  }

  const newQuote = () => {
    const profile = [...doc.profiles].sort((a, b) => b.year - a.year).find((entry) => entry.confirmed)
    const snapshot = profile ? snapshotProfile(profile, doc.businessCosts) : undefined
    const created: Quote = { ...meta(), date: new Date().toISOString().slice(0, 10), ...(profile ? { profileId: profile.id } : {}), ...(snapshot?.ok ? { profileSnapshot: snapshot.value } : {}), items: [], snapshotRevision: 0, exportAttempts: [] }
    appState.mutate((document) => document.quotes.push(created))
    setActiveQuoteId(created.id)
  }

  const updateQuote = (updates: { date?: string; profileId?: string; mainSiteId?: string; commission?: string }, allowYearMismatch = false): "updated" | "year-mismatch" | "invalid" => {
    if (!quote) return "invalid"
    const date = updates.date ?? quote.date
    const profileId = updates.profileId === undefined ? quote.profileId : updates.profileId || undefined
    const profile = doc.profiles.find((entry) => entry.id === profileId)
    if (profile && profile.year !== Number(date.slice(0, 4)) && !allowYearMismatch) return "year-mismatch"
    const snapshot = profile ? snapshotProfile(profile, doc.businessCosts) : undefined
    if (profile && !snapshot?.ok) { appState.setError(snapshot?.error ?? { code: "MISSING_DATA", message: "Il profilo selezionato non è calcolabile." }); return "invalid" }
    const siteId = updates.mainSiteId === undefined ? quote.mainSite?.sourceId : updates.mainSiteId || undefined
    const site = doc.sites.find((entry) => entry.id === siteId)
    appState.mutate((document) => {
      const target = document.quotes.find((entry) => entry.id === quote.id)!
      target.date = date; target.profileId = profile?.id; target.profileSnapshot = snapshot?.ok ? snapshot.value : undefined
      target.mainSite = site ? { sourceId: site.id, name: site.name, address: site.address, ...(site.oneWayKm !== undefined ? { oneWayKm: site.oneWayKm } : {}) } : undefined
      if (updates.commission !== undefined) target.commission = updates.commission ? Number(updates.commission).toFixed(2) : undefined
    })
    return "updated"
  }

  const searchRemoteClients = async (query: string) => {
    const companyId = doc.settings.fic.company?.id
    if (!doc.settings.fic.enabled || !companyId) { appState.setError({ code: "MISSING_DATA", source: "FattureInCloud", message: "Fatture in Cloud non è attivo.", action: "Completa la configurazione nelle Impostazioni oppure usa un Cliente locale." }); return }
    const result = await window.cash.fic.searchClients({ companyId, query })
    if (!result.ok) { appState.setError(result.error); return }
    setClientResults(result.value)
  }

  const addItem = (name: string) => {
    if (!quote || !name.trim()) return
    appState.mutate((document) => document.quotes.find((entry) => entry.id === quote.id)!.items.push({ ...meta(), name: name.trim(), subItems: [], variantGroups: [], variantSelections: [] }))
  }

  const renameItem = (itemId: string, name: string) => {
    if (!quote || !name.trim()) return
    appState.mutate((document) => { const item = document.quotes.find((entry) => entry.id === quote.id)!.items.find((entry) => entry.id === itemId)!; item.name = name.trim(); item.updatedAt = new Date().toISOString() })
  }

  const updatePrices = (itemId: string, chosenPrice: string, referenceAmount: string, referencePeriod: string) => {
    if (!quote) return
    appState.mutate((document) => {
      const item = document.quotes.find((entry) => entry.id === quote.id)!.items.find((entry) => entry.id === itemId)!
      item.chosenPrice = chosenPrice ? Number(chosenPrice).toFixed(2) : undefined
      item.referencePrice = referenceAmount && referencePeriod ? { amount: Number(referenceAmount).toFixed(2), period: referencePeriod } : undefined
    })
  }

  const saveSimpleSub = (itemId: string, input: SimpleSubInput, subId?: string) => {
    if (!quote || !input.description.trim()) return false
    if (input.kind === "time" && (!Number.isFinite(input.minutes) || input.minutes <= 0)) {
      appState.setError({ code: "VALIDATION", field: "minutes", message: "La durata deve essere maggiore di zero." })
      return false
    }
    if (input.kind === "expense" && (!Number.isFinite(Number(input.amount)) || Number(input.amount) < 0)) {
      appState.setError({ code: "VALIDATION", field: "amount", message: "L’importo della spesa non è valido." })
      return false
    }
    appState.mutate((document) => {
      const item = document.quotes.find((entry) => entry.id === quote.id)!.items.find((entry) => entry.id === itemId)!
      const existing = item.subItems.find((entry) => entry.id === subId)
      if (existing && input.kind === "time" && existing.kind === "time") {
        existing.description = input.description.trim(); existing.minutes = input.minutes
        if (existing.variantOwner) existing.manuallyModified = true
        existing.updatedAt = new Date().toISOString()
      } else if (existing && input.kind === "expense" && existing.kind === "expense") {
        existing.description = input.description.trim(); existing.amount = Number(input.amount).toFixed(2)
        if (existing.variantOwner) existing.manuallyModified = true
        existing.updatedAt = new Date().toISOString()
      } else item.subItems.push(input.kind === "time" ? { ...meta(), kind: "time", description: input.description.trim(), minutes: input.minutes } : { ...meta(), kind: "expense", description: input.description.trim(), amount: Number(input.amount).toFixed(2) })
    })
    return true
  }

  const saveTravel = async (itemId: string, input: TravelInput, subId?: string) => {
    if (!quote) return false
    const built = await materializeTravel(input, quote)
    if (!built) return false
    appState.mutate((document) => {
      const item = document.quotes.find((entry) => entry.id === quote.id)!.items.find((entry) => entry.id === itemId)!
      const index = item.subItems.findIndex((entry) => entry.id === subId)
      if (index >= 0) {
        const previous = item.subItems[index]!
        item.subItems[index] = { ...built, id: previous.id, createdAt: previous.createdAt, updatedAt: new Date().toISOString(), ...(previous.variantOwner ? { variantOwner: previous.variantOwner, manuallyModified: true } : {}) }
      } else item.subItems.push(built)
    })
    return true
  }

  const addReusable = async (itemId: string, reusable: ReusableSubItem, context?: TravelContext) => {
    if (!quote) return false
    let sub: QuoteSubItem | undefined
    if (reusable.kind === "time") sub = { ...meta(), kind: "time", description: reusable.description, minutes: reusable.minutes }
    else if (reusable.kind === "expense") sub = { ...meta(), kind: "expense", description: reusable.description, amount: reusable.amount }
    else sub = await materializeTravel(reusable, quote, context)
    if (!sub) return false
    appState.mutate((document) => document.quotes.find((entry) => entry.id === quote.id)!.items.find((entry) => entry.id === itemId)!.subItems.push(sub!))
    return true
  }

  const saveSubToCatalog = (itemId: string, subId: string) => {
    const sub = quote?.items.find((item) => item.id === itemId)?.subItems.find((entry) => entry.id === subId)
    if (sub) appState.mutate((document) => document.catalog.subItems.push(reusableFromQuoteSubItem(sub)))
  }

  const switchVariant = async (itemId: string, groupId: string, optionId: string, context: TravelContext, force: boolean) => {
    if (!quote) return false
    const item = quote.items.find((entry) => entry.id === itemId)
    const option = item?.variantGroups.find((entry) => entry.id === groupId)?.options.find((entry) => entry.id === optionId)
    if (!item || !option) return false
    const queue: QuoteSubItem[] = []
    for (const definition of option.subItems) if (definition.kind === "travel") { const travel = await materializeTravel(definition, quote, context); if (!travel) return false; queue.push(travel) }
    const result = changeVariant(item, groupId, optionId, force, { materializeTravel: () => { const travel = queue.shift(); return travel ? { ok: true, value: travel } : { ok: false, error: { code: "MISSING_DATA", message: "Dati della trasferta non disponibili." } } } })
    if (!result.ok) { appState.setError(result.error); return false }
    appState.mutate((document) => Object.assign(document.quotes.find((entry) => entry.id === quote.id)!.items.find((entry) => entry.id === itemId)!, result.value))
    return true
  }

  const saveVariantGroup = async (itemId: string, group: VariantGroup, selectedOptionId: string, context: TravelContext, force: boolean) => {
    if (!quote) return false
    const source = quote.items.find((entry) => entry.id === itemId)
    if (!source) return false
    const draft = structuredClone(source)
    const index = draft.variantGroups.findIndex((entry) => entry.id === group.id)
    if (index >= 0) draft.variantGroups[index] = group
    else draft.variantGroups.push(group)
    const validation = validateVariantGroups(draft.variantGroups)
    if (!validation.ok) { appState.setError(validation.error); return false }
    const option = group.options.find((entry) => entry.id === selectedOptionId)
    if (!option) { appState.setError({ code: "MISSING_DATA", message: "Scegli l’opzione iniziale del gruppo variante." }); return false }
    const queue: QuoteSubItem[] = []
    for (const definition of option.subItems) if (definition.kind === "travel") { const travel = await materializeTravel(definition, quote, context); if (!travel) return false; queue.push(travel) }
    const result = changeVariant(draft, group.id, option.id, force, { materializeTravel: () => { const travel = queue.shift(); return travel ? { ok: true, value: travel } : { ok: false, error: { code: "MISSING_DATA", message: "Dati della trasferta non disponibili." } } } })
    if (!result.ok) { appState.setError(result.error); return false }
    appState.mutate((document) => Object.assign(document.quotes.find((entry) => entry.id === quote.id)!.items.find((entry) => entry.id === itemId)!, result.value))
    return true
  }

  const insertTemplate = async (templateId: string, choices: Record<string, string>, context: TravelContext) => {
    if (!quote) return false
    const sourceTemplate = doc.catalog.templates.find((entry) => entry.id === templateId)
    if (!sourceTemplate) return false
    // The dialog returns IDs from the catalog template. Cloning deliberately
    // regenerates every group/option ID, so preserve the user's choices by
    // position and resolve them against the cloned identities below.
    const selectedOptionIndexes = sourceTemplate.items.map((item) => item.variantGroups.map((group) => {
      const selectedId = choices[group.id] || group.defaultOptionId
      return group.options.findIndex((option) => option.id === selectedId)
    }))
    const template = cloneTemplate(sourceTemplate)
    const prepared: QuoteItem[] = []
    for (const [itemIndex, source] of template.items.entries()) {
      const item: QuoteItem = { ...meta(), name: source.name, subItems: [], variantGroups: source.variantGroups, variantSelections: [], ...(source.referencePrice ? { referencePrice: { ...source.referencePrice } } : {}) }
      for (const reusable of source.subItems) {
        if (reusable.kind === "time") item.subItems.push({ ...meta(), kind: "time", description: reusable.description, minutes: reusable.minutes })
        else if (reusable.kind === "expense") item.subItems.push({ ...meta(), kind: "expense", description: reusable.description, amount: reusable.amount })
        else { const travel = await materializeTravel(reusable, quote, context); if (!travel) return false; item.subItems.push(travel) }
      }
      const resolved: Record<string, string> = {}
      const queue: QuoteSubItem[] = []
      for (const [groupIndex, group] of item.variantGroups.entries()) {
        const optionIndex = selectedOptionIndexes[itemIndex]?.[groupIndex] ?? -1
        const option = optionIndex >= 0 ? group.options[optionIndex] : undefined
        if (!option) { appState.setError({ code: "MISSING_DATA", message: `Scegli un’opzione per ${group.name}.` }); return false }
        resolved[group.id] = option.id
        for (const definition of option.subItems) if (definition.kind === "travel") { const travel = await materializeTravel(definition, quote, context); if (!travel) return false; queue.push(travel) }
      }
      const applied = applyVariantSelections(item, resolved, { materializeTravel: () => { const travel = queue.shift(); return travel ? { ok: true, value: travel } : { ok: false, error: { code: "MISSING_DATA", message: "Dati della trasferta non disponibili." } } } })
      if (!applied.ok) { appState.setError(applied.error); return false }
      prepared.push(applied.value)
    }
    appState.mutate((document) => document.quotes.find((entry) => entry.id === quote.id)!.items.push(...prepared))
    return true
  }

  const saveTemplate = (name: string, itemIds: string[]) => {
    if (!quote) return false
    const items = quote.items.filter((item) => itemIds.includes(item.id))
    const built = templateFromQuote(name, items)
    if (!built.ok) { appState.setError(built.error); return false }
    appState.mutate((document) => document.catalog.templates.push(built.value))
    return true
  }

  const performRefresh = async () => {
    if (!quote) return false
    const result = await refreshQuote(quote, {
      profileById: (id) => doc.profiles.find((entry) => entry.id === id), costs: doc.businessCosts,
      siteById: (id) => doc.sites.find((entry) => entry.id === id), vehicleById: (id) => doc.vehicles.find((entry) => entry.id === id),
      fuel: (vehicle) => doc.settings.fuelTerritory ? window.cash.mimit.latestFuelPrice({ territory: doc.settings.fuelTerritory, fuel: vehicle.fuel }) : Promise.resolve({ ok: false, error: { code: "MISSING_DATA", field: "fuelTerritory", message: "Regione MIMIT non configurata." } }),
      foi: (amount, period) => window.cash.istat.revalue({ amount, fromPeriod: period }),
    })
    if (!result.ok) { appState.setError(result.error); return false }
    appState.mutate((document) => { document.quotes[document.quotes.findIndex((entry) => entry.id === quote.id)] = result.value })
    return true
  }

  const performExport = async (client: FicClientSnapshot, groups: Array<{ itemIds: string[]; description: string }>) => {
    if (!quote) return false
    const fic = doc.settings.fic
    if (!fic.enabled || !fic.company || !fic.product) { appState.setError({ code: "MISSING_DATA", source: "FattureInCloud", message: "Fatture in Cloud non è configurato.", action: "Completa la procedura guidata nelle Impostazioni." }); return false }
    const product = await window.cash.fic.verifyProduct({ companyId: fic.company.id, productId: fic.product.id })
    if (!product.ok) { appState.setError(product.error); return false }
    const exportSnapshot = { ...quote, client }
    const built = buildExportLines(exportSnapshot, groups, fic.company.id)
    if (!built.ok) { appState.setError(built.error); return false }
    if (quote.client?.source !== "fatture_in_cloud" || quote.client.clientId !== client.clientId) {
      appState.mutate((document) => { document.quotes.find((entry) => entry.id === quote.id)!.client = client })
      await appState.save()
      if (appState.status !== "Salvato") return false
    }
    const attempt = createPendingAttempt(fic.company.id, built.value)
    appState.mutate((document) => document.quotes.find((entry) => entry.id === quote.id)!.exportAttempts.push(attempt))
    await appState.save()
    if (appState.status !== "Salvato") return false
    const sent = await window.cash.fic.exportQuote({ companyId: fic.company.id, clientId: client.clientId, productId: fic.product.id, lines: built.value, attemptId: attempt.id })
    appState.mutate((document) => {
      const saved = document.quotes.find((entry) => entry.id === quote.id)!.exportAttempts.find((entry) => entry.id === attempt.id)!
      if (sent.ok) { saved.outcome = sent.value.outcome; saved.remoteDocumentId = sent.value.remoteDocumentId; saved.diagnostic = sent.value.diagnostic }
      else { saved.outcome = "uncertain"; saved.diagnostic = sent.error.message }
    })
    return sent.ok && sent.value.outcome === "success"
  }

  return {
    quote, clientResults, newQuote, updateQuote, searchRemoteClients, setClientResults, addItem, renameItem, updatePrices,
    saveSimpleSub, saveTravel, addReusable, saveSubToCatalog, switchVariant, saveVariantGroup, insertTemplate,
    saveTemplate, performRefresh, performExport, requestDelete,
  }
}
