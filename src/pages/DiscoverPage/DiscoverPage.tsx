import { RefreshCw, Search, SearchX, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AddBook } from '../../components/AddBook/AddBook';
import { BookCover } from '../../components/BookCover/BookCover';
import { CuratedLists, Recommendations } from '../../components/Discovery/Discovery';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Button } from '../../components/ui/Button';
import { formatAuthors, pluralize } from '../../lib/format';
import { BookApiError, searchBooks, type BookApiErrorKind, type SearchField } from '../../lib/openLibrary';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAnnouncer } from '../../state/AnnouncerContext';
import type { Book } from '../../types';
import page from '../Page.module.css';
import styles from './DiscoverPage.module.css';

type SearchState =
  | { status: 'idle' }
  | { status: 'loading'; books: Book[] }
  | {
      status: 'done';
      books: Book[];
      editionCounts: Record<string, number>;
      total: number;
      page: number;
      hasMore: boolean;
      loadingMore?: boolean;
    }
  | { status: 'error'; kind: BookApiErrorKind; books: Book[]; editionCounts?: Record<string, number> };

const ERROR_COPY: Record<BookApiErrorKind, { title: string; body: string }> = {
  'rate-limited': {
    title: 'Open Library asked us to slow down',
    body: 'Too many searches in a short time. Wait a few seconds, then try again.',
  },
  network: {
    title: 'Can’t reach Open Library',
    body: 'Check your internet connection. Your library is still available while you’re offline.',
  },
  timeout: {
    title: 'Open Library is taking too long',
    body: 'The book catalogue is responding slowly right now. Trying again usually works.',
  },
  server: {
    title: 'Open Library is having trouble',
    body: 'Their servers returned an error. This is on their side — please try again in a minute.',
  },
  'bad-response': {
    title: 'We couldn’t read the search results',
    body: 'Open Library sent something unexpected. Try again, or search a different way.',
  },
};

const FIELD_LABELS: Record<SearchField, string> = { all: 'Everything', title: 'Title', author: 'Author', isbn: 'ISBN' };

export function DiscoverPage() {
  usePageTitle('Discover');
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const field = (params.get('field') as SearchField | null) ?? 'all';
  const [draft, setDraft] = useState(query);
  const [draftField, setDraftField] = useState<SearchField>(field);
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const [retryToken, setRetryToken] = useState(0);
  const { announce } = useAnnouncer();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => setDraft(query), [query]);
  useEffect(() => setDraftField(field), [field]);

  // Run the search whenever the URL query changes (submit, back/forward, shared links).
  useEffect(() => {
    if (!query.trim()) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading', books: [] });
    searchBooks(query, { field, signal: controller.signal })
      .then((res) => {
        setState({ status: 'done', ...res });
        announce(res.total === 0 ? `No books found for ${query}.` : `${pluralize(res.total, 'result')} for ${query}.`);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', kind: err instanceof BookApiError ? err.kind : 'network', books: [] });
      });
    return () => controller.abort();
  }, [query, field, retryToken, announce]);

  const loadMore = useCallback(async () => {
    if (state.status !== 'done' || !state.hasMore) return;
    setState({ ...state, loadingMore: true });
    try {
      const res = await searchBooks(query, { field, page: state.page + 1 });
      // Open Library occasionally repeats a work across pages; keep the first occurrence.
      const seen = new Set(state.books.map((b) => b.id));
      const fresh = res.books.filter((b) => !seen.has(b.id));
      setState({
        status: 'done',
        books: [...state.books, ...fresh],
        editionCounts: { ...state.editionCounts, ...res.editionCounts },
        total: res.total,
        page: res.page,
        hasMore: res.hasMore,
      });
      announce(`Loaded ${pluralize(fresh.length, 'more book')}.`);
    } catch (err) {
      setState({ status: 'error', kind: err instanceof BookApiError ? err.kind : 'network', books: state.books, editionCounts: state.editionCounts });
    }
  }, [state, query, field, announce]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    if (q === query && draftField === field) {
      setRetryToken((n) => n + 1);
      return;
    }
    setParams(draftField === 'all' ? { q } : { q, field: draftField });
  };

  return (
    <div className={page.page}>
      <header>
        <p className={page.eyebrow}>Discover</p>
        <h1 className={page.title}>Find your next book</h1>
        <p className={page.lede}>Search millions of books from Open Library by title, author or ISBN.</p>
      </header>

      <div className={styles.searchBox}>
        <form onSubmit={submit} className={styles.form} role="search" aria-label="Book search">
          <label htmlFor="book-search" className="u-sr-only">
            Search books
          </label>
          <div className={styles.inputWrap}>
            <Search size={20} className={styles.inputIcon} aria-hidden="true" />
            <input
              ref={inputRef}
              id="book-search"
              type="search"
              className={styles.input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Title, author, or ISBN"
              autoComplete="off"
              enterKeyHint="search"
              autoFocus={!query}
            />
          </div>
          <label htmlFor="search-field" className="u-sr-only">
            Search in
          </label>
          <select id="search-field" className={styles.fieldSelect} value={draftField} onChange={(e) => setDraftField(e.target.value as SearchField)}>
            {(Object.keys(FIELD_LABELS) as SearchField[]).map((f) => (
              <option key={f} value={f}>
                {FIELD_LABELS[f]}
              </option>
            ))}
          </select>
          <Button type="submit" variant="primary" size="lg">
            Search
          </Button>
        </form>
      </div>

      {state.status === 'idle' && (
        <div className={styles.idle}>
          <Recommendations />
          <CuratedLists />
        </div>
      )}

      {state.status === 'loading' && <ResultsSkeleton />}

      {state.status === 'error' && state.books.length === 0 && (
        <ErrorPanel kind={state.kind} onRetry={() => setRetryToken((n) => n + 1)} />
      )}

      {(state.status === 'done' || (state.status === 'error' && state.books.length > 0)) && (
        <section className={page.section} aria-labelledby="results-heading">
          {state.books.length === 0 ? (
            <EmptyState icon={<SearchX />} title={`No books found for “${query}”`}>
              {field === 'title'
                ? 'Try searching by author instead, or check the spelling.'
                : field === 'isbn'
                  ? 'Double-check the ISBN digits, or search by title instead.'
                  : 'Check the spelling, try fewer words, or search by the author’s last name.'}
            </EmptyState>
          ) : (
            <>
              <h2 id="results-heading" ref={resultsHeadingRef} className={styles.resultsHeading}>
                {state.status === 'done' ? `${pluralize(state.total, 'result')}` : 'Results'}
                <span className={styles.resultsQuery}> for “{query}”</span>
              </h2>
              <ul role="list" className={styles.results}>
                {state.books.map((book, i) => (
                  <SearchResultItem key={book.id} book={book} editionCount={state.editionCounts?.[book.id] ?? 1} priority={i < 4} />
                ))}
              </ul>
              {state.status === 'done' && state.hasMore && (
                <div className={styles.more}>
                  <p className={styles.moreCount}>
                    Showing {state.books.length} of {state.total.toLocaleString()}
                  </p>
                  <Button onClick={loadMore} disabled={state.loadingMore} aria-busy={state.loadingMore}>
                    {state.loadingMore ? 'Loading…' : 'Load more results'}
                  </Button>
                </div>
              )}
              {state.status === 'error' && <ErrorPanel kind={state.kind} onRetry={loadMore} compact />}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function SearchResultItem({ book, editionCount, priority }: { book: Book; editionCount: number; priority: boolean }) {
  const meta = [
    book.publishedYear && `First published ${book.publishedYear}`,
    book.pageCount && `≈ ${book.pageCount} pages`,
    editionCount > 1 && `${editionCount} editions`,
  ].filter(Boolean);

  return (
    <li className={styles.result}>
      <div className={styles.resultCover}>
        <BookCover book={book} size="M" priority={priority} />
      </div>
      <div className={styles.resultBody}>
        <h3 className={styles.resultTitle}>{book.title}</h3>
        <p className={styles.resultAuthor}>{book.authors.length ? formatAuthors(book.authors) : 'Unknown author'}</p>
        {meta.length > 0 && <p className={styles.resultMeta}>{meta.join(' · ')}</p>}
      </div>
      <div className={styles.resultActions}>
        <AddBook book={book} editionCount={editionCount} />
      </div>
    </li>
  );
}

function ErrorPanel({ kind, onRetry, compact }: { kind: BookApiErrorKind; onRetry(): void; compact?: boolean }) {
  const copy = ERROR_COPY[kind];
  return (
    <div className={`${page.errorBox} ${compact ? styles.compactError : ''}`} role="alert">
      <h2>
        {kind === 'network' && <WifiOff size={18} aria-hidden="true" className={styles.errorIcon} />}
        {copy.title}
      </h2>
      <p>{copy.body}</p>
      <Button icon={<RefreshCw />} onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className={styles.results} role="status" aria-label="Searching Open Library">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={`${styles.result} ${styles.skeleton}`} aria-hidden="true">
          <div className={styles.resultCover}>
            <div className={styles.skeletonCover} />
          </div>
          <div className={styles.resultBody}>
            <div className={styles.skeletonLine} style={{ width: '60%' }} />
            <div className={styles.skeletonLine} style={{ width: '35%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
