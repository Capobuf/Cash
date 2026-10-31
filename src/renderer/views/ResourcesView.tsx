import { DataTable } from '@/components/ui/data-table';
import {
  Building2,
  Car,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Star,
} from 'lucide-react';
import { useState } from 'react';
import { calculateVehicleCost } from '../../domain/calculations';
import { annualPlannedBusinessCosts } from '../../domain/financial-analysis';
import { coordinatesInput } from '../../domain/locations';
import type { CashDocument, Vehicle } from '../../domain/model';
import {
  CostDialog,
  SiteDialog,
  VehicleDialog,
} from '@/components/EntityDialogs';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { dateIt, eur, formatNumber } from '@/lib/format';
import type { AppState } from '../state';
import type { DeleteTarget } from '../types';

type Editor = { kind: 'cost' | 'vehicle' | 'site'; id?: string } | null;

function vehicleCostInputs(vehicle: Vehicle, territory?: string): string {
  return JSON.stringify([
    territory,
    vehicle.fuel,
    vehicle.consumption,
    vehicle.consumptionUnit,
    vehicle.annualKm,
    vehicle.annualInsurance,
    vehicle.annualTax,
    vehicle.annualMaintenance,
  ]);
}

export function ResourcesView({
  doc,
  appState,
  requestDelete,
}: {
  doc: CashDocument;
  appState: AppState;
  requestDelete: (target: DeleteTarget) => void;
}) {
  const [editor, setEditor] = useState<Editor>(null);
  const [vehicleCostPreviews, setVehicleCostPreviews] = useState<
    Record<
      string,
      {
        costPerKm: string;
        referenceDate: string;
        inputs: string;
        archiveContext: number;
      }
    >
  >({});
  const siteGroups = [
    {
      label: 'Sedi associate ai clienti',
      sites: doc.sites.filter((site) => site.client),
    },
    { label: 'Altre sedi', sites: doc.sites.filter((site) => !site.client) },
  ];
  const annualCosts = annualPlannedBusinessCosts(doc.businessCosts);

  const checkVehicleCost = async (id: string) => {
    const vehicle = doc.vehicles.find((entry) => entry.id === id);
    if (!vehicle || !doc.settings.fuelTerritory) {
      appState.setError({
        code: 'MISSING_DATA',
        message: 'Configura il territorio MIMIT.',
      });
      return;
    }
    const inputs = vehicleCostInputs(vehicle, doc.settings.fuelTerritory);
    const archiveContext = appState.archiveContext;
    const fuel = await window.cash.mimit.latestFuelPrice({
      territory: doc.settings.fuelTerritory,
      fuel: vehicle.fuel,
    });
    if (!fuel.ok) {
      appState.setError(fuel.error);
      return;
    }
    const result = calculateVehicleCost(vehicle, fuel.value);
    if (!result.ok) {
      appState.setError(result.error);
      return;
    }
    setVehicleCostPreviews((current) => ({
      ...current,
      [id]: {
        costPerKm: result.value.costPerKm,
        referenceDate: fuel.value.referenceDate,
        inputs,
        archiveContext,
      },
    }));
  };

  return (
    <>
      <Tabs defaultValue="costs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="costs">
            <ReceiptText />
            Costi aziendali
          </TabsTrigger>
          <TabsTrigger value="vehicles">
            <Car />
            Veicoli
          </TabsTrigger>
          <TabsTrigger value="sites">
            <Building2 />
            Sedi
          </TabsTrigger>
        </TabsList>

        <TabsContent value="costs">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Costi aziendali</CardTitle>
                <CardDescription>
                  Totale annuale: <strong>{eur(annualCosts)}</strong>.
                </CardDescription>
              </div>
              <CardAction>
                <Button onClick={() => setEditor({ kind: 'cost' })}>
                  <Plus />
                  Nuovo costo
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {doc.businessCosts.length ? (
                <DataTable
                  preferencesKey="business-costs"
                  data={doc.businessCosts}
                  getRowKey={(cost) => cost.id}
                  emptyMessage="Nessun risultato."
                  columns={[
                    {
                      id: 'category',
                      header: 'Categoria',
                      value: (cost) => cost.category,
                      cell: (cost) => (
                        <Badge variant="secondary">{cost.category}</Badge>
                      ),
                    },
                    {
                      id: 'description',
                      header: 'Descrizione',
                      value: (cost) => cost.description,
                      cell: (cost) => cost.description,
                    },
                    {
                      id: 'monthly',
                      header: 'Mensile',
                      value: (cost) => Number(cost.monthlyAmount),
                      cell: (cost) => eur(cost.monthlyAmount),
                    },
                    {
                      id: 'actions',
                      header: 'Azioni',
                      value: () => undefined,
                      sortable: false,
                      configurable: false,
                      cell: (cost) => (
                        <RowMenu
                          label={cost.description}
                          onEdit={() =>
                            setEditor({ kind: 'cost', id: cost.id })
                          }
                          onDelete={() =>
                            requestDelete({
                              kind: 'cost',
                              id: cost.id,
                              label: cost.description,
                            })
                          }
                        />
                      ),
                    },
                  ]}
                />
              ) : (
                <Empty
                  title="Nessun costo aziendale"
                  onAction={() => setEditor({ kind: 'cost' })}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vehicles">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Veicoli</CardTitle>
                <CardDescription>
                  Il predefinito viene proposto soltanto nelle nuove Trasferte.
                </CardDescription>
              </div>
              <CardAction>
                <Button onClick={() => setEditor({ kind: 'vehicle' })}>
                  <Plus />
                  Nuovo veicolo
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <AlertTitle>Evita duplicazioni</AlertTitle>
                <AlertDescription>
                  Assicurazione, bollo e manutenzione non vanno duplicati nei
                  costi aziendali.
                </AlertDescription>
              </Alert>
              {doc.vehicles.length ? (
                <DataTable
                  preferencesKey="vehicles"
                  data={doc.vehicles.map((vehicle) => {
                    const savedPreview = vehicleCostPreviews[vehicle.id];
                    const preview =
                      savedPreview?.inputs ===
                        vehicleCostInputs(
                          vehicle,
                          doc.settings.fuelTerritory,
                        ) &&
                      savedPreview.archiveContext === appState.archiveContext
                        ? savedPreview
                        : undefined;
                    return { ...vehicle, preview };
                  })}
                  getRowKey={(vehicle) => vehicle.id}
                  emptyMessage={'Nessun risultato.'}
                  columns={[
                    {
                      id: 'name',
                      header: 'Veicolo',
                      value: (vehicle) => vehicle.name,
                      cell: (vehicle) => (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{vehicle.name}</span>
                          <DefaultStar
                            selected={
                              doc.settings.defaultVehicleId === vehicle.id
                            }
                            label={`Veicolo predefinito: ${vehicle.name}`}
                            onClick={() =>
                              appState.mutate((document) => {
                                document.settings.defaultVehicleId =
                                  document.settings.defaultVehicleId ===
                                  vehicle.id
                                    ? undefined
                                    : vehicle.id;
                              })
                            }
                          />
                        </div>
                      ),
                    },
                    {
                      id: 'consumption',
                      header: 'Consumo',
                      value: (vehicle) => Number(vehicle.consumption),
                      cell: (vehicle) => (
                        <>
                          {formatNumber(vehicle.consumption, 2)}{' '}
                          {vehicle.consumptionUnit}
                        </>
                      ),
                    },
                    {
                      id: 'cost',
                      header: 'Costo/km',
                      value: (vehicle) =>
                        vehicle.preview
                          ? Number(vehicle.preview.costPerKm)
                          : undefined,
                      cell: (vehicle) => (
                        <>
                          {vehicle.preview ? (
                            <>
                              {vehicle.preview.costPerKm} €/km{' '}
                              <span className="text-xs text-muted-foreground">
                                MIMIT {dateIt(vehicle.preview.referenceDate)}
                              </span>
                            </>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void checkVehicleCost(vehicle.id)}
                          >
                            Verifica ora
                          </Button>
                        </>
                      ),
                    },
                    {
                      id: 'actions',
                      header: 'Azioni',
                      value: () => undefined,
                      sortable: false,
                      configurable: false,
                      cell: (vehicle) => (
                        <RowMenu
                          label={vehicle.name}
                          onEdit={() =>
                            setEditor({ kind: 'vehicle', id: vehicle.id })
                          }
                          onDelete={() =>
                            requestDelete({
                              kind: 'vehicle',
                              id: vehicle.id,
                              label: vehicle.name,
                            })
                          }
                        />
                      ),
                    },
                  ]}
                />
              ) : (
                <Empty
                  title="Nessun veicolo"
                  onAction={() => setEditor({ kind: 'vehicle' })}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sites">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Sedi Cash</CardTitle>
                <CardDescription>
                  Gestione locale di tutte le Sedi. I riferimenti cliente
                  salvati non sono dati live FIC.
                </CardDescription>
              </div>
              <CardAction>
                <Button onClick={() => setEditor({ kind: 'site' })}>
                  <Plus />
                  Nuova sede
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="space-y-6">
              {siteGroups.map(({ label, sites }) => (
                <section key={label} className="space-y-3">
                  <h3 className="font-medium">{label}</h3>
                  {sites.length ? (
                    <DataTable
                      preferencesKey={`sites:${label}`}
                      data={sites}
                      getRowKey={(site) => site.id}
                      emptyMessage={'Nessun risultato.'}
                      columns={[
                        {
                          id: 'name',
                          header: 'Nome',
                          value: (site) => site.name,
                          cell: (site) => (
                            <div className="flex items-center gap-1">
                              <span className="font-medium">{site.name}</span>
                              <DefaultStar
                                selected={
                                  doc.settings.defaultDepartureSiteId ===
                                  site.id
                                }
                                label={`Partenza predefinita: ${site.name}`}
                                onClick={() =>
                                  appState.mutate((document) => {
                                    document.settings.defaultDepartureSiteId =
                                      document.settings
                                        .defaultDepartureSiteId === site.id
                                        ? undefined
                                        : site.id;
                                  })
                                }
                              />
                            </div>
                          ),
                        },
                        {
                          id: 'client',
                          header: 'Cliente (riferimento salvato)',
                          value: (site) =>
                            site.client?.displayName ?? 'Nessuno',
                          cell: (site) => site.client?.displayName ?? 'Nessuno',
                        },
                        {
                          id: 'address',
                          header: 'Indirizzo',
                          value: (site) => site.address,
                          cell: (site) => site.address ?? 'Non indicato',
                        },
                        {
                          id: 'coordinates',
                          header: 'Coordinate',
                          value: (site) =>
                            site.location
                              ? coordinatesInput(site.location.coordinates)
                              : undefined,
                          cell: (site) =>
                            site.location
                              ? coordinatesInput(site.location.coordinates)
                              : 'Da localizzare',
                        },
                        {
                          id: 'actions',
                          header: 'Azioni',
                          value: () => undefined,
                          sortable: false,
                          configurable: false,
                          cell: (site) => (
                            <RowMenu
                              label={site.name}
                              onEdit={() =>
                                setEditor({ kind: 'site', id: site.id })
                              }
                              onDelete={() =>
                                requestDelete({
                                  kind: 'site',
                                  id: site.id,
                                  label: site.name,
                                })
                              }
                            />
                          ),
                        },
                      ]}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nessuna sede in questo gruppo.
                    </p>
                  )}
                </section>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CostDialog
        open={editor?.kind === 'cost'}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        appState={appState}
        cost={
          editor?.kind === 'cost'
            ? doc.businessCosts.find((entry) => entry.id === editor.id)
            : undefined
        }
      />
      <VehicleDialog
        open={editor?.kind === 'vehicle'}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        appState={appState}
        vehicle={
          editor?.kind === 'vehicle'
            ? doc.vehicles.find((entry) => entry.id === editor.id)
            : undefined
        }
      />
      <SiteDialog
        open={editor?.kind === 'site'}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        appState={appState}
        doc={doc}
        site={
          editor?.kind === 'site'
            ? doc.sites.find((entry) => entry.id === editor.id)
            : undefined
        }
      />
    </>
  );
}

function DefaultStar({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={selected}
            onClick={onClick}
            className={
              selected
                ? 'text-primary hover:text-primary'
                : 'text-muted-foreground'
            }
          />
        }
      >
        <Star
          aria-hidden="true"
          className={selected ? 'fill-current' : undefined}
        />
      </TooltipTrigger>
      <TooltipContent>
        {selected ? 'Rimuovi predefinito' : 'Imposta come predefinito'}
      </TooltipContent>
    </Tooltip>
  );
}

function RowMenu({
  label,
  onEdit,
  onDelete,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Azioni per ${label}`}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>Modifica</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          Elimina
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Empty({ title, onAction }: { title: string; onAction: () => void }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-lg border border-dashed text-center">
      <div>
        <p>{title}</p>
        <Button className="mt-3" size="sm" onClick={onAction}>
          <Plus />
          Aggiungi
        </Button>
      </div>
    </div>
  );
}
