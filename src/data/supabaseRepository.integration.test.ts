// @vitest-environment node
/**
 * Live check against the real Supabase project — exercises SupabaseRepository end to end plus RLS
 * isolation between two users. Opt-in, because it creates two throwaway accounts each run:
 *
 *   RUN_SUPABASE_IT=1 npx vitest run src/data/supabaseRepository.integration.test.ts
 *
 * Requires "Confirm email" to be OFF in Supabase Auth settings (sign-up must return a session).
 * Data rows are cleaned up afterwards; the auth users remain (delete them in the dashboard).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { applyMove } from '../lib/libraryRules';
import { applyProgress } from '../lib/progress';
import type { Book, LibraryEntry } from '../types';
import { SupabaseRepository } from './supabaseRepository';

const enabled = process.env.RUN_SUPABASE_IT === '1';
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

async function signUpFresh(label: string): Promise<{ db: SupabaseClient; userId: string; email: string }> {
  const db = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `bookshelf-it-${label}-${Date.now().toString(36)}@example.com`;
  const password = `It-${crypto.randomUUID()}`;
  const { data, error } = await db.auth.signUp({ email, password });
  if (error) throw new Error(`sign-up failed for ${label}: ${error.message}`);
  if (!data.session || !data.user) throw new Error('sign-up returned no session — is "Confirm email" turned off?');
  return { db, userId: data.user.id, email };
}

const book: Book = {
  id: 'pending',
  title: 'Bookshelf Integration Test Book',
  authors: ['Test Author'],
  coverUrl: null,
  isbn10: null,
  isbn13: null,
  pageCount: 200,
  publishedYear: 2026,
  publisher: null,
  description: null,
  genres: ['Fiction'],
  source: 'openlibrary',
  workKey: `/works/OL-IT-${Date.now()}W`,
};

describe.skipIf(!enabled)('SupabaseRepository (live)', () => {
  let a: Awaited<ReturnType<typeof signUpFresh>>;
  let b: Awaited<ReturnType<typeof signUpFresh>>;
  let repoA: SupabaseRepository;
  let repoB: SupabaseRepository;
  let entry: LibraryEntry;

  beforeAll(async () => {
    a = await signUpFresh('a');
    b = await signUpFresh('b');
    repoA = new SupabaseRepository(a.db, a.userId);
    repoB = new SupabaseRepository(b.db, b.userId);
    console.info(`[it] created users: ${a.email}, ${b.email}`);
  }, 30_000);

  afterAll(async () => {
    for (const [repo, db] of [[repoA, a?.db], [repoB, b?.db]] as const) {
      if (!repo || !db) continue;
      const snap = await repo.load().catch(() => null);
      if (!snap) continue;
      await repo.removeEntries(snap.entries.map((e) => e.id)).catch(() => undefined);
      for (const g of snap.goals) await repo.deleteGoal(g.year).catch(() => undefined);
      for (const s of snap.shelves.filter((s) => !s.kind)) await repo.deleteShelf(s.id).catch(() => undefined);
    }
  });

  it('creates the three default shelves for a new user', async () => {
    const { shelves, entries } = await repoA.load();
    expect(shelves.map((s) => s.kind).sort()).toEqual(['read', 'reading', 'want']);
    expect(entries).toEqual([]);
  });

  it('adds a book through the shared catalog and links the entry', async () => {
    const { shelves } = await repoA.load();
    const want = shelves.find((s) => s.kind === 'want')!;
    const draft: LibraryEntry = {
      id: crypto.randomUUID(),
      book,
      shelfId: want.id,
      addedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      rating: null,
      notes: '',
      progress: null,
      format: 'print',
      totalPages: null,
      totalMinutes: null,
    };
    entry = await repoA.addEntry(draft);
    expect(entry.book.id).not.toBe('pending'); // replaced by the catalog row's uuid
    const { entries } = await repoA.load();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.book.title).toBe(book.title);
  });

  it('persists moves, progress history, rating and notes', async () => {
    const { shelves } = await repoA.load();
    const reading = shelves.find((s) => s.kind === 'reading')!;
    const moved = applyMove(entry, reading);
    const { entry: progressed, log } = applyProgress(moved, { page: 50 });
    await repoA.saveEntries([{ ...progressed, rating: 4, notes: 'Integration note' }]);
    await repoA.appendLog(log);

    const snap = await repoA.load();
    const saved = snap.entries[0]!;
    expect(saved.shelfId).toBe(reading.id);
    expect(saved.progress).toMatchObject({ currentPage: 50, percent: 25 });
    expect(saved.rating).toBe(4);
    expect(saved.notes).toBe('Integration note');
    expect(snap.logs.filter((l) => l.entryId === entry.id)).toHaveLength(1);

    // Formats, edition length and undo of a log row.
    const audio = applyProgress({ ...saved, format: 'audio', totalMinutes: 300 }, { minutes: 90 });
    await repoA.saveEntries([audio.entry]);
    await repoA.appendLog(audio.log);
    await repoA.removeLog(audio.log.id);
    const after = await repoA.load();
    expect(after.entries[0]).toMatchObject({ format: 'audio', totalMinutes: 300, progress: { minutes: 90, percent: 30 } });
    expect(after.logs.filter((l) => l.entryId === entry.id)).toHaveLength(1);
  });

  it('saves reading goals and custom shelves, and protects default shelves', async () => {
    const year = new Date().getFullYear();
    await repoA.saveGoal({ year, target: 12 });
    const custom = { id: crypto.randomUUID(), name: 'IT Favorites', position: 3, kind: null };
    await repoA.saveShelves([custom]);
    let snap = await repoA.load();
    expect(snap.goals).toEqual([{ year, target: 12 }]);
    expect(snap.shelves.map((s) => s.name)).toContain('IT Favorites');

    await repoA.deleteShelf(custom.id);
    const defaultShelf = snap.shelves.find((s) => s.kind === 'read')!;
    await expect(repoA.deleteShelf(defaultShelf.id)).rejects.toThrow(/default shelves/i);
    snap = await repoA.load();
    expect(snap.shelves).toHaveLength(3);
  });

  it('isolates users: B sees none of A’s data and cannot write into it', async () => {
    const snapB = await repoB.load();
    expect(snapB.entries).toEqual([]);
    expect(snapB.goals).toEqual([]);
    const { shelves: shelvesA } = await repoA.load();
    expect(snapB.shelves.map((s) => s.id).some((id) => shelvesA.some((s) => s.id === id))).toBe(false);

    // Direct table reads as B return nothing of A's.
    const { data: leaked } = await b.db.from('library_entries').select('id').eq('user_id', a.userId);
    expect(leaked).toEqual([]);

    // B cannot file a book onto A's shelf, nor edit A's entry.
    const intrusion: LibraryEntry = { ...entry, id: crypto.randomUUID(), shelfId: shelvesA[0]!.id };
    await expect(repoB.saveEntries([intrusion])).rejects.toThrow();
    const { data: updated } = await b.db.from('library_entries').update({ notes: 'hacked' }).eq('id', entry.id).select('id');
    expect(updated).toEqual([]);
    const after = await repoA.load();
    expect(after.entries[0]!.notes).toBe('Integration note');
  });

  it('lets B reuse the shared catalog row instead of duplicating it', async () => {
    const { shelves } = await repoB.load();
    const saved = await repoB.addEntry({
      id: crypto.randomUUID(),
      book,
      shelfId: shelves.find((s) => s.kind === 'want')!.id,
      addedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      rating: null,
      notes: '',
      progress: null,
      format: 'print',
      totalPages: null,
      totalMinutes: null,
    });
    expect(saved.book.id).toBe(entry.book.id);
  });
});
