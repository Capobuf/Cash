import type { FormEvent } from "react"
import { calculateItem } from "../../domain/calculations"
import type { CashDocument, QuoteItem } from "../../domain/model"
import { Analysis } from "@/components/Analysis"
import { MoneyField, Option, SelectField, Field } from "@/components/FormControls"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { eur, hours } from "@/lib/format"
import type { DeleteTarget } from "../types"

export interface QuoteItemActions {
  rename: (item: QuoteItem) => void
  savePrices: (item: QuoteItem, form: HTMLFormElement) => void
  editSub: (itemId: string, subId: string) => void
  saveSub: (itemId: string, subId: string) => void
  changeVariant: (itemId: string, groupId: string, optionId: string) => void
  addTimeOrExpense: (kind: "time" | "expense", itemId: string) => void
  addTravel: (itemId: string) => void
  addCatalog: (itemId: string) => void
  addVariant: (itemId: string) => void
  requestDelete: (target: DeleteTarget) => void
}

export function QuoteItemCard({ item, hourly, doc, actions }: { item: QuoteItem; hourly?: string; doc: CashDocument; actions: QuoteItemActions }) {
  const analysis = hourly ? calculateItem(item, hourly) : undefined
  const savePrices = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); actions.savePrices(item, event.currentTarget) }
  return (
    <Card className="card full item">
      <CardHeader className="section-heading"><div><CardTitle>{item.name}</CardTitle><Badge variant="secondary">{item.subItems.length} sottovoci</Badge></div><div className="row-actions"><Button variant="secondary" size="sm" onClick={() => actions.rename(item)}>Rinomina</Button><Button variant="destructive" size="sm" onClick={() => actions.requestDelete({ kind: "item", id: item.id, label: item.name })}>Elimina</Button></div></CardHeader>
      <CardContent>
        <form className="form-grid" onSubmit={savePrices}><MoneyField label="Prezzo scelto" name="chosenPrice" value={item.chosenPrice ?? ""} /><MoneyField label="Prezzo di riferimento" name="referenceAmount" value={item.referencePrice?.amount ?? ""} /><Field label="Mese riferimento" name="referencePeriod" value={item.referencePrice?.period ?? ""} type="month" /><Button type="submit">Aggiorna prezzi</Button></form>
        {item.referencePrice?.foiEvidence ? <div className="notice section-list">Rivalutato: <strong>{eur(item.referencePrice.foiEvidence.revaluedAmount)}</strong> · {item.referencePrice.foiEvidence.fromPeriod} → {item.referencePrice.foiEvidence.toPeriod} · basi {item.referencePrice.foiEvidence.fromBase} / {item.referencePrice.foiEvidence.toBase} · acquisito {item.referencePrice.foiEvidence.acquiredAt}</div> : null}
        <div className="list section-list">{item.subItems.length ? item.subItems.map((sub) => <div className="row" key={sub.id}><div><div className="row-title">{sub.description}</div><div className="row-detail">{sub.kind === "time" ? `${sub.minutes} min` : sub.kind === "expense" ? eur(sub.amount) : `${sub.totalDistanceKm} km · ${hours(sub.totalMinutes)} · ${eur(sub.totalCost)}`}{sub.variantOwner ? " · variante" : ""}</div></div><div className="row-actions"><Button variant="secondary" size="sm" onClick={() => actions.editSub(item.id, sub.id)}>Modifica</Button><Button variant="secondary" size="sm" onClick={() => actions.saveSub(item.id, sub.id)}>Salva nel catalogo</Button><Button variant="destructive" size="icon-sm" aria-label={`Elimina ${sub.description}`} onClick={() => actions.requestDelete({ kind: "sub", id: `${item.id}:${sub.id}`, label: sub.description })}>×</Button></div></div>) : <div className="empty">La voce richiede tempo positivo per essere calcolabile.</div>}</div>
        {item.variantGroups.map((group) => <SelectField key={group.id} className="variant-field" label={group.name} name={`variant-${group.id}`} value={item.variantSelections.find((selection) => selection.groupId === group.id)?.optionId} onChange={(event) => actions.changeVariant(item.id, group.id, event.target.value)}>{group.options.map((option) => <Option key={option.id} value={option.id}>{option.name}</Option>)}</SelectField>)}
        <div className="tabs"><Button variant="secondary" size="sm" onClick={() => actions.addTimeOrExpense("time", item.id)}>+ Tempo</Button><Button variant="secondary" size="sm" onClick={() => actions.addTimeOrExpense("expense", item.id)}>+ Spesa</Button><Button variant="secondary" size="sm" onClick={() => actions.addTravel(item.id)}>+ Trasferta</Button><Button variant="secondary" size="sm" disabled={!doc.catalog.subItems.length} onClick={() => actions.addCatalog(item.id)}>+ Dal catalogo</Button><Button variant="secondary" size="sm" onClick={() => actions.addVariant(item.id)}>+ Variante</Button></div>
        {analysis ? <Analysis value={analysis} /> : null}
      </CardContent>
    </Card>
  )
}
