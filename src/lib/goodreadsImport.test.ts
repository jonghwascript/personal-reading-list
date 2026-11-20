import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildGuestSnapshot } from '../data/guestSeed';
import type { Book, Shelf } from '../types';
import {
  buildEntry,
  buildImportPlan,
  cleanText,
  defaultMapping,
  findCatalogMatches,
  mergeCatalogMatch,
  NotGoodreadsError,
  parseCsv,
  parseGoodreadsCsv,
  parseGoodreadsDate,
  prettyShelfName,
  rowToBook,
  type GoodreadsRow,
  type ResolvedShelves,
} from './goodreadsImport';
import { __resetOpenLibraryForTests } from './openLibrary';

const sample = readFileSync(resolve(__dirname, '../../data/sample-books.csv'), 'utf8');
const HEADER =
  'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies';

describe('parseCsv', () => {
  it('handles quoted commas, escaped quotes, CRLF, a BOM and newlines inside quotes', () => {
    const records = parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","line\nbreak"\r\n');
    expect(records.map((r) => r.cells)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line\nbreak'],
    ]);
  });

  it('skips blank lines and keeps a final record without a newline', () => {
    expect(parseCsv('a\n\n b \n').map((r) => r.cells)).toEqual([['a'], [' b ']]);
    expect(parseCsv('a,b\n1,2').at(-1)!.cells).toEqual(['1', '2']);
  });

  it('accepts whitespace before an opening quote', () => {
    expect(parseCsv('a, "b,c"')[0]!.cells).toEqual(['a', 'b,c']);
  });
});

describe('parseGoodreadsCsv on the sample export', () => {
  const { rows, problems, missingColumns } = parseGoodreadsCsv(sample);
  const byTitle = (t: string) => rows.find((r) => r.title.startsWith(t))!;

  it('reads every book', () => {
    expect(rows).toHaveLength(45);
    expect(problems).toEqual([]);
    expect(missingColumns).toEqual([]);
  });

  it('unwraps ="…" ISBNs, including one with a leading space', () => {
    expect(byTitle('The Great Gatsby')).toMatchObject({ isbn10: '0743273567', isbn13: '9780743273565' });
    expect(byTitle('Say Nothing')).toMatchObject({ isbn10: null, isbn13: '9780385521314' });
    expect(byTitle('Eloquent JavaScript')).toMatchObject({ isbn10: null, isbn13: null });
  });

  it('treats a 0 rating as unrated and trims the exclusive shelf', () => {
    expect(byTitle('Say Nothing').rating).toBeNull();
    expect(byTitle('To Kill a Mockingbird')).toMatchObject({ rating: 5, exclusiveShelf: 'read' });
  });

  it('keeps commas inside quoted titles and publishers', () => {
    expect(byTitle('Thinking, Fast and Slow').publisher).toBe('Farrar, Straus and Giroux');
  });

  it('reads dates, custom shelves, co-authors, original year and notes', () => {
    const gatsby = byTitle('The Great Gatsby');
    expect(gatsby.dateRead).toBe('2025-09-14T12:00:00.000Z');
    expect(gatsby.dateAdded).toBe('2025-01-10T12:00:00.000Z');
    expect(gatsby.tags).toEqual(['favorites']);
    expect(gatsby.publishedYear).toBe(1925);
    expect(gatsby.notes).toBe('A perfect novel. Every sentence earns its place.\n\nPrivate notes: Great for re-reading');
    expect(byTitle('The Pragmatic Programmer').authors).toEqual(['David Thomas', 'Andrew Hunt']);
  });

  it('strips HTML from reviews', () => {
    expect(byTitle('The Mythical Man-Month').notes).toMatch(/^Still relevant after 50 years/);
  });

  it('tolerates a row with a missing trailing column', () => {
    expect(byTitle('A Gentleman in Moscow')).toMatchObject({ rating: 5, exclusiveShelf: 'read' });
  });
});

describe('parseGoodreadsCsv variations', () => {
  it('rejects a file that is not a Goodreads export', () => {
    expect(() => parseGoodreadsCsv('name,email\nA,a@b.c')).toThrow(NotGoodreadsError);
    expect(() => parseGoodreadsCsv('')).toThrow(NotGoodreadsError);
  });

  it('works with a minimal export and reports useful missing columns', () => {
    const { rows, missingColumns } = parseGoodreadsCsv('  Title , Author\n Dune , Frank Herbert \n');
    expect(rows[0]).toMatchObject({ title: 'Dune', authors: ['Frank Herbert'], exclusiveShelf: 'to-read', rating: null });
    expect(missingColumns).toContain('Exclusive Shelf');
  });

  it('reports rows without a title by line number', () => {
    const { rows, problems } = parseGoodreadsCsv(`${HEADER}\n1,,Nobody\n2,Dune,Frank Herbert`);
    expect(rows).toHaveLength(1);
    expect(problems).toEqual([{ line: 2, reason: 'No title' }]);
  });

  it('infers read when the shelf is missing but a read date exists, and keeps custom exclusive shelves', () => {
    const csv = `Title,Date Read,Exclusive Shelf,Bookshelves,Binding\nA,2024/02/03,,,Kindle Edition\nB,,did-not-finish,"did-not-finish, sci-fi",Audible Audio`;
    const { rows } = parseGoodreadsCsv(csv);
    expect(rows[0]).toMatchObject({ exclusiveShelf: 'read', format: 'ebook' });
    expect(rows[1]).toMatchObject({ exclusiveShelf: 'did-not-finish', tags: ['sci-fi'], format: 'audio' });
  });

  it('parses 600 rows quickly', () => {
    const lines = Array.from({ length: 600 }, (_, i) => `${i},Book ${i},Author ${i},,,,,3,,,,200,,,,2025/01/01,,,to-read,,,,0,0`);
    const started = performance.now();
    const { rows } = parseGoodreadsCsv([HEADER, ...lines].join('\n'));
    const plan = buildImportPlan(rows, buildGuestSnapshot().entries);
    expect(rows).toHaveLength(600);
    expect(plan.items.filter((i) => i.status === 'new')).toHaveLength(600);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe('helpers', () => {
  it('parses Goodreads dates and rejects impossible ones', () => {
    expect(parseGoodreadsDate('2025/9/4')).toBe('2025-09-04T12:00:00.000Z');
    expect(parseGoodreadsDate('2025-02-30')).toBeNull();
    expect(parseGoodreadsDate('')).toBeNull();
  });

  it('cleans HTML entities and breaks', () => {
    expect(cleanText('A<br/>B &amp; <b>C</b>')).toBe('A\nB & C');
  });

  it('prettifies shelf slugs', () => {
    expect(prettyShelfName('did-not-finish')).toBe('Did not finish');
  });
});

describe('buildImportPlan', () => {
  const { rows } = parseGoodreadsCsv(sample);

  it('flags books already in the library and repeats within the file', () => {
    const library = buildGuestSnapshot().entries;
    const repeated = { ...rows[0]!, line: 99 };
    const plan = buildImportPlan([...rows, repeated], library);
    const inLibrary = plan.items.filter((i) => i.status === 'in-library');
    expect(inLibrary.length).toBeGreaterThan(0);
    expect(plan.items.at(-1)).toMatchObject({ status: expect.stringMatching(/repeated|in-library/) });
  });

  it('collects custom shelves with counts', () => {
    const plan = buildImportPlan(rows, []);
    expect(plan.customShelves).toEqual([{ slug: 'favorites', exclusive: false, count: 10 }]);
    expect(plan.standardCounts).toEqual({ read: 33, 'to-read': 8, 'currently-reading': 4 });
  });

  it('maps a custom shelf to a same-named shelf when one exists', () => {
    const shelves: Shelf[] = [{ id: 's1', name: 'Favorites', position: 3, kind: null }];
    expect(defaultMapping({ slug: 'favorites', exclusive: false, count: 1 }, shelves)).toEqual({ action: 'existing', shelfId: 's1' });
    expect(defaultMapping({ slug: 'to-gift', exclusive: false, count: 1 }, shelves)).toEqual({ action: 'create', name: 'To gift' });
  });
});

describe('buildEntry', () => {
  const shelf = (id: string, kind: Shelf['kind']): Shelf => ({ id, name: id, position: 0, kind });
  const resolved = (overrides: Partial<ResolvedShelves> = {}): ResolvedShelves => ({
    byKind: { want: shelf('want', 'want'), reading: shelf('reading', 'reading'), read: shelf('read', 'read') },
    bySlug: new Map(),
    genreBySlug: new Map(),
    ...overrides,
  });
  const now = new Date('2026-11-20T09:00:00Z');
  const row = (patch: Partial<GoodreadsRow>): GoodreadsRow => ({
    line: 2,
    title: 'Dune',
    authors: ['Frank Herbert'],
    isbn10: null,
    isbn13: '9780441013593',
    rating: 5,
    pageCount: 688,
    publisher: 'Ace',
    publishedYear: 1965,
    format: 'print',
    dateRead: '2025-07-04T12:00:00.000Z',
    dateAdded: '2025-05-15T12:00:00.000Z',
    exclusiveShelf: 'read',
    tags: [],
    notes: 'Epic',
    ...patch,
  });

  it('keeps Goodreads dates, rating and notes on a read book', () => {
    const r = row({});
    const entry = buildEntry(r, rowToBook(r, 'b1'), resolved(), { entryId: 'e1' }, now);
    expect(entry).toMatchObject({
      shelfId: 'read',
      addedAt: '2025-05-15T12:00:00.000Z',
      finishedAt: '2025-07-04T12:00:00.000Z',
      startedAt: null,
      rating: 5,
      notes: 'Epic',
      totalPages: 688,
    });
    expect(entry.progress?.percent).toBe(100);
  });

  it('never invents a finish date', () => {
    const r = row({ dateRead: null });
    expect(buildEntry(r, rowToBook(r, 'b1'), resolved(), { entryId: 'e1' }, now).finishedAt).toBeNull();
  });

  it('places a book on a mapped custom shelf but keeps its reading state, and adds genre tags', () => {
    const r = row({ tags: ['favorites', 'space'] });
    const entry = buildEntry(
      r,
      rowToBook(r, 'b1'),
      resolved({ bySlug: new Map([['favorites', shelf('fav', null)]]), genreBySlug: new Map([['space', 'Space']]) }),
      { entryId: 'e1' },
      now,
    );
    expect(entry.shelfId).toBe('fav');
    expect(entry.finishedAt).toBe('2025-07-04T12:00:00.000Z');
    expect(entry.book.genres).toEqual(['Space']);
  });

  it('starts currently-reading books at the beginning', () => {
    const r = row({ exclusiveShelf: 'currently-reading', dateRead: null });
    const entry = buildEntry(r, rowToBook(r, 'b1'), resolved(), { entryId: 'e1' }, now);
    expect(entry).toMatchObject({ shelfId: 'reading', startedAt: null });
    expect(entry.progress?.currentPage).toBe(0);
  });
});

describe('mergeCatalogMatch', () => {
  it('keeps the reader’s details and takes cover, genres and work key from the catalog', () => {
    const own = rowToBook(parseGoodreadsCsv(sample).rows[0]!, 'b1');
    const match: Book = { ...own, id: 'ol', coverUrl: 'cover', genres: ['Classics'], workKey: '/works/OL1W', pageCount: 999, source: 'openlibrary' };
    expect(mergeCatalogMatch(own, match)).toMatchObject({ id: 'b1', pageCount: 180, coverUrl: 'cover', genres: ['Classics'], workKey: '/works/OL1W', source: 'openlibrary' });
    expect(mergeCatalogMatch(own, null)).toBe(own);
  });
});

describe('findCatalogMatches', () => {
  beforeEach(() => {
    __resetOpenLibraryForTests();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

  it('batches ISBN lookups and falls back to title search for the rest', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const q = new URL(url).searchParams;
      if (q.get('q')?.startsWith('isbn:')) {
        return json({ docs: [{ key: '/works/OL1W', title: 'Dune', author_name: ['Frank Herbert'], isbn: ['0441013597'], cover_i: 1 }] });
      }
      if (q.get('title') === 'Eloquent JavaScript') {
        return json({ docs: [{ key: '/works/OL2W', title: 'Eloquent JavaScript', author_name: ['Marijn Haverbeke'] }] });
      }
      return json({ docs: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { rows } = parseGoodreadsCsv(sample);
    const picked = rows.filter((r) => ['Dune', 'Eloquent JavaScript', 'Neuromancer'].includes(r.title));
    const result = await findCatalogMatches(picked);
    expect(result.failure).toBeNull();
    expect(result.checked.size).toBe(3);
    expect([...result.matches.values()].map((b) => b.workKey).sort()).toEqual(['/works/OL1W', '/works/OL2W']);
    // One ISBN batch for both ISBN rows, then title searches for the two without a match.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops at the first outage and keeps what it found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const { rows } = parseGoodreadsCsv(sample);
    const result = await findCatalogMatches(rows.slice(0, 3));
    expect(result.failure).toMatch(/503/);
    expect(result.checked.size).toBe(0);
  });
});
