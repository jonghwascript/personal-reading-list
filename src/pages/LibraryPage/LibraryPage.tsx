import { ArrowRight, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookCover } from '../../components/BookCover/BookCover';
import { BookGrid } from '../../components/BookGrid/BookGrid';
import { CuratedLists, StartSearch } from '../../components/Discovery/Discovery';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { GoalCard } from '../../components/GoalCard/GoalCard';
import { ProgressLogger } from '../../components/ProgressLogger/ProgressLogger';
import { useBookDraggable, useShelfDroppable } from '../../components/ShelfDnd/ShelfDnd';
import { Button } from '../../components/ui/Button';
import { formatAuthors, pluralize } from '../../lib/format';
import { booksFinishedInYear } from '../../lib/goal';
import { authorsIn, filterEntries, genresIn, sortEntries, type EntryFilter } from '../../lib/libraryRules';
import { useFlipGrid } from '../../lib/motion';
import { usePageTitle } from '../../lib/usePageTitle';
import { useLibrary } from '../../state/LibraryContext';
import { useSession } from '../../state/SessionContext';
import type { LibraryEntry } from '../../types';
import page from '../Page.module.css';
import styles from './LibraryPage.module.css';

const PREVIEW_COUNT = 8;
/**
 * Below this many books the page stays in "getting started" mode: the curated lists stay put while
 * the reader adds books, so the layout doesn't jump away (and steal focus) after the first add.
 */
const ONBOARDING_UNTIL = 3;

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 5 ? 'Reading late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function LibraryPage() {
  usePageTitle('Library');
  const { shelves, entries } = useLibrary();
  const { status } = useSession();
  const [filter, setFilter] = useState<EntryFilter>({});
  // Changing filters glides matching books into place; new matches fade in.
  const flip = useFlipGrid();
  const changeFilter = (next: EntryFilter) => {
    flip.capture();
    setFilter(next);
  };
  const year = new Date().getFullYear();

  const readingShelf = shelves.find((s) => s.kind === 'reading');
  const reading = useMemo(
    () => sortEntries(entries.filter((e) => e.shelfId === readingShelf?.id), 'added'),
    [entries, readingShelf?.id],
  );
  const finishedThisYear = booksFinishedInYear(entries, year).length;
  const filterActive = Boolean(filter.genre || filter.author || filter.minRating);
  const filtered = useMemo(() => (filterActive ? sortEntries(filterEntries(entries, filter), 'title') : []), [entries, filter, filterActive]);

  if (entries.length < ONBOARDING_UNTIL) {
    // Design challenge #2: an empty library is a starting line, not a void. Readers who know what
    // they want search straight away; everyone else can pick from a short, hand-curated list.
    const others = entries.filter((e) => e.shelfId !== readingShelf?.id);
    return (
      <div className={page.page}>
        <header className={styles.welcome}>
          <p className={page.eyebrow}>{greeting()}</p>
          <h1 className={page.title}>{entries.length === 0 ? 'Let’s fill your first shelf' : 'Your library is taking shape'}</h1>
          <p className={page.lede}>
            {entries.length === 0
              ? 'Add a book you’re reading now, one you loved, or one you’ve been meaning to start.'
              : `${pluralize(entries.length, 'book')} so far. Add a couple more and your full library view opens up.`}
          </p>
          <StartSearch autoFocus={entries.length === 0} />
          <Link to="/import" className={styles.reviewLink}>
            Coming from Goodreads? Import your library <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </header>
        {reading.length > 0 && readingShelf && <ReadingSection entries={reading} shelfId={readingShelf.id} />}
        {others.length > 0 && (
          <section className={page.section} aria-labelledby="added-heading">
            <div className={page.sectionHeader}>
              <h2 id="added-heading" className={page.sectionTitle}>
                On your shelves
              </h2>
            </div>
            <BookGrid entries={others} label="On your shelves" />
          </section>
        )}
        <GoalCard />
        <CuratedLists />
      </div>
    );
  }

  return (
    <div className={page.page}>
      <header className={styles.hero}>
        <div>
          <p className={page.eyebrow}>{greeting()}</p>
          <h1 className={page.title}>{status === 'guest' ? 'A reader’s library' : 'Your library'}</h1>
          <dl className={styles.stats}>
            <div>
              <dt>Books</dt>
              <dd>{entries.length}</dd>
            </div>
            <div>
              <dt>Read in {year}</dt>
              <dd>{finishedThisYear}</dd>
            </div>
            <div>
              <dt>Reading now</dt>
              <dd>{reading.length}</dd>
            </div>
          </dl>
          {finishedThisYear > 0 && (
            <Link to="/review" className={styles.reviewLink}>
              See your {year} so far <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        </div>
        <GoalCard />
      </header>

      {reading.length > 0 && readingShelf && <ReadingSection entries={reading} shelfId={readingShelf.id} />}

      <section className={page.section} aria-labelledby="browse-heading">
        <div className={page.sectionHeader}>
          <h2 id="browse-heading" className={page.sectionTitle}>
            Browse your library
          </h2>
        </div>
        <LibraryFilters filter={filter} onChange={changeFilter} />
        {filterActive && (
          <div className={styles.filterResults} ref={flip.ref}>
            <p className={styles.resultCount} role="status">
              {pluralize(filtered.length, 'book')} match
            </p>
            {filtered.length > 0 ? (
              <BookGrid entries={filtered} label="Filtered books" />
            ) : (
              <EmptyState
                title="No books match these filters"
                headingLevel="h3"
                action={
                  <Button variant="secondary" onClick={() => changeFilter({})}>
                    Clear filters
                  </Button>
                }
              >
                Try a different genre or a lower minimum rating.
              </EmptyState>
            )}
          </div>
        )}
      </section>

      {!filterActive &&
        shelves
          .filter((s) => s.kind !== 'reading')
          .map((shelf) => {
            const shelfEntries = entries.filter((e) => e.shelfId === shelf.id);
            const preview = sortEntries(shelfEntries, shelf.kind === 'read' ? 'finished' : 'added').slice(0, PREVIEW_COUNT);
            const headingId = `shelf-${shelf.id}-heading`;
            return (
              <DropSection key={shelf.id} shelfId={shelf.id} shelfName={shelf.name} labelledBy={headingId}>
                <div className={page.sectionHeader}>
                  <h2 id={headingId} className={page.sectionTitle}>
                    {shelf.name} <span className={page.sectionCount}>{shelfEntries.length}</span>
                  </h2>
                  {shelfEntries.length > 0 && (
                    <Link to={`/shelves/${shelf.id}`} className={page.sectionLink}>
                      {shelfEntries.length > PREVIEW_COUNT ? `See all ${shelfEntries.length}` : 'Open shelf'}
                      {' '}<span className="u-sr-only">{shelf.name}</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  )}
                </div>
                {preview.length > 0 ? (
                  <BookGrid entries={preview} label={shelf.name} />
                ) : (
                  <p className={styles.emptyShelf}>
                    This shelf is waiting for its first book. <Link to="/discover">Search to add one.</Link>
                  </p>
                )}
              </DropSection>
            );
          })}
    </div>
  );
}

/** Design challenge #3 lives here: progress is logged straight from these cards. */
function ReadingSection({ entries, shelfId }: { entries: LibraryEntry[]; shelfId: string }) {
  return (
    <DropSection shelfId={shelfId} shelfName="Currently reading" labelledBy="reading-heading">
      <div className={page.sectionHeader}>
        <h2 id="reading-heading" className={page.sectionTitle}>
          Currently reading <span className={page.sectionCount}>{entries.length}</span>
        </h2>
        <Link to={`/shelves/${shelfId}`} className={page.sectionLink}>
          See all <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <ul role="list" className={styles.readingList}>
        {entries.map((entry, i) => (
          <li key={entry.id} className={styles.readingCard}>
            <DraggableCover entry={entry} priority={i < 3} />
            <div className={styles.readingBody}>
              <h3 className={styles.readingTitle}>
                <Link to={`/books/${entry.id}`}>{entry.book.title}</Link>
              </h3>
              <p className={styles.readingAuthor}>{formatAuthors(entry.book.authors) || 'Unknown author'}</p>
              <ProgressLogger entry={entry} variant="card" />
            </div>
          </li>
        ))}
      </ul>
    </DropSection>
  );
}

/**
 * A shelf section that accepts dropped books. While a drag is in progress, every other shelf shows
 * a dashed outline; the one under the book lights up and says what will happen.
 */
function DropSection({ shelfId, shelfName, labelledBy, children }: { shelfId: string; shelfName: string; labelledBy: string; children: React.ReactNode }) {
  const drop = useShelfDroppable(shelfId, 'section');
  return (
    <section
      ref={drop.ref}
      className={`${page.section} ${styles.dropSection}`}
      aria-labelledby={labelledBy}
      data-candidate={drop.isCandidate || undefined}
      data-over={drop.isOver || undefined}
    >
      {children}
      {drop.isOver && (
        <p className={styles.dropHint} aria-hidden="true">
          Drop to move to {shelfName}
        </p>
      )}
    </section>
  );
}

/** Pointer-only drag handle on reading cards (the card itself holds a form, so it can't be the handle). */
function DraggableCover({ entry, priority }: { entry: LibraryEntry; priority: boolean }) {
  const drag = useBookDraggable(entry.id);
  return (
    <Link
      ref={drag.ref}
      {...drag.props}
      to={`/books/${entry.id}`}
      className={styles.readingCover}
      tabIndex={-1}
      aria-hidden="true"
      data-dragging={drag.isDragging || undefined}
    >
      <BookCover book={entry.book} size="M" priority={priority} />
    </Link>
  );
}

function LibraryFilters({ filter, onChange }: { filter: EntryFilter; onChange(f: EntryFilter): void }) {
  const { entries } = useLibrary();
  const genres = useMemo(() => genresIn(entries), [entries]);
  const authors = useMemo(() => authorsIn(entries), [entries]);
  const active = Boolean(filter.genre || filter.author || filter.minRating);

  return (
    <div className={page.toolbar} role="group" aria-label="Filter books">
      <label className={page.field}>
        Genre
        <select className={page.select} value={filter.genre ?? ''} onChange={(e) => onChange({ ...filter, genre: e.target.value || null })}>
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </label>
      <label className={page.field}>
        Author
        <select className={page.select} value={filter.author ?? ''} onChange={(e) => onChange({ ...filter, author: e.target.value || null })}>
          <option value="">All authors</option>
          {authors.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      <label className={page.field}>
        Rating
        <select
          className={page.select}
          value={filter.minRating ?? ''}
          onChange={(e) => onChange({ ...filter, minRating: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Any rating</option>
          <option value="5">★★★★★ only</option>
          <option value="4">★★★★ and up</option>
          <option value="3">★★★ and up</option>
        </select>
      </label>
      {active && (
        <Button variant="ghost" icon={<X />} onClick={() => onChange({})}>
          Clear
        </Button>
      )}
    </div>
  );
}
