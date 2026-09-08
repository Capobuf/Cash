import { err, ok, type Result, type SharedSettings } from './model';

export type FicDeviceState = 'disabled' | 'requires_local_configuration' | 'active' | 'connection_error';

export function ficDeviceState(settings: SharedSettings, hasLocalToken: boolean): FicDeviceState {
  if (!settings.fic.enabled) return 'disabled';
  if (settings.fic.lastVerification?.result === 'error') return 'connection_error';
  if (!hasLocalToken) return 'requires_local_configuration';
  return settings.fic.company && settings.fic.product ? 'active' : 'requires_local_configuration';
}

export function requireActiveFic(settings: SharedSettings, companyId: string, productId?: string): Result<void> {
  if (!settings.fic.enabled) return err({ code: 'VALIDATION', source: 'FattureInCloud', message: 'Integrazione Fatture in Cloud disattivata.' });
  if (settings.fic.company?.id !== companyId) return err({ code: 'VALIDATION', source: 'FattureInCloud', message: 'Azienda Fatture in Cloud non configurata o diversa.' });
  if (!settings.fic.product || (productId !== undefined && settings.fic.product.id !== productId))
    return err({ code: 'VALIDATION', source: 'FattureInCloud', message: 'Prodotto Consulenza non configurato o diverso.' });
  return ok(undefined);
}

export function disableFic(settings: SharedSettings): SharedSettings {
  return { ...structuredClone(settings), fic: { ...structuredClone(settings.fic), enabled: false } };
}

export function removeFicLink(settings: SharedSettings): SharedSettings {
  return { ...(settings.fuelTerritory ? { fuelTerritory: settings.fuelTerritory } : {}), fic: { enabled: false } };
}
