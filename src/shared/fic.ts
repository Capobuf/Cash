import type { CashError, FicClientSnapshot } from '../domain/model';

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
