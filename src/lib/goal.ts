import type { LibraryEntry, ReadingGoal } from '../types';

export type PaceStatus = 'complete' | 'ahead' | 'on-track' | 'behind';

export interface GoalProgress {
  target: number;
  completed: number;
  /** Books the user "should" have read by today for a linear pace. */
  expected: number;
  percent: number;
  status: PaceStatus;
  /** Positive = books ahead of pace, negative = behind. Rounded to one decimal. */
  delta: number;
}

/** Fraction of the year elapsed at the given instant (0–1), using local calendar days. */
export function yearFraction(now: Date): number {
  const year = now.getFullYear();
  const start = new Date(year, 0, 1).getTime();
  const end = new Date(year + 1, 0, 1).getTime();
  return (now.getTime() - start) / (end - start);
}

export function booksFinishedInYear(entries: LibraryEntry[], year: number): LibraryEntry[] {
  return entries.filter((e) => e.finishedAt && new Date(e.finishedAt).getFullYear() === year);
}

/**
 * Within one book of the linear pace counts as on track — a reader one book behind in March
 * shouldn't be told they're failing.
 */
export function goalProgress(goal: ReadingGoal, completed: number, now: Date = new Date()): GoalProgress {
  const fraction = now.getFullYear() === goal.year ? yearFraction(now) : now.getFullYear() > goal.year ? 1 : 0;
  const expected = goal.target * fraction;
  const delta = Math.round((completed - expected) * 10) / 10;
  let status: PaceStatus;
  if (completed >= goal.target) status = 'complete';
  else if (delta >= 1) status = 'ahead';
  else if (delta > -1) status = 'on-track';
  else status = 'behind';
  return {
    target: goal.target,
    completed,
    expected,
    percent: goal.target > 0 ? Math.min(100, (completed / goal.target) * 100) : 0,
    status,
    delta,
  };
}
