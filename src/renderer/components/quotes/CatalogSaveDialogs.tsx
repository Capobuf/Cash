import { useState } from "react"
import { type Quote } from "../../../domain/model"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function SaveTemplateDialog({ quote, onClose, onSave }: { quote: Quote; onClose: () => void; onSave: (name: string, itemIds: string[]) => boolean }) {
  const [name, setName] = useState("")
  const [selected, setSelected] = useState(() => new Set(quote.items.map((item) => item.id)))
  const changed = quote.items.flatMap((item) => item.subItems.filter((sub) => sub.variantOwner && sub.manuallyModified).map((sub) => `${item.name} / ${sub.description}`))
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Salva come nuovo template</DialogTitle><DialogDescription>Viene sempre creata una nuova copia nel Catalogo; il preventivo e gli eventuali template di origine restano indipendenti.</DialogDescription></DialogHeader><Field><FieldLabel htmlFor="template-new-name">Nome template</FieldLabel><Input id="template-new-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus /></Field><div className="rounded-lg border"><div className="border-b px-4 py-3 text-sm font-medium">Voci da includere</div>{quote.items.map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-3 border-b p-3 last:border-0"><Checkbox checked={selected.has(item.id)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(item.id); else next.delete(item.id); return next })} /><span><span className="block text-sm font-medium">{item.name}</span><span className="text-xs text-muted-foreground">{item.subItems.filter((sub) => !sub.variantOwner).length} sempre inclusi · {item.variantGroups.length} varianti</span></span></label>)}</div>{changed.length ? <Alert><AlertTitle>Modifiche alle varianti incluse</AlertTitle><AlertDescription>Le modifiche manuali seguenti saranno applicate alla rispettiva opzione nella nuova copia: {changed.join(", ")}.</AlertDescription></Alert> : null}<DialogFooter><Button variant="outline" onClick={onClose}>Annulla</Button><Button disabled={!name.trim() || selected.size === 0} onClick={() => { if (onSave(name, [...selected])) onClose() }}>Crea template</Button></DialogFooter></DialogContent></Dialog>
}

export function SaveSubDialog({ description, onClose, onConfirm }: { description: string; onClose: () => void; onConfirm: () => void }) { return <AlertDialog open onOpenChange={(open) => { if (!open) onClose() }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Salvare nel Catalogo?</AlertDialogTitle><AlertDialogDescription>“{description}” diventerà una nuova copia indipendente e riutilizzabile. Le modifiche future non si propagheranno.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={onConfirm}>Crea copia nel Catalogo</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog> }
