import type { CashError, FicClientSnapshot } from '../domain/model';
import { z } from 'zod';

const clientText = z.string().trim().min(1).optional();
export const ficCreateClientSchema = z.strictObject({
  name: z.string().trim().min(1, 'Inserisci la denominazione del cliente.'),
  type: z.enum(['company', 'person', 'pa', 'condo'], {
    error: 'Seleziona il tipo di cliente.',
  }),
  vat_number: clientText,
  email: z.email().optional(),
  phone: clientText,
  address_street: clientText,
  address_postal_code: clientText,
  address_city: clientText,
  address_province: clientText,
  country: clientText,
  code: clientText,
  address_extra: clientText,
  tax_code: clientText,
  contact_person: clientText,
  first_name: clientText,
  last_name: clientText,
  certified_email: z.email().optional(),
  ei_code: clientText,
  e_invoice: z.boolean().optional(),
  notes: clientText,
  shipping_address: clientText,
  default_payment_terms: z.number().int().nonnegative().optional(),
  default_payment_terms_type: z.enum(['standard', 'end_of_month']).optional(),
  default_discount: z.number().min(0).max(100).optional(),
  bank_name: clientText,
  bank_iban: clientText,
  bank_swift_code: clientText,
});

export type FicCreateClientInput = z.infer<typeof ficCreateClientSchema>;
export type FicCreateClientResult =
  | { outcome: 'created'; client: FicClientSnapshot }
  | { outcome: 'uncertain'; diagnostic: string };

export interface FicQuotaObservation {
  companyId: string;
  hourlyRemaining?: number;
  hourlyLimit?: number;
  monthlyRemaining?: number;
  monthlyLimit?: number;
  observedAt: string;
  suspendedUntil?: string;
}

export interface FicClientPage {
  clients: FicClientSnapshot[];
  page: number;
  nextPage?: number;
}

export interface FicExportResult {
  outcome: 'success' | 'rejected' | 'uncertain';
  remoteDocumentId?: string;
  diagnostic?: string;
  requestSent?: boolean;
  error?: CashError;
}
