import { Check, Plus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { DuplicateBookError } from '../../data/repository';
import { findDuplicate } from '../../lib/libraryRules';
import { useAnimatedDialog } from '../../lib/motion';
import { bookFromEdition, fetchEditions, rankEditions, type Edition } from '../../lib/openLibrary';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useLibrary } from '../../state/LibraryContext';
import type { Book } from '../../types';
import { BookCover } from '../BookCover/BookCover';
import { Button } from '../ui/Button';
import styles from './AddBook.module.css';

interface AddBookProps {
  book: Book;
  editionCount: number;
}

/**
 * Design challenge #2's friction rule: one click when there's only one edition; one extra,
 * pre-answered step when there are several — because the edition decides the page count that
 * progress percentages are computed from. That extra step opens in a dialog: an inline chooser
 * couldn't fit a 145px card without breaking the grid. Single-edition books never see it, so the
 * routine add stays modal-free (patterns.md).
 */
export function AddBook({ book, editionCount }: AddBookProps) {
  const { entries, addBook, defaultShelf, shelfById } = useLibrary();
  const { notify } = useAnnouncer();
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const inLibraryRef = useRef<HTMLAnchorElement>(null);
  const justAdded = useRef(false);
  const existing = findDuplicate(entries, book);

  // Move focus to the new "In your library" link once it exists *and* any dialog has finished
  // closing (a modal dialog makes the page inert, so focusing earlier would fail).
  useEffect(() => {
    if (existing && justAdded.current && !choosing) {
      justAdded.current = false;
      inLibraryRef.current?.focus();
    }
  }, [existing, choosing]);

  /** Resolves true when the book was added, so the dialog knows to close. */
  const add = async (chosen: Book, shelfId: string): Promise<boolean> => {
    setBusy(true);
    // Set before the call: the optimistic update renders "In your library" before addBook resolves.
    justAdded.current = true;
    try {
      const entry = await addBook(chosen, shelfId);
      notify(`Added “${chosen.title}” to ${shelfById(entry.shelfId)?.name ?? 'your library'}.`, 'success');
      return true;
    } catch (err) {
      justAdded.current = false;
      if (err instanceof DuplicateBookError) notify(err.message, 'info');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const want = defaultShelf('want');
  const needsEdition = editionCount > 1 && book.workKey !== null;

  return (
    <>
      {existing ? (
        <Link ref={inLibraryRef} to={`/books/${existing.id}`} className={styles.inLibrary}>
          <Check size={16} aria-hidden="true" />
          <span>
            In your library<span className={styles.shelfName}> · {shelfById(existing.shelfId)?.name}</span>
          </span>
          <span className="u-sr-only">: open {book.title}</span>
        </Link>
      ) : (
        <Button
          variant="primary"
          size="sm"
          icon={<Plus />}
          disabled={busy}
          aria-haspopup={needsEdition ? 'dialog' : undefined}
          onClick={() => (needsEdition ? setChoosing(true) : void add(book, want.id))}
        >
          {want.name}
          <span className="u-sr-only">: add {book.title}</span>
        </Button>
      )}
      {/* Rendered outside the branch above so it can finish its exit animation after the add. */}
      {choosing && <EditionDialog book={book} busy={busy} onClosed={() => setChoosing(false)} onAdd={add} />}
    </>
  );
}

/**
 * Native <dialog>: focus is trapped inside, Escape and the backdrop close it, the page behind is
 * inert, and focus returns to the "Want to Read" button on close — all from the platform.
 */
function EditionDialog({
  book,
  busy,
  onAdd,
  onClosed,
}: {
  book: Book;
  busy: boolean;
  onAdd(book: Book, shelfId: string): Promise<boolean>;
  /** Called after the exit animation, when the dialog has really closed. */
  onClosed(): void;
}) {
  const [open, setOpen] = useState(true);
  const ref = useAnimatedDialog(open, onClosed);
  const titleId = useId();
  const requestClose = () => setOpen(false);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault(); // Escape: animate out instead of the browser's instant close
        requestClose();
      }}
      onClick={(e) => {
        // A click on the dialog element itself (not its contents) is a click on the backdrop.
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <EditionChooser
        book={book}
        busy={busy}
        titleId={titleId}
        onCancel={requestClose}
        onAdd={async (chosen, shelfId) => {
          if (await onAdd(chosen, shelfId)) requestClose();
        }}
      />
    </dialog>
  );
}

type EditionsState = { status: 'loading' } | { status: 'ready'; editions: Edition[] } | { status: 'error' };

function EditionChooser({
  book,
  busy,
  titleId,
  onAdd,
  onCancel,
}: {
  book: Book;
  busy: boolean;
  titleId: string;
  onAdd(book: Book, shelfId: string): Promise<void>;
  onCancel(): void;
}) {
  const { shelves, defaultShelf } = useLibrary();
  const id = useId();
  const [state, setState] = useState<EditionsState>({ status: 'loading' });
  const [choice, setChoice] = useState('any');
  const [shelfId, setShelfId] = useState(() => defaultShelf('want').id);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Start screen readers at the question rather than on the close button.
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
    void onAdd(edition ? bookFromEdition(book, edition) : book, shelfId);
  };

  const shelfName = shelves.find((s) => s.id === shelfId)?.name ?? 'shelf';

  return (
    <form className={styles.chooser} onSubmit={submit}>
      <header className={styles.header}>
        <div className={styles.thumb} aria-hidden="true">
          <BookCover book={book} size="S" />
        </div>
        <div className={styles.headerText}>
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className={styles.chooserTitle}>
            Which edition of <cite>{book.title}</cite>?
          </h2>
          <p className={styles.chooserHint}>Editions differ in length; your choice sets the page count used for progress.</p>
        </div>
        <button type="button" className={styles.close} onClick={onCancel}>
          <X size={18} aria-hidden="true" />
          <span className="u-sr-only">Close</span>
        </button>
      </header>

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
          <>
            <p className="u-sr-only" role="status">
              Finding editions…
            </p>
            {[0.55, 0.7, 0.45, 0.62].map((width, i) => (
              <div key={i} className={styles.skeletonOption} aria-hidden="true">
                <span className={styles.skeletonDot} />
                <span className={styles.skeletonText}>
                  <span className={styles.skeletonLine} style={{ width: '30%' }} />
                  <span className={styles.skeletonLine} style={{ width: `${width * 100}%` }} />
                </span>
              </div>
            ))}
          </>
        )}
        {state.status === 'error' && <p className={styles.status}>Couldn’t load editions right now — “Not sure yet” works fine.</p>}
        {state.status === 'ready' && editions.length === 0 && <p className={styles.status}>No editions with page counts listed.</p>}
      </fieldset>

      <footer className={styles.footer}>
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
        <div className={styles.footerActions}>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={busy}>
            Add to {shelfName}
          </Button>
        </div>
      </footer>
    </form>
  );
}
