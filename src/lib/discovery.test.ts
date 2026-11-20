import { buildGuestSnapshot } from '../data/guestSeed';
import { CURATED_LISTS, pickRecommendationSeed } from './discovery';

describe('curated lists', () => {
  it('ships three lists of six books with real Open Library work keys', () => {
    expect(CURATED_LISTS).toHaveLength(3);
    for (const list of CURATED_LISTS) {
      expect(list.books).toHaveLength(6);
      for (const { book } of list.books) expect(book.workKey).toMatch(/^\/works\/OL\d+W$/);
    }
  });
});

describe('pickRecommendationSeed', () => {
  it('uses the most recent 4★+ finish with a specific genre', () => {
    const { entries } = buildGuestSnapshot(Date.UTC(2026, 10, 20, 12));
    const seed = pickRecommendationSeed(entries)!;
    // Most recent loved finish in the seed is Ancillary Justice (Oct 30, 4★, Science Fiction).
    expect(seed.entry.book.title).toBe('Ancillary Justice');
    expect(seed).toMatchObject({ genre: 'Science Fiction', subject: 'science fiction' });
  });

  it('returns null for a library with nothing loved yet', () => {
    expect(pickRecommendationSeed([])).toBeNull();
  });
});
