import { booksFinishedInYear, goalProgress } from '../lib/goal';
import { buildGuestSnapshot } from './guestSeed';
import { GuestRepository } from './guestRepository';

const NOW = Date.UTC(2026, 10, 20, 12);

describe('guest seed', () => {
  const snap = buildGuestSnapshot(NOW);

  it('places all 45 sample books exactly once', () => {
    expect(snap.entries).toHaveLength(45);
    expect(new Set(snap.entries.map((e) => e.book.id)).size).toBe(45);
  });

  it('distributes books across default and custom shelves', () => {
    const count = (id: string) => snap.entries.filter((e) => e.shelfId === id).length;
    expect(count('shelf-reading')).toBe(5);
    expect(count('shelf-read')).toBe(24);
    expect(count('shelf-want')).toBe(11);
    expect(count('shelf-favorites')).toBe(3);
    expect(count('shelf-book-club')).toBe(2);
  });

  it('pre-populates an on-track goal for the current year', () => {
    const finished = booksFinishedInYear(snap.entries, 2026).length;
    expect(finished).toBe(21);
    expect(goalProgress(snap.goals[0]!, finished, new Date(NOW)).status).toBe('on-track');
  });

  it('shows all three reading formats among current reads', () => {
    const sayNothing = snap.entries.find((e) => e.book.title.startsWith('Say Nothing'))!;
    expect(sayNothing).toMatchObject({ format: 'ebook', progress: { currentPage: null, percent: 35 } });
    const weeks = snap.entries.find((e) => e.book.title.startsWith('Four Thousand Weeks'))!;
    expect(weeks).toMatchObject({ format: 'audio', totalMinutes: 318, progress: { minutes: 104, percent: 32.7 } });
    expect(snap.entries.find((e) => e.book.title === 'The Name of the Wind')!.format).toBe('print');
  });

  it('gives every progress log a unique id (needed for undo)', () => {
    expect(new Set(snap.logs.map((l) => l.id)).size).toBe(snap.logs.length);
  });

  it('splits co-authors', () => {
    const pragmatic = snap.entries.find((e) => e.book.title === 'The Pragmatic Programmer')!;
    expect(pragmatic.book.authors).toEqual(['David Thomas', 'Andrew Hunt']);
  });

  it('shifts the calendar so history stays recent', () => {
    const later = buildGuestSnapshot(Date.UTC(2027, 10, 20, 12));
    expect(booksFinishedInYear(later.entries, 2027)).toHaveLength(21);
    expect(later.goals[0]!.year).toBe(2027);
  });
});

describe('GuestRepository', () => {
  it('persists changes within the session storage it was given', async () => {
    const storage = window.sessionStorage;
    storage.clear();
    const repo = new GuestRepository(storage);
    const { entries } = await repo.load();
    await repo.removeEntries([entries[0]!.id]);
    const reloaded = new GuestRepository(storage);
    expect((await reloaded.load()).entries).toHaveLength(44);
    reloaded.reset();
    expect((await reloaded.load()).entries).toHaveLength(45);
  });
});
