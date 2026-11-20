import { Search, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CURATED_LISTS, pickRecommendationSeed } from '../../lib/discovery';
import { formatAuthors } from '../../lib/format';
import { findDuplicate } from '../../lib/libraryRules';
import { searchBySubject } from '../../lib/openLibrary';
import { useLibrary } from '../../state/LibraryContext';
import type { Book } from '../../types';
import { AddBook } from '../AddBook/AddBook';
import { BookCover } from '../BookCover/BookCover';
import { Button } from '../ui/Button';
import styles from './Discovery.module.css';

/** Search box used where a new reader lands with an empty library. */
export function StartSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate(`/discover?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <form className={styles.startSearch} role="search" aria-label="Find a book" onSubmit={submit}>
      <label htmlFor="start-search" className="u-sr-only">
        Search for a book
      </label>
      <div className={styles.inputWrap}>
        <Search size={20} aria-hidden="true" className={styles.inputIcon} />
        <input
          id="start-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search for a book you’ve read or want to read"
          className={styles.input}
          autoComplete="off"
          enterKeyHint="search"
          autoFocus={autoFocus}
        />
      </div>
      <Button type="submit" variant="primary" size="lg">
        Search
      </Button>
    </form>
  );
}

export function CuratedLists({ headingLevel = 'h2' }: { headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel;
  return (
    <div className={styles.lists}>
      {CURATED_LISTS.map((list) => (
        <section key={list.id} className={styles.list} aria-labelledby={`curated-${list.id}`}>
          <div className={styles.listHeader}>
            <Heading id={`curated-${list.id}`} className={styles.listTitle}>
              {list.title}
            </Heading>
            <p className={styles.listDescription}>{list.description}</p>
          </div>
          <BookTiles items={list.books} label={list.title} />
        </section>
      ))}
    </div>
  );
}

type RecState =
  | { status: 'loading' }
  | { status: 'ready'; items: { book: Book; editionCount: number }[] }
  | { status: 'error' };

/**
 * "Same genre as «Circe»" — a deliberately simple, explainable recommendation. The reason is
 * always shown; we never present a suggestion we can't justify from the reader's own library.
 */
export function Recommendations() {
  const { entries } = useLibrary();
  // Re-pick only when the set of loved books changes, not on every progress update.
  const lovedKey = entries
    .filter((e) => e.finishedAt && (e.rating ?? 0) >= 4)
    .map((e) => e.id)
    .join();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const seed = useMemo(() => pickRecommendationSeed(entries), [lovedKey]);
  const [state, setState] = useState<RecState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(
    (signal: AbortSignal) => {
      if (!seed) return;
      setState({ status: 'loading' });
      searchBySubject(seed.subject, { signal })
        .then(({ books, editionCounts }) => {
          const fresh = books.filter((b) => !findDuplicate(entries, b)).slice(0, 6);
          setState({ status: 'ready', items: fresh.map((book) => ({ book, editionCount: editionCounts[book.id] ?? 1 })) });
        })
        .catch(() => {
          if (!signal.aborted) setState({ status: 'error' });
        });
    },
    // entries intentionally omitted: adding a suggested book shouldn't re-fetch and reshuffle the row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, attempt]);

  if (!seed) return null;

  return (
    <section className={styles.list} aria-labelledby="recs-title">
      <div className={styles.listHeader}>
        <p className={styles.reason}>
          <Sparkles size={14} aria-hidden="true" /> Because you rated it {seed.entry.rating}★
        </p>
        <h2 id="recs-title" className={styles.listTitle}>
          Same genre as <cite>{seed.entry.book.title}</cite>
        </h2>
        <p className={styles.listDescription}>
          Highly rated {seed.genre.toLowerCase()} on Open Library that isn’t on your shelves yet.
        </p>
      </div>
      {state.status === 'loading' && (
        <p className={styles.status} role="status">
          Finding {seed.genre.toLowerCase()} you might like…
        </p>
      )}
      {state.status === 'error' && (
        <div className={styles.status}>
          <p>Couldn’t load suggestions from Open Library just now.</p>
          <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}
      {state.status === 'ready' &&
        (state.items.length ? (
          <BookTiles items={state.items} label={`Same genre as ${seed.entry.book.title}`} />
        ) : (
          <p className={styles.status}>You already have the top {seed.genre.toLowerCase()} picks. Impressive.</p>
        ))}
    </section>
  );
}

function BookTiles({ items, label }: { items: { book: Book; editionCount: number }[]; label: string }) {
  return (
    <ul role="list" className={styles.tiles} aria-label={label}>
      {items.map(({ book, editionCount }) => (
        <Tile key={book.id} book={book} editionCount={editionCount} />
      ))}
    </ul>
  );
}

function Tile({ book, editionCount }: { book: Book; editionCount: number }) {
  const [expanded, setExpanded] = useState(false);
  const meta = [book.pageCount && `${book.pageCount} pages`, book.publishedYear].filter(Boolean).join(' · ');
  return (
    <li className={styles.tile} data-expanded={expanded}>
      <div className={styles.tileCover}>
        <BookCover book={book} size="M" />
      </div>
      <div className={styles.tileBody}>
        <h3 className={styles.tileTitle}>{book.title}</h3>
        <p className={styles.tileAuthor}>{formatAuthors(book.authors) || 'Unknown author'}</p>
        {meta && <p className={styles.tileMeta}>{meta}</p>}
        <div className={styles.tileAction}>
          <AddBook book={book} editionCount={editionCount} onExpandedChange={setExpanded} />
        </div>
      </div>
    </li>
  );
}
