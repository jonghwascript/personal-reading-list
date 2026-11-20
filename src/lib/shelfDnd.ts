import type { LibraryEntry, Shelf } from '../types';

/** Data attached to every drop target; several targets can point at the same shelf. */
export interface ShelfDropData {
  shelfId: string;
}

/** Data attached to every draggable book. */
export interface BookDragData {
  entryId: string;
}

export function dropTargetId(location: 'sidebar' | 'section', shelfId: string): string {
  return `${location}:${shelfId}`;
}

/** A drop resolves to a move only when it lands on a different, existing shelf. */
export function resolveDrop(
  entries: LibraryEntry[],
  shelves: Shelf[],
  drag: BookDragData | undefined,
  drop: ShelfDropData | undefined,
): { entry: LibraryEntry; target: Shelf } | null {
  if (!drag || !drop) return null;
  const entry = entries.find((e) => e.id === drag.entryId);
  const target = shelves.find((s) => s.id === drop.shelfId);
  if (!entry || !target || entry.shelfId === target.id) return null;
  return { entry, target };
}

export interface TargetRect {
  id: string;
  shelfId: string;
  rect: { top: number; left: number; width: number; height: number };
}

/**
 * Keyboard dragging steps shelf by shelf (not pixel by pixel). For each shelf we keep one target —
 * the one most visible in the viewport (sidebar link on desktop, page section on mobile) — and
 * order them like the shelves themselves.
 */
export function orderKeyboardTargets(targets: TargetRect[], shelves: Shelf[], viewportHeight: number): TargetRect[] {
  const visible = (t: TargetRect) => {
    const top = Math.max(0, t.rect.top);
    const bottom = Math.min(viewportHeight, t.rect.top + t.rect.height);
    return t.rect.width > 0 ? Math.max(0, bottom - top) : 0;
  };
  const best = new Map<string, TargetRect>();
  for (const t of targets) {
    const current = best.get(t.shelfId);
    if (!current || visible(t) > visible(current)) best.set(t.shelfId, t);
  }
  const position = new Map(shelves.map((s) => [s.id, s.position]));
  return [...best.values()]
    .filter((t) => t.rect.width > 0 && t.rect.height > 0)
    .sort((a, b) => (position.get(a.shelfId) ?? 0) - (position.get(b.shelfId) ?? 0));
}

/** The next target in a direction, wrapping around; starts from the book's own shelf. */
export function stepTarget(ordered: TargetRect[], currentShelfId: string | null, direction: 1 | -1): TargetRect | null {
  if (ordered.length === 0) return null;
  const index = ordered.findIndex((t) => t.shelfId === currentShelfId);
  if (index === -1) return ordered[direction === 1 ? 0 : ordered.length - 1]!;
  return ordered[(index + direction + ordered.length) % ordered.length]!;
}
