import { Check, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { DuplicateBookError } from '../../data/repository';
import { findDuplicate } from '../../lib/libraryRules';
import { bookFromEdition, fetchEditions, rankEditions, type Edition } from '../../lib/openLibrary';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useLibrary } from '../../state/LibraryContext';
import type { Book } from '../../types';
import { Button } from '../ui/Button';
import styles from './AddBook.module.css';

interface AddBookProps {
  book: Book;
  editionCount: number;
  /** Lets a grid card expand to full width while the edition chooser is open. */
  onExpandedChange?(expanded: boolean): void;
}

/**
 * Design challenge #2's friction rule: one click when there's only one edition; one extra,
 * pre-answered step when there are several — because the edition decides the page count that
 * progress percentages are computed from.
 */
export function AddBook({ book, editionCount, onExpandedChange }: AddBookProps) {
  const { entries, addBook, defaultShelf, shelfById } = useLibrary();
  const { notify } = useAnnouncer();
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const inLibraryRef = useRef<HTMLAnchorElement>(null);
  const justAdded = useRef(false);
  const existing = findDuplicate(entries, book);

  useEffect(() => onExpandedChange?.(choosing), [choosing, onExpandedChange]);
  useEffect(() => {
    if (existing && justAdded.current) {
      justAdded.current = false;
      inLibraryRef.current?.focus();
    }
  }, [existing]);

  const add = async (chosen: Book, shelfId: string) => {
    setBusy(true);
    // Set before the call: the optimistic update renders "In your library" before addBook resolves,
    // and that render is when focus must move to the new link.
    justAdded.current = true;
    try {
      const entry = await addBook(chosen, shelfId);
      setChoosing(false);
      notify(`Added “${chosen.title}” to ${shelfById(entry.shelfId)?.name ?? 'your library'}.`, 'success');
    } catch (err) {
      justAdded.current = false;
      if (err instanceof DuplicateBookError) notify(err.message, 'info');
    } finally {
      setBusy(false);
    }
  };

  if (existing) {
    return (
      <Link ref={inLibraryRef} to={`/books/${existing.id}`} className={styles.inLibrary}>
        <Check size={16} aria-hidden="true" />
        <span>
          In your library<span className={styles.shelfName}> · {shelfById(existing.shelfId)?.name}</span>
        </span>
        <span className="u-sr-only">: open {book.title}</span>
      </Link>
    );
  }

  const want = defaultShelf('want');
  const needsEdition = editionCount > 1 && book.workKey !== null;

  if (choosing) {
    return <EditionChooser book={book} busy={busy} onCancel={() => setChoosing(false)} onAdd={add} />;
  }

  return (
    <Button
      variant="primary"
      size="sm"
      icon={<Plus />}
      disabled={busy}
      aria-haspopup={needsEdition ? 'true' : undefined}
      onClick={() => (needsEdition ? setChoosing(true) : add(book, want.id))}
    >
      {want.name}
      <span className="u-sr-only">: add {book.title}</span>
    </Button>
  );
}

type EditionsState = { status: 'loading' } | { status: 'ready'; editions: Edition[] } | { status: 'error' };

function EditionChooser({
  book,
  busy,
  onAdd,
  onCancel,
}: {
  book: Book;
  busy: boolean;
  onAdd(book: Book, shelfId: string): void;
  onCancel(): void;
}) {
  const { shelves, defaultShelf } = useLibrary();
  const id = useId();
  const [state, setState] = useState<EditionsState>({ status: 'loading' });
  const [choice, setChoice] = useState('any');
  const [shelfId, setShelfId] = useState(() => defaultShelf('want').id);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => headingRef.current?.focus(), []);
  useEffect(() => {
    const controller = new AbortController();
    fetchEditions(book.workKey!, controller.signal)
      .then((all) => setState({ status: 'ready', editions: rankEditions(all) }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, [book.workKey]);

  const editions = state.status === 'ready' ? state.editions : [];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const edition = editions.find((ed) => ed.key === choice);
    onAdd(edition ? bookFromEdition(book, edition) : book, shelfId);
  };

  const shelfName = shelves.find((s) => s.id === shelfId)?.name ?? 'shelf';

  return (
    <form className={styles.chooser} onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onCancel()} aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`} ref={headingRef} tabIndex={-1} className={styles.chooserTitle}>
        Which edition of <cite>{book.title}</cite>?
      </h4>
      <p className={styles.chooserHint}>Editions differ in length; your choice sets the page count used for progress.</p>
      <fieldset className={styles.options} aria-busy={state.status === 'loading'}>
        <legend className="u-sr-only">Edition</legend>
        <label className={styles.option}>
          <input type="radio" name={`${id}-edition`} value="any" checked={choice === 'any'} onChange={() => setChoice('any')} />
          <span>
            <strong>Not sure yet</strong>
            <span className={styles.meta}>
              {book.pageCount ? `Use the typical length (≈ ${book.pageCount} pages). You can change it later.` : 'You can add your edition’s length later.'}
            </span>
          </span>
        </label>
        {editions.map((ed) => (
          <label key={ed.key} className={styles.option}>
            <input type="radio" name={`${id}-edition`} value={ed.key} checked={choice === ed.key} onChange={() => setChoice(ed.key)} />
            <span>
              <strong>{ed.pageCount} pages</strong>
              <span className={styles.meta}>{[ed.format, ed.publisher, ed.year, ed.language].filter(Boolean).join(' · ')}</span>
            </span>
          </label>
        ))}
        {state.status === 'loading' && (
          <p className={styles.status} role="status">
            Finding editions…
          </p>
        )}
        {state.status === 'error' && <p className={styles.status}>Couldn’t load editions right now — “Not sure yet” works fine.</p>}
        {state.status === 'ready' && editions.length === 0 && <p className={styles.status}>No editions with page counts listed.</p>}
      </fieldset>
      <div className={styles.footer}>
        <label className={styles.shelfField}>
          <span className="u-sr-only">Shelf</span>
          <select value={shelfId} onChange={(e) => setShelfId(e.target.value)} className={styles.select}>
            {shelves.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          Add to {shelfName}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
