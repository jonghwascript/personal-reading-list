import { Compass, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { BookGrid } from '../../components/BookGrid/BookGrid';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { pluralize } from '../../lib/format';
import { filterEntries, genresIn, sortEntries, type SortKey } from '../../lib/libraryRules';
import { useFlipGrid } from '../../lib/motion';
import { usePageTitle } from '../../lib/usePageTitle';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useLibrary } from '../../state/LibraryContext';
import page from '../Page.module.css';
import styles from './ShelfPage.module.css';

const SORT_LABELS: Record<SortKey, string> = {
  added: 'Date added',
  finished: 'Date read',
  title: 'Title',
  author: 'Author',
  rating: 'Rating',
};

const EMPTY_COPY: Record<string, string> = {
  want: 'Keep a list of books you’re curious about. Search for one to add it here.',
  reading: 'Nothing on the nightstand right now. Start a book from your Want to Read shelf, or find a new one.',
  read: 'Books you finish land here — along with your ratings and notes.',
};

export function ShelfPage() {
  const { shelfId = '' } = useParams();
  const { shelfById, entries, renameShelf, deleteShelf, defaultShelf } = useLibrary();
  const { announce, notify } = useAnnouncer();
  const navigate = useNavigate();
  const shelf = shelfById(shelfId);
  usePageTitle(shelf?.name ?? 'Shelf');

  const [sort, setSort] = useState<SortKey>(shelf?.kind === 'read' ? 'finished' : 'added');
  const [genre, setGenre] = useState('');
  // Sorting and filtering glide books to their new places instead of snapping (animated-shelf differentiator).
  const flip = useFlipGrid();
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const shelfEntries = useMemo(() => entries.filter((e) => e.shelfId === shelfId), [entries, shelfId]);
  const visible = useMemo(
    () => sortEntries(filterEntries(shelfEntries, { genre: genre || null }), sort),
    [shelfEntries, genre, sort],
  );
  const genres = useMemo(() => genresIn(shelfEntries), [shelfEntries]);

  if (!shelf) return <Navigate to="/shelves" replace />;

  const onRename = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    if (name && name !== shelf.name) {
      await renameShelf(shelf.id, name);
      announce(`Shelf renamed to ${name}.`);
    }
    setRenaming(false);
  };

  return (
    <div className={page.page}>
      <header className={page.header}>
        <div>
          <p className={page.eyebrow}>Shelf</p>
          {renaming ? (
            <form className={styles.renameForm} onSubmit={onRename} onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)}>
              <label htmlFor="shelf-name" className="u-sr-only">
                Shelf name
              </label>
              <input id="shelf-name" name="name" defaultValue={shelf.name} maxLength={60} autoFocus className={styles.renameInput} required />
              <Button type="submit" variant="primary" size="sm">
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <h1 className={page.title}>{shelf.name}</h1>
          )}
          <p className={page.lede}>{pluralize(shelfEntries.length, 'book')}</p>
        </div>
        {!renaming && (
          <div className={styles.actions}>
            <Button variant="ghost" size="sm" icon={<Pencil />} onClick={() => setRenaming(true)}>
              Rename
            </Button>
            {!shelf.kind && (
              <Button variant="ghost" size="sm" icon={<Trash2 />} onClick={() => setConfirmDelete(true)}>
                Delete shelf
              </Button>
            )}
          </div>
        )}
      </header>

      {shelfEntries.length === 0 ? (
        <EmptyState
          icon={<Compass />}
          title="No books on this shelf yet"
          action={
            <ButtonLink to="/discover" variant="primary">
              Search for books
            </ButtonLink>
          }
        >
          {EMPTY_COPY[shelf.kind ?? ''] ?? 'Search for books to add, or move books here from another shelf.'}
        </EmptyState>
      ) : (
        <section className={page.section} aria-label={`Books on ${shelf.name}`}>
          <div className={page.toolbar}>
            <label className={page.field}>
              Sort by
              <select className={page.select} value={sort} onChange={(e) => {
                  flip.capture();
                  setSort(e.target.value as SortKey);
                }}>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            {genres.length > 1 && (
              <label className={page.field}>
                Genre
                <select className={page.select} value={genre} onChange={(e) => {
                    flip.capture();
                    setGenre(e.target.value);
                  }}>
                  <option value="">All genres</option>
                  {genres.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {visible.length > 0 ? (
            <div ref={flip.ref}>
              <BookGrid entries={visible} label={shelf.name} priorityCount={8} showProgress={shelf.kind === 'reading'} />
            </div>
          ) : (
            <p className={styles.noMatch} role="status">
              No {genre} books on this shelf. <button type="button" onClick={() => setGenre('')}>Show all genres</button>
            </p>
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${shelf.name}”?`}
        confirmLabel="Delete shelf"
        tone="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          const fallback = defaultShelf('want');
          await deleteShelf(shelf.id);
          notify(
            shelfEntries.length
              ? `Deleted “${shelf.name}”. ${pluralize(shelfEntries.length, 'book')} moved to ${fallback.name}.`
              : `Deleted “${shelf.name}”.`,
            'success',
          );
          navigate('/library');
        }}
      >
        {shelfEntries.length > 0
          ? `The ${pluralize(shelfEntries.length, 'book')} on this shelf will move to ${defaultShelf('want').name}. Ratings, notes and progress are kept.`
          : 'This shelf is empty, so nothing else will change.'}
      </ConfirmDialog>
    </div>
  );
}
