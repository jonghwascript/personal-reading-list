import curatedLists from '../data/curatedLists.json';
import type { Book, LibraryEntry } from '../types';
import { normalizeGenres } from './genres';
import { coverUrl } from './openLibrary';

interface CuratedBookRaw {
  title: string;
  authors: string[];
  workKey: string;
  coverId: number | null;
  publishedYear: number | null;
  pageCount: number | null;
  isbn13: string | null;
  subjects: string[];
  editionCount: number;
}

export interface CuratedList {
  id: string;
  title: string;
  description: string;
  books: { book: Book; editionCount: number }[];
}

/**
 * Hand-picked lists, stored with real Open Library ids so they render instantly with covers and
 * cost zero API calls (we stay well inside Open Library's rate limit until the user acts).
 */
export const CURATED_LISTS: CuratedList[] = (curatedLists as { id: string; title: string; description: string; books: CuratedBookRaw[] }[]).map(
  (list) => ({
    id: list.id,
    title: list.title,
    description: list.description,
    books: list.books.map((raw) => ({
      editionCount: raw.editionCount,
      book: {
        id: `ol:${raw.workKey}`,
        title: raw.title,
        authors: raw.authors,
        coverUrl: coverUrl({ coverId: raw.coverId, isbn: raw.isbn13 }),
        isbn10: null,
        isbn13: raw.isbn13,
        pageCount: raw.pageCount,
        publishedYear: raw.publishedYear,
        publisher: null,
        description: null,
        genres: normalizeGenres(raw.subjects),
        source: 'openlibrary',
        workKey: raw.workKey,
      },
    })),
  }),
);

/** Our genre tags → Open Library subject names. Umbrella tags (Fiction) are too broad to be useful. */
const GENRE_SUBJECTS: Record<string, string> = {
  'Sci-Fi': 'science fiction',
  'Science Fiction': 'science fiction',
  Cyberpunk: 'cyberpunk',
  Fantasy: 'fantasy',
  Mythology: 'mythology',
  Dystopian: 'dystopias',
  Mystery: 'mystery',
  Thriller: 'thriller',
  Romance: 'romance',
  'Historical Fiction': 'historical fiction',
  Classics: 'classic literature',
  Memoir: 'biography',
  Biography: 'biography',
  History: 'history',
  Psychology: 'psychology',
  'Self-Improvement': 'self-help',
  Productivity: 'time management',
  Philosophy: 'philosophy',
  Stoicism: 'stoics',
  Business: 'business',
  Finance: 'finance, personal',
  Science: 'popular science',
  Programming: 'computer programming',
  'Software Engineering': 'software engineering',
  'Systems Design': 'computer architecture',
  JavaScript: 'javascript',
  'UX Design': 'user interfaces (computer systems)',
  Design: 'design',
};

export interface RecommendationSeed {
  entry: LibraryEntry;
  genre: string;
  subject: string;
}

/**
 * Picks the book a recommendation is "because of": the most recently finished book the reader
 * rated 4+ that carries a specific genre. Showing that reason keeps suggestions explainable.
 */
export function pickRecommendationSeed(entries: LibraryEntry[]): RecommendationSeed | null {
  const loved = entries
    .filter((e) => e.finishedAt && (e.rating ?? 0) >= 4)
    .sort((a, b) => Date.parse(b.finishedAt!) - Date.parse(a.finishedAt!));
  for (const entry of loved) {
    // Prefer the most specific tag (later tags in curated data are narrower, e.g. "Fantasy" over "Fiction").
    const genre = [...entry.book.genres].reverse().find((g) => GENRE_SUBJECTS[g]);
    if (genre) return { entry, genre, subject: GENRE_SUBJECTS[genre]! };
  }
  return null;
}
