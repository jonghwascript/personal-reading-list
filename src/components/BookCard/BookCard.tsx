import { useRef, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import type { LibraryEntry } from '../../types';
import { BookCover } from '../BookCover/BookCover';
import { useBookDraggable } from '../ShelfDnd/ShelfDnd';
import { formatAuthors } from '../../lib/format';
import styles from './BookCard.module.css';

interface BookCardProps {
  entry: LibraryEntry;
  showProgress?: boolean;
  priority?: boolean;
}

const MAX_TILT_DEG = 8;

/**
 * Grid item: cover + title + author only (patterns.md: keep grid items lean). The whole card is
 * one link so keyboard and screen reader users get a single, well-named stop per book.
 */
export function BookCard({ entry, showProgress = false, priority }: BookCardProps) {
  const tiltRef = useRef<HTMLDivElement>(null);
  const drag = useBookDraggable(entry.id);
  const { book } = entry;
  const percent = showProgress ? (entry.progress?.percent ?? 0) : null;

  // Pointer-driven 3D tilt. CSS ignores the variables under reduced motion and on touch devices.
  const onPointerMove = (e: PointerEvent<HTMLAnchorElement>) => {
    const el = tiltRef.current;
    if (!el || e.pointerType !== 'mouse') return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty('--tilt-x', `${(-y * MAX_TILT_DEG).toFixed(2)}deg`);
    el.style.setProperty('--tilt-y', `${(x * MAX_TILT_DEG).toFixed(2)}deg`);
    el.style.setProperty('--glare-x', `${((x + 0.5) * 100).toFixed(0)}%`);
  };
  const onPointerLeave = () => {
    tiltRef.current?.style.removeProperty('--tilt-x');
    tiltRef.current?.style.removeProperty('--tilt-y');
  };

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
      className={styles.card}
      data-dragging={drag.isDragging || undefined}
      data-landed={drag.landed || undefined}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      aria-label={label}
    >
      <div ref={tiltRef} className={styles.tilt}>
        <BookCover book={book} progress={percent} priority={priority} />
        <span className={styles.glare} aria-hidden="true" />
      </div>
      <span className={styles.title} aria-hidden="true">
        {book.title}
      </span>
      <span className={styles.author} aria-hidden="true">
        {book.authors.length ? formatAuthors(book.authors) : 'Unknown author'}
      </span>
    </Link>
  );
}
