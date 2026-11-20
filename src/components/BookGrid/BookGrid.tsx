import { useDndContext } from '@dnd-kit/core';
import type { KeyboardEvent, ReactNode } from 'react';
import type { LibraryEntry } from '../../types';
import { BookCard } from '../BookCard/BookCard';
import styles from './BookGrid.module.css';

interface BookGridProps {
  entries: LibraryEntry[];
  showProgress?: boolean;
  /** Number of leading covers to load eagerly (above the fold). */
  priorityCount?: number;
  label: string;
}

/**
 * Arrow keys move focus between books the way they're laid out: ←/→ along a row, ↑/↓ by a row,
 * Home/End to the ends. Tab still walks the grid normally. Ignored while a book is being dragged
 * (the drag uses the arrows to choose a shelf).
 */
function moveFocus(e: KeyboardEvent<HTMLUListElement>, dragging: boolean) {
  if (dragging || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const cards = [...e.currentTarget.querySelectorAll<HTMLElement>(':scope > li > a')];
  const index = cards.indexOf(document.activeElement as HTMLElement);
  if (index === -1) return;
  // Columns = cards sharing the first card's row.
  const firstTop = cards[0]!.offsetTop;
  const columns = Math.max(1, cards.filter((c) => c.offsetTop === firstTop).length);
  const next = {
    ArrowLeft: index - 1,
    ArrowRight: index + 1,
    ArrowUp: index - columns,
    ArrowDown: index + columns,
    Home: 0,
    End: cards.length - 1,
  }[e.key]!;
  if (next < 0 || next >= cards.length) return;
  e.preventDefault();
  cards[next]!.focus();
}

export function BookGrid({ entries, showProgress, priorityCount = 0, label }: BookGridProps) {
  const { active } = useDndContext();
  return (
    // The list handles keys bubbling from its links (focus management only, not an interactive widget).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <ul className={styles.grid} role="list" aria-label={label} onKeyDown={(e) => moveFocus(e, active !== null)}>
      {entries.map((entry, i) => (
        // data-flip-id lets useFlipGrid follow each book across re-orders.
        <li key={entry.id} data-flip-id={entry.id}>
          <BookCard
            entry={entry}
            showProgress={showProgress ?? (entry.progress?.percent != null && entry.progress.percent < 100 && !entry.finishedAt)}
            priority={i < priorityCount}
          />
        </li>
      ))}
    </ul>
  );
}

/** Cover-shaped (2:3) skeletons so layout doesn't shift when real covers arrive. */
export function BookGridSkeleton({ count = 12, label = 'Loading books' }: { count?: number; label?: string }) {
  return (
    <div className={styles.grid} role="status" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={styles.skeleton} aria-hidden="true">
          <div className={styles.skeletonCover} />
          <div className={styles.skeletonLine} />
          <div className={`${styles.skeletonLine} ${styles.short}`} />
        </div>
      ))}
    </div>
  );
}

export function GridSlot({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}
