export function formatAuthors(authors: string[]): string {
  if (authors.length <= 2) return authors.join(' & ');
  return `${authors[0]} & ${authors.length - 1} others`;
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const absolute = new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' });
const short = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });

/** "2 days ago" for the last week, "March 15, 2026" after that (spec: activity timeline format). */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const diffMs = Date.parse(iso) - now.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 1) return 'just now';
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return relative.format(days, 'day');
  return absolute.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return absolute.format(new Date(iso));
}

export function formatShortDate(iso: string): string {
  return short.format(new Date(iso));
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
