import type { LibraryEntry, ProgressLog, ReadingFormat, ReadingProgress } from '../types';

export type ProgressInput = { page: number } | { percent: number } | { minutes: number };

/** The milestone a save crossed, used for a light celebratory line — never a modal. */
export type Milestone = 'started' | 'halfway' | 'almost' | 'end' | null;

export function totalPagesOf(entry: Pick<LibraryEntry, 'totalPages' | 'book'>): number | null {
  return entry.totalPages ?? entry.book.pageCount;
}

/** What one "unit" of position means for this entry's format, and the total if known. */
export function positionModel(entry: LibraryEntry): { format: ReadingFormat; total: number | null } {
  switch (entry.format) {
    case 'ebook':
      return { format: 'ebook', total: 100 };
    case 'audio':
      return { format: 'audio', total: entry.totalMinutes };
    default:
      return { format: 'print', total: totalPagesOf(entry) };
  }
}

/** Current position in the entry's own unit (page / percent / minutes). */
export function currentPosition(entry: LibraryEntry): number {
  const p = entry.progress;
  if (!p) return 0;
  if (entry.format === 'ebook') return Math.round(p.percent ?? 0);
  if (entry.format === 'audio') return p.minutes ?? 0;
  return p.currentPage ?? 0;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
const round1 = (n: number) => Math.round(n * 10) / 10;
const percentOf = (position: number, total: number) => position >= total ? 100 : Math.min(99.9, round1((position / total) * 100));

function milestoneBetween(before: number | null, after: number | null): Milestone {
  if (after === null) return null;
  const prev = before ?? 0;
  if (after >= 100 && prev < 100) return 'end';
  if (after >= 90 && prev < 90) return 'almost';
  if (after >= 50 && prev < 50) return 'halfway';
  if (after > 0 && prev === 0 && before === null) return 'started';
  return null;
}

/**
 * Records a new position in the entry's format. Unknown totals are fine: the position is kept and
 * percent stays null until the user tells us how long their edition is.
 */
export function applyProgress(
  entry: LibraryEntry,
  input: ProgressInput,
  now: Date = new Date(),
): { entry: LibraryEntry; log: ProgressLog; milestone: Milestone } {
  const updatedAt = now.toISOString();
  let progress: ReadingProgress;

  if ('percent' in input) {
    const percent = round1(clamp(input.percent, 0, 100));
    const pages = totalPagesOf(entry);
    progress = { currentPage: pages ? Math.round((percent / 100) * pages) : null, percent, minutes: null, updatedAt };
  } else if ('minutes' in input) {
    const total = entry.totalMinutes;
    const minutes = Math.round(clamp(input.minutes, 0, total ?? Number.MAX_SAFE_INTEGER));
    progress = { currentPage: null, percent: total ? percentOf(minutes, total) : null, minutes, updatedAt };
  } else {
    const total = totalPagesOf(entry);
    const page = Math.round(clamp(input.page, 0, total ?? Number.MAX_SAFE_INTEGER));
    progress = { currentPage: page, percent: total ? percentOf(page, total) : null, minutes: null, updatedAt };
  }

  const milestone = milestoneBetween(entry.progress?.percent ?? null, progress.percent);
  return {
    entry: { ...entry, startedAt: entry.startedAt ?? updatedAt, progress },
    log: {
      id: crypto.randomUUID(),
      entryId: entry.id,
      page: progress.currentPage,
      percent: progress.percent,
      minutes: progress.minutes,
      loggedAt: updatedAt,
    },
    milestone,
  };
}

/** Re-derives percent after the user changes format or tells us their edition's length. */
export function recomputeProgress(entry: LibraryEntry): LibraryEntry {
  const p = entry.progress;
  if (!p) return entry;
  const pages = totalPagesOf(entry);
  if (entry.format === 'print' && pages && p.currentPage === null && p.percent !== null) {
    return { ...entry, progress: { ...p, currentPage: Math.round((p.percent / 100) * pages) } };
  }
  const ratio = (position: number | null, total: number | null): number | null => {
    if (position === null) return p.percent; // no position in this unit yet: keep what we had
    return total ? percentOf(position, total) : null;
  };
  let percent = p.percent;
  if (entry.format === 'print') percent = ratio(p.currentPage, pages);
  if (entry.format === 'audio') percent = ratio(p.minutes, entry.totalMinutes);
  return { ...entry, progress: { ...p, percent } };
}

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** "147 / 350 pages", "35%", "1h 44m of 5h 18m", "Page 147" — the card's primary readout. */
export function describePosition(entry: LibraryEntry): string {
  const p = entry.progress;
  if (entry.format === 'ebook') return `${Math.round(p?.percent ?? 0)}%`;
  if (entry.format === 'audio') {
    const at = formatMinutes(p?.minutes ?? 0);
    return entry.totalMinutes ? `${at} of ${formatMinutes(entry.totalMinutes)}` : `${at} listened`;
  }
  const total = totalPagesOf(entry);
  const page = p?.currentPage ?? 0;
  if (!total && p?.percent != null) return `${p.percent}%`;
  return total ? `${page} / ${total} pages` : `Page ${page}`;
}

/** What's left, in the format's natural unit, or null when unknowable. */
export function describeRemaining(entry: LibraryEntry): string | null {
  const { total } = positionModel(entry);
  if (total === null) return null;
  const left = Math.max(0, total - currentPosition(entry));
  if (entry.format === 'ebook') return `${left}% to go`;
  if (entry.format === 'audio') return `${formatMinutes(left)} left`;
  return `${left} ${left === 1 ? 'page' : 'pages'} to go`;
}

/** Whole days between start and finish, when both are known. */
export function daysToFinish(entry: Pick<LibraryEntry, 'startedAt' | 'finishedAt'>): number | null {
  if (!entry.startedAt || !entry.finishedAt) return null;
  const days = Math.round((Date.parse(entry.finishedAt) - Date.parse(entry.startedAt)) / 86_400_000);
  return days >= 0 ? Math.max(1, days) : null;
}
