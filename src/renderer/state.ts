import { createEmptyDocument, type CashDocument, type CashError } from '../domain/model';
import type { ArchiveSession } from '../native/persistence';

export type SaveStatus = 'Nessun archivio' | 'Modifiche non salvate' | 'Salvataggio' | 'Salvato' | 'Errore di salvataggio' | 'Conflitto esterno' | 'Sola lettura';
type Listener = () => void;

class AppState {
  session: ArchiveSession | null = null;
  status: SaveStatus = 'Nessun archivio';
  error: CashError | null = null;
  private listeners = new Set<Listener>();
  private timer?: number;
  private savePromise: Promise<void> = Promise.resolve();

  get document(): CashDocument | undefined { return this.session?.document; }
  subscribe(listener: Listener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(): void { for (const listener of this.listeners) listener(); }

  async initialize(): Promise<void> {
    window.cash.onExternalChange(error => { this.error = error; this.status = 'Conflitto esterno'; this.emit(); });
    const result = await window.cash.archive.openLast();
    if (result.ok && result.value) this.accept(result.value);
    else if (!result.ok && result.error.code !== 'IO') { this.error = result.error; this.emit(); }
  }

  async create(): Promise<void> {
    const result = await window.cash.archive.create(createEmptyDocument());
    if (result.ok) this.accept(result.value); else if (result.error.code !== 'CANCELLED') { this.error = result.error; this.emit(); }
  }

  async open(): Promise<void> {
    const result = await window.cash.archive.open();
    if (result.ok) this.accept(result.value); else if (result.error.code !== 'CANCELLED') { this.error = result.error; this.emit(); }
  }

  private accept(session: ArchiveSession): void {
    this.session = session;
    this.status = session.readOnly ? 'Sola lettura' : 'Salvato';
    this.error = null;
    window.cash.setDirty(false);
    this.emit();
  }

  mutate(mutator: (document: CashDocument) => void): void {
    if (!this.session?.document || this.session.readOnly || this.status === 'Conflitto esterno') return;
    const next = structuredClone(this.session.document);
    mutator(next);
    this.session = { ...this.session, document: next };
    this.status = 'Modifiche non salvate';
    this.error = null;
    window.cash.setDirty(true);
    this.emit();
    if (this.timer) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { void this.save(); }, 350);
  }

  async save(): Promise<void> {
    if (!this.session?.document || this.session.readOnly || this.status === 'Conflitto esterno') return;
    if (this.timer) window.clearTimeout(this.timer);
    const snapshot = this.session;
    this.status = 'Salvataggio'; this.emit();
    this.savePromise = this.savePromise.then(async () => {
      const result = await window.cash.archive.save(snapshot.path, snapshot.document!, snapshot.token);
      if (result.ok) this.accept(result.value);
      else { this.error = result.error; this.status = result.error.code === 'CONFLICT' ? 'Conflitto esterno' : 'Errore di salvataggio'; window.cash.setDirty(true); this.emit(); }
    });
    await this.savePromise;
  }

  async recovery(): Promise<void> {
    if (!this.document) return;
    const result = await window.cash.archive.saveRecovery(this.document);
    if (!result.ok && result.error.code !== 'CANCELLED') { this.error = result.error; this.emit(); }
  }

  clearError(): void { this.error = null; this.emit(); }
}

export const state = new AppState();
