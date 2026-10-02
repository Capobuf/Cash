import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { formReader } from "@/lib/format"

export function ItemNameDialog({ open, initial, title, onOpenChange, onSave }: { open: boolean; initial?: string; title: string; onOpenChange: (open: boolean) => void; onSave: (name: string) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><form onSubmit={(event) => { event.preventDefault(); onSave(formReader(event.currentTarget).get("name")) }} className="contents"><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader><Field><FieldLabel htmlFor="item-name">Nome voce</FieldLabel><Input id="item-name" name="name" defaultValue={initial} autoFocus required /></Field><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button><Button type="submit">Conferma</Button></DialogFooter></form></DialogContent></Dialog>
}
