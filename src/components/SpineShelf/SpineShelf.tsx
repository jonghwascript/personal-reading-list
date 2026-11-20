import { useDndContext } from '@dnd-kit/core';
import type { CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { LibraryEntry } from '../../types';
import { toneFor } from '../BookCover/BookCover';
import { moveGridFocus } from '../BookGrid/BookGrid';
import { useBookDraggable } from '../ShelfDnd/ShelfDnd';
import { formatAuthors } from '../../lib/format';
import { openWithCoverTransition } from '../../lib/motion';
import styles from './SpineShelf.module.css';

interface SpineShelfProps {
  entries: LibraryEntry[];
  label: string;
  showProgress?: boolean;
}

/**
 * The shelf seen side-on: every book is a cloth spine standing on a plank, as thick as its page
 * count and as tall as its (hashed) trim size. Hovering or focusing a spine pulls it part-way off
 * the shelf; opening it carries the spine into the detail page's cover. Same list semantics,
 * arrow-key movement and drag-and-drop as the cover grid — only the picture changes.
 */
export function SpineShelf({ entries, label, showProgress = false }: SpineShelfProps) {
  const { active } = useDndContext();
  return (
    // The list handles keys bubbling from its links (focus management only, not an interactive widget).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <ul className={styles.shelf} role="list" aria-label={label} onKeyDown={(e) => moveGridFocus(e, active !== null)}>
      {entries.map((entry) => (
        // data-flip-id lets useFlipGrid glide spines along the shelf when it's re-sorted.
        <li key={entry.id} className={styles.slot} data-flip-id={entry.id}>
          <Spine entry={entry} showProgress={showProgress} />
        </li>
      ))}
    </ul>
  );
}

/** Thin paperbacks to doorstops: 1.75rem at 0 pages up to 3.5rem at 900+. Unknown → a mid-size book. */
export function thicknessFor(pages: number | null): string {
  if (!pages) return '2.4rem';
  return `${(1.75 + (Math.min(pages, 900) / 900) * 1.75).toFixed(2)}rem`;
}

/** Trim heights vary between 84% and 100% of a cover's height, stable per title. */
export function heightFor(title: string): string {
  let hash = 7;
  for (const ch of title) hash = (hash * 33 + ch.charCodeAt(0)) >>> 0;
  return `${84 + (hash % 17)}%`;
}

function Spine({ entry, showProgress }: { entry: LibraryEntry; showProgress: boolean }) {
  const drag = useBookDraggable(entry.id);
  const navigate = useNavigate();
  const { book } = entry;
  const to = `/books/${entry.id}`;
  const percent = showProgress && !entry.finishedAt ? (entry.progress?.percent ?? null) : null;
  const author = book.authors.length ? formatAuthors(book.authors) : null;

  const label = [book.title, author ? `by ${author}` : null, percent != null ? `${Math.round(percent)}% read` : null].filter(Boolean).join(', ');

  return (
    <Link
      ref={drag.ref}
      {...drag.props}
      to={to}
      onClick={(e) => openWithCoverTransition(e, () => navigate(to))}
      className={styles.spine}
      style={spineStyle(book.title, entry.totalPages ?? book.pageCount)}
      data-dragging={drag.isDragging || undefined}
      data-landed={drag.landed || undefined}
      aria-label={label}
    >
      <SpineFace title={book.title} author={book.authors[0] ?? null} percent={percent} />
    </Link>
  );
}

/** Size and colour variables for a spine: put on the element that holds a SpineFace. */
export function spineStyle(title: string, pages: number | null): CSSProperties {
  return { '--tone': toneFor(title), '--thickness': thicknessFor(pages), '--height': heightFor(title) } as CSSProperties;
}

/** The cloth itself — title, author, optional progress ribbon. Decorative; the holder names the book. */
export function SpineFace({ title, author, percent = null, className }: { title: string; author: string | null; percent?: number | null; className?: string }) {
  return (
    <span className={[styles.cloth, className].filter(Boolean).join(' ')} data-cover-source="" aria-hidden="true">
      <span className={styles.title}>{title}</span>
      {author && <span className={styles.author}>{author}</span>}
      {percent != null && <span className={styles.progress} style={{ blockSize: `${Math.max(2, percent)}%` }} />}
    </span>
  );
}
