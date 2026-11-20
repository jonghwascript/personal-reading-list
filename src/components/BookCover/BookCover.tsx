import { useState } from 'react';
import { resizeCover, type CoverSize } from '../../lib/openLibrary';
import type { Book } from '../../types';
import styles from './BookCover.module.css';

interface BookCoverProps {
  book: Pick<Book, 'title' | 'authors' | 'coverUrl'>;
  size?: CoverSize;
  /** Empty string (default) when a visible title sits next to the cover. */
  alt?: string;
  /** Above-the-fold covers load eagerly to avoid LCP delay. */
  priority?: boolean;
  /** 0–100; renders a thin bar along the bottom edge of the cover. */
  progress?: number | null;
  className?: string;
}

/**
 * Deep teal / rose / sage spines that sit with the palette. Each keeps the cream title at ≥ 5:1.
 */
const PLACEHOLDER_TONES = ['#1f5f5e', '#8a4b55', '#3e6e64', '#6b4a5e', '#2f5470', '#7a5a48', '#4e6b5a'];

function toneFor(title: string): string {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PLACEHOLDER_TONES[hash % PLACEHOLDER_TONES.length]!;
}

export function BookCover({ book, size = 'M', alt = '', priority = false, progress, className }: BookCoverProps) {
  const src = resizeCover(book.coverUrl, size);
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>(src ? 'loading' : 'failed');
  const showPlaceholder = state === 'failed';

  return (
    <div className={[styles.cover, styles[`size${size}`], className].filter(Boolean).join(' ')}>
      {showPlaceholder ? (
        <div
          className={styles.placeholder}
          style={{ '--tone': toneFor(book.title) } as React.CSSProperties}
          role={alt ? 'img' : undefined}
          aria-label={alt || undefined}
          aria-hidden={alt ? undefined : true}
        >
          <span className={styles.placeholderTitle}>{book.title}</span>
          {book.authors[0] && <span className={styles.placeholderAuthor}>{book.authors[0]}</span>}
        </div>
      ) : (
        <img
          className={styles.image}
          data-state={state}
          src={src!}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          fetchPriority={priority ? 'high' : 'auto'}
          onLoad={(e) => {
            // Some cover endpoints return a 1×1 pixel instead of a 404 — treat it as missing.
            setState(e.currentTarget.naturalWidth > 1 ? 'loaded' : 'failed');
          }}
          onError={() => setState('failed')}
        />
      )}
      {progress != null && (
        <div className={styles.progress} aria-hidden="true">
          <div className={styles.progressFill} style={{ inlineSize: `${Math.max(2, progress)}%` }} />
        </div>
      )}
    </div>
  );
}
