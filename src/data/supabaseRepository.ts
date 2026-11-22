import type { SupabaseClient } from '@supabase/supabase-js';
import { catalogKey } from '../lib/bookIdentity';
import type { Book, BookSource, LibraryEntry, ProgressLog, ReadingFormat, ReadingGoal, Shelf, ShelfKind } from '../types';
import type { LibraryRepository, LibrarySnapshot } from './repository';

interface BookRow {
  id: string;
  title: string;
  authors: string[];
  cover_url: string | null;
  isbn10: string | null;
  isbn13: string | null;
  page_count: number | null;
  published_year: number | null;
  publisher: string | null;
  description: string | null;
  genres: string[];
  source: BookSource;
  work_key: string | null;
}

interface EntryRow {
  id: string;
  shelf_id: string;
  added_at: string;
  started_at: string | null;
  finished_at: string | null;
  rating: number | null;
  notes: string;
  genres: string[];
  current_page: number | null;
  current_minutes: number | null;
  progress_percent: number | string | null;
  progress_updated_at: string | null;
  format: ReadingFormat;
  total_pages: number | null;
  total_minutes: number | null;
  book: BookRow;
}

const BOOK_COLUMNS =
  'id,title,authors,cover_url,isbn10,isbn13,page_count,published_year,publisher,description,genres,source,work_key';

function rowToBook(row: BookRow, genres?: string[]): Book {
  return {
    id: row.id,
    title: row.title,
    authors: row.authors ?? [],
    coverUrl: row.cover_url,
    isbn10: row.isbn10,
    isbn13: row.isbn13,
    pageCount: row.page_count,
    publishedYear: row.published_year,
    publisher: row.publisher,
    description: row.description,
    genres: genres && genres.length > 0 ? genres : (row.genres ?? []),
    source: row.source,
    workKey: row.work_key,
  };
}

function rowToEntry(row: EntryRow): LibraryEntry {
  return {
    id: row.id,
    book: rowToBook(row.book, row.genres),
    shelfId: row.shelf_id,
    addedAt: row.added_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    rating: row.rating,
    notes: row.notes ?? '',
    // A position without a percent is valid ("page 147 of ?"), so presence is keyed on the timestamp.
    progress:
      row.progress_updated_at === null
        ? null
        : {
            currentPage: row.current_page,
            percent: row.progress_percent === null ? null : Number(row.progress_percent),
            minutes: row.current_minutes,
            updatedAt: row.progress_updated_at,
          },
    format: row.format ?? 'print',
    totalPages: row.total_pages,
    totalMinutes: row.total_minutes,
  };
}

function entryToRow(entry: LibraryEntry, userId: string) {
  return {
    id: entry.id,
    user_id: userId,
    book_id: entry.book.id,
    shelf_id: entry.shelfId,
    added_at: entry.addedAt,
    started_at: entry.startedAt,
    finished_at: entry.finishedAt,
    rating: entry.rating,
    notes: entry.notes,
    genres: entry.book.genres,
    current_page: entry.progress?.currentPage ?? null,
    current_minutes: entry.progress?.minutes ?? null,
    progress_percent: entry.progress?.percent ?? null,
    progress_updated_at: entry.progress?.updatedAt ?? null,
    format: entry.format,
    total_pages: entry.totalPages,
    total_minutes: entry.totalMinutes,
  };
}

/** Throws the Supabase error so the optimistic layer can roll back and explain what failed. */
function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

/** Like check, for selects: a null body means "no rows". */
function rows<T>(result: { data: T[] | null; error: { message: string } | null }): T[] {
  return check(result) ?? [];
}

export class SupabaseRepository implements LibraryRepository {
  readonly kind = 'account' as const;

  constructor(
    private readonly db: SupabaseClient,
    private readonly userId: string,
  ) {}

  async load(): Promise<LibrarySnapshot> {
    // Four narrow queries in parallel; RLS scopes every one to the signed-in user.
    const [shelves, entries, goals, logs] = await Promise.all([
      this.db.from('shelves').select('id,name,position,kind').order('position'),
      this.db
        .from('library_entries')
        .select(
          `id,shelf_id,added_at,started_at,finished_at,rating,notes,genres,format,total_pages,total_minutes,current_page,current_minutes,progress_percent,progress_updated_at,book:books(${BOOK_COLUMNS})`,
        ),
      this.db.from('reading_goals').select('year,target'),
      this.db.from('reading_logs').select('id,entry_id,page,percent,minutes,logged_at').order('logged_at'),
    ]);
    return {
      shelves: rows(shelves).map((s) => ({ ...s, kind: s.kind as ShelfKind | null })),
      entries: (rows(entries) as unknown as EntryRow[]).map(rowToEntry),
      goals: rows(goals) as ReadingGoal[],
      logs: rows(logs).map((l) => ({
        id: l.id,
        entryId: l.entry_id,
        page: l.page,
        percent: l.percent === null ? null : Number(l.percent),
        minutes: l.minutes,
        loggedAt: l.logged_at,
      })),
    };
  }

  /** Upserts into the shared catalog first, then links the user's entry to that row. */
  async addEntry(entry: LibraryEntry): Promise<LibraryEntry> {
    const { book } = entry;
    const catalogRow = {
      catalog_key: catalogKey(book),
      title: book.title,
      authors: book.authors,
      cover_url: book.coverUrl,
      isbn10: book.isbn10,
      isbn13: book.isbn13,
      page_count: book.pageCount,
      published_year: book.publishedYear,
      publisher: book.publisher,
      description: book.description,
      genres: book.genres,
      source: book.source,
      work_key: book.workKey,
    };
    const saved = check(
      await this.db.from('books').upsert(catalogRow, { onConflict: 'catalog_key' }).select(BOOK_COLUMNS).single(),
    ) as BookRow;
    const linked: LibraryEntry = { ...entry, book: rowToBook(saved, book.genres) };
    check(await this.db.from('library_entries').insert(entryToRow(linked, this.userId)));
    return linked;
  }

  async saveEntries(entries: LibraryEntry[]): Promise<void> {
    if (entries.length === 0) return;
    check(await this.db.from('library_entries').upsert(entries.map((e) => entryToRow(e, this.userId))));
  }

  async saveAnnotations(id: string, fields: Partial<Pick<LibraryEntry, 'notes' | 'rating'>>): Promise<void> {
    check(await this.db.from('library_entries').update(fields).eq('id', id).eq('user_id', this.userId).select('id').single());
  }

  async removeEntries(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    check(await this.db.from('library_entries').delete().in('id', ids));
  }

  async appendLog(log: ProgressLog): Promise<void> {
    check(
      await this.db.from('reading_logs').insert({
        id: log.id,
        user_id: this.userId,
        entry_id: log.entryId,
        page: log.page,
        percent: log.percent,
        minutes: log.minutes,
        logged_at: log.loggedAt,
      }),
    );
  }

  async removeLog(id: string): Promise<void> {
    check(await this.db.from('reading_logs').delete().eq('id', id));
  }

  async saveProgress(entry: LibraryEntry, log: ProgressLog, expectedAt: string | null, undo = false): Promise<boolean> {
    return check(await this.db.rpc('save_reading_progress', {
      entry_id: entry.id,
      expected_at: expectedAt,
      next_entry: entryToRow(entry, this.userId),
      log_change: log,
      undo,
    })) === true;
  }

  async saveShelves(shelves: Shelf[]): Promise<void> {
    if (shelves.length === 0) return;
    check(
      await this.db
        .from('shelves')
        .upsert(shelves.map((s) => ({ id: s.id, user_id: this.userId, name: s.name, position: s.position, kind: s.kind }))),
    );
  }

  async deleteShelf(id: string): Promise<void> {
    check(await this.db.from('shelves').delete().eq('id', id));
  }

  async moveBooksAndDeleteShelf(id: string, targetId: string, now = new Date()): Promise<void> {
    check(await this.db.rpc('move_books_and_delete_shelf', { source_id: id, target_id: targetId, moved_at: now.toISOString() }));
  }

  async saveGoal(goal: ReadingGoal): Promise<void> {
    check(await this.db.from('reading_goals').upsert({ user_id: this.userId, ...goal }));
  }

  async deleteGoal(year: number): Promise<void> {
    check(await this.db.from('reading_goals').delete().eq('year', year));
  }
}
