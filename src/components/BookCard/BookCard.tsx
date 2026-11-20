import { Link, useNavigate } from 'react-router-dom';
import type { LibraryEntry } from '../../types';
import { BookCover } from '../BookCover/BookCover';
import { useBookDraggable } from '../ShelfDnd/ShelfDnd';
import { TiltCover } from '../TiltCover/TiltCover';
import { formatAuthors } from '../../lib/format';
import { openWithCoverTransition } from '../../lib/motion';
import styles from './BookCard.module.css';

interface BookCardProps {
  entry: LibraryEntry;
  showProgress?: boolean;
  priority?: boolean;
}

/**
 * Grid item: cover + title + author only (patterns.md: keep grid items lean). The whole card is
 * one link so keyboard and screen reader users get a single, well-named stop per book.
 */
export function BookCard({ entry, showProgress = false, priority }: BookCardProps) {
  const drag = useBookDraggable(entry.id);
  const navigate = useNavigate();
  const { book } = entry;
  const percent = showProgress ? (entry.progress?.percent ?? 0) : null;

  const label = [
    book.title,
    book.authors.length ? `by ${formatAuthors(book.authors)}` : null,
    percent != null ? `${Math.round(percent)}% read` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Link
      ref={drag.ref}
      {...drag.props}
      to={`/books/${entry.id}`}
      // The cover lifts off the grid and becomes the detail page's cover.
      onClick={(e) => openWithCoverTransition(e, () => navigate(`/books/${entry.id}`))}
      className={styles.card}
      data-dragging={drag.isDragging || undefined}
      data-landed={drag.landed || undefined}
      // Hovering anywhere on the card (cover or title) tilts the cover.
      data-tilt-trigger=""
      aria-label={label}
    >
      <TiltCover className={styles.cover}>
        <BookCover book={book} progress={percent} priority={priority} />
      </TiltCover>
      <span className={styles.title} aria-hidden="true">
        {book.title}
      </span>
      <span className={styles.author} aria-hidden="true">
        {book.authors.length ? formatAuthors(book.authors) : 'Unknown author'}
      </span>
    </Link>
  );
}
