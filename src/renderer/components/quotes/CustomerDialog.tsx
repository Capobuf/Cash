import { Search } from 'lucide-react';
import { useState } from 'react';
import {
  type CashDocument,
  type FicClientSnapshot,
  type Quote,
} from '../../../domain/model';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formReader } from '@/lib/format';
import { ChoiceButton } from './ChoiceButton';

export function CustomerDialog({
  open,
  onOpenChange,
  quote,
  doc,
  hasToken,
  results,
  onSearch,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote;
  doc: CashDocument;
  hasToken: boolean;
  results: FicClientSnapshot[];
  onSearch: (query: string) => Promise<void>;
  onSelect: (clientId: string | FicClientSnapshot) => boolean;
}) {
  const [searching, setSearching] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scegli cliente</DialogTitle>
          <DialogDescription>
            I clienti vengono recuperati in tempo reale dall’azienda Fatture in
            Cloud collegata.
          </DialogDescription>
        </DialogHeader>
        <ChoiceButton
          selected={!quote.client}
          title="Nessun cliente"
          detail="Puoi sceglierlo in seguito"
          onClick={() => {
            if (onSelect('')) onOpenChange(false);
          }}
        />
        {doc.settings.fic.enabled && hasToken && doc.settings.fic.company ? (
          <div className="space-y-3">
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                setSearching(true);
                void onSearch(
                  formReader(event.currentTarget).get('query'),
                ).finally(() => setSearching(false));
              }}
            >
              <InputGroup>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  name="query"
                  defaultValue={quote.client?.displayName ?? ''}
                  placeholder="Cerca cliente in Fatture in Cloud"
                />
              </InputGroup>
              <Button disabled={searching}>
                {searching ? 'Ricerca…' : 'Cerca'}
              </Button>
            </form>
            <ScrollArea className="h-72 rounded-lg border">
              <div className="p-2">
                {results.length ? (
                  results.map((client) => (
                    <ChoiceButton
                      key={client.clientId}
                      selected={
                        quote.client?.source === 'fatture_in_cloud' &&
                        quote.client.clientId === client.clientId
                      }
                      title={client.displayName}
                      detail={client.vatNumber ?? 'P.IVA non indicata'}
                      onClick={() => {
                        if (onSelect(client)) onOpenChange(false);
                      }}
                    />
                  ))
                ) : (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    Avvia una ricerca per caricare i clienti correnti.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <Alert>
            <AlertTitle>
              {doc.settings.fic.enabled && !hasToken
                ? 'Richiede configurazione locale'
                : 'Fatture in Cloud non è attivo'}
            </AlertTitle>
            <AlertDescription>
              {doc.settings.fic.enabled && !hasToken
                ? 'Collega questa postazione a Fatture in Cloud nelle Impostazioni per cercare un cliente. Lo snapshot già salvato resta disponibile.'
                : 'Attiva il collegamento nelle Impostazioni per recuperare e selezionare un cliente.'}
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
