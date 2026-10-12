import { Search } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { formReader } from '@/lib/format';
import { ChoiceButton } from './ChoiceButton';

export function CustomerDialog({
  open,
  onOpenChange,
  quote,
  doc,
  hasToken,
  results,
  searching = false,
  searchError = false,
  onSearch,
  hasMore = false,
  onLoadMore,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: Quote;
  doc: CashDocument;
  hasToken: boolean;
  results: FicClientSnapshot[];
  searching?: boolean;
  searchError?: boolean;
  onSearch: (query: string) => Promise<void>;
  hasMore?: boolean;
  onLoadMore?: () => Promise<void>;
  onSelect: (clientId: string | FicClientSnapshot) => boolean;
}) {
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
                void onSearch(formReader(event.currentTarget).get('query'));
              }}
            >
              <InputGroup>
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  name="query"
                  aria-label="Cerca cliente in Fatture in Cloud"
                  placeholder="Cerca cliente in Fatture in Cloud"
                />
              </InputGroup>
              <Button type="submit" disabled={searching}>
                {searching ? <Spinner aria-hidden="true" /> : null}
                {searching ? 'Ricerca…' : 'Cerca'}
              </Button>
            </form>
            <ScrollArea
              className="h-72 rounded-lg border"
              aria-busy={searching}
            >
              <div className="p-2">
                {searching && (!hasMore || results.length === 0) ? (
                  <div className="space-y-2">
                    <p role="status" className="sr-only">
                      Caricamento clienti…
                    </p>
                    {Array.from({ length: 4 }, (_, index) => (
                      <div
                        key={index}
                        className="space-y-2 rounded-lg border p-3"
                        aria-hidden="true"
                      >
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                    ))}
                  </div>
                ) : searchError && (!hasMore || results.length === 0) ? (
                  <Alert variant="destructive">
                    <AlertTitle>Ricerca clienti non riuscita</AlertTitle>
                    <AlertDescription>
                      Ripeti la ricerca per recuperare i clienti da Fatture in
                      Cloud.
                    </AlertDescription>
                  </Alert>
                ) : results.length ? (
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
                    Nessun cliente trovato.
                  </p>
                )}
              </div>
            </ScrollArea>
            {hasMore ? (
              <Button
                variant="outline"
                disabled={searching}
                onClick={() => {
                  void onLoadMore?.();
                }}
              >
                {searching ? 'Caricamento…' : 'Carica altri'}
              </Button>
            ) : null}
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
