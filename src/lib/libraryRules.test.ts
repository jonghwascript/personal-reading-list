import type { Book, LibraryEntry, Shelf } from '../types';
import { applyMove, filterEntries, findDuplicate, sortEntries } from './libraryRules';

const book = (over: Partial<Book> = {}): Book => ({
  id: 'b1',
  title: 'Dune',
  authors: ['Frank Herbert'],
  coverUrl: null,
  isbn10: null,
  isbn13: '9780441013593',
  pageCount: 400,
  publishedYear: 1965,
  publisher: null,
  description: null,
  genres: ['Sci-Fi'],
  source: 'openlibrary',
  workKey: null,
  ...over,
});

const entry = (over: Partial<LibraryEntry> = {}): LibraryEntry => ({
  id: 'e1',
  book: book(),
  shelfId: 'want',
  addedAt: '2026-01-01T00:00:00Z',
  startedAt: null,
  finishedAt: null,
  rating: null,
  notes: '',
  progress: null,
  format: 'print',
  totalPages: null,
  totalMinutes: null,
  ...over,
});

const shelf = (kind: Shelf['kind'], id = kind ?? 'custom'): Shelf => ({ id, name: id, position: 0, kind });
const NOW = new Date('2026-06-01T10:00:00Z');

describe('applyMove', () => {
  it('starts a book when moved to Currently Reading', () => {
    const moved = applyMove(entry(), shelf('reading'), NOW);
    expect(moved).toMatchObject({ shelfId: 'reading', startedAt: NOW.toISOString(), progress: { percent: 0, currentPage: 0 } });
  });

  it('finishes a book when moved to Read and keeps an existing finish date', () => {
    const moved = applyMove(entry(), shelf('read'), NOW);
    expect(moved.finishedAt).toBe(NOW.toISOString());
    expect(moved.progress?.percent).toBe(100);
    const again = applyMove({ ...moved, finishedAt: '2025-01-01T00:00:00Z' }, shelf('read'), NOW);
    expect(again.finishedAt).toBe('2025-01-01T00:00:00Z');
  });

  it('resets reading state for Want to Read but not for custom shelves', () => {
    const read = applyMove(entry(), shelf('read'), NOW);
    expect(applyMove(read, shelf(null, 'favorites'), NOW)).toMatchObject({ shelfId: 'favorites', finishedAt: NOW.toISOString() });
    expect(applyMove(read, shelf('want'), NOW)).toMatchObject({ finishedAt: null, startedAt: null, progress: null });
  });
});

describe('findDuplicate', () => {
  it('detects another edition of a book already in the library', () => {
    const existing = entry();
    expect(findDuplicate([existing], book({ id: 'x', isbn13: null, isbn10: '0441013597' }))).toBe(existing);
    expect(findDuplicate([existing], book({ id: 'y', title: 'Neuromancer', isbn13: null, authors: ['William Gibson'] }))).toBeUndefined();
  });
});

describe('sortEntries / filterEntries', () => {
  const a = entry({ id: 'a', book: book({ title: 'The Road', authors: ['Cormac McCarthy'] }), rating: 3 });
  const b = entry({ id: 'b', book: book({ title: 'Beloved', authors: ['Toni Morrison'], genres: ['Fiction'] }), rating: null });
  const c = entry({ id: 'c', book: book({ title: 'Circe', authors: ['Madeline Miller'] }), rating: 5 });

  it('ignores leading articles and sinks unrated books', () => {
    expect(sortEntries([a, b, c], 'title').map((e) => e.id)).toEqual(['b', 'c', 'a']);
    expect(sortEntries([a, b, c], 'rating').map((e) => e.id)).toEqual(['c', 'a', 'b']);
    expect(sortEntries([a, b, c], 'author').map((e) => e.id)).toEqual(['a', 'c', 'b']);
  });

  it('filters by genre and minimum rating', () => {
    expect(filterEntries([a, b, c], { genre: 'Fiction' })).toEqual([b]);
    expect(filterEntries([a, b, c], { minRating: 4 })).toEqual([c]);
  });
});
