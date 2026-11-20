import { useCallback, useState } from 'react';

/**
 * How a shelf page shows its books: the cover grid, or spines standing on a shelf (animated-shelf
 * differentiator). Remembered per device; covers are the default because they carry the most
 * information at a glance.
 */
export type ShelfView = 'covers' | 'spines';

export const SHELF_VIEW_STORAGE_KEY = 'bookshelf:shelf-view';

export function readShelfView(): ShelfView {
  try {
    return localStorage.getItem(SHELF_VIEW_STORAGE_KEY) === 'spines' ? 'spines' : 'covers';
  } catch {
    return 'covers';
  }
}

export function useShelfView(): [ShelfView, (view: ShelfView) => void] {
  const [view, setView] = useState<ShelfView>(readShelfView);
  const change = useCallback((next: ShelfView) => {
    setView(next);
    try {
      if (next === 'covers') localStorage.removeItem(SHELF_VIEW_STORAGE_KEY);
      else localStorage.setItem(SHELF_VIEW_STORAGE_KEY, next);
    } catch {
      // Storage blocked (private mode): the choice still applies for this visit.
    }
  }, []);
  return [view, change];
}
