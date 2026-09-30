import { createEmptyDocument, type CashDocument, type CashError } from '../domain/model';
import { cashDocumentSchema, validationErrorFromIssues } from '../domain/schema';
import type { ArchiveSession } from '../native/persistence';

export type SaveStatus = 'Nessun archivio' | 'Modifiche non salvate' | 'Salvataggio' | 'Salvato' | 'Dati da correggere' | 'Errore di salvataggio' | 'Conflitto esterno' | 'Sola lettura';
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
  financialSyncError: CashError | null = null;
  private requestArchiveDecision?: () => Promise<ArchiveDecision>;

  get document(): CashDocument | undefined { return this.session?.document; }
  subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(): void { for (const listener of this.listeners) listener(); }

  async initialize(): Promise<void> {
    window.cash.onExternalChange(error => { this.error = error; this.status = 'Conflitto esterno'; this.emit(); });
    window.cash.onArchiveReloaded(session => { this.accept(session); });
    const result = await window.cash.archive.openLast();
    if (result.ok && result.value) this.accept(result.value);
    else if (!result.ok && result.error.code !== 'IO') { this.error = result.error; this.emit(); }
  }

  async create(): Promise<void> {
    if (!await this.mayReplaceSession()) return;
    const result = await window.cash.archive.create(createEmptyDocument());
    if (result.ok) this.accept(result.value); else if (result.error.code !== 'CANCELLED') { this.error = result.error; this.emit(); }
  }

  async open(): Promise<void> {
    if (!await this.mayReplaceSession()) return;
    const result = await window.cash.archive.open();
    if (result.ok) this.accept(result.value); else if (result.error.code !== 'CANCELLED') { this.error = result.error; this.emit(); }
  }

  private accept(session: ArchiveSession): void {
    if (session.document?.documentId !== this.document?.documentId || session.path !== this.session?.path)
      this.financialSyncError = null;
    this.session = session;
    this.mutationVersion = 0;
    this.sessionVersion += 1;
    this.status = session.readOnly ? 'Sola lettura' : 'Salvato';
    this.error = null;
    window.cash.setDirty(false);
    this.emit();
  }

  acceptNativeSession(session: ArchiveSession): void { this.accept(session); }
  async syncFinancialData(): Promise<void> {
    if (this.financialSyncing || !this.document || this.session?.readOnly || this.status === 'Conflitto esterno') return;
    const companyId = this.document.settings.fic.company?.id;
    if (!this.document.settings.fic.enabled || !companyId) {
      this.setError({ code: 'MISSING_DATA', message: 'Configura e attiva Fatture in Cloud prima di aggiornare i dati.' }); return;
    }
    const documentId = this.document.documentId; const path = this.session?.path;
    const acquiredAt = this.document.financialSnapshot?.acquiredAt;
    const sameContext = () => this.document?.documentId === documentId && this.session?.path === path
      && this.document.settings.fic.enabled && this.document.settings.fic.company?.id === companyId
      && this.document.financialSnapshot?.acquiredAt === acquiredAt;
    this.financialSyncing = true; this.financialSyncError = null; this.emit();
    try {
      await this.save();
      if (!sameContext() || !this.isSaved()) return;
      const result = await window.cash.fic.syncFinancialData({ companyId });
      if (!sameContext()) {
        this.setError({ code: 'CONFLICT', message: 'Archivio, azienda o snapshot cambiato durante l’aggiornamento. Ripeti la sincronizzazione.' }); return;
      }
      if (!result.ok) { this.financialSyncError = result.error; this.setError(result.error); return; }
      if (result.value.company.id !== companyId) {
        this.setError({ code: 'SOURCE_INVALID', message: 'Lo snapshot ricevuto appartiene a un’altra azienda.' }); return;
      }
      this.mutate(document => { document.financialSnapshot = result.value; });
    } catch {
      this.financialSyncError = { code: 'SOURCE_UNAVAILABLE', source: 'FattureInCloud', message: 'Aggiornamento finanziario non riuscito. Lo snapshot precedente resta disponibile.' };
      this.setError(this.financialSyncError);
    } finally { this.financialSyncing = false; this.emit(); }
  }
  setArchiveDecisionHandler(handler: () => Promise<ArchiveDecision>): void { this.requestArchiveDecision = handler; }

  mutate(mutator: (document: CashDocument) => void): void {
    if (!this.session?.document || this.session.readOnly || this.status === 'Conflitto esterno') return;
    const next = structuredClone(this.session.document);
    mutator(next);
    const validation = cashDocumentSchema.safeParse(next);
    if (!validation.success) {
      this.error = validationErrorFromIssues(validation.error.issues);
      this.emit();
      return;
    }
    this.mutationVersion += 1;
    this.session = { ...this.session, document: validation.data };
    this.status = 'Modifiche non salvate';
    this.error = null;
    window.cash.setDirty(true);
    this.emit();
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { void this.save(); }, 350);
  }

  async save(): Promise<void> {
    if (!this.session?.document || this.session.readOnly || this.status === 'Conflitto esterno' || this.status === 'Salvato') return;
    if (this.timer) window.clearTimeout(this.timer);
    this.savePromise = this.savePromise.then(async () => {
      if (!this.session?.document || this.session.readOnly || this.status === 'Conflitto esterno' || this.status === 'Salvato') return;
      const snapshot = this.session;
      const savingVersion = this.mutationVersion;
      const savingSessionVersion = this.sessionVersion;
      this.status = 'Salvataggio'; this.emit();
      const result = await window.cash.archive.save(snapshot.path, snapshot.document!, snapshot.token);
      if (savingSessionVersion !== this.sessionVersion) return;
      if (result.ok && this.mutationVersion === savingVersion) this.accept(result.value);
      else if (result.ok) {
        this.session = { ...result.value, document: this.session?.document };
        this.status = 'Modifiche non salvate';
        window.cash.setDirty(true);
        this.emit();
        this.timer = window.setTimeout(() => { void this.save(); }, 0);
      }
      else { this.error = result.error; this.status = result.error.code === 'CONFLICT' ? 'Conflitto esterno' : result.error.code === 'VALIDATION' ? 'Dati da correggere' : 'Errore di salvataggio'; window.cash.setDirty(true); this.emit(); }
    });
    await this.savePromise;
  }

  async recovery(): Promise<boolean> {
    if (!this.document) return false;
    const result = await window.cash.archive.saveRecovery(this.document);
    if (!result.ok && result.error.code !== 'CANCELLED') { this.error = result.error; this.emit(); }
    return result.ok;
  }

  async restoreBackup():Promise<void>{if(!this.session)return;const result=await window.cash.archive.restoreBackup(this.session.path,this.session.token);if(result.ok)this.accept(result.value);else if(result.error.code!=='CANCELLED'){this.error=result.error;this.emit();}}

  private async mayReplaceSession(): Promise<boolean> {
    if (!this.session || this.status === 'Salvato' || this.status === 'Sola lettura') return true;
    const choice = await this.requestArchiveDecision?.() ?? 'cancel';
    if (choice === 'save') { await this.save(); return this.isSaved(); }
    if (choice === 'recovery') return this.recovery();
    return choice === 'discard';
  }

  private isSaved(): boolean { return this.status === 'Salvato'; }

  clearError(): void { this.error = null; this.emit(); }
  setError(error: CashError): void { this.error = error; this.emit(); }
}

export const state = new AppState();
