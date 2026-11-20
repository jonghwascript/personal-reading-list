import type { ReactNode } from 'react';
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

export function BookGrid({ entries, showProgress, priorityCount = 0, label }: BookGridProps) {
  return (
    <ul className={styles.grid} role="list" aria-label={label}>
      {entries.map((entry, i) => (
        <li key={entry.id}>
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
