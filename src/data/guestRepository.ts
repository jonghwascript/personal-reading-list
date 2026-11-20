import type { LibraryEntry, ProgressLog, ReadingGoal, Shelf } from '../types';
import { buildGuestSnapshot } from './guestSeed';
import type { LibraryRepository, LibrarySnapshot } from './repository';

// Bumped when the stored shape changes so old sessions re-seed instead of breaking.
const STORAGE_KEY = 'bookshelf:guest:v2';

/**
 * Guest data lives in sessionStorage: it survives refreshes within the visit (so exploring feels
 * real) but disappears when the tab closes, as the spec requires.
 */
export class GuestRepository implements LibraryRepository {
  readonly kind = 'guest' as const;
  private state: LibrarySnapshot;

  constructor(private readonly storage: Storage | null = safeSessionStorage()) {
    this.state = this.read() ?? buildGuestSnapshot();
    this.write();
  }

  async load(): Promise<LibrarySnapshot> {
    return structuredClone(this.state);
  }

  async addEntry(entry: LibraryEntry): Promise<LibraryEntry> {
    this.state.entries.push(structuredClone(entry));
    this.write();
    return entry;
  }

  async saveEntries(entries: LibraryEntry[]): Promise<void> {
    const byId = new Map(entries.map((e) => [e.id, e]));
    this.state.entries = this.state.entries.map((e) => structuredClone(byId.get(e.id) ?? e));
    this.write();
  }

  async removeEntries(ids: string[]): Promise<void> {
    const set = new Set(ids);
    this.state.entries = this.state.entries.filter((e) => !set.has(e.id));
    this.state.logs = this.state.logs.filter((l) => !set.has(l.entryId));
    this.write();
  }

  async appendLog(log: ProgressLog): Promise<void> {
    this.state.logs.push({ ...log });
    this.write();
  }

  async removeLog(id: string): Promise<void> {
    this.state.logs = this.state.logs.filter((l) => l.id !== id);
    this.write();
  }

  async saveShelves(shelves: Shelf[]): Promise<void> {
    const byId = new Map(this.state.shelves.map((s) => [s.id, s]));
    for (const shelf of shelves) byId.set(shelf.id, { ...shelf });
    this.state.shelves = [...byId.values()].sort((a, b) => a.position - b.position);
    this.write();
  }

  async deleteShelf(id: string): Promise<void> {
    this.state.shelves = this.state.shelves.filter((s) => s.id !== id);
    this.write();
  }

  async saveGoal(goal: ReadingGoal): Promise<void> {
    this.state.goals = [...this.state.goals.filter((g) => g.year !== goal.year), { ...goal }];
    this.write();
  }

  async deleteGoal(year: number): Promise<void> {
    this.state.goals = this.state.goals.filter((g) => g.year !== year);
    this.write();
  }

  /** Start the guest library over from the curated seed. */
  reset(): void {
    this.state = buildGuestSnapshot();
    this.write();
  }

  private read(): LibrarySnapshot | null {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as LibrarySnapshot) : null;
    } catch {
      return null;
    }
  }

  private write() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Quota or privacy mode: the in-memory state still works for this page view.
    }
  }

  static clear(storage: Storage | null = safeSessionStorage()) {
    try {
      storage?.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}
