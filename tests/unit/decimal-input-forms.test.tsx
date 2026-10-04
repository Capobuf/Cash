import {
  Children,
  createElement,
  isValidElement,
  type FormEvent,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyDocument,
  createFiscalPreset2026,
  meta,
  type CashDocument,
  type Template,
} from '../../src/domain/model';
import { ProfileEditor } from '../../src/renderer/components/ProfileEditor';
import {
  CostDialog,
  VehicleDialog,
} from '../../src/renderer/components/EntityDialogs';
import { ReusableDialog } from '../../src/renderer/components/catalog/ReusableDialog';
import { TemplateWorkspace } from '../../src/renderer/components/catalog/TemplateWorkspace';
import { DefinitionDialog } from '../../src/renderer/components/quotes/DefinitionDialog';
import { SubItemDialog } from '../../src/renderer/components/quotes/SubItemDialog';
import { AppState } from '../../src/renderer/state';

const harness = vi.hoisted(() => ({
  submit: undefined as
    ((event: FormEvent<HTMLFormElement>) => unknown) | undefined,
  saveTemplate: undefined as (() => void) | undefined,
  values: {} as Record<string, string>,
}));
const captureForm = ({ children }: { children: ReactNode }) => {
  for (const child of Children.toArray(children)) {
    if (
      isValidElement<{ onSubmit: typeof harness.submit }>(child) &&
      child.type === 'form'
    )
      harness.submit = child.props.onSubmit;
  }
  return null;
};
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? children : null,
  DialogContent: (props: Parameters<typeof captureForm>[0]) =>
    captureForm(props),
  DialogHeader: () => null,
  DialogTitle: () => null,
  DialogDescription: () => null,
  DialogFooter: () => null,
}));
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: ReactNode }) => children,
  CardContent: (props: Parameters<typeof captureForm>[0]) => captureForm(props),
  CardHeader: () => null,
  CardAction: () => null,
  CardTitle: () => null,
  CardDescription: () => null,
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => {
    if (Children.toArray(children).includes('Salva template'))
      harness.saveTemplate = onClick;
    return null;
  },
}));
vi.mock('../../src/renderer/components/catalog/TemplateItemCard', () => ({
  TemplateItemCard: () => null,
}));

function stateFor(document = createEmptyDocument()) {
  const state = new AppState();
  state.acceptNativeSession({
    path: 'Cash.json',
    document,
    readOnly: false,
    token: {
      documentId: document.documentId,
      revision: document.revision,
      fingerprint: 'hash',
    },
  });
  return state;
}
function submit() {
  return harness.submit!({
    preventDefault: vi.fn(),
    currentTarget: {},
    nativeEvent: { submitter: null },
  } as unknown as FormEvent<HTMLFormElement>);
}

describe('precisione degli input nei form', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    harness.values = {};
    harness.submit = undefined;
    harness.saveTemplate = undefined;
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      cash: { setDirty: vi.fn() },
    });
    vi.stubGlobal(
      'FormData',
      class {
        get(name: string) {
          return harness.values[name] ?? null;
        }
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    'revenueTarget',
    'specificAnnualExpenses',
    'contributionCeiling',
    'ordinaryThreshold',
    'cessationThreshold',
  ])('rifiuta gli euro troppo precisi nel profilo: %s', (field) => {
    const profile = createFiscalPreset2026();
    const document = createEmptyDocument();
    document.profiles.push(profile);
    const state = stateFor(document);
    harness.values = profileValues();
    harness.values[field] = '10,999';
    renderToStaticMarkup(
      createElement(ProfileEditor, {
        profile,
        doc: document,
        appState: state,
        onCopy: vi.fn(),
      }),
    );
    submit();
    expect(state.error?.code).toBe('VALIDATION');
    expect(state.document).toEqual(document);
  });

  it('salva gli euro validi del profilo nel formato canonico', () => {
    const profile = createFiscalPreset2026();
    const document = createEmptyDocument();
    document.profiles.push(profile);
    const state = stateFor(document);
    harness.values = profileValues();
    harness.values.revenueTarget = '50.000,25';
    renderToStaticMarkup(
      createElement(ProfileEditor, {
        profile,
        doc: document,
        appState: state,
        onCopy: vi.fn(),
      }),
    );
    submit();
    expect(state.error).toBeNull();
    expect(state.document?.profiles[0]?.revenueTarget).toBe('50000.25');
  });

  it.each([
    'annualInsurance',
    'annualTax',
    'annualMaintenance',
    'consumption',
    'annualKm',
  ])('rifiuta la precisione eccessiva del veicolo: %s', (field) => {
    const state = stateFor();
    const onOpenChange = vi.fn();
    harness.values = vehicleValues();
    harness.values[field] = field === 'annualKm' ? '1,27' : '10,999';
    renderToStaticMarkup(
      createElement(VehicleDialog, {
        open: true,
        appState: state,
        onOpenChange,
      }),
    );
    submit();
    expect(state.error?.code).toBe('VALIDATION');
    expect(state.document?.vehicles).toEqual([]);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('salva costi, consumo e distanza validi del veicolo nel formato canonico', () => {
    const state = stateFor();
    harness.values = {
      ...vehicleValues(),
      consumption: '20,25',
      annualKm: '10000,5',
      annualInsurance: '500,2',
    };
    renderToStaticMarkup(
      createElement(VehicleDialog, {
        open: true,
        appState: state,
        onOpenChange: vi.fn(),
      }),
    );
    submit();
    expect(state.document?.vehicles[0]).toMatchObject({
      consumption: '20.25',
      annualKm: '10000.5',
      annualInsurance: '500.20',
      annualTax: '200.00',
      annualMaintenance: '300.00',
    });
  });

  it.each([
    ['10,999', false],
    ['10,9', true],
  ] as const)(
    'valida il costo aziendale %s prima di salvare',
    (monthlyAmount, valid) => {
      const state = stateFor();
      const onOpenChange = vi.fn();
      harness.values = {
        category: 'Software',
        description: 'Licenza',
        monthlyAmount,
      };
      renderToStaticMarkup(
        createElement(CostDialog, {
          open: true,
          appState: state,
          onOpenChange,
        }),
      );
      submit();
      expect(state.document?.businessCosts).toHaveLength(valid ? 1 : 0);
      if (valid)
        expect(state.document?.businessCosts[0]?.monthlyAmount).toBe('10.90');
      else expect(onOpenChange).not.toHaveBeenCalled();
    },
  );

  describe.each([
    ['Catalogo', ReusableDialog],
    ['effetti del preventivo', DefinitionDialog],
  ] as const)('%s', (_, Component) => {
    it.each([
      ['expense', '10,999'],
      ['travel', '1,27'],
    ] as const)('rifiuta la precisione eccessiva per %s', (kind, value) => {
      const onSave = vi.fn();
      harness.values = {
        description: 'Lavoro',
        amount: value,
        distance: value,
        occurrences: '1',
      };
      renderToStaticMarkup(
        createElement(Component, {
          initialKind: kind,
          onClose: vi.fn(),
          onSave,
        }),
      );
      submit();
      expect(onSave).not.toHaveBeenCalled();
    });
    it.each([
      ['expense', '10,9', { amount: '10.90' }],
      ['travel', '1,2', { distanceKmPerOccurrence: '1.2' }],
    ] as const)('converte gli input validi per %s', (kind, value, expected) => {
      const onSave = vi.fn();
      harness.values = {
        description: 'Lavoro',
        amount: value,
        distance: value,
        occurrences: '1',
      };
      renderToStaticMarkup(
        createElement(Component, {
          initialKind: kind,
          onClose: vi.fn(),
          onSave,
        }),
      );
      submit();
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining(expected));
    });
  });

  it.each([
    ['1,27', false],
    ['1,2', true],
  ] as const)(
    'valida la distanza della trasferta nel preventivo: %s',
    (distance, valid) => {
      const state = stateFor();
      const onSaveTravel = vi.fn(async () => true);
      harness.values = { description: 'Visita', occurrences: '1' };
      renderToStaticMarkup(
        createElement(SubItemDialog, {
          sub: {
            ...meta(),
            kind: 'travel',
            description: 'Visita',
            roundTrip: false,
            occurrences: 1,
            distanceKmPerOccurrence: distance,
          },
          doc: state.document as CashDocument,
          appState: state,
          onClose: vi.fn(),
          onSaveSimple: vi.fn(),
          onSaveTravel,
        }),
      );
      submit();
      if (valid)
        expect(onSaveTravel).toHaveBeenCalledWith(
          expect.objectContaining({ distanceKmPerOccurrence: '1.2' }),
        );
      else {
        expect(onSaveTravel).not.toHaveBeenCalled();
        expect(state.error?.code).toBe('VALIDATION');
      }
    },
  );

  it.each([
    ['10,999', false],
    ['10,9', true],
  ] as const)(
    'valida il prezzo di riferimento del template: %s',
    (amount, valid) => {
      const state = stateFor();
      const onSave = vi.fn();
      const source: Template = {
        ...meta(),
        name: 'Modello',
        items: [
          {
            ...meta(),
            name: 'Lavoro',
            subItems: [
              { ...meta(), kind: 'time', description: 'Attività', minutes: 60 },
            ],
            variantGroups: [],
            referencePrice: { amount, period: '2026-01' },
          },
        ],
      };
      renderToStaticMarkup(
        createElement(TemplateWorkspace, {
          source,
          reusableItems: [],
          appState: state,
          onClose: vi.fn(),
          onSave,
        }),
      );
      harness.saveTemplate!();
      if (valid)
        expect(onSave.mock.calls[0]?.[0].items[0].referencePrice.amount).toBe(
          '10.90',
        );
      else {
        expect(onSave).not.toHaveBeenCalled();
        expect(state.error?.code).toBe('VALIDATION');
      }
      expect(source.items[0]?.referencePrice?.amount).toBe(amount);
    },
  );
});

function vehicleValues() {
  return {
    name: 'Auto',
    fuel: 'Benzina',
    consumption: '20',
    annualKm: '10000',
    annualInsurance: '500',
    annualTax: '200',
    annualMaintenance: '300',
  };
}
function profileValues() {
  const profile = createFiscalPreset2026();
  return {
    year: String(profile.year),
    revenueTarget: '50000',
    specificAnnualExpenses: '100',
    hoursPerDay: '8',
    clientTimePercentage: '80',
    vacationDays: '20',
    unplannedDays: '5',
    atecoCode: profile.fiscal.atecoCode,
    profitabilityCoefficient: profile.fiscal.profitabilityCoefficient,
    contributionRate: profile.fiscal.contributionRate,
    contributionCeiling: profile.fiscal.contributionCeiling,
    activityPhase: profile.fiscal.activityPhase,
    reducedSubstituteTaxRate: profile.fiscal.reducedSubstituteTaxRate,
    ordinarySubstituteTaxRate: profile.fiscal.ordinarySubstituteTaxRate,
    ordinaryThreshold: profile.fiscal.ordinaryThreshold,
    cessationThreshold: profile.fiscal.cessationThreshold,
  };
}
