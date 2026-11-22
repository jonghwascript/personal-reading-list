import type { LibraryEntry, ProgressLog, ReadingGoal, Shelf } from '../types';

export interface LibrarySnapshot {
  shelves: Shelf[];
  entries: LibraryEntry[];
  goals: ReadingGoal[];
  logs: ProgressLog[];
}

/**
 * Persistence boundary. The UI computes the next state itself (optimistic updates) and hands the
 * result here, so guest and Supabase storage stay interchangeable and free of business rules.
 * All ids are generated client-side (crypto.randomUUID) so optimistic records never need re-keying,
 * except a book's catalog id, which addEntry may replace with the shared catalog row's id.
 */
export interface LibraryRepository {
  readonly kind: 'guest' | 'account';
  load(): Promise<LibrarySnapshot>;
  addEntry(entry: LibraryEntry): Promise<LibraryEntry>;
  /** Persists mutable fields: shelf, dates, rating, notes, progress, and the book's genres. */
  saveEntries(entries: LibraryEntry[]): Promise<void>;
  saveAnnotations(id: string, fields: Partial<Pick<LibraryEntry, 'notes' | 'rating'>>): Promise<void>;
  removeEntries(ids: string[]): Promise<void>;
  appendLog(log: ProgressLog): Promise<void>;
  /** Used by "Undo" right after a progress save. */
  removeLog(id: string): Promise<void>;
  saveProgress(entry: LibraryEntry, log: ProgressLog, expectedAt: string | null, undo?: boolean): Promise<boolean>;
  /** Upserts name/position for every given shelf (create, rename and reorder all use this). */
  saveShelves(shelves: Shelf[]): Promise<void>;
  /** Callers move the shelf's entries elsewhere first. */
  deleteShelf(id: string): Promise<void>;
  moveBooksAndDeleteShelf(id: string, targetId: string, now?: Date): Promise<void>;
  saveGoal(goal: ReadingGoal): Promise<void>;
  deleteGoal(year: number): Promise<void>;
}

export class DuplicateBookError extends Error {
  readonly existing: LibraryEntry;
  constructor(existing: LibraryEntry) {
    super(`"${existing.book.title}" is already in your library.`);
    this.name = 'DuplicateBookError';
    this.existing = existing;
  }
}
