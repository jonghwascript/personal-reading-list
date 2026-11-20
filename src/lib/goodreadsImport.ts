import type { Book, LibraryEntry, ReadingFormat, Shelf, ShelfKind } from '../types';
import { authorSurname, cleanIsbn, isbn10To13, isSameBook, normalizeTitle } from './bookIdentity';
import { coverUrl, ISBN_BATCH_SIZE, lookupIsbns, searchTitleAuthor } from './openLibrary';
import { applyMove, findDuplicate } from './libraryRules';

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * RFC 4180 parser: quoted fields may hold commas, newlines and "" escapes. Tolerates a BOM, CRLF,
 * a missing final newline and stray whitespace around quoted fields (` ="978…"` in real exports).
 * Returns the physical line each record starts on so problems can point at the file.
 */
export function parseCsv(text: string): { cells: string[]; line: number }[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: { cells: string[]; line: number }[] = [];
  let cells: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const endField = () => {
    cells.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    if (cells.length > 1 || cells[0]!.trim() !== '') records.push({ cells, line: recordLine });
    cells = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
    } else if (ch === '"' && field.trim() === '') {
      field = '';
      quoted = true;
    } else if (ch === ',') endField();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else field += ch;
  }
  if (field !== '' || cells.length > 0) endRecord();
  return records;
}

// ---------------------------------------------------------------------------
// Goodreads rows
// ---------------------------------------------------------------------------

/** The three Goodreads shelves every account has, and the default shelf each maps onto. */
export const STANDARD_SHELVES: Record<string, ShelfKind> = {
  read: 'read',
  'to-read': 'want',
  'currently-reading': 'reading',
};

export interface GoodreadsRow {
  /** Line in the file, for problem reports. */
  line: number;
  title: string;
  authors: string[];
  isbn10: string | null;
  isbn13: string | null;
  rating: number | null;
  pageCount: number | null;
  publisher: string | null;
  publishedYear: number | null;
  format: ReadingFormat;
  dateRead: string | null;
  dateAdded: string | null;
  /** Goodreads' "exclusive" shelf: read / to-read / currently-reading or a custom exclusive shelf. */
  exclusiveShelf: string;
  /** Other (non-exclusive) shelves the book is on, in Goodreads' order. */
  tags: string[];
  notes: string;
}

export interface RowProblem {
  line: number;
  reason: string;
}

export interface ParsedExport {
  rows: GoodreadsRow[];
  problems: RowProblem[];
  /** Useful columns the file didn't have — shown so a partial export isn't a silent surprise. */
  missingColumns: string[];
}

const COLUMN_ALIASES = {
  title: ['title'],
  author: ['author'],
  additionalAuthors: ['additional authors'],
  isbn: ['isbn'],
  isbn13: ['isbn13'],
  rating: ['my rating'],
  publisher: ['publisher'],
  binding: ['binding'],
  pages: ['number of pages'],
  year: ['original publication year', 'year published'],
  dateRead: ['date read'],
  dateAdded: ['date added'],
  shelves: ['bookshelves'],
  exclusiveShelf: ['exclusive shelf'],
  review: ['my review'],
  privateNotes: ['private notes'],
} as const;

type Column = keyof typeof COLUMN_ALIASES;
const REPORTED_COLUMNS: Column[] = ['author', 'isbn13', 'rating', 'dateRead', 'dateAdded', 'exclusiveShelf'];
const COLUMN_LABELS: Record<Column, string> = {
  title: 'Title',
  author: 'Author',
  additionalAuthors: 'Additional Authors',
  isbn: 'ISBN',
  isbn13: 'ISBN13',
  rating: 'My Rating',
  publisher: 'Publisher',
  binding: 'Binding',
  pages: 'Number of Pages',
  year: 'Year Published',
  dateRead: 'Date Read',
  dateAdded: 'Date Added',
  shelves: 'Bookshelves',
  exclusiveShelf: 'Exclusive Shelf',
  review: 'My Review',
  privateNotes: 'Private Notes',
};

const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, ' ');

/** Goodreads shelf names are slugs; compare them case- and whitespace-insensitively. */
export const normalizeShelfName = (name: string) => name.trim().toLowerCase().replace(/[\s_]+/g, '-');

export class NotGoodreadsError extends Error {
  constructor() {
    super('This doesn’t look like a Goodreads export — there’s no “Title” column. In Goodreads, go to My Books → Import and export → Export library.');
    this.name = 'NotGoodreadsError';
  }
}

export function parseGoodreadsCsv(text: string): ParsedExport {
  const records = parseCsv(text);
  const header = records.shift();
  if (!header) throw new NotGoodreadsError();
  const headers = header.cells.map(normalizeHeader);

  const index = {} as Record<Column, number>;
  for (const [column, aliases] of Object.entries(COLUMN_ALIASES) as [Column, readonly string[]][]) {
    // First alias that exists wins, so "Original Publication Year" beats "Year Published".
    index[column] = aliases.map((a) => headers.indexOf(a)).find((i) => i >= 0) ?? -1;
  }
  if (index.title < 0) throw new NotGoodreadsError();

  const rows: GoodreadsRow[] = [];
  const problems: RowProblem[] = [];
  for (const { cells, line } of records) {
    // Short rows (a dropped trailing column) are fine: missing cells read as empty.
    const get = (column: Column) => (index[column] >= 0 ? (cells[index[column]] ?? '').trim() : '');
    const title = get('title');
    if (!title) {
      problems.push({ line, reason: 'No title' });
      continue;
    }
    const isbn10 = cleanIsbn(get('isbn'));
    const rawIsbn13 = cleanIsbn(get('isbn13'));
    const shelf = normalizeShelfName(get('exclusiveShelf'));
    const dateRead = parseGoodreadsDate(get('dateRead'));
    const exclusiveShelf = shelf || (dateRead ? 'read' : 'to-read');
    const rating = Number.parseInt(get('rating'), 10);
    const pages = Number.parseInt(get('pages'), 10);
    const year = Number.parseInt(get('year'), 10);

    rows.push({
      line,
      title: cleanText(title),
      authors: [get('author'), ...get('additionalAuthors').split(',')].map((a) => a.trim().replace(/\s+/g, ' ')).filter(Boolean),
      isbn10: isbn10?.length === 10 ? isbn10 : null,
      isbn13: rawIsbn13?.length === 13 ? rawIsbn13 : isbn10?.length === 13 ? isbn10 : null,
      // Goodreads writes 0 for "not rated".
      rating: rating >= 1 && rating <= 5 ? rating : null,
      pageCount: pages > 0 ? pages : null,
      publisher: get('publisher') || null,
      publishedYear: year > 0 ? year : null,
      format: formatFromBinding(get('binding')),
      dateRead,
      dateAdded: parseGoodreadsDate(get('dateAdded')),
      exclusiveShelf,
      tags: [
        ...new Set(
          get('shelves')
            .split(',')
            .map(normalizeShelfName)
            .filter((s) => s && s !== exclusiveShelf && !(s in STANDARD_SHELVES)),
        ),
      ],
      notes: [cleanText(get('review')), get('privateNotes') && `Private notes: ${cleanText(get('privateNotes'))}`].filter(Boolean).join('\n\n'),
    });
  }

  const missingColumns = REPORTED_COLUMNS.filter((c) => index[c] < 0).map((c) => COLUMN_LABELS[c]);
  return { rows, problems, missingColumns };
}

/** Goodreads writes yyyy/mm/dd; tolerate yyyy-mm-dd and a missing day. Noon UTC keeps the calendar day in every timezone. */
export function parseGoodreadsDate(raw: string): string | null {
  const m = /^(\d{4})[/-](\d{1,2})(?:[/-](\d{1,2}))?$/.exec(raw.trim());
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 1)];
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString();
}

/** Reviews are HTML ("<i>Still</i> relevant", "<br/>"); notes are plain text. */
export function cleanText(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function formatFromBinding(binding: string): ReadingFormat {
  if (/audio/i.test(binding)) return 'audio';
  if (/kindle|ebook|e-book|nook|digital/i.test(binding)) return 'ebook';
  return 'print';
}

// ---------------------------------------------------------------------------
// Plan: duplicates and shelf mapping
// ---------------------------------------------------------------------------

export function rowToBook(row: GoodreadsRow, id: string): Book {
  const isbn13 = row.isbn13 ?? (row.isbn10 ? isbn10To13(row.isbn10) : null);
  return {
    id,
    title: row.title,
    authors: row.authors,
    coverUrl: coverUrl({ isbn: isbn13 }),
    isbn10: row.isbn10,
    isbn13: row.isbn13,
    pageCount: row.pageCount,
    publishedYear: row.publishedYear,
    publisher: row.publisher,
    description: null,
    genres: [],
    source: 'import',
    workKey: null,
  };
}

export type ImportItem =
  | { row: GoodreadsRow; status: 'new' }
  | { row: GoodreadsRow; status: 'in-library'; existingTitle: string }
  | { row: GoodreadsRow; status: 'repeated'; firstLine: number };

/** Every Goodreads shelf in the file that isn't one of the standard three. */
export interface CustomShelf {
  /** Normalised Goodreads slug, e.g. "did-not-finish". */
  slug: string;
  /** Exclusive shelves replace the reading status; tags sit on top of it. */
  exclusive: boolean;
  count: number;
}

export type ShelfMapping =
  | { action: 'create'; name: string }
  | { action: 'existing'; shelfId: string }
  | { action: 'genre'; genre: string }
  | { action: 'ignore' };

export interface ImportPlan {
  items: ImportItem[];
  customShelves: CustomShelf[];
  /** How many new books land on each standard Goodreads shelf, for the mapping summary. */
  standardCounts: Record<string, number>;
}

export function buildImportPlan(rows: GoodreadsRow[], library: LibraryEntry[]): ImportPlan {
  const items: ImportItem[] = [];
  const accepted: { book: Book; line: number }[] = [];
  const custom = new Map<string, CustomShelf>();
  const standardCounts: Record<string, number> = { read: 0, 'to-read': 0, 'currently-reading': 0 };

  for (const row of rows) {
    const book = rowToBook(row, '');
    const existing = findDuplicate(library, book);
    if (existing) {
      items.push({ row, status: 'in-library', existingTitle: existing.book.title });
      continue;
    }
    const earlier = accepted.find((a) => isSameBook(a.book, book));
    if (earlier) {
      items.push({ row, status: 'repeated', firstLine: earlier.line });
      continue;
    }
    accepted.push({ book, line: row.line });
    items.push({ row, status: 'new' });

    if (row.exclusiveShelf in STANDARD_SHELVES) standardCounts[row.exclusiveShelf]!++;
    else bump(custom, row.exclusiveShelf, true);
    for (const tag of row.tags) bump(custom, tag, false);
  }

  const customShelves = [...custom.values()].sort((a, b) => Number(b.exclusive) - Number(a.exclusive) || b.count - a.count);
  return { items, customShelves, standardCounts };
}

function bump(map: Map<string, CustomShelf>, slug: string, exclusive: boolean) {
  const found = map.get(slug);
  if (found) {
    found.count++;
    found.exclusive ||= exclusive;
  } else map.set(slug, { slug, exclusive, count: 1 });
}

/** "did-not-finish" → "Did not finish". */
export function prettyShelfName(slug: string): string {
  const words = slug.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Reuse a same-named shelf when there is one; otherwise create a matching shelf (the spec's default). */
export function defaultMapping(shelf: CustomShelf, shelves: Shelf[]): ShelfMapping {
  const match = shelves.find((s) => normalizeShelfName(s.name) === shelf.slug);
  return match ? { action: 'existing', shelfId: match.id } : { action: 'create', name: prettyShelfName(shelf.slug) };
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export interface ResolvedShelves {
  /** Default shelf per kind. */
  byKind: Record<ShelfKind, Shelf>;
  /** Target shelf for each custom Goodreads shelf mapped to a shelf (created or existing). */
  bySlug: Map<string, Shelf>;
  /** Genre to add for each custom Goodreads shelf mapped to a genre. */
  genreBySlug: Map<string, string>;
}

/**
 * One library entry per row. The reading status (and its dates) always comes from Goodreads'
 * exclusive shelf; a custom shelf mapped to a Bookshelf shelf only decides where the book sits,
 * because custom shelves are organisational and leave reading state alone.
 */
export function buildEntry(
  row: GoodreadsRow,
  book: Book,
  shelves: ResolvedShelves,
  ids: { entryId: string },
  now: Date = new Date(),
): LibraryEntry {
  const status: ShelfKind = STANDARD_SHELVES[row.exclusiveShelf] ?? (row.dateRead ? 'read' : 'want');
  const genres = [...book.genres];
  for (const slug of [row.exclusiveShelf, ...row.tags]) {
    const genre = shelves.genreBySlug.get(slug);
    if (genre && !genres.includes(genre)) genres.push(genre);
  }

  const base: LibraryEntry = {
    id: ids.entryId,
    book: { ...book, genres },
    shelfId: shelves.byKind[status].id,
    addedAt: row.dateAdded ?? now.toISOString(),
    startedAt: null,
    finishedAt: row.dateRead,
    rating: row.rating,
    notes: row.notes,
    progress: null,
    format: row.format,
    totalPages: row.format === 'print' ? row.pageCount : null,
    totalMinutes: null,
  };
  const placed = applyMove(base, shelves.byKind[status], now);
  // applyMove stamps "now" for missing dates; an import must not invent when someone read a book.
  const entry: LibraryEntry =
    status === 'read' ? { ...placed, startedAt: null, finishedAt: row.dateRead } : status === 'reading' ? { ...placed, startedAt: null } : placed;

  const target = [row.exclusiveShelf, ...row.tags].map((slug) => shelves.bySlug.get(slug)).find(Boolean);
  return target ? { ...entry, shelfId: target.id } : entry;
}

/** Prefer the reader's own Goodreads details; take identity, cover and genres from the catalog match. */
export function mergeCatalogMatch(own: Book, match: Book | null | undefined): Book {
  if (!match) return own;
  return {
    ...own,
    authors: own.authors.length > 0 ? own.authors : match.authors,
    coverUrl: match.coverUrl ?? own.coverUrl,
    isbn10: own.isbn10 ?? match.isbn10,
    isbn13: own.isbn13 ?? match.isbn13,
    pageCount: own.pageCount ?? match.pageCount,
    publishedYear: own.publishedYear ?? match.publishedYear,
    publisher: own.publisher ?? match.publisher,
    genres: match.genres,
    source: 'openlibrary',
    workKey: match.workKey,
  };
}

/** The ISBN-13 we look a row up by, if it has any ISBN. */
export function lookupIsbn(row: Pick<GoodreadsRow, 'isbn10' | 'isbn13'>): string | null {
  return row.isbn13 ?? (row.isbn10 ? isbn10To13(row.isbn10) : null);
}

/** A title search result only counts if it is plausibly the same book. */
export function titleMatches(row: Pick<GoodreadsRow, 'title' | 'authors'>, candidate: Book): boolean {
  if (normalizeTitle(row.title) !== normalizeTitle(candidate.title)) return false;
  const surname = row.authors[0] ? authorSurname(row.authors[0]) : '';
  // Catalogs list co-authors in any order, so any shared surname will do.
  return surname === '' || candidate.authors.some((a) => authorSurname(a) === surname);
}

// ---------------------------------------------------------------------------
// Catalog lookup
// ---------------------------------------------------------------------------

export interface CatalogLookup {
  /** Open Library match per row line. */
  matches: Map<number, Book>;
  /** Lines we actually asked about; the rest were skipped or cut short by an outage. */
  checked: Set<number>;
  /** Why the lookup stopped early, if it did for a reason other than the reader skipping. */
  failure: string | null;
}

/**
 * ISBN rows go in batches (a dozen requests for 500 books); rows without an ISBN — or whose ISBN
 * Open Library doesn't know — fall back to one title + author search each. Aborting the signal
 * ("Skip the rest") keeps everything found so far. The first API failure stops the lookup instead of
 * timing out row by row: the books still import with their Goodreads details.
 */
export async function findCatalogMatches(
  rows: GoodreadsRow[],
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (done: number) => void } = {},
): Promise<CatalogLookup> {
  const matches = new Map<number, Book>();
  const checked = new Set<number>();
  const report = () => onProgress?.(checked.size);
  const withIsbn = rows.filter((r) => lookupIsbn(r));
  const titleOnly: GoodreadsRow[] = rows.filter((r) => !lookupIsbn(r));

  try {
    for (let i = 0; i < withIsbn.length; i += ISBN_BATCH_SIZE) {
      if (signal?.aborted) return { matches, checked, failure: null };
      const batch = withIsbn.slice(i, i + ISBN_BATCH_SIZE);
      const found = await lookupIsbns(batch.map((r) => lookupIsbn(r)!), signal);
      for (const row of batch) {
        const match = found.get(lookupIsbn(row)!);
        if (match) {
          matches.set(row.line, match);
          checked.add(row.line);
        } else titleOnly.push(row);
      }
      report();
    }
    for (const row of titleOnly) {
      if (signal?.aborted) return { matches, checked, failure: null };
      const candidates = await searchTitleAuthor(row.title, row.authors[0], signal);
      const match = candidates.find((c) => titleMatches(row, c));
      if (match) matches.set(row.line, match);
      checked.add(row.line);
      report();
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { matches, checked, failure: null };
    return { matches, checked, failure: err instanceof Error ? err.message : 'Open Library is unavailable.' };
  }
  return { matches, checked, failure: null };
}
