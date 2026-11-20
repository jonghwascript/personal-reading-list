import { buildGuestSnapshot } from '../data/guestSeed';
import type { LibraryEntry } from '../types';
import { buildYearReview, reviewSentence, yearsWithFinishedBooks } from './yearReview';

const NOW = new Date(2026, 10, 20, 12);
const { entries } = buildGuestSnapshot(NOW.getTime());

const finishedEntry = (month: number, over: Partial<LibraryEntry> = {}): LibraryEntry => ({
  ...entries[0]!,
  id: `x-${month}-${Math.random()}`,
  finishedAt: new Date(2026, month, 10).toISOString(),
  ...over,
});

describe('buildYearReview', () => {
  it('summarises a rich year with a biggest-month story', () => {
    const r = buildYearReview(entries, 2026, NOW);
    expect(r.finished).toHaveLength(21);
    expect(r.byMonth.reduce((a, b) => a + b, 0)).toBe(21);
    expect(r.monthsElapsed).toBe(11);
    expect(r.featured.length).toBeLessThanOrEqual(7);
    expect(r.genres?.[0]).toBeDefined();
    expect(r.pages?.known).toBe(21);
    expect(reviewSentence(r)).toMatch(/books/);
  });

  it('features every book for a light year and never shows empty months as failure', () => {
    const light = [finishedEntry(1), finishedEntry(4), finishedEntry(9)];
    const r = buildYearReview(light, 2026, NOW);
    expect(r.featured).toHaveLength(3);
    expect(r.topMonth).toBeNull();
    expect(reviewSentence(r)).toBe('You finished these three books so far this year — here’s when each one landed.');
  });

  it('omits genres and page totals when the data is too thin', () => {
    const noData = [0, 1, 2, 3].map((m) =>
      finishedEntry(m, { book: { ...entries[0]!.book, genres: [], pageCount: m === 0 ? 100 : null } }),
    );
    const r = buildYearReview(noData, 2026, NOW);
    expect(r.genres).toBeNull();
    expect(r.pages).toBeNull();
  });

  it('treats past years as complete', () => {
    const r = buildYearReview(entries, 2025, NOW);
    expect(r).toMatchObject({ isCurrentYear: false, monthsElapsed: 12, asOf: null });
    expect(yearsWithFinishedBooks(entries)).toEqual([2024, 2025, 2026]);
  });
});
