import type { Book, LibraryEntry, ReadingProgress, Shelf } from '../types';
import { isSameBook } from './bookIdentity';
import { totalPagesOf } from './progress';

/**
 * Moving between default shelves carries meaning:
 * - to "Currently Reading": stamp a start date and begin progress at 0
 * - to "Read": stamp a finish date and complete progress
 * - to "Want to Read": the book is un-started again
 * Custom shelves ("Favorites") are organisational only and leave reading state untouched.
 */
export function applyMove(entry: LibraryEntry, target: Shelf, now: Date = new Date()): LibraryEntry {
  const iso = now.toISOString();
  const next: LibraryEntry = { ...entry, shelfId: target.id };
  switch (target.kind) {
    case 'reading':
      return {
        ...next,
        startedAt: entry.startedAt ?? iso,
        finishedAt: null,
        // Keep a partly-read position (resuming a book); otherwise start from the beginning.
        progress: entry.progress && (entry.progress.percent ?? 0) < 100 ? entry.progress : startPosition(entry, iso),
      };
    case 'read':
      return {
        ...next,
        startedAt: entry.startedAt ?? iso,
        finishedAt: entry.finishedAt ?? iso,
        progress: endPosition(entry, iso),
      };
    case 'want':
      return { ...next, startedAt: null, finishedAt: null, progress: null };
    default:
      return next;
  }
}

function startPosition(entry: LibraryEntry, updatedAt: string): ReadingProgress {
  return {
    currentPage: entry.format === 'print' ? 0 : null,
    percent: entry.format === 'ebook' || (entry.format === 'print' && totalPagesOf(entry)) || (entry.format === 'audio' && entry.totalMinutes) ? 0 : null,
    minutes: entry.format === 'audio' ? 0 : null,
    updatedAt,
  };
}

function endPosition(entry: LibraryEntry, updatedAt: string): ReadingProgress {
  return {
    currentPage: entry.format === 'print' ? (totalPagesOf(entry) ?? entry.progress?.currentPage ?? null) : null,
    percent: 100,
    minutes: entry.format === 'audio' ? (entry.totalMinutes ?? entry.progress?.minutes ?? null) : null,
    updatedAt,
  };
}

export function findDuplicate(entries: LibraryEntry[], book: Book): LibraryEntry | undefined {
  return entries.find((e) => isSameBook(e.book, book));
}

export type SortKey = 'title' | 'author' | 'added' | 'finished' | 'rating';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const sortTitle = (t: string) => t.replace(/^(the|a|an)\s+/i, '');
const sortAuthor = (e: LibraryEntry) => {
  const first = e.book.authors[0] ?? '';
  return first.split(/\s+/).at(-1) ?? first;
};

/** Newest-first for dates and highest-first for ratings; unknown values always sink to the end. */
export function sortEntries(entries: LibraryEntry[], key: SortKey): LibraryEntry[] {
  const list = [...entries];
  const byTitle = (a: LibraryEntry, b: LibraryEntry) => collator.compare(sortTitle(a.book.title), sortTitle(b.book.title));
  const desc = (get: (e: LibraryEntry) => number | null) => (a: LibraryEntry, b: LibraryEntry) => {
    const av = get(a);
    const bv = get(b);
    if (av === bv) return byTitle(a, b);
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av;
  };
  switch (key) {
    case 'title':
      return list.sort(byTitle);
    case 'author':
      return list.sort((a, b) => collator.compare(sortAuthor(a), sortAuthor(b)) || byTitle(a, b));
    case 'added':
      return list.sort(desc((e) => Date.parse(e.addedAt)));
    case 'finished':
      return list.sort(desc((e) => (e.finishedAt ? Date.parse(e.finishedAt) : null)));
    case 'rating':
      return list.sort(desc((e) => e.rating));
  }
}

export interface EntryFilter {
  genre?: string | null;
  author?: string | null;
  /** Minimum rating (inclusive). */
  minRating?: number | null;
}

export function filterEntries(entries: LibraryEntry[], filter: EntryFilter): LibraryEntry[] {
  return entries.filter(
    (e) =>
      (!filter.genre || e.book.genres.includes(filter.genre)) &&
      (!filter.author || e.book.authors.includes(filter.author)) &&
      (!filter.minRating || (e.rating ?? 0) >= filter.minRating),
  );
}

export function genresIn(entries: LibraryEntry[]): string[] {
  return [...new Set(entries.flatMap((e) => e.book.genres))].sort(collator.compare);
}

export function authorsIn(entries: LibraryEntry[]): string[] {
  return [...new Set(entries.flatMap((e) => e.book.authors))].sort((a, b) =>
    collator.compare(a.split(' ').at(-1) ?? a, b.split(' ').at(-1) ?? b),
  );
}
