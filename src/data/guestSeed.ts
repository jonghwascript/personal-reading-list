import sampleBooks from '../../data/sample-books.json';
import { normalizeTitle } from '../lib/bookIdentity';
import type { Book, LibraryEntry, ProgressLog, ReadingGoal, Shelf } from '../types';
import type { LibrarySnapshot } from './repository';

interface SampleBook {
  title: string;
  author: string;
  isbn13: string | null;
  isbn10: string | null;
  coverUrl: string | null;
  pageCount: number | null;
  publishedDate: string | null;
  genres: string[];
  description: string | null;
  publisher: string | null;
}

/**
 * The seed calendar is authored against this date, then shifted so the guest always sees a
 * library that was active "recently" — the latest finish is ~a week ago whenever they visit.
 */
const AUTHORED_TODAY = Date.UTC(2026, 10, 20);
const DAY = 86_400_000;

const SHELF_IDS = {
  want: 'shelf-want',
  reading: 'shelf-reading',
  read: 'shelf-read',
  favorites: 'shelf-favorites',
  bookClub: 'shelf-book-club',
} as const;

export const GUEST_SHELVES: Shelf[] = [
  { id: SHELF_IDS.reading, name: 'Currently Reading', position: 0, kind: 'reading' },
  { id: SHELF_IDS.want, name: 'Want to Read', position: 1, kind: 'want' },
  { id: SHELF_IDS.read, name: 'Read', position: 2, kind: 'read' },
  { id: SHELF_IDS.favorites, name: 'Favorites', position: 3, kind: null },
  { id: SHELF_IDS.bookClub, name: 'Book Club 2026', position: 4, kind: null },
];

type Plan =
  | { shelf: 'want'; added: string; note?: string }
  | { shelf: 'bookClub'; added: string; note?: string }
  | {
      shelf: 'reading';
      added: string;
      started: string;
      page?: number;
      /** E-book position. */
      percent?: number;
      /** Audiobook position and length, in minutes. */
      minutes?: number;
      length?: number;
      note?: string;
    }
  | { shelf: 'read'; added: string; finished: string; rating: number; note?: string }
  | { shelf: 'favorites'; added: string; finished: string; rating: number; note?: string };

/** Keyed by normalized title so the plan survives reordering of the JSON file. */
const PLAN: Record<string, Plan> = {
  // Currently reading
  'name of the wind': { shelf: 'reading', added: '2026-09-02', started: '2026-10-28', page: 412, note: 'Kvothe’s voice carries everything. The University chapters are a joy.' },
  'designing data intensive applications': { shelf: 'reading', added: '2026-05-11', started: '2026-10-05', page: 188, note: 'Ch. 5 on replication — re-read the leaderless section with a pen.' },
  // An e-book (tracked in percent) and an audiobook (tracked in minutes) show the other formats.
  'say nothing': { shelf: 'reading', added: '2026-08-15', started: '2026-11-03', percent: 35 },
  'gentleman in moscow': { shelf: 'reading', added: '2026-07-01', started: '2026-10-19', page: 301 },
  'four thousand weeks': { shelf: 'reading', added: '2026-10-30', started: '2026-11-14', minutes: 104, length: 318 },
  // Read this year — the year-in-review story
  'great gatsby': { shelf: 'read', added: '2025-12-20', finished: '2026-01-09', rating: 5, note: 'A perfect novel. Every sentence earns its place.' },
  'project hail mary': { shelf: 'read', added: '2025-12-28', finished: '2026-01-24', rating: 5, note: 'Rocky! Laughed out loud on the train.' },
  'atomic habits': { shelf: 'read', added: '2026-01-15', finished: '2026-02-06', rating: 4 },
  neuromancer: { shelf: 'read', added: '2026-01-30', finished: '2026-02-21', rating: 4 },
  educated: { shelf: 'read', added: '2026-02-10', finished: '2026-03-08', rating: 5, note: 'Hard to read, impossible to put down.' },
  'deep work': { shelf: 'read', added: '2026-02-25', finished: '2026-03-19', rating: 4 },
  'left hand of darkness': { shelf: 'read', added: '2026-03-10', finished: '2026-04-04', rating: 4 },
  'don t make me think': { shelf: 'read', added: '2026-03-30', finished: '2026-04-15', rating: 4 },
  '1984': { shelf: 'read', added: '2026-04-10', finished: '2026-05-02', rating: 5 },
  'psychology of money': { shelf: 'read', added: '2026-04-28', finished: '2026-05-20', rating: 4 },
  piranesi: { shelf: 'read', added: '2026-05-15', finished: '2026-06-07', rating: 5, note: 'The House is beautiful, its kindness immeasurable.' },
  'pragmatic programmer': { shelf: 'read', added: '2026-05-25', finished: '2026-06-21', rating: 5 },
  'born a crime': { shelf: 'read', added: '2026-06-12', finished: '2026-07-05', rating: 5 },
  'normal people': { shelf: 'read', added: '2026-06-30', finished: '2026-07-19', rating: 3, note: 'Beautifully written, but I wanted to shake both of them.' },
  'fifth season': { shelf: 'read', added: '2026-07-10', finished: '2026-08-03', rating: 5 },
  'obstacle is the way': { shelf: 'read', added: '2026-08-01', finished: '2026-08-24', rating: 3 },
  'philosophy of software design': { shelf: 'read', added: '2026-08-20', finished: '2026-09-10', rating: 4, note: 'Deep modules > shallow modules. Changed how I review PRs.' },
  circe: { shelf: 'read', added: '2026-09-01', finished: '2026-09-27', rating: 4 },
  'thinking fast and slow': { shelf: 'read', added: '2026-08-25', finished: '2026-10-12', rating: 4 },
  'ancillary justice': { shelf: 'read', added: '2026-10-01', finished: '2026-10-30', rating: 4 },
  essentialism: { shelf: 'read', added: '2026-10-25', finished: '2026-11-12', rating: 3 },
  // Read in earlier years
  'to kill a mockingbird': { shelf: 'read', added: '2025-03-15', finished: '2025-06-22', rating: 5, note: 'Timeless and devastating.' },
  dune: { shelf: 'read', added: '2025-08-01', finished: '2025-10-02', rating: 5 },
  'clean code': { shelf: 'read', added: '2025-02-01', finished: '2025-03-11', rating: 3, note: 'Some good ideas, some dated dogma. Read critically.' },
  // Custom shelves
  'pride and prejudice': { shelf: 'favorites', added: '2024-07-20', finished: '2024-08-14', rating: 5, note: 'Comfort read. Every few years, forever.' },
  beloved: { shelf: 'favorites', added: '2024-10-05', finished: '2024-11-02', rating: 5 },
  sapiens: { shelf: 'favorites', added: '2025-01-02', finished: '2025-01-28', rating: 4 },
  'children of time': { shelf: 'bookClub', added: '2026-11-10', note: 'December pick — meeting on the 14th.' },
  'immortal life of henrietta lacks': { shelf: 'bookClub', added: '2026-11-10' },
};

const shift = (iso: string, now: number) => new Date(Date.parse(`${iso}T19:30:00Z`) + (now - AUTHORED_TODAY)).toISOString();

function slug(title: string): string {
  return normalizeTitle(title).replace(/\s+/g, '-');
}

function toBook(raw: SampleBook): Book {
  return {
    id: `seed-${slug(raw.title)}`,
    title: raw.title,
    authors: raw.author.split(/,\s*|\s+and\s+/).map((a) => a.trim()).filter(Boolean),
    coverUrl: raw.coverUrl,
    isbn10: raw.isbn10,
    isbn13: raw.isbn13,
    pageCount: raw.pageCount,
    publishedYear: raw.publishedDate ? Number.parseInt(raw.publishedDate, 10) || null : null,
    publisher: raw.publisher,
    description: raw.description,
    // The curated genre list uses "Sci-Fi & Fantasy"/"Tech & Programming" umbrellas; keep them as
    // tags so the guest's genre filters mirror the five sample genres.
    genres: raw.genres,
    source: 'seed',
    workKey: null,
  };
}

export function buildGuestSnapshot(now: number = Date.now()): LibrarySnapshot {
  const entries: LibraryEntry[] = [];
  const logs: ProgressLog[] = [];

  for (const raw of sampleBooks as SampleBook[]) {
    const book = toBook(raw);
    const plan = PLAN[normalizeTitle(raw.title)];
    const entryId = `entry-${slug(raw.title)}`;
    const base = {
      id: entryId,
      book,
      addedAt: shift(plan?.added ?? '2026-06-01', now),
      notes: plan?.note ?? '',
      rating: null,
      startedAt: null,
      finishedAt: null,
      progress: null,
      format: 'print',
      totalPages: null,
      totalMinutes: null,
    } satisfies Omit<LibraryEntry, 'shelfId'>;

    if (!plan || plan.shelf === 'want' || plan.shelf === 'bookClub') {
      entries.push({ ...base, shelfId: SHELF_IDS[plan?.shelf ?? 'want'] });
      continue;
    }

    if (plan.shelf === 'reading') {
      const format = plan.minutes !== undefined ? 'audio' : plan.percent !== undefined ? 'ebook' : 'print';
      const totalMinutes = plan.length ?? null;
      const percent =
        format === 'ebook'
          ? plan.percent!
          : format === 'audio'
            ? Math.round((plan.minutes! / totalMinutes!) * 1000) / 10
            : book.pageCount && plan.page
              ? Math.round((plan.page / book.pageCount) * 1000) / 10
              : null;
      const started = shift(plan.started, now);
      const updatedAt = new Date(Math.min(now - DAY * 0.3, Date.parse(started) + DAY * 9)).toISOString();
      entries.push({
        ...base,
        shelfId: SHELF_IDS.reading,
        format,
        totalMinutes,
        startedAt: started,
        progress: {
          currentPage: format === 'print' ? (plan.page ?? 0) : null,
          percent,
          minutes: format === 'audio' ? plan.minutes! : null,
          updatedAt,
        },
      });
      // A few logged positions so the reading history isn't empty.
      [0.25, 0.6, 1].forEach((fraction, i) => {
        const t = Date.parse(started) + (Date.parse(updatedAt) - Date.parse(started)) * fraction;
        logs.push({
          id: `${entryId}-log-${i}`,
          entryId,
          page: format === 'print' && plan.page ? Math.round(plan.page * fraction) : null,
          percent: percent === null ? null : Math.round(percent * fraction * 10) / 10,
          minutes: format === 'audio' ? Math.round(plan.minutes! * fraction) : null,
          loggedAt: new Date(t).toISOString(),
        });
      });
      continue;
    }

    const finished = shift(plan.finished, now);
    // Assume ~30 pages/day so time-to-finish stats look plausible.
    const days = Math.max(4, Math.round((book.pageCount ?? 300) / 30));
    const started = new Date(Date.parse(finished) - days * DAY).toISOString();
    entries.push({
      ...base,
      shelfId: SHELF_IDS[plan.shelf],
      rating: plan.rating,
      startedAt: started,
      finishedAt: finished,
      progress: { currentPage: book.pageCount, percent: 100, minutes: null, updatedAt: finished },
    });
    logs.push(
      { id: `${entryId}-log-start`, entryId, page: 0, percent: 0, minutes: null, loggedAt: started },
      { id: `${entryId}-log-end`, entryId, page: book.pageCount, percent: 100, minutes: null, loggedAt: finished },
    );
  }

  const currentYear = new Date(now).getFullYear();
  const goals: ReadingGoal[] = [{ year: currentYear, target: 24 }];
  return { shelves: GUEST_SHELVES.map((s) => ({ ...s })), entries, goals, logs };
}
