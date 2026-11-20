import { Compass, Search, SearchX, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookGrid } from '../../components/BookGrid/BookGrid';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Button, ButtonLink } from '../../components/ui/Button';
import { pluralize } from '../../lib/format';
import { genresIn, searchLibrary, type LibraryMatch } from '../../lib/libraryRules';
import { useFlipGrid } from '../../lib/motion';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useLibrary } from '../../state/LibraryContext';
import page from '../Page.module.css';
import styles from './LibrarySearchPage.module.css';
import { LIBRARY_SEARCH_INPUT_ID } from './searchInputId';


/**
 * Stretch #14 — search *your own* books (titles, authors and your notes). Instant, in memory, and
 * deliberately distinct from Discover, which searches Open Library for new books.
 */
export function LibrarySearchPage() {
  usePageTitle('Search your library');
  const { entries, shelves } = useLibrary();
  const { announce } = useAnnouncer();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const [shelfId, setShelfId] = useState('');
  const [genre, setGenre] = useState('');
  const [minRating, setMinRating] = useState(0);
  const flip = useFlipGrid();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtersActive = Boolean(shelfId || genre || minRating);
  const trimmed = query.trim();

  const matches = useMemo<LibraryMatch[]>(() => {
    const base = trimmed ? searchLibrary(entries, trimmed) : filtersActive ? entries.map((entry) => ({ entry, fields: [] })) : [];
    return base.filter(
      ({ entry }) =>
        (!shelfId || entry.shelfId === shelfId) && (!genre || entry.book.genres.includes(genre)) && (!minRating || (entry.rating ?? 0) >= minRating),
    );
  }, [entries, trimmed, filtersActive, shelfId, genre, minRating]);

  const notesOnly = matches.filter((m) => m.fields.length === 1 && m.fields[0] === 'notes').length;
  const genres = useMemo(() => genresIn(entries), [entries]);
  const showing = Boolean(trimmed || filtersActive);

  // Keep the URL shareable (and back-button friendly) without a history entry per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setParams(trimmed ? { q: trimmed } : {}, { replace: true }), 250);
    return () => window.clearTimeout(t);
  }, [trimmed, setParams]);

  // Announce the count once typing pauses, not on every keystroke.
  useEffect(() => {
    if (!showing) return;
    const t = window.setTimeout(() => announce(matches.length ? `${pluralize(matches.length, 'book')} found.` : 'No books found.'), 700);
    return () => window.clearTimeout(t);
  }, [matches.length, showing, announce]);

  /** Wrap any state change that re-filters the grid so books glide instead of snapping. */
  const change = (fn: () => void) => {
    flip.capture();
    fn();
  };

  return (
    <div className={page.page}>
      <header className={styles.header}>
        <p className={page.eyebrow}>Library</p>
        <h1 className={page.title}>Search your library</h1>
        <p className={page.lede}>
          Titles, authors and your own notes. Looking for something new?{' '}
          <Link to={trimmed ? `/discover?q=${encodeURIComponent(trimmed)}` : '/discover'}>Discover books on Open Library</Link>.
        </p>
      </header>

      <form className={styles.form} role="search" aria-label="Your library" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor={LIBRARY_SEARCH_INPUT_ID} className="u-sr-only">
          Search your library
        </label>
        <div className={styles.inputWrap}>
          <Search size={20} aria-hidden="true" className={styles.inputIcon} />
          <input
            ref={inputRef}
            id={LIBRARY_SEARCH_INPUT_ID}
            type="search"
            className={styles.input}
            value={query}
            onChange={(e) => change(() => setQuery(e.target.value))}
            placeholder="Title, author or something you wrote in a note"
            autoComplete="off"
            enterKeyHint="search"
            autoFocus
          />
          <kbd className={styles.kbd} aria-hidden="true">
            /
          </kbd>
        </div>

        <div className={page.toolbar} role="group" aria-label="Filter results">
          <label className={page.field}>
            Shelf
            <select className={page.select} value={shelfId} onChange={(e) => change(() => setShelfId(e.target.value))}>
              <option value="">All shelves</option>
              {shelves.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className={page.field}>
            Genre
            <select className={page.select} value={genre} onChange={(e) => change(() => setGenre(e.target.value))}>
              <option value="">All genres</option>
              {genres.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className={page.field}>
            Rating
            <select className={page.select} value={minRating} onChange={(e) => change(() => setMinRating(Number(e.target.value)))}>
              <option value={0}>Any rating</option>
              <option value={5}>★★★★★ only</option>
              <option value={4}>★★★★ and up</option>
              <option value={3}>★★★ and up</option>
            </select>
          </label>
          {filtersActive && (
            <Button
              variant="ghost"
              icon={<X />}
              onClick={() =>
                change(() => {
                  setShelfId('');
                  setGenre('');
                  setMinRating(0);
                })
              }
            >
              Clear filters
            </Button>
          )}
        </div>
      </form>

      <section className={page.section} aria-label="Results" ref={flip.ref}>
        {!showing ? (
          <p className={styles.hint}>
            Start typing to search {pluralize(entries.length, 'book')} — or press <kbd className={styles.kbdInline}>/</kbd> anywhere in your
            library to jump here.
          </p>
        ) : matches.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title={trimmed ? `Nothing in your library matches “${trimmed}”` : 'No books match these filters'}
            action={
              trimmed ? (
                <ButtonLink to={`/discover?q=${encodeURIComponent(trimmed)}`} variant="primary" icon={<Compass />}>
                  Search Open Library for “{trimmed}”
                </ButtonLink>
              ) : undefined
            }
          >
            {trimmed ? 'Check the spelling, try fewer words — or find it as a new book.' : 'Try a different shelf, genre or rating.'}
          </EmptyState>
        ) : (
          <>
            <p className={styles.count}>
              {pluralize(matches.length, 'book')}
              {notesOnly > 0 && ` · ${notesOnly} matched only in your notes`}
            </p>
            <BookGrid entries={matches.map((m) => m.entry)} label="Search results" priorityCount={8} />
          </>
        )}
      </section>
    </div>
  );
}
