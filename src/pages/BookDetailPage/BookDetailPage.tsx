import { ArrowLeft, ExternalLink, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { BookCover } from '../../components/BookCover/BookCover';
import { ProgressLogger } from '../../components/ProgressLogger/ProgressLogger';
import { ReadingFormatEditor } from '../../components/ProgressLogger/ReadingFormatEditor';
import { StarRating } from '../../components/StarRating/StarRating';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { FinishDateDialog } from '../../components/ui/FinishDateDialog';
import { formatAuthors, formatDate, pluralize } from '../../lib/format';
import { daysToFinish, totalPagesOf } from '../../lib/progress';
import { genresIn } from '../../lib/libraryRules';
import { fetchWorkDetails, openLibraryUrl } from '../../lib/openLibrary';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useLibrary } from '../../state/LibraryContext';
import type { LibraryEntry } from '../../types';
import page from '../Page.module.css';
import styles from './BookDetailPage.module.css';

export function BookDetailPage() {
  const { entryId = '' } = useParams();
  const { entries } = useLibrary();
  const entry = entries.find((e) => e.id === entryId);
  usePageTitle(entry?.book.title ?? 'Book');
  if (!entry) return <Navigate to="/library" replace />;
  // Keyed so per-book local state (notes draft, fetched description) resets between books.
  return <BookDetail key={entry.id} entry={entry} />;
}

function BookDetail({ entry }: { entry: LibraryEntry }) {
  const { shelves, shelfById, moveEntries, updateEntry, removeEntries } = useLibrary();
  const { notify, announce } = useAnnouncer();

  // Number keys rate the book you're looking at: 1–5 sets the stars, 0 clears them.
  // Never while typing, with a modifier held, or behind an open dialog.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (!/^[0-5]$/.test(e.key)) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('dialog[open]')) return;
      const rating = Number(e.key) || null;
      if (rating === entry.rating) return;
      e.preventDefault();
      void updateEntry(entry.id, { rating })
        .then(() => announce(rating ? `Rated ${rating} out of 5.` : 'Rating cleared.'))
        .catch(() => notify('Couldn’t save your rating.', 'error'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [entry.id, entry.rating, updateEntry, announce, notify]);
  const navigate = useNavigate();
  const { book } = entry;
  const shelf = shelfById(entry.shelfId);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [finishTarget, setFinishTarget] = useState('');
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState(false);
  const description = useLazyDescription(entry);

  const move = async (targetId: string) => {
    setMoving(true);
    setMoveError(false);
    try {
      await moveEntries([entry.id], targetId);
      announce(`Moved to ${shelfById(targetId)?.name ?? 'the selected shelf'}.`);
    } catch {
      setMoveError(true);
    } finally {
      setMoving(false);
    }
  };

  // Only rows that have data — sparse books get a shorter list, never "Unknown" placeholders.
  const facts = [
    totalPagesOf(entry) && ['Pages', `${totalPagesOf(entry)!.toLocaleString()}${entry.totalPages ? ' (your edition)' : ''}`],
    book.publishedYear && ['First published', String(book.publishedYear)],
    book.publisher && ['Publisher', book.publisher],
    (book.isbn13 || book.isbn10) && ['ISBN', [book.isbn13, book.isbn10].filter(Boolean).join(' · ')],
    ['Added', formatDate(entry.addedAt)],
    entry.startedAt && shelf?.kind !== 'want' && ['Started', formatDate(entry.startedAt)],
    entry.finishedAt && ['Finished', formatDate(entry.finishedAt)],
    // Only shown when both dates are real; we never guess reading time from log timestamps.
    daysToFinish(entry) && ['Time to finish', pluralize(daysToFinish(entry)!, 'day')],
  ].filter(Boolean) as [string, string][];

  return (
    <article className={styles.layout} aria-labelledby="book-title">
      <div className={styles.back}>
        <Link to={shelf ? `/shelves/${shelf.id}` : '/library'} className={page.sectionLink}>
          <ArrowLeft size={16} aria-hidden="true" /> {shelf ? shelf.name : 'Library'}
        </Link>
      </div>

      <div className={styles.coverCol} data-cover-target="">
        <BookCover book={book} size="L" alt={`Cover of ${book.title}`} priority className={styles.cover} />
      </div>

      <div className={styles.main}>
        <header className={styles.header}>
          {book.genres.length > 0 && <p className={page.eyebrow}>{book.genres.slice(0, 3).join(' · ')}</p>}
          <h1 id="book-title" className={styles.title}>
            {book.title}
          </h1>
          <p className={styles.author}>{book.authors.length ? `by ${formatAuthors(book.authors)}` : 'Author unknown'}</p>
        </header>

        <section className={styles.panel} aria-label="Your copy">
          <label className={page.field}>
            Shelf
            <select
              className={page.select}
              value={entry.shelfId}
              disabled={moving}
              onChange={(e) => {
                const targetId = e.target.value;
                if (shelfById(targetId)?.kind === 'read' && !entry.finishedAt && entry.progress?.percent !== 100) {
                  setFinishTarget(targetId);
                  setMoveError(false);
                  return;
                }
                void move(targetId);
              }}
            >
              {shelves.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {finishTarget && <FinishDateDialog onCancel={() => setFinishTarget('')} onMove={async (date) => {
            await moveEntries([entry.id], finishTarget, date);
            setFinishTarget('');
            announce('Moved to Read.');
          }} />}
          {moveError && <p role="alert">Couldn’t move this book. Please try again.</p>}

          {shelf?.kind === 'reading' && (
            <div className={styles.progress}>
              <h2 className={styles.panelHeading}>Reading progress</h2>
              <ProgressLogger entry={entry} variant="detail" />
            </div>
          )}

          {shelf?.kind !== 'read' && <ReadingFormatEditor entry={entry} />}

          <StarRating
            value={entry.rating}
            onChange={async (rating) => {
              try {
                await updateEntry(entry.id, { rating });
                announce(rating ? `Rated ${rating} out of 5.` : 'Rating cleared.');
              } catch {
                notify('Couldn’t save your rating.', 'error');
              }
            }}
          />
        </section>

        {description ? (
          <section className={styles.section} aria-labelledby="about-heading">
            <h2 id="about-heading" className={styles.sectionHeading}>
              About this book
            </h2>
            <div className={styles.description}>
              {description.split(/\n{2,}/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </section>
        ) : null}

        <NotesEditor entry={entry} />

        <GenreEditor entry={entry} />

        <section className={styles.section} aria-labelledby="details-heading">
          <h2 id="details-heading" className={styles.sectionHeading}>
            Details
          </h2>
          <dl className={styles.facts}>
            {facts.map(([term, value]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p>
            <a href={openLibraryUrl(book)} target="_blank" rel="noreferrer" className={styles.external}>
              View on Open Library <ExternalLink size={14} aria-hidden="true" />
              {' '}<span className="u-sr-only">(opens in a new tab)</span>
            </a>
          </p>
        </section>

        <div className={styles.danger}>
          <Button variant="ghost" size="sm" icon={<Trash2 />} onClick={() => setConfirmRemove(true)}>
            Remove from library
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title={`Remove “${book.title}”?`}
        confirmLabel="Remove book"
        tone="danger"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={async () => {
          setConfirmRemove(false);
          await removeEntries([entry.id]);
          notify(`Removed “${book.title}” from your library.`, 'success');
          navigate(shelf ? `/shelves/${shelf.id}` : '/library');
        }}
      >
        Your rating, notes and reading progress for this book will be deleted. This can’t be undone.
      </ConfirmDialog>
    </article>
  );
}

/** Search results carry no description; fetch it from the work record once, non-blocking. */
function useLazyDescription(entry: LibraryEntry): string | null {
  const [fetched, setFetched] = useState<string | null>(null);
  const { workKey, description } = entry.book;
  useEffect(() => {
    if (description || !workKey) return;
    const controller = new AbortController();
    fetchWorkDetails(workKey, controller.signal)
      .then((d) => setFetched(d.description))
      .catch(() => undefined); // A missing description is fine; the section simply stays hidden.
    return () => controller.abort();
  }, [workKey, description]);
  return description ?? fetched;
}

function NotesEditor({ entry }: { entry: LibraryEntry }) {
  const { updateEntry } = useLibrary();
  const [draft, setDraft] = useState(entry.notes);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const id = useId();
  const dirty = draft !== entry.notes;
  const blocker = useBlocker(dirty);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const save = async () => {
    if (!dirty) return;
    setSaved('saving');
    try {
      await updateEntry(entry.id, { notes: draft });
      setSaved('saved');
    } catch {
      setSaved('error');
    }
  };

  return (
    <section className={styles.section} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className={styles.sectionHeading}>
        <label htmlFor={`${id}-notes`}>Your notes</label>
      </h2>
      <textarea
        id={`${id}-notes`}
        className={styles.notes}
        value={draft}
        rows={Math.min(12, Math.max(4, draft.split('\n').length + 1))}
        placeholder="Favourite lines, what stayed with you, who you’d recommend it to…"
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved('idle');
        }}
        aria-describedby={`${id}-status`}
      />
      <Button variant="secondary" disabled={!dirty || saved === 'saving'} onClick={save}>Save notes</Button>
      <p id={`${id}-status`} className={styles.notesStatus} aria-live="polite">
        {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Notes saved' : saved === 'error' ? 'Couldn’t save notes. Try again.' : dirty ? 'Unsaved changes' : ''}
      </p>
      {blocker.state === 'blocked' && (
        <ConfirmDialog open title="Leave without saving your notes?" confirmLabel="Discard notes" tone="danger"
          onCancel={blocker.reset} onConfirm={blocker.proceed}>
          Your edits will be lost.
        </ConfirmDialog>
      )}
    </section>
  );
}

function GenreEditor({ entry }: { entry: LibraryEntry }) {
  const { entries, setGenres } = useLibrary();
  const { announce } = useAnnouncer();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const suggestions = useMemo(() => genresIn(entries).filter((g) => !entry.book.genres.includes(g)), [entries, entry.book.genres]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const genre = value.trim();
    if (!genre || entry.book.genres.some((g) => g.toLowerCase() === genre.toLowerCase())) return;
    await setGenres([entry.id], (genres) => [...genres, genre]);
    announce(`Added genre ${genre}.`);
    setValue('');
  };

  return (
    <section className={styles.section} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className={styles.sectionHeading}>
        Genres
      </h2>
      {entry.book.genres.length > 0 ? (
        <ul role="list" className={styles.tags}>
          {entry.book.genres.map((genre) => (
            <li key={genre} className={styles.tag}>
              {genre}
              <button
                type="button"
                className={styles.tagRemove}
                onClick={async () => {
                  await setGenres([entry.id], (genres) => genres.filter((g) => g !== genre));
                  announce(`Removed genre ${genre}.`);
                  inputRef.current?.focus();
                }}
              >
                <X size={12} aria-hidden="true" />
                <span className="u-sr-only">Remove {genre}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No genres yet.</p>
      )}
      <form className={styles.tagForm} onSubmit={add}>
        <label htmlFor={`${id}-input`} className="u-sr-only">
          Add a genre
        </label>
        <input
          ref={inputRef}
          id={`${id}-input`}
          list={`${id}-suggestions`}
          className={page.input}
          value={value}
          maxLength={40}
          placeholder="Add a genre"
          onChange={(e) => setValue(e.target.value)}
        />
        <datalist id={`${id}-suggestions`}>
          {suggestions.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        <Button type="submit" size="sm" icon={<Plus />} disabled={!value.trim()}>
          Add
        </Button>
      </form>
    </section>
  );
}
