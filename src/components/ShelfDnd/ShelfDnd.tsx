import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { ArrowRight } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { orderKeyboardTargets, resolveDrop, stepTarget, type BookDragData, type ShelfDropData, type TargetRect } from '../../lib/shelfDnd';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useLibrary } from '../../state/LibraryContext';
import type { LibraryEntry, Shelf } from '../../types';
import { BookCover } from '../BookCover/BookCover';
import { FinishDateDialog } from '../ui/FinishDateDialog';
import styles from './ShelfDnd.module.css';

interface ShelfDndState {
  /** Entry that just landed on a new shelf — its card plays a short "settle" animation. */
  landedId: string | null;
  /** True for a moment after a drop, so the link under the pointer doesn't also navigate. */
  shouldSuppressClick(): boolean;
}

const ShelfDndContext = createContext<ShelfDndState>({ landedId: null, shouldSuppressClick: () => false });
export const useShelfDnd = () => useContext(ShelfDndContext);

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Pointer drags use the pointer position; keyboard drags (no pointer) fall back to rect overlap. */
const collisionDetection: CollisionDetection = (args) => {
  const byPointer = pointerWithin(args);
  return byPointer.length > 0 ? byPointer : rectIntersection(args);
};

/**
 * Drag books between shelves (animated-shelf differentiator) without giving up accessibility:
 * mouse, touch (long-press so scrolling still works) and keyboard (Space to pick up, ↑/↓ to choose
 * a shelf, Space to drop, Esc to cancel) all work, with spoken instructions and announcements.
 */
export function ShelfDndProvider({ children }: { children: ReactNode }) {
  const { entries, shelves, moveEntries, restoreEntries, shelfById } = useLibrary();
  const { notify } = useAnnouncer();
  const [activeEntry, setActiveEntry] = useState<LibraryEntry | null>(null);
  const [landedId, setLandedId] = useState<string | null>(null);
  const [finishMove, setFinishMove] = useState<{ entry: LibraryEntry; target: Shelf } | null>(null);
  const lastDropAt = useRef(0);
  const latest = useRef({ entries, shelves });
  latest.current = { entries, shelves };

  // Keyboard: arrows jump shelf to shelf instead of nudging the book a few pixels at a time.
  const coordinateGetter = useCallback<KeyboardCoordinateGetter>((event, { context }) => {
    const direction = event.code === 'ArrowDown' || event.code === 'ArrowRight' ? 1 : event.code === 'ArrowUp' || event.code === 'ArrowLeft' ? -1 : 0;
    if (!direction || !context.collisionRect) return undefined;
    event.preventDefault();
    const targets: TargetRect[] = [];
    for (const container of context.droppableContainers.getEnabled()) {
      const rect = context.droppableRects.get(container.id);
      const data = container.data.current as ShelfDropData | undefined;
      if (rect && data) targets.push({ id: String(container.id), shelfId: data.shelfId, rect });
    }
    const overShelf = (context.over?.data.current as ShelfDropData | undefined)?.shelfId;
    const ownShelf = latest.current.entries.find((e) => e.id === (context.active?.data.current as BookDragData | undefined)?.entryId)?.shelfId;
    const next = stepTarget(orderKeyboardTargets(targets, latest.current.shelves, window.innerHeight), overShelf ?? ownShelf ?? null, direction);
    if (!next) return undefined;
    const { width, height } = context.collisionRect;
    return { x: next.rect.left + next.rect.width / 2 - width / 2, y: next.rect.top + next.rect.height / 2 - height / 2 };
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    // Enter is left alone so it still opens the book.
    useSensor(KeyboardSensor, { coordinateGetter, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } }),
  );

  const titleOf = (data: unknown) => entries.find((e) => e.id === (data as BookDragData | undefined)?.entryId)?.book.title ?? 'the book';
  const shelfNameOf = (data: unknown) => shelfById((data as ShelfDropData | undefined)?.shelfId ?? '')?.name;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.data.current)}. Use the arrow keys to choose a shelf, Space to drop, Escape to cancel.`,
    onDragOver: ({ active, over }) => {
      const name = shelfNameOf(over?.data.current);
      return name ? `${titleOf(active.data.current)} is over ${name}.` : `${titleOf(active.data.current)} is not over a shelf.`;
    },
    onDragEnd: ({ active, over }) => {
      const name = shelfNameOf(over?.data.current);
      return name ? `${titleOf(active.data.current)} dropped on ${name}.` : `${titleOf(active.data.current)} was not moved.`;
    },
    onDragCancel: ({ active }) => `Moving ${titleOf(active.data.current)} was cancelled.`,
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    const id = (active.data.current as BookDragData | undefined)?.entryId;
    setActiveEntry(entries.find((e) => e.id === id) ?? null);
  };

  const moveBook = async (previous: LibraryEntry, target: Shelf, date?: Date) => {
    await moveEntries([previous.id], target.id, date);
    setLandedId(previous.id);
    window.setTimeout(() => setLandedId((id) => (id === previous.id ? null : id)), 900);
    notify(`Moved “${previous.book.title}” to ${target.name}.`, 'success', {
      label: 'Undo',
      onClick: () => {
        void restoreEntries([previous]).then(() => notify(`“${previous.book.title}” is back on ${shelfById(previous.shelfId)?.name ?? 'its shelf'}.`, 'info'));
      },
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    lastDropAt.current = Date.now();
    setActiveEntry(null);
    const move = resolveDrop(entries, shelves, active.data.current as BookDragData | undefined, over?.data.current as ShelfDropData | undefined);
    if (!move) return;
    if (move.target.kind === 'read' && !move.entry.finishedAt && move.entry.progress?.percent !== 100) {
      setFinishMove(move);
      return;
    }
    void moveBook(move.entry, move.target).catch(() => {
      if (move.target.kind === 'read') notify('Couldn’t move this book. Please try again.', 'error');
    });
  };

  const state = useMemo<ShelfDndState>(
    () => ({ landedId, shouldSuppressClick: () => Date.now() - lastDropAt.current < 250 }),
    [landedId],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        lastDropAt.current = Date.now();
        setActiveEntry(null);
      }}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To move this book to another shelf, press Space to pick it up, use the arrow keys to choose a shelf, then press Space to drop it or Escape to cancel. Press Enter to open the book.',
        },
      }}
    >
      <ShelfDndContext.Provider value={state}>{children}</ShelfDndContext.Provider>
      {finishMove && <FinishDateDialog onCancel={() => setFinishMove(null)} onMove={async (date) => {
        await moveBook(finishMove.entry, finishMove.target, date);
        setFinishMove(null);
      }} />}
      <DragOverlay dropAnimation={prefersReducedMotion() ? null : { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
        {activeEntry ? <DragPreview entry={activeEntry} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

/** The book in hand: lifted, tilted, with a hint of where it will land. */
function DragPreview({ entry }: { entry: LibraryEntry }) {
  const { over } = useDndContext();
  const { shelfById } = useLibrary();
  const target = shelfById((over?.data.current as ShelfDropData | undefined)?.shelfId ?? '');
  const moving = target && target.id !== entry.shelfId;
  return (
    <div className={styles.preview} aria-hidden="true">
      <div className={styles.previewCover}>
        <BookCover book={entry.book} size="M" />
      </div>
      {moving && (
        <span className={styles.previewBadge}>
          <ArrowRight size={12} /> {target.name}
        </span>
      )}
    </div>
  );
}

/** Makes a book card draggable while keeping it a normal link for click and Enter. */
export function useBookDraggable(entryId: string) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `book:${entryId}`, data: { entryId } satisfies BookDragData });
  const { landedId, shouldSuppressClick } = useShelfDnd();
  // dnd-kit marks draggables as role="button" with aria-pressed and a "draggable" role description.
  // These are links: keep the native role (so screen readers still say "link"), drop the
  // button-only state, and let the aria-describedby instructions explain the drag gesture.
  const { role: _role, 'aria-pressed': _pressed, 'aria-roledescription': _desc, ...a11y } = attributes;
  return {
    ref: setNodeRef,
    props: {
      ...a11y,
      ...listeners,
      // Stop the browser's own link/image drag from competing with ours.
      draggable: false,
      onClickCapture: (e: React.MouseEvent) => {
        if (shouldSuppressClick()) e.preventDefault();
      },
    },
    isDragging,
    landed: landedId === entryId,
  };
}

/** A shelf that accepts books. `location` keeps ids unique when a shelf appears twice on screen. */
export function useShelfDroppable(shelfId: string, location: 'sidebar' | 'section') {
  const { setNodeRef, isOver, active } = useDroppable({ id: `${location}:${shelfId}`, data: { shelfId } satisfies ShelfDropData });
  const { entries } = useLibrary();
  const draggedFrom = entries.find((e) => e.id === (active?.data.current as BookDragData | undefined)?.entryId)?.shelfId;
  return {
    ref: setNodeRef,
    /** A drag is in progress and this shelf would accept it. */
    isCandidate: Boolean(active) && draggedFrom !== shelfId,
    isOver: isOver && draggedFrom !== shelfId,
  };
}
