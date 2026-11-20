import { buildGuestSnapshot, GUEST_SHELVES } from '../data/guestSeed';
import { orderKeyboardTargets, resolveDrop, stepTarget, type TargetRect } from './shelfDnd';

const { entries } = buildGuestSnapshot(Date.UTC(2026, 10, 20, 12));
const dune = entries.find((e) => e.book.title === 'Dune')!; // on Read

describe('resolveDrop', () => {
  it('moves a book to a different shelf', () => {
    const r = resolveDrop(entries, GUEST_SHELVES, { entryId: dune.id }, { shelfId: 'shelf-favorites' });
    expect(r?.target.name).toBe('Favorites');
  });
  it('ignores drops on the same shelf, unknown shelves and missing data', () => {
    expect(resolveDrop(entries, GUEST_SHELVES, { entryId: dune.id }, { shelfId: 'shelf-read' })).toBeNull();
    expect(resolveDrop(entries, GUEST_SHELVES, { entryId: dune.id }, { shelfId: 'nope' })).toBeNull();
    expect(resolveDrop(entries, GUEST_SHELVES, undefined, { shelfId: 'shelf-want' })).toBeNull();
  });
});

describe('keyboard targets', () => {
  const rect = (top: number, height = 40, width = 200) => ({ top, left: 0, width, height });
  const targets: TargetRect[] = [
    { id: 'sidebar:shelf-read', shelfId: 'shelf-read', rect: rect(300) },
    { id: 'section:shelf-read', shelfId: 'shelf-read', rect: rect(2000, 400) }, // scrolled out of view
    { id: 'sidebar:shelf-reading', shelfId: 'shelf-reading', rect: rect(200) },
    { id: 'sidebar:shelf-want', shelfId: 'shelf-want', rect: rect(250) },
    { id: 'section:shelf-favorites', shelfId: 'shelf-favorites', rect: rect(500, 300) },
    { id: 'sidebar:hidden', shelfId: 'shelf-book-club', rect: rect(0, 0, 0) }, // display:none on mobile
  ];

  it('keeps one visible target per shelf, in shelf order', () => {
    const ordered = orderKeyboardTargets(targets, GUEST_SHELVES, 900);
    expect(ordered.map((t) => t.id)).toEqual([
      'sidebar:shelf-reading',
      'sidebar:shelf-want',
      'sidebar:shelf-read',
      'section:shelf-favorites',
    ]);
  });

  it('steps from the current shelf and wraps around', () => {
    const ordered = orderKeyboardTargets(targets, GUEST_SHELVES, 900);
    expect(stepTarget(ordered, 'shelf-read', 1)?.shelfId).toBe('shelf-favorites');
    expect(stepTarget(ordered, 'shelf-favorites', 1)?.shelfId).toBe('shelf-reading');
    expect(stepTarget(ordered, 'shelf-reading', -1)?.shelfId).toBe('shelf-favorites');
    expect(stepTarget([], 'shelf-read', 1)).toBeNull();
  });
});
