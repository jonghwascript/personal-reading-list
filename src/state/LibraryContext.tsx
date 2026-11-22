import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DuplicateBookError, type LibraryRepository, type LibrarySnapshot } from '../data/repository';
import { applyMove, findDuplicate, rehomeEntry } from '../lib/libraryRules';
import { applyProgress, recomputeProgress, type Milestone, type ProgressInput } from '../lib/progress';
import type { Book, EntryPatch, LibraryEntry, Shelf } from '../types';
import { useAnnouncer } from './AnnouncerContext';

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

interface LibraryValue {
  load: LoadState;
  shelves: Shelf[];
  entries: LibraryEntry[];
  goals: LibrarySnapshot['goals'];
  logs: LibrarySnapshot['logs'];
  repositoryKind: LibraryRepository['kind'];
  shelfById(id: string): Shelf | undefined;
  defaultShelf(kind: 'want' | 'reading' | 'read'): Shelf;
  reload(): Promise<void>;
  /** Throws DuplicateBookError when another edition is already in the library. */
  addBook(book: Book, shelfId: string, editionPages?: number | null): Promise<LibraryEntry>;
  moveEntries(ids: string[], shelfId: string, finishedDate?: Date): Promise<void>;
  /** Puts entries back exactly as given — dates and progress included. Used by "Undo" after a move. */
  restoreEntries(previous: LibraryEntry[]): Promise<void>;
  updateEntry(id: string, patch: EntryPatch): Promise<void>;
  setGenres(ids: string[], update: (genres: string[]) => string[]): Promise<void>;
  /**
   * Saves a position. Returns the milestone crossed (so the UI can offer "Mark as finished" at the
   * end) and an undo that restores the previous position and drops the history row.
   */
  setProgress(id: string, input: ProgressInput, expectedAt: string | null): Promise<{ milestone: Milestone; undo(): Promise<void> }>;
  /** Moves the book to the Read shelf, stamping today's finish date. */
  markFinished(id: string): Promise<void>;
  removeEntries(ids: string[]): Promise<void>;
  createShelf(name: string): Promise<Shelf>;
  renameShelf(id: string, name: string): Promise<void>;
  deleteShelf(id: string, targetId: string): Promise<void>;
  reorderShelves(orderedIds: string[]): Promise<void>;
  setGoal(year: number, target: number): Promise<void>;
  clearGoal(year: number): Promise<void>;
}

const LibraryContext = createContext<LibraryValue | null>(null);
const EMPTY: LibrarySnapshot = { shelves: [], entries: [], goals: [], logs: [] };

const newId = () => crypto.randomUUID();

export function LibraryProvider({ repository, children }: { repository: LibraryRepository; children: ReactNode }) {
  const { notify } = useAnnouncer();
  const [snapshot, setSnapshot] = useState<LibrarySnapshot>(EMPTY);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  // Mutations read the latest state synchronously so rapid successive actions compose correctly.
  const current = useRef(snapshot);
  const commit = useCallback((next: LibrarySnapshot) => {
    current.current = next;
    setSnapshot(next);
  }, []);

  // Once the library is on screen, refreshes happen in place: never swap the page for a loading or
  // error screen (that would unmount whatever the reader is doing). A failed refresh just says so.
  const loaded = useRef(false);
  const reload = useCallback(async () => {
    try {
      commit(await repository.load());
      loaded.current = true;
      setLoad({ status: 'ready' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (loaded.current) notify(`Couldn't refresh your library (${message}). Showing what you had.`, 'error');
      else setLoad({ status: 'error', message });
    }
  }, [repository, commit, notify]);

  useEffect(() => {
    if (!loaded.current) setLoad({ status: 'loading' });
    void reload();
  }, [reload]);

  // Another tab may have changed account data; refresh when this one becomes visible again.
  useEffect(() => {
    if (repository.kind !== 'account') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [repository, reload]);

  /** Apply locally, persist, and roll back with a specific message if persistence fails. */
  const optimistic = useCallback(
    async (next: LibrarySnapshot, persist: () => Promise<unknown>, failure: string) => {
      const previous = current.current;
      commit(next);
      try {
        await persist();
      } catch (err) {
        commit(previous);
        const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
        notify(`${failure}${detail}. Your change was undone.`, 'error');
        throw err;
      }
    },
    [commit, notify],
  );

  const value = useMemo<LibraryValue>(() => {
    const shelfById = (id: string) => snapshot.shelves.find((s) => s.id === id);
    const defaultShelf = (kind: 'want' | 'reading' | 'read') => {
      const shelf = current.current.shelves.find((s) => s.kind === kind);
      if (!shelf) throw new Error(`Missing default shelf: ${kind}`);
      return shelf;
    };
    const replaceEntries = (updated: LibraryEntry[]) => {
      const byId = new Map(updated.map((e) => [e.id, e]));
      return current.current.entries.map((e) => byId.get(e.id) ?? e);
    };

    return {
      load,
      ...snapshot,
      repositoryKind: repository.kind,
      shelfById,
      defaultShelf,
      reload,

      async addBook(book, shelfId, editionPages) {
        const duplicate = findDuplicate(current.current.entries, book);
        if (duplicate) throw new DuplicateBookError(duplicate);
        const shelf = current.current.shelves.find((s) => s.id === shelfId) ?? defaultShelf('want');
        const now = new Date().toISOString();
        const draft = applyMove(
          {
            id: newId(),
            book,
            shelfId: shelf.id,
            addedAt: now,
            startedAt: null,
            finishedAt: null,
            rating: null,
            notes: '',
            progress: null,
            format: 'print',
            totalPages: editionPages ?? null,
            totalMinutes: null,
          },
          shelf,
        );
        const snap = current.current;
        let saved = draft;
        await optimistic(
          { ...snap, entries: [...snap.entries, draft] },
          async () => {
            saved = await repository.addEntry(draft);
          },
          `Couldn't add “${book.title}”`,
        );
        // The repository may have linked the entry to an existing shared catalog row (new book id).
        if (saved !== draft) commit({ ...current.current, entries: replaceEntries([saved]) });
        return saved;
      },

      async moveEntries(ids, shelfId, finishedDate) {
        const target = current.current.shelves.find((s) => s.id === shelfId);
        if (!target) return;
        const set = new Set(ids);
        const moved = current.current.entries.filter((e) => set.has(e.id) && e.shelfId !== shelfId).map((e) =>
          applyMove(target.kind === 'read' && finishedDate ? { ...e, finishedAt: finishedDate.toISOString() } : e, target),
        );
        if (moved.length === 0) return;
        if (target.kind === 'read') {
          await repository.saveEntries(moved);
          commit({ ...current.current, entries: replaceEntries(moved) });
          return;
        }
        await optimistic(
          { ...current.current, entries: replaceEntries(moved) },
          () => repository.saveEntries(moved),
          `Couldn't move ${moved.length === 1 ? 'the book' : `${moved.length} books`} to ${target.name}`,
        );
      },

      async restoreEntries(previous) {
        const known = new Set(current.current.entries.map((e) => e.id));
        const restorable = previous.filter((e) => known.has(e.id));
        if (restorable.length === 0) return;
        await optimistic(
          { ...current.current, entries: replaceEntries(restorable) },
          () => repository.saveEntries(restorable),
          "Couldn't undo the move",
        );
      },

      async updateEntry(id, patch) {
        const entry = current.current.entries.find((e) => e.id === id);
        if (!entry) return;
        const { notes, rating, ...otherFields } = patch;
        if (Object.keys(otherFields).length === 0) {
          const fields = { ...(notes !== undefined ? { notes } : {}), ...(rating !== undefined ? { rating } : {}) };
          if (Object.keys(fields).length === 0) return;
          await repository.saveAnnotations(id, fields);
          const latest = current.current.entries.find((item) => item.id === id);
          if (latest) commit({ ...current.current, entries: replaceEntries([{ ...latest, ...fields }]) });
          return;
        }
        // Changing format or edition length changes what the saved position means.
        const next = recomputeProgress({ ...entry, ...patch });
        if (next.progress && !(next.progress.percent === 100 && entry.progress?.percent === 100)
          && (patch.format !== undefined || patch.totalPages !== undefined || patch.totalMinutes !== undefined)) {
          next.progress = { ...next.progress, updatedAt: new Date().toISOString() };
        }
        await optimistic({ ...current.current, entries: replaceEntries([next]) }, () => repository.saveEntries([next]), "Couldn't save your changes");
      },

      async setGenres(ids, update) {
        const set = new Set(ids);
        const changed = current.current.entries
          .filter((e) => set.has(e.id))
          .map((e) => ({ ...e, book: { ...e.book, genres: [...new Set(update(e.book.genres).map((g) => g.trim()).filter(Boolean))] } }));
        await optimistic({ ...current.current, entries: replaceEntries(changed) }, () => repository.saveEntries(changed), "Couldn't update genres");
      },

      async setProgress(id, input, expectedAt) {
        const entry = current.current.entries.find((e) => e.id === id);
        if (!entry) throw new Error('This book is no longer in your library');
        const conflict = () => new Error('Progress changed in another tab. Review the latest saved value before retrying.');
        if ((entry.progress?.updatedAt ?? null) !== expectedAt) throw conflict();
        const { entry: next, log, milestone } = applyProgress(entry, input);
        if (entry.progress?.percent === 100 && next.progress?.percent === 100) {
          return { milestone: null, undo: async () => undefined };
        }
        const snap = current.current;
        commit({ ...snap, entries: replaceEntries([next]), logs: [...snap.logs, log] });
        try {
          if (!await repository.saveProgress(next, log, expectedAt)) {
            await reload();
            throw conflict();
          }
        } catch (error) {
          const latest = current.current;
          commit({
            ...latest,
            entries: latest.entries.map((item) => item.id === id && item.progress?.updatedAt === next.progress?.updatedAt
              ? { ...item, progress: entry.progress, startedAt: entry.startedAt }
              : item),
            logs: latest.logs.filter((item) => item.id !== log.id),
          });
          throw error;
        }
        const undo = async () => {
          const latest = current.current;
          const restored = latest.entries.find((e) => e.id === id);
          if (!restored) return;
          const previous = { ...restored, progress: entry.progress, startedAt: entry.startedAt };
          if (!await repository.saveProgress(previous, log, next.progress?.updatedAt ?? null, true)) {
            await reload();
            throw new Error('A newer progress update is already saved');
          }
          const afterUndo = current.current;
          commit({ ...afterUndo, entries: replaceEntries([previous]), logs: afterUndo.logs.filter((item) => item.id !== log.id) });
        };
        return { milestone, undo };
      },

      async markFinished(id) {
        const target = defaultShelf('read');
        const entry = current.current.entries.find((e) => e.id === id);
        if (!entry) return;
        const finished = applyMove(entry, target);
        await repository.saveEntries([finished]);
        commit({ ...current.current, entries: replaceEntries([finished]) });
      },

      async removeEntries(ids) {
        const set = new Set(ids);
        const snap = current.current;
        await optimistic(
          { ...snap, entries: snap.entries.filter((e) => !set.has(e.id)), logs: snap.logs.filter((l) => !set.has(l.entryId)) },
          () => repository.removeEntries(ids),
          `Couldn't remove ${ids.length === 1 ? 'the book' : `${ids.length} books`}`,
        );
      },

      async createShelf(name) {
        const snap = current.current;
        const shelf: Shelf = { id: newId(), name: name.trim(), position: Math.max(-1, ...snap.shelves.map((item) => item.position)) + 1, kind: null };
        await optimistic({ ...snap, shelves: [...snap.shelves, shelf] }, () => repository.saveShelves([shelf]), `Couldn't create “${shelf.name}”`);
        return shelf;
      },

      async renameShelf(id, name) {
        const shelf = current.current.shelves.find((s) => s.id === id);
        if (!shelf) return;
        const next = { ...shelf, name: name.trim() };
        await optimistic(
          { ...current.current, shelves: current.current.shelves.map((s) => (s.id === id ? next : s)) },
          () => repository.saveShelves([next]),
          "Couldn't rename the shelf",
        );
      },

      async deleteShelf(id, targetId) {
        const snap = current.current;
        const shelf = snap.shelves.find((s) => s.id === id);
        if (!shelf || shelf.kind) return;
        const target = snap.shelves.find((item) => item.id === targetId);
        if (!target) throw new Error('Shelf is unavailable');
        const now = new Date();
        await repository.moveBooksAndDeleteShelf(id, targetId, now);
        const latest = current.current;
        commit({
          ...latest,
          shelves: latest.shelves.filter((item) => item.id !== id),
          entries: latest.entries.map((entry) => entry.shelfId === id ? rehomeEntry(entry, target, now) : entry),
        });
      },

      async reorderShelves(orderedIds) {
        const snap = current.current;
        const byId = new Map(snap.shelves.map((s) => [s.id, s]));
        const shelves = orderedIds.map((id, position) => ({ ...byId.get(id)!, position })).filter((s) => s.id);
        await optimistic({ ...snap, shelves }, () => repository.saveShelves(shelves), "Couldn't save the new shelf order");
      },

      async setGoal(year, target) {
        const snap = current.current;
        const goal = { year, target };
        await optimistic({ ...snap, goals: [...snap.goals.filter((g) => g.year !== year), goal] }, () => repository.saveGoal(goal), "Couldn't save your reading goal");
      },

      async clearGoal(year) {
        const snap = current.current;
        await optimistic({ ...snap, goals: snap.goals.filter((g) => g.year !== year) }, () => repository.deleteGoal(year), "Couldn't remove your reading goal");
      },
    };
  }, [snapshot, load, repository, reload, optimistic]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used inside <LibraryProvider>');
  return ctx;
}
