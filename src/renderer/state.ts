import {
  CURRENT_SCHEMA_VERSION,
  createEmptyDocument,
  type BankExpenseImportSummary,
  type CashDocument,
  type CashError,
} from '../domain/model';
import {
  bankExpenseImportSchema,
  cashDocumentSchema,
  validationErrorFromIssues,
} from '../domain/schema';
import type { ArchiveSession } from '../native/persistence';
import { deduplicateBankExpenses } from '../domain/bank-expenses';

export type SaveStatus =
  | 'Nessun archivio'
  | 'Modifiche non salvate'
  | 'Salvataggio'
  | 'Salvato'
  | 'Dati da correggere'
  | 'Errore di salvataggio'
  | 'Conflitto esterno'
  | 'Sola lettura';
export type ArchiveDecision = 'save' | 'recovery' | 'discard' | 'cancel';
type Listener = () => void;

export class AppState {
  session: ArchiveSession | null = null;
  status: SaveStatus = 'Nessun archivio';
  error: CashError | null = null;
  private listeners = new Set<Listener>();
  private timer?: number;
  private savePromise: Promise<void> = Promise.resolve();
  private mutationVersion = 0;
  private sessionVersion = 0;
  financialSyncing = false;
  bankExpenseImporting = false;
  bankExpenseImportSummary: BankExpenseImportSummary | null = null;
  private archiveContextVersion = 0;
  financialSyncError: CashError | null = null;
  private restoringBackup = false;
  private requestArchiveDecision?: (
    allowSave: boolean,
  ) => Promise<ArchiveDecision>;

  get document(): CashDocument | undefined {
    return this.session?.document;
  }
  get archiveContext(): number {
    return this.archiveContextVersion;
  }
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  async initialize(): Promise<void> {
    window.cash.onExternalChange((error) => {
      this.error = error;
      this.status = 'Conflitto esterno';
      this.emit();
    });
    window.cash.onArchiveReloaded((session) => {
      this.accept(session);
    });
    const result = await window.cash.archive.openLast();
    if (result.ok && result.value) this.accept(result.value);
    else if (!result.ok && result.error.code !== 'IO') {
      this.error = result.error;
      this.emit();
    }
  }

  async create(): Promise<void> {
    if (!(await this.mayReplaceSession())) return;
    const result = await window.cash.archive.create(createEmptyDocument());
    if (result.ok) this.accept(result.value);
    else if (result.error.code !== 'CANCELLED') {
      this.error = result.error;
      this.emit();
    }
  }

  async open(): Promise<void> {
    if (!(await this.mayReplaceSession())) return;
    const result = await window.cash.archive.open();
    if (result.ok) this.accept(result.value);
    else if (result.error.code !== 'CANCELLED') {
      this.error = result.error;
      this.emit();
    }
  }

  private accept(session: ArchiveSession): void {
    if (
      session.document?.documentId !== this.document?.documentId ||
      session.path !== this.session?.path
    ) {
      this.financialSyncError = null;
      this.bankExpenseImportSummary = null;
      this.archiveContextVersion++;
    }
    this.session = session;
    this.mutationVersion = 0;
    this.sessionVersion += 1;
    this.status = session.readOnly ? 'Sola lettura' : 'Salvato';
    this.error = session.headerOnly
      ? {
          code: 'SCHEMA_NEWER',
          source: 'archive',
          message: `L’archivio usa uno schema più recente${session.schemaVersion ? ` (${session.schemaVersion})` : ''} di quello supportato da questa versione di Cash (${CURRENT_SCHEMA_VERSION}).`,
          action:
            'Apri il file con una versione di Cash compatibile. I dati non sono stati modificati.',
          details: [
            session.path,
            `Revisione: ${session.token.revision} · Sola lettura: contenuto non disponibile in questa versione.`,
          ],
        }
      : null;
    window.cash.setDirty(false);
    this.emit();
  }

  acceptNativeSession(session: ArchiveSession): void {
    this.accept(session);
  }
  async importBankExpenses(): Promise<void> {
    if (
      this.bankExpenseImporting ||
      !this.document ||
      this.session?.readOnly ||
      this.status === 'Conflitto esterno'
    )
      return;
    const context = this.archiveContextVersion;
    const documentId = this.document.documentId;
    const path = this.session?.path;
    this.bankExpenseImporting = true;
    this.bankExpenseImportSummary = null;
    this.emit();
    try {
      const result = await window.cash.bankExpenses.importFile();
      if (
        context !== this.archiveContextVersion ||
        this.document?.documentId !== documentId ||
        this.session?.path !== path
      ) {
        this.setError({
          code: 'CONFLICT',
          message:
            'Archivio cambiato durante l’importazione. Ripeti la selezione del file.',
        });
        return;
      }
      if (!result.ok) {
        if (result.error.code !== 'CANCELLED') this.setError(result.error);
        return;
      }
      if (
        !this.document ||
        this.session?.readOnly ||
        this.hasExternalConflict()
      )
        return;
      const parsed = bankExpenseImportSchema.safeParse(result.value);
      if (!parsed.success) {
        this.setError(validationErrorFromIssues(parsed.error.issues));
        return;
      }
      const { added, duplicates } = deduplicateBankExpenses(
        this.document.bankExpenses,
        parsed.data.rows,
      );
      if (added.length) {
        const before = this.mutationVersion;
        this.mutate((document) => {
          document.bankExpenses = document.bankExpenses.concat(added);
        });
        if (before === this.mutationVersion) return;
      }
      this.bankExpenseImportSummary = {
        imported: added.length,
        duplicates,
        ignoredIncome: parsed.data.ignoredIncome,
      };
    } catch {
      this.setError({
        code: 'IO',
        message:
          'Importazione bancaria non riuscita. Nessun movimento è stato importato.',
      });
    } finally {
      this.bankExpenseImporting = false;
      this.emit();
    }
  }
  private hasExternalConflict(): boolean {
    return this.status === 'Conflitto esterno';
  }
  async syncFinancialData(): Promise<void> {
    if (
      this.financialSyncing ||
      !this.document ||
      this.session?.readOnly ||
      this.status === 'Conflitto esterno'
    )
      return;
    const companyId = this.document.settings.fic.company?.id;
    if (!this.document.settings.fic.enabled || !companyId) {
      this.setError({
        code: 'MISSING_DATA',
        message:
          'Configura e attiva Fatture in Cloud prima di aggiornare i dati.',
      });
      return;
    }
    const documentId = this.document.documentId;
    const path = this.session?.path;
    const acquiredAt = this.document.financialSnapshot?.acquiredAt;
    const sameContext = () =>
      this.document?.documentId === documentId &&
      this.session?.path === path &&
      this.document.settings.fic.enabled &&
      this.document.settings.fic.company?.id === companyId &&
      this.document.financialSnapshot?.acquiredAt === acquiredAt;
    this.financialSyncing = true;
    this.financialSyncError = null;
    this.emit();
    try {
      await this.save();
      if (!sameContext() || !this.isSaved()) return;
      const result = await window.cash.fic.syncFinancialData({ companyId });
      if (!sameContext()) {
        this.setError({
          code: 'CONFLICT',
          message:
            'Archivio, azienda o snapshot cambiato durante l’aggiornamento. Ripeti la sincronizzazione.',
        });
        return;
      }
      if (!result.ok) {
        this.financialSyncError = result.error;
        this.setError(result.error);
        return;
      }
      if (result.value.company.id !== companyId) {
        this.setError({
          code: 'SOURCE_INVALID',
          message: 'Lo snapshot ricevuto appartiene a un’altra azienda.',
        });
        return;
      }
      this.mutate((document) => {
        document.financialSnapshot = result.value;
      });
    } catch {
      this.financialSyncError = {
        code: 'SOURCE_UNAVAILABLE',
        source: 'FattureInCloud',
        message:
          'Aggiornamento finanziario non riuscito. Lo snapshot precedente resta disponibile.',
      };
      this.setError(this.financialSyncError);
    } finally {
      this.financialSyncing = false;
      this.emit();
    }
  }
  setArchiveDecisionHandler(
    handler: (allowSave: boolean) => Promise<ArchiveDecision>,
  ): void {
    this.requestArchiveDecision = handler;
  }

  mutate(mutator: (document: CashDocument) => void): boolean {
    if (
      this.restoringBackup ||
      !this.session?.document ||
      this.session.readOnly ||
      this.status === 'Conflitto esterno'
    )
      return false;
    const next = structuredClone(this.session.document);
    mutator(next);
    const validation = cashDocumentSchema.safeParse(next);
    if (!validation.success) {
      this.error = validationErrorFromIssues(validation.error.issues);
      this.emit();
      return false;
    }
    this.mutationVersion += 1;
    this.session = { ...this.session, document: validation.data };
    this.status = 'Modifiche non salvate';
    this.error = null;
    window.cash.setDirty(true);
    this.emit();
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      void this.save();
    }, 350);
    return true;
  }

  async save(): Promise<void> {
    if (
      this.restoringBackup ||
      !this.session?.document ||
      this.session.readOnly ||
      this.status === 'Conflitto esterno' ||
      this.status === 'Salvato'
    )
      return;
    if (this.timer) window.clearTimeout(this.timer);
    this.savePromise = this.savePromise.then(async () => {
      if (
        this.restoringBackup ||
        !this.session?.document ||
        this.session.readOnly ||
        this.status === 'Conflitto esterno' ||
        this.status === 'Salvato'
      )
        return;
      const snapshot = this.session;
      const savingVersion = this.mutationVersion;
      const savingSessionVersion = this.sessionVersion;
      this.status = 'Salvataggio';
      this.emit();
      let result: Awaited<ReturnType<typeof window.cash.archive.save>>;
      try {
        result = await window.cash.archive.save(
          snapshot.path,
          snapshot.document!,
          snapshot.token,
        );
      } catch (cause) {
        result = {
          ok: false,
          error: {
            code: 'IO',
            source: 'archive',
            message:
              'Comunicazione interrotta durante il salvataggio. Le modifiche restano non salvate.',
            details: [String(cause)],
          },
        };
      }
      if (savingSessionVersion !== this.sessionVersion) return;
      if (result.ok && this.mutationVersion === savingVersion)
        this.accept(result.value);
      else if (result.ok) {
        this.session = { ...result.value, document: this.session?.document };
        this.status = 'Modifiche non salvate';
        window.cash.setDirty(true);
        this.emit();
        this.timer = window.setTimeout(() => {
          void this.save();
        }, 0);
      } else {
        this.error = result.error;
        this.status =
          result.error.code === 'CONFLICT'
            ? 'Conflitto esterno'
            : result.error.code === 'VALIDATION'
              ? 'Dati da correggere'
              : 'Errore di salvataggio';
        window.cash.setDirty(true);
        this.emit();
      }
    });
    await this.savePromise;
  }

  async recovery(): Promise<boolean> {
    if (!this.document) return false;
    const result = await window.cash.archive.saveRecovery(this.document);
    if (!result.ok && result.error.code !== 'CANCELLED') {
      this.error = result.error;
      this.emit();
    }
    return result.ok;
  }

  markExportForVerification(quoteId: string, attemptId: string): boolean {
    if (!this.session?.document) return false;
    const document = structuredClone(this.session.document);
    const attempt = document.quotes
      .find((quote) => quote.id === quoteId)
      ?.exportAttempts.find((entry) => entry.id === attemptId);
    if (!attempt) return false;
    attempt.outcome = 'uncertain';
    this.session = { ...this.session, document };
    // Keep the unsaved response without scheduling another save after a failure.
    if (this.timer) window.clearTimeout(this.timer);
    if (this.status !== 'Conflitto esterno')
      this.status = 'Errore di salvataggio';
    window.cash.setDirty(true);
    this.emit();
    return true;
  }

  async restoreBackup(): Promise<void> {
    if (!this.session || this.restoringBackup) return;
    this.restoringBackup = true;
    const context = this.archiveContextVersion;
    if (this.timer) window.clearTimeout(this.timer);
    try {
      // A save already sent must finish before selecting the backup to restore.
      await this.savePromise;
      if (this.archiveContextVersion !== context) {
        this.setError({
          code: 'CONFLICT',
          message:
            'Archivio cambiato prima del ripristino. Ripeti l’operazione.',
        });
        return;
      }
      const session = this.session;
      if (!(await this.mayReplaceSession(false))) return;
      if (this.session !== session) {
        this.setError({
          code: 'CONFLICT',
          message:
            'Archivio cambiato durante la scelta di ripristino. Ripeti l’operazione.',
        });
        return;
      }
      const result = await window.cash.archive.restoreBackup(
        session.path,
        session.token,
      );
      if (this.session !== session) {
        this.setError({
          code: 'CONFLICT',
          message:
            'Archivio cambiato durante il ripristino. Riapri l’archivio ripristinato.',
        });
        return;
      }
      if (result.ok) this.accept(result.value);
      else if (result.error.code !== 'CANCELLED') this.setError(result.error);
    } catch (cause) {
      this.setError({
        code: 'IO',
        source: 'archive',
        message:
          'Esito del ripristino non disponibile. Riapri l’archivio per verificarlo.',
        details: [String(cause)],
      });
    } finally {
      this.restoringBackup = false;
      if (this.status === 'Modifiche non salvate') {
        this.timer = window.setTimeout(() => {
          void this.save();
        }, 350);
      }
    }
  }

  private async mayReplaceSession(allowSave = true): Promise<boolean> {
    if (this.restoringBackup && allowSave) return false;
    if (
      !this.session ||
      this.status === 'Salvato' ||
      this.status === 'Sola lettura'
    )
      return true;
    const choice = (await this.requestArchiveDecision?.(allowSave)) ?? 'cancel';
    if (choice === 'save') {
      if (!allowSave) return false;
      await this.save();
      return this.isSaved();
    }
    if (choice === 'recovery') return this.recovery();
    return choice === 'discard';
  }

  private isSaved(): boolean {
    return this.status === 'Salvato';
  }

  clearError(): void {
    this.error = null;
    this.emit();
  }
  setError(error: CashError): void {
    this.error = error;
    this.emit();
  }
}

export const state = new AppState();
