import type { LibraryEntry } from '../types';
import { totalPagesOf } from './progress';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Up to this many books, every finished book is a headline cover. */
export const FEATURE_ALL_LIMIT = 6;
const FEATURED_MAX = 7;
/** Only claim a page total when we know most books' lengths — a half-known total misleads. */
const PAGE_COVERAGE_THRESHOLD = 0.7;
const MIN_BOOKS_FOR_GENRES = 3;

export interface YearReview {
  year: number;
  isCurrentYear: boolean;
  /** For the current year: the date the numbers are "as of". */
  asOf: Date | null;
  finished: LibraryEntry[];
  byMonth: number[];
  /** Months that have happened (12 for past years). */
  monthsElapsed: number;
  topMonth: { month: number; count: number } | null;
  featured: LibraryEntry[];
  genres: { genre: string; count: number }[] | null;
  pages: { total: number; known: number; of: number } | null;
}

export function finishedIn(entries: LibraryEntry[], year: number): LibraryEntry[] {
  return entries
    .filter((e) => e.finishedAt && new Date(e.finishedAt).getFullYear() === year)
    .sort((a, b) => Date.parse(a.finishedAt!) - Date.parse(b.finishedAt!));
}

export function yearsWithFinishedBooks(entries: LibraryEntry[]): number[] {
  return [...new Set(entries.filter((e) => e.finishedAt).map((e) => new Date(e.finishedAt!).getFullYear()))].sort((a, b) => a - b);
}

export function buildYearReview(entries: LibraryEntry[], year: number, now: Date = new Date()): YearReview {
  const isCurrentYear = year === now.getFullYear();
  const finished = finishedIn(entries, year);

  const byMonth = Array.from({ length: 12 }, () => 0);
  for (const e of finished) byMonth[new Date(e.finishedAt!).getMonth()]! += 1;
  const max = Math.max(0, ...byMonth);
  // Only name a "biggest month" when it's genuinely a standout (a unique max of at least two).
  const topMonth = max >= 2 && byMonth.filter((n) => n === max).length === 1 ? { month: byMonth.indexOf(max), count: max } : null;

  const featured =
    finished.length <= FEATURE_ALL_LIMIT
      ? finished
      : [...finished]
          .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || Date.parse(b.finishedAt!) - Date.parse(a.finishedAt!))
          .slice(0, FEATURED_MAX);

  // Primary genre per book (its first tag) keeps each book counted once.
  const withGenre = finished.filter((e) => e.book.genres.length > 0);
  let genres: YearReview['genres'] = null;
  if (withGenre.length >= MIN_BOOKS_FOR_GENRES) {
    const counts = new Map<string, number>();
    for (const e of withGenre) counts.set(e.book.genres[0]!, (counts.get(e.book.genres[0]!) ?? 0) + 1);
    genres = [...counts.entries()].map(([genre, count]) => ({ genre, count })).sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre)).slice(0, 5);
  }

  const lengths = finished.map((e) => totalPagesOf(e)).filter((n): n is number => n !== null);
  const pages =
    finished.length > 0 && lengths.length / finished.length >= PAGE_COVERAGE_THRESHOLD
      ? { total: lengths.reduce((a, b) => a + b, 0), known: lengths.length, of: finished.length }
      : null;

  return {
    year,
    isCurrentYear,
    asOf: isCurrentYear ? now : null,
    finished,
    byMonth,
    monthsElapsed: isCurrentYear ? now.getMonth() + 1 : year < now.getFullYear() ? 12 : 0,
    topMonth,
    featured,
    genres,
    pages,
  };
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export function countWord(n: number): string {
  return WORDS[n] ?? n.toLocaleString();
}

/** The one-line story under the headline. Written to feel good at 3 books and at 50. */
export function reviewSentence(review: YearReview): string {
  const n = review.finished.length;
  const when = review.isCurrentYear ? 'so far this year' : `in ${review.year}`;
  if (n === 0) return '';
  if (n === 1) return `One book, start to finish, ${when}. Every reading year starts with one.`;
  if (n <= FEATURE_ALL_LIMIT) return `You finished these ${countWord(n)} books ${when} — here’s when each one landed.`;
  if (review.topMonth) {
    return `${MONTHS[review.topMonth.month]} was your biggest month, with ${countWord(review.topMonth.count)} books finished.`;
  }
  return `A steady year: ${countWord(n)} books spread across ${review.byMonth.filter(Boolean).length} months.`;
}
