import type { Book } from '../types';
import { cleanIsbn, looksLikeIsbn } from './bookIdentity';
import { normalizeGenres } from './genres';

const API = 'https://openlibrary.org';
const COVERS = 'https://covers.openlibrary.org';
const SEARCH_FIELDS =
  'key,title,author_name,cover_i,first_publish_year,number_of_pages_median,isbn,publisher,subject,edition_count';
export const PAGE_SIZE = 24;
const TIMEOUT_MS = 10_000;
/** Open Library asks sustained clients to stay at or below ~1 request per second. */
const MIN_INTERVAL_MS = 1_000;

export type BookApiErrorKind = 'rate-limited' | 'network' | 'timeout' | 'server' | 'bad-response';

/** Typed so the UI can explain *which* failure happened instead of "Something went wrong". */
export class BookApiError extends Error {
  readonly kind: BookApiErrorKind;
  constructor(kind: BookApiErrorKind, message: string) {
    super(message);
    this.name = 'BookApiError';
    this.kind = kind;
  }
}

export type CoverSize = 'S' | 'M' | 'L';

/**
 * Builds a cover URL that 404s instead of returning Open Library's 1×1 placeholder gif, so an
 * <img onError> can swap in our styled placeholder.
 */
export function coverUrl(ref: { coverId?: number | null; isbn?: string | null }, size: CoverSize = 'M'): string | null {
  if (ref.coverId) return `${COVERS}/b/id/${ref.coverId}-${size}.jpg?default=false`;
  if (ref.isbn) return `${COVERS}/b/isbn/${ref.isbn}-${size}.jpg?default=false`;
  return null;
}

/** Re-sizes an existing Open Library cover URL (seed data stores -L) so thumbnails don't load full-res. */
export function resizeCover(url: string | null, size: CoverSize): string | null {
  if (!url) return null;
  if (!url.startsWith(COVERS)) return url;
  const sized = url.replace(/-[SML]\.jpg/, `-${size}.jpg`);
  return sized.includes('default=false') ? sized : `${sized}${sized.includes('?') ? '&' : '?'}default=false`;
}

// ---------------------------------------------------------------------------
// Throttled, cached fetch
// ---------------------------------------------------------------------------

let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();
const memoryCache = new Map<string, unknown>();
const CACHE_PREFIX = 'bookshelf:ol:';

function readCache<T>(url: string): T | undefined {
  if (memoryCache.has(url)) return memoryCache.get(url) as T;
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + url);
    if (raw) {
      const value = JSON.parse(raw) as T;
      memoryCache.set(url, value);
      return value;
    }
  } catch {
    // Storage may be unavailable (private mode, quota) — the memory cache still works.
  }
  return undefined;
}

function writeCache(url: string, value: unknown) {
  memoryCache.set(url, value);
  try {
    sessionStorage.setItem(CACHE_PREFIX + url, JSON.stringify(value));
  } catch {
    // Ignore quota errors; caching is an optimisation only.
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Serialises requests through one queue so bursts never exceed the polite request rate. */
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const gap = Date.now() - lastRequestAt;
    if (gap < MIN_INTERVAL_MS) await wait(MIN_INTERVAL_MS - gap);
    lastRequestAt = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const cached = readCache<T>(url);
  if (cached !== undefined) return cached;

  return throttled(async () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('timeout'), TIMEOUT_MS);
    const onAbort = () => controller.abort('caller');
    signal?.addEventListener('abort', onAbort);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    } catch (err) {
      if (controller.signal.reason === 'timeout') {
        throw new BookApiError('timeout', 'Open Library took too long to respond.');
      }
      if (controller.signal.reason === 'caller') throw new DOMException('Aborted', 'AbortError');
      throw new BookApiError('network', err instanceof Error ? err.message : 'Network request failed.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
    if (response.status === 429) throw new BookApiError('rate-limited', 'Too many requests to Open Library.');
    if (response.status >= 500) throw new BookApiError('server', `Open Library returned ${response.status}.`);
    if (!response.ok) throw new BookApiError('bad-response', `Unexpected status ${response.status}.`);
    let data: T;
    try {
      data = (await response.json()) as T;
    } catch {
      throw new BookApiError('bad-response', 'Open Library sent a response we could not read.');
    }
    writeCache(url, data);
    return data;
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

interface SearchDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  number_of_pages_median?: number;
  isbn?: string[];
  publisher?: string[];
  subject?: string[];
  edition_count?: number;
}

interface SearchResponse {
  numFound?: number;
  num_found?: number;
  docs?: SearchDoc[];
}

export interface SearchResult {
  books: Book[];
  /** Edition count per book id — drives whether adding needs an edition choice. */
  editionCounts: Record<string, number>;
  total: number;
  page: number;
  hasMore: boolean;
}

export type SearchField = 'all' | 'title' | 'author' | 'isbn';

function pickIsbns(isbns: string[] | undefined): { isbn10: string | null; isbn13: string | null } {
  let isbn10: string | null = null;
  let isbn13: string | null = null;
  for (const raw of isbns ?? []) {
    const clean = cleanIsbn(raw);
    if (!clean) continue;
    // Prefer English-language (978-0/978-1) editions — they're most likely to have a cover.
    if (clean.length === 13 && (!isbn13 || (/^97[89][01]/.test(clean) && !/^97[89][01]/.test(isbn13)))) isbn13 = clean;
    if (clean.length === 10 && !isbn10) isbn10 = clean;
    if (isbn10 && isbn13 && /^97[89][01]/.test(isbn13)) break;
  }
  return { isbn10, isbn13 };
}

/** Normalises one messy search doc into our Book shape. Returns null for unusable docs. */
export function docToBook(doc: SearchDoc): Book | null {
  const title = doc.title?.trim();
  if (!title || !doc.key) return null;
  const { isbn10, isbn13 } = pickIsbns(doc.isbn);
  const authors = [...new Set((doc.author_name ?? []).map((a) => a.trim()).filter(Boolean))];
  return {
    id: `ol:${doc.key}`,
    title,
    authors,
    coverUrl: coverUrl({ coverId: doc.cover_i ?? null, isbn: doc.cover_i ? null : isbn13 }),
    isbn10,
    isbn13,
    pageCount: doc.number_of_pages_median && doc.number_of_pages_median > 0 ? doc.number_of_pages_median : null,
    publishedYear: doc.first_publish_year ?? null,
    publisher: doc.publisher?.[0]?.trim() ?? null,
    description: null,
    genres: normalizeGenres(doc.subject ?? []),
    source: 'openlibrary',
    workKey: doc.key.startsWith('/works/') ? doc.key : null,
  };
}

export function buildSearchUrl(query: string, field: SearchField, page: number): string {
  const params = new URLSearchParams({ fields: SEARCH_FIELDS, limit: String(PAGE_SIZE), page: String(page) });
  const q = query.trim();
  const effective: SearchField = field === 'all' && looksLikeIsbn(q) ? 'isbn' : field;
  if (effective === 'isbn') params.set('isbn', cleanIsbn(q) ?? q);
  else if (effective === 'title') params.set('title', q);
  else if (effective === 'author') params.set('author', q);
  else params.set('q', q);
  return `${API}/search.json?${params}`;
}

export async function searchBooks(
  query: string,
  { field = 'all', page = 1, signal }: { field?: SearchField; page?: number; signal?: AbortSignal } = {},
): Promise<SearchResult> {
  const data = await getJson<SearchResponse>(buildSearchUrl(query, field, page), signal);
  if (!data || !Array.isArray(data.docs)) throw new BookApiError('bad-response', 'Search results were malformed.');
  const { books, editionCounts } = mapDocs(data.docs);
  const total = data.numFound ?? data.num_found ?? books.length;
  return { books, editionCounts, total, page, hasMore: page * PAGE_SIZE < total };
}

function mapDocs(docs: SearchDoc[]): { books: Book[]; editionCounts: Record<string, number> } {
  const books: Book[] = [];
  const editionCounts: Record<string, number> = {};
  const seen = new Set<string>();
  for (const doc of docs) {
    const book = docToBook(doc);
    if (!book || seen.has(book.id)) continue;
    seen.add(book.id);
    books.push(book);
    editionCounts[book.id] = doc.edition_count ?? 1;
  }
  return { books, editionCounts };
}

/** Highest-rated works for a subject — the raw material for "same genre as…" suggestions. */
export async function searchBySubject(
  subject: string,
  { limit = 24, signal }: { limit?: number; signal?: AbortSignal } = {},
): Promise<Pick<SearchResult, 'books' | 'editionCounts'>> {
  const params = new URLSearchParams({ subject, sort: 'rating', fields: SEARCH_FIELDS, limit: String(limit) });
  const data = await getJson<SearchResponse>(`${API}/search.json?${params}`, signal);
  if (!data || !Array.isArray(data.docs)) throw new BookApiError('bad-response', 'Results were malformed.');
  return mapDocs(data.docs);
}

// ---------------------------------------------------------------------------
// Editions — page counts differ between editions, so the user can pick theirs
// ---------------------------------------------------------------------------

interface EditionDoc {
  key?: string;
  title?: string;
  number_of_pages?: number;
  publishers?: string[];
  publish_date?: string;
  isbn_13?: string[];
  isbn_10?: string[];
  covers?: number[];
  physical_format?: string;
  languages?: { key?: string }[];
}

export interface Edition {
  key: string;
  title: string;
  pageCount: number | null;
  publisher: string | null;
  year: number | null;
  isbn13: string | null;
  isbn10: string | null;
  coverId: number | null;
  format: string | null;
  language: string | null;
}

const LANGUAGE_NAMES: Record<string, string> = {
  eng: 'English', spa: 'Spanish', fre: 'French', ger: 'German', ita: 'Italian', por: 'Portuguese',
  jpn: 'Japanese', kor: 'Korean', chi: 'Chinese', rus: 'Russian', dut: 'Dutch', pol: 'Polish',
};

export function toEdition(doc: EditionDoc): Edition | null {
  if (!doc.key) return null;
  const lang = doc.languages?.[0]?.key?.split('/').pop() ?? null;
  const year = doc.publish_date?.match(/\d{4}/)?.[0];
  return {
    key: doc.key,
    title: doc.title?.trim() || 'Untitled edition',
    pageCount: doc.number_of_pages && doc.number_of_pages > 0 ? doc.number_of_pages : null,
    publisher: doc.publishers?.[0]?.trim() ?? null,
    year: year ? Number(year) : null,
    isbn13: cleanIsbn(doc.isbn_13?.[0]),
    isbn10: cleanIsbn(doc.isbn_10?.[0]),
    coverId: doc.covers?.find((c) => c > 0) ?? null,
    format: doc.physical_format?.trim() || null,
    language: lang ? (LANGUAGE_NAMES[lang] ?? lang) : null,
  };
}

/**
 * The most useful editions to choose from: ones with a page count (that's why you'd pick one),
 * in English first, with covers, newest first. Capped so the chooser stays scannable.
 */
export function rankEditions(editions: Edition[], max = 6): Edition[] {
  const score = (e: Edition) => (e.language === 'English' ? 2 : 0) + (e.coverId ? 1 : 0);
  return editions
    .filter((e) => e.pageCount)
    .sort((a, b) => score(b) - score(a) || (b.year ?? 0) - (a.year ?? 0))
    .slice(0, max);
}

export async function fetchEditions(workKey: string, signal?: AbortSignal): Promise<Edition[]> {
  const data = await getJson<{ entries?: EditionDoc[] }>(`${API}${workKey}/editions.json?limit=50`, signal);
  if (!data || !Array.isArray(data.entries)) throw new BookApiError('bad-response', 'Edition list was malformed.');
  return data.entries.map(toEdition).filter((e): e is Edition => e !== null);
}

/** The user's chosen edition supplies the length, ISBN and (if it has one) the cover. */
export function bookFromEdition(work: Book, edition: Edition): Book {
  return {
    ...work,
    pageCount: edition.pageCount ?? work.pageCount,
    isbn13: edition.isbn13 ?? work.isbn13,
    isbn10: edition.isbn10 ?? work.isbn10,
    publisher: edition.publisher ?? work.publisher,
    coverUrl: edition.coverId ? coverUrl({ coverId: edition.coverId }) : work.coverUrl,
  };
}

// ---------------------------------------------------------------------------
// Work details (description) — fetched lazily, failures are non-fatal
// ---------------------------------------------------------------------------

interface WorkResponse {
  type?: { key?: string };
  location?: string;
  description?: string | { value?: string };
  subjects?: string[];
}

/** Decodes entities and strips tags/markdown link noise that Open Library descriptions often contain. */
export function cleanDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  const text = (doc.body.textContent ?? '')
    .replace(/\[([^\]]+)\]\[\d+\]/g, '$1') // [link text][1]
    .replace(/^\s*\[\d+\]:.*$/gm, '') // [1]: https://...
    .replace(/-{3,}[\s\S]*$/, '') // trailing "----------\nContains:" blocks
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

export async function fetchWorkDetails(
  workKey: string,
  signal?: AbortSignal,
): Promise<{ description: string | null; subjects: string[] }> {
  let key = workKey;
  // Merged works are served as redirects; follow at most two hops.
  for (let hop = 0; hop < 3; hop++) {
    const work = await getJson<WorkResponse>(`${API}${key}.json`, signal);
    if (work.type?.key === '/type/redirect' && work.location) {
      key = work.location;
      continue;
    }
    const raw = typeof work.description === 'string' ? work.description : work.description?.value;
    return { description: cleanDescription(raw), subjects: work.subjects ?? [] };
  }
  return { description: null, subjects: [] };
}

export function openLibraryUrl(book: Pick<Book, 'workKey' | 'isbn13' | 'isbn10' | 'title'>): string {
  if (book.workKey) return `${API}${book.workKey}`;
  const isbn = book.isbn13 ?? book.isbn10;
  if (isbn) return `${API}/isbn/${isbn}`;
  return `${API}/search?q=${encodeURIComponent(book.title)}`;
}

/** Test hook: clear caches and throttle state between tests. */
export function __resetOpenLibraryForTests() {
  memoryCache.clear();
  lastRequestAt = 0;
  queue = Promise.resolve();
}
