import {
  BookApiError,
  bookFromEdition,
  rankEditions,
  toEdition,
  __resetOpenLibraryForTests,
  buildSearchUrl,
  cleanDescription,
  docToBook,
  fetchWorkDetails,
  resizeCover,
  searchBooks,
} from './openLibrary';
import { normalizeGenres } from './genres';

function mockFetch(...responses: { status?: number; body?: unknown }[]) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      json: async () => r.body,
    });
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  __resetOpenLibraryForTests();
  sessionStorage.clear();
  vi.useRealTimers();
});
afterEach(() => vi.unstubAllGlobals());

describe('buildSearchUrl', () => {
  it('routes ISBN-looking queries to the isbn parameter', () => {
    expect(buildSearchUrl('978-0-441-01359-3', 'all', 1)).toContain('isbn=9780441013593');
    expect(buildSearchUrl('dune', 'all', 2)).toMatch(/q=dune.*|page=2/);
    expect(buildSearchUrl('Le Guin', 'author', 1)).toContain('author=Le+Guin');
  });
});

describe('docToBook', () => {
  it('normalises a messy doc and tolerates missing fields', () => {
    const book = docToBook({
      key: '/works/OL1W',
      title: '  Dune ',
      author_name: ['Frank Herbert', 'Frank Herbert'],
      isbn: ['8401469317', 'junk', '9788401469312', '9780441013593'],
      subject: ['Accessible book', 'Science fiction', 'Fiction'],
    });
    expect(book).toMatchObject({
      title: 'Dune',
      authors: ['Frank Herbert'],
      isbn13: '9780441013593',
      pageCount: null,
      publishedYear: null,
      workKey: '/works/OL1W',
      genres: ['Sci-Fi', 'Fiction'],
    });
    expect(book?.coverUrl).toContain('/b/isbn/9780441013593-M.jpg?default=false');
  });
  it('drops docs without a title', () => {
    expect(docToBook({ key: '/works/OL2W' })).toBeNull();
  });
});

describe('searchBooks', () => {
  it('maps results and computes hasMore', async () => {
    mockFetch({ body: { numFound: 100, docs: [{ key: '/works/OL1W', title: 'A' }] } });
    const res = await searchBooks('a');
    expect(res.books).toHaveLength(1);
    expect(res.hasMore).toBe(true);
    expect(res.editionCounts['ol:/works/OL1W']).toBe(1);
  });

  it('serves repeat queries from cache', async () => {
    const fetchFn = mockFetch({ body: { numFound: 1, docs: [{ key: '/works/OL1W', title: 'A' }] } });
    await searchBooks('cached');
    await searchBooks('cached');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('distinguishes rate limiting, server errors and malformed bodies', async () => {
    mockFetch({ status: 429 });
    await expect(searchBooks('x1')).rejects.toMatchObject({ kind: 'rate-limited' });
    mockFetch({ status: 503 });
    await expect(searchBooks('x2')).rejects.toMatchObject({ kind: 'server' });
    mockFetch({ body: { nope: true } });
    await expect(searchBooks('x3')).rejects.toBeInstanceOf(BookApiError);
  });

  it('reports network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(searchBooks('offline')).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('fetchWorkDetails', () => {
  it('follows redirects and unwraps {value} descriptions', async () => {
    mockFetch(
      { body: { type: { key: '/type/redirect' }, location: '/works/OL2W' } },
      { body: { description: { value: 'A &amp; B' }, subjects: ['Fantasy'] } },
    );
    await expect(fetchWorkDetails('/works/OL1W')).resolves.toEqual({ description: 'A & B', subjects: ['Fantasy'] });
  });
});

describe('editions', () => {
  const editions = [
    { key: '/books/1', title: 'Circé', publishers: ['POCKET'], publish_date: '2019-05-02', languages: [{ key: '/languages/fre' }] },
    { key: '/books/2', title: 'Circe', number_of_pages: 336, publishers: ['Bloomsbury'], publish_date: '4 April 2019', isbn_13: ['9781526612519'], covers: [15176841], physical_format: 'Paperback', languages: [{ key: '/languages/eng' }] },
    { key: '/books/3', title: 'Circe', number_of_pages: 488, publishers: ['AdN'], publish_date: '2023' },
  ].map((e) => toEdition(e)!);

  it('parses years and languages, and ranks editions with page counts first', () => {
    expect(editions[1]).toMatchObject({ year: 2019, language: 'English', pageCount: 336, format: 'Paperback' });
    expect(rankEditions(editions).map((e) => e.key)).toEqual(['/books/2', '/books/3']);
  });

  it('takes length, ISBN and cover from the chosen edition', () => {
    const work = docToBook({ key: '/works/OL1W', title: 'Circe', author_name: ['Madeline Miller'] })!;
    expect(bookFromEdition(work, editions[1]!)).toMatchObject({
      pageCount: 336,
      isbn13: '9781526612519',
      publisher: 'Bloomsbury',
      coverUrl: expect.stringContaining('/b/id/15176841-M.jpg'),
      workKey: '/works/OL1W',
    });
  });
});

describe('helpers', () => {
  it('cleans HTML and markdown link noise', () => {
    expect(cleanDescription('<p>Hello <b>world</b></p>')).toBe('Hello world');
    expect(cleanDescription('See [the site][1]\n\n[1]: https://x.y')).toBe('See the site');
    expect(cleanDescription('')).toBeNull();
  });
  it('resizes seed cover URLs and leaves foreign URLs alone', () => {
    expect(resizeCover('https://covers.openlibrary.org/b/isbn/1-L.jpg', 'M')).toBe(
      'https://covers.openlibrary.org/b/isbn/1-M.jpg?default=false',
    );
    expect(resizeCover('https://example.com/a.jpg', 'S')).toBe('https://example.com/a.jpg');
  });
  it('filters noisy subjects into canonical genres', () => {
    expect(normalizeGenres(['Accessible book', 'Protected DAISY', 'Computer programming'])).toEqual(['Programming']);
  });
});
