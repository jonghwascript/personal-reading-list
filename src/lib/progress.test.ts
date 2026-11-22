import type { LibraryEntry } from '../types';
import { applyProgress, daysToFinish, describePosition, describeRemaining, recomputeProgress } from './progress';

const NOW = new Date('2026-06-01T10:00:00Z');

const entry = (over: Partial<LibraryEntry> = {}, pageCount: number | null = 400): LibraryEntry => ({
  id: 'e1',
  book: {
    id: 'b1',
    title: 'Dune',
    authors: ['Frank Herbert'],
    coverUrl: null,
    isbn10: null,
    isbn13: null,
    pageCount,
    publishedYear: null,
    publisher: null,
    description: null,
    genres: [],
    source: 'openlibrary',
    workKey: null,
  },
  shelfId: 'reading',
  addedAt: '2026-01-01T00:00:00Z',
  startedAt: null,
  finishedAt: null,
  rating: null,
  notes: '',
  progress: null,
  format: 'print',
  totalPages: null,
  totalMinutes: null,
  ...over,
});

describe('applyProgress', () => {
  it('records pages for print and derives percent', () => {
    const { entry: e, log } = applyProgress(entry(), { page: 100 }, NOW);
    expect(e.progress).toMatchObject({ currentPage: 100, percent: 25, minutes: null });
    expect(e.startedAt).toBe(NOW.toISOString());
    expect(log).toMatchObject({ entryId: 'e1', page: 100, percent: 25 });
    expect(log.id).toMatch(/[0-9a-f-]{36}/);
  });

  it('keeps the position when the page total is unknown', () => {
    const { entry: e } = applyProgress(entry({}, null), { page: 147 }, NOW);
    expect(e.progress).toMatchObject({ currentPage: 147, percent: null });
    expect(describePosition(e)).toBe('Page 147');
    expect(describeRemaining(e)).toBeNull();
  });

  it('keeps the print format for a percentage-only entry and converts it when the total becomes known', () => {
    const { entry: saved } = applyProgress(entry({}, null), { percent: 40 }, NOW);
    expect(saved.format).toBe('print');
    expect(describePosition(saved)).toBe('40%');
    expect(recomputeProgress({ ...saved, totalPages: 300 }).progress).toMatchObject({ currentPage: 120, percent: 40 });
  });

  it('prefers the user’s edition length over the catalog count', () => {
    const { entry: e } = applyProgress(entry({ totalPages: 200 }), { page: 100 }, NOW);
    expect(e.progress?.percent).toBe(50);
    expect(describePosition(e)).toBe('100 / 200 pages');
  });

  it('tracks ebooks by percent and audiobooks by minutes', () => {
    expect(applyProgress(entry({ format: 'ebook' }), { percent: 35 }, NOW).entry.progress?.percent).toBe(35);
    const audio = applyProgress(entry({ format: 'audio', totalMinutes: 300 }), { minutes: 75 }, NOW).entry;
    expect(audio.progress).toMatchObject({ minutes: 75, percent: 25 });
    expect(describePosition(audio)).toBe('1h 15m of 5h 00m');
    expect(describeRemaining(audio)).toBe('3h 45m left');
  });

  it('reports the milestone a save crosses', () => {
    const at40 = applyProgress(entry(), { page: 160 }, NOW).entry;
    expect(applyProgress(at40, { page: 210 }, NOW).milestone).toBe('halfway');
    expect(applyProgress(at40, { page: 370 }, NOW).milestone).toBe('almost');
    expect(applyProgress(at40, { page: 400 }, NOW).milestone).toBe('end');
    expect(applyProgress(at40, { page: 170 }, NOW).milestone).toBeNull();
  });

  it('clamps to the known total', () => {
    expect(applyProgress(entry(), { page: 9999 }, NOW).entry.progress?.currentPage).toBe(400);
  });
});

describe('recomputeProgress', () => {
  it('fills in percent once the edition length is known', () => {
    const unknown = applyProgress(entry({}, null), { page: 147 }, NOW).entry;
    expect(recomputeProgress({ ...unknown, totalPages: 294 }).progress?.percent).toBe(50);
  });
});

describe('daysToFinish', () => {
  it('needs both dates', () => {
    expect(daysToFinish({ startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-11T00:00:00Z' })).toBe(10);
    expect(daysToFinish({ startedAt: null, finishedAt: '2026-01-11T00:00:00Z' })).toBeNull();
  });
});
