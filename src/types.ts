/** A book's catalog metadata. Every field except title may be missing in real API data. */
export interface Book {
  /** Stable internal id (uuid in the database, deterministic slug for guest seed books). */
  id: string;
  title: string;
  authors: string[];
  coverUrl: string | null;
  isbn10: string | null;
  isbn13: string | null;
  pageCount: number | null;
  publishedYear: number | null;
  publisher: string | null;
  description: string | null;
  genres: string[];
  source: BookSource;
  /** Open Library work key, e.g. "/works/OL45804W". Best cross-edition identity we have. */
  workKey: string | null;
}

export type BookSource = 'openlibrary' | 'seed' | 'import';

/** Default shelves carry a kind so behaviour (progress, finished date) never depends on a name. */
export type ShelfKind = 'want' | 'reading' | 'read';

export interface Shelf {
  id: string;
  name: string;
  position: number;
  kind: ShelfKind | null;
}

/**
 * How the user is reading this copy. Each format has a natural position unit:
 * print → page, ebook → percent, audio → minutes into the recording.
 */
export type ReadingFormat = 'print' | 'ebook' | 'audio';

export interface ReadingProgress {
  /** Print position. */
  currentPage: number | null;
  /** 0–100 when the total is known; null when we only know a position (e.g. page 147 of ?). */
  percent: number | null;
  /** Audio position in minutes. */
  minutes: number | null;
  updatedAt: string;
}

/** One book in one user's library. */
export interface LibraryEntry {
  id: string;
  book: Book;
  shelfId: string;
  addedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  rating: number | null;
  notes: string;
  progress: ReadingProgress | null;
  format: ReadingFormat;
  /** The user's own edition length; overrides the catalog page count (editions differ). */
  totalPages: number | null;
  /** Audiobook length in minutes. */
  totalMinutes: number | null;
}

export interface ReadingGoal {
  year: number;
  target: number;
}

/**
 * A point-in-time position record. We keep *when it was logged*, but deliberately don't derive
 * streaks or reading speed from it — people often log a session hours or days after reading.
 */
export interface ProgressLog {
  id: string;
  entryId: string;
  page: number | null;
  percent: number | null;
  minutes: number | null;
  loggedAt: string;
}

export type EntryPatch = Partial<
  Pick<LibraryEntry, 'rating' | 'notes' | 'startedAt' | 'finishedAt' | 'format' | 'totalPages' | 'totalMinutes'>
>;
