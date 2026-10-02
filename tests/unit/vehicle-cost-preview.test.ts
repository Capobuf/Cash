import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  meta,
  ok,
  type FuelEvidence,
} from '../../src/domain/model';
import { ResourcesView } from '../../src/renderer/views/ResourcesView';
import { AppState } from '../../src/renderer/state';

const harness = vi.hoisted(() => ({
  calls: 0,
  previews: {} as unknown,
  check: undefined as (() => void) | undefined,
}));
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useState: (initial: unknown) => {
      if (++harness.calls === 2)
        return [
          harness.previews,
          (update: (value: unknown) => unknown) => {
            harness.previews = update(harness.previews);
          },
        ];
      return react.useState(initial);
    },
  };
});
vi.mock('@/components/ui/tabs', () => {
  const content = ({ children }: { children: ReactNode }) => children;
  return {
    Tabs: content,
    TabsContent: content,
    TabsList: content,
    TabsTrigger: content,
  };
});
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => {
    if (children === 'Verifica ora') harness.check = onClick;
    return children;
  },
}));

describe('verifica live del costo veicolo', () => {
  beforeEach(() => {
    harness.previews = {};
    harness.check = undefined;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('nasconde risultati obsoleti e consente nuove verifiche senza invalidare per il solo nome', async () => {
    const doc = createEmptyDocument();
    const vehicle = {
      ...meta(),
      name: 'Auto',
      fuel: 'Benzina' as const,
      consumption: '20',
      consumptionUnit: 'km/l' as const,
      annualKm: '10000',
      annualInsurance: '500',
      annualTax: '200',
      annualMaintenance: '300',
    };
    doc.vehicles.push(vehicle);
    doc.settings.fuelTerritory = 'Lazio';
    const fuel: FuelEvidence = {
      fuel: 'Benzina',
      mode: 'SELF',
      territory: 'Lazio',
      network: 'NON_AUTOSTRADALE',
      price: '1.900',
      priceUnit: 'EUR/l',
      referenceDate: '2026-10-01',
      acquiredAt: '2026-10-02T10:00:00Z',
    };
    const latestFuelPrice = vi.fn(async () => ok(fuel));
    vi.stubGlobal('window', { cash: { mimit: { latestFuelPrice } } });
    const appState = new AppState();
    const render = () => {
      harness.calls = 0;
      harness.check = undefined;
      return renderToStaticMarkup(
        createElement(ResourcesView, { doc, appState, requestDelete: vi.fn() }),
      );
    };
    expect(render()).not.toContain('MIMIT 01/10/2026');
    harness.check?.();
    await Promise.resolve();
    expect(render()).toContain('0.1950');
    expect(harness.check).toBeDefined();
    vehicle.name = 'Auto rinominata';
    expect(render()).toContain('0.1950');
    vehicle.consumption = '10';
    expect(render()).not.toContain('0.1950');
    harness.check?.();
    await Promise.resolve();
    expect(latestFuelPrice).toHaveBeenCalledTimes(2);
    expect(render()).toContain('0.2900');
    doc.settings.fuelTerritory = 'Lombardia';
    expect(render()).not.toContain('0.2900');
  });
});
