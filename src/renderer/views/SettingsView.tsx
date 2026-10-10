import {
  ArrowLeft,
  Database,
  MoreHorizontal,
  Plus,
  Settings2,
} from 'lucide-react';
import { useState } from 'react';
import { createManualProfile, type CashDocument } from '../../domain/model';
import { ProfileEditor } from '@/components/ProfileEditor';
import { IntegrationsSettings } from '@/components/integrations/IntegrationsSettings';
import {
  ficTaxProfileYear,
  type FicUiState,
} from '@/components/integrations/FicWizard';
import { ResourcesView } from './ResourcesView';
import { UpdatesPanel } from '@/components/UpdatesPanel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AppState } from '../state';
import type { DeleteTarget } from '../types';

export type { FicUiState } from '@/components/integrations/FicWizard';

export function SettingsView({
  doc,
  appState,
  ficUi,
  activeProfileId,
  onEditProfile,
  onCopyProfile,
  requestDelete,
}: {
  doc: CashDocument;
  appState: AppState;
  ficUi: FicUiState;
  activeProfileId?: string;
  onEditProfile: (id?: string) => void;
  onCopyProfile: (id: string) => void;
  requestDelete: (target: DeleteTarget) => void;
}) {
  const [tab, setTab] = useState('profiles');
  const [newProfileOpen, setNewProfileOpen] = useState(false);
  const profile = doc.profiles.find((entry) => entry.id === activeProfileId);
  const fic = doc.settings.fic;
  const createProfile = (year: number) => {
    if (
      !Number.isInteger(year) ||
      doc.profiles.some((entry) => entry.year === year)
    ) {
      appState.setError({
        code: 'CONFLICT',
        field: 'profile.year',
        message: `Non è possibile creare il profilo ${year}.`,
        action: 'Verifica che l’anno sia valido e non esista già.',
      });
      return;
    }
    const created = createManualProfile(year);
    if (!appState.mutate((document) => document.profiles.unshift(created)))
      return;
    setNewProfileOpen(false);
    onEditProfile(created.id);
  };

  return (
    <>
      <Tabs value={tab} onValueChange={setTab} className="space-y-5">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="profiles">Profili annuali</TabsTrigger>
          <TabsTrigger value="planning">Pianificazione</TabsTrigger>
          <TabsTrigger value="resources">
            Costi, trasferte e altre sedi
          </TabsTrigger>
          <TabsTrigger value="integrations">Integrazioni</TabsTrigger>
          <TabsTrigger value="archive">Archivio</TabsTrigger>
          <TabsTrigger value="application">Applicazione</TabsTrigger>
        </TabsList>

        <TabsContent value="profiles">
          {profile ? (
            <div className="space-y-3">
              <Button variant="ghost" onClick={() => onEditProfile(undefined)}>
                <ArrowLeft />
                Tutti i profili
              </Button>
              <ProfileEditor
                key={profile.id}
                profile={profile}
                doc={doc}
                appState={appState}
                onCopy={onCopyProfile}
              />
            </div>
          ) : (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Profili annuali</CardTitle>
                  <CardDescription>
                    Obiettivi, capacità e fiscalità condivisi da preventivazione
                    e analisi finanziaria.
                  </CardDescription>
                </div>
                <CardAction>
                  <Button onClick={() => setNewProfileOpen(true)}>
                    <Plus />
                    Nuovo profilo
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {doc.profiles.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Anno</TableHead>
                        <TableHead>Revisione</TableHead>
                        <TableHead>Stato</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...doc.profiles]
                        .sort((a, b) => b.year - a.year)
                        .map((entry) => {
                          const imported =
                            ficTaxProfileYear(fic.taxProfile?.acquiredAt) ===
                            entry.year;
                          return (
                            <TableRow key={entry.id}>
                              <TableCell className="font-medium">
                                {entry.year}
                              </TableCell>
                              <TableCell>{entry.revision}</TableCell>
                              <TableCell>
                                <div className="flex gap-1.5">
                                  <Badge
                                    variant={
                                      entry.confirmed ? 'default' : 'secondary'
                                    }
                                  >
                                    {entry.confirmed
                                      ? 'Confermato'
                                      : imported
                                        ? 'Da completare'
                                        : 'Da verificare'}
                                  </Badge>
                                  {imported ? (
                                    <Badge variant="outline">
                                      Fatture in Cloud
                                    </Badge>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`Azioni profilo ${entry.year}`}
                                      />
                                    }
                                  >
                                    <MoreHorizontal />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => onEditProfile(entry.id)}
                                    >
                                      Apri editor
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => onCopyProfile(entry.id)}
                                    >
                                      Copia per nuovo anno
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onClick={() =>
                                        requestDelete({
                                          kind: 'profile',
                                          id: entry.id,
                                          label: `Profilo ${entry.year}`,
                                        })
                                      }
                                    >
                                      Elimina
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="grid min-h-56 place-items-center rounded-lg border border-dashed text-center">
                    <div>
                      <p className="font-medium">Nessun profilo annuale</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Crea un profilo per calcolare il valore medio da
                        generare.
                      </p>
                      <Button
                        className="mt-4"
                        size="sm"
                        onClick={() => setNewProfileOpen(true)}
                      >
                        Nuovo profilo
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="planning">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Pianificazione generale</CardTitle>
                <CardDescription>
                  Dati condivisi usati dalle fonti correnti.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Field className="max-w-lg">
                <FieldLabel htmlFor="fuel-territory">
                  Regione / provincia autonoma MIMIT
                </FieldLabel>
                <Input
                  id="fuel-territory"
                  defaultValue={doc.settings.fuelTerritory ?? ''}
                  placeholder="es. Lazio"
                  onBlur={(event) => {
                    const value = event.currentTarget.value.trim() || undefined;
                    if (value !== doc.settings.fuelTerritory)
                      appState.mutate((document) => {
                        document.settings.fuelTerritory = value;
                      });
                  }}
                />
                <FieldDescription>
                  Usata per il prezzo carburante. La modalità SELF/SERVITO
                  deriva dal tipo di carburante.
                </FieldDescription>
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources">
          <ResourcesView
            doc={doc}
            appState={appState}
            requestDelete={requestDelete}
          />
        </TabsContent>

        <IntegrationsSettings doc={doc} appState={appState} ficUi={ficUi} />

        <TabsContent value="application">
          <UpdatesPanel appState={appState} />
        </TabsContent>

        <TabsContent value="archive">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Archivio corrente</CardTitle>
                  <CardDescription>
                    Archivio SQLite locale dei dati di Cash.
                  </CardDescription>
                </div>
                <CardAction>
                  <Database className="size-5 text-muted-foreground" />
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row
                  label="File"
                  value={
                    (appState.session?.path ?? '').split(/[\\/]/).pop() ?? '—'
                  }
                />
                <Row label="Revisione" value={String(doc.revision)} />
                <Row label="Stato" value={appState.status} />
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => void appState.open()}
                  >
                    Apri altro archivio
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void appState.recovery()}
                  >
                    Copia di recupero
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Alert>
              <Settings2 />
              <AlertTitle>Archivio su disco locale</AlertTitle>
              <AlertDescription>
                Conserva l’archivio attivo fuori da Google Drive, OneDrive e
                condivisioni di rete. Puoi sincronizzare copie di recupero
                chiuse. Il passaggio fra postazioni tramite sincronizzazione del
                file attivo non è più supportato. Attendi “Salvato” prima di
                chiudere Cash.
              </AlertDescription>
            </Alert>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={newProfileOpen} onOpenChange={setNewProfileOpen}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              createProfile(
                Number(new FormData(event.currentTarget).get('year')),
              );
            }}
            className="contents"
          >
            <DialogHeader>
              <DialogTitle>Nuovo profilo annuale</DialogTitle>
              <DialogDescription>
                Il profilo nasce Da verificare e non abilita proiezioni fiscali
                finché non viene confermato.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="new-profile-year">Anno</FieldLabel>
              <Input
                id="new-profile-year"
                name="year"
                type="number"
                defaultValue={new Date().getFullYear()}
                min={2000}
                max={2200}
                autoFocus
                required
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewProfileOpen(false)}
              >
                Annulla
              </Button>
              <Button type="submit">Crea profilo</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <strong className="text-right font-medium">{value}</strong>
    </div>
  );
}
