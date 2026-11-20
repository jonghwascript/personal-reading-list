import type { Book } from '../types';

/** Strips hyphens/spaces and Goodreads' ="..." wrapping. Returns null for anything not ISBN-shaped. */
export function cleanIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/^="?|"$/g, '').replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(cleaned) || /^\d{13}$/.test(cleaned)) return cleaned;
  return null;
}

/** Converts a valid ISBN-10 to its ISBN-13 form so editions can be compared on one identifier. */
export function isbn10To13(isbn10: string): string | null {
  const clean = cleanIsbn(isbn10);
  if (!clean || clean.length !== 10) return null;
  const core = `978${clean.slice(0, 9)}`;
  const sum = [...core].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return core + ((10 - (sum % 10)) % 10);
}

export function looksLikeIsbn(query: string): boolean {
  return cleanIsbn(query) !== null;
}

/** Lowercase, strip subtitle, punctuation, and leading articles: "The Hobbit: Or There..." → "hobbit". */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .split(/[:(]/)[0]!
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/^(the|a|an) /, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Surname is the most stable part across "J.R.R. Tolkien" / "Tolkien, J.R.R." / "John Ronald Reuel Tolkien". */
export function authorSurname(author: string): string {
  const trimmed = author.trim();
  const surname = trimmed.includes(',') ? trimmed.split(',')[0]! : trimmed.split(/\s+/).at(-1)!;
  return surname.toLowerCase().replace(/[^a-z]/g, '');
}

function isbnSet(book: Pick<Book, 'isbn10' | 'isbn13'>): Set<string> {
  const set = new Set<string>();
  const i13 = cleanIsbn(book.isbn13);
  if (i13) set.add(i13);
  const fromTen = book.isbn10 ? isbn10To13(book.isbn10) : null;
  if (fromTen) set.add(fromTen);
  return set;
}

type Comparable = Pick<Book, 'title' | 'authors' | 'isbn10' | 'isbn13' | 'workKey'>;

/**
 * Whether two records describe the same work. Editions differ in ISBN and cover, so we accept a
 * match on any of: work key, any shared ISBN, or normalized title + first author's surname.
 */
export function isSameBook(a: Comparable, b: Comparable): boolean {
  if (a.workKey && b.workKey) return a.workKey === b.workKey;
  const aIsbns = isbnSet(a);
  for (const isbn of isbnSet(b)) if (aIsbns.has(isbn)) return true;
  const aAuthor = a.authors[0] ? authorSurname(a.authors[0]) : '';
  const bAuthor = b.authors[0] ? authorSurname(b.authors[0]) : '';
  return normalizeTitle(a.title) === normalizeTitle(b.title) && aAuthor === bAuthor;
}

/** Key used for the shared books catalog table's unique constraint. */
export function catalogKey(book: Comparable): string {
  if (book.workKey) return `work:${book.workKey}`;
  const isbn = cleanIsbn(book.isbn13) ?? (book.isbn10 ? isbn10To13(book.isbn10) : null);
  if (isbn) return `isbn:${isbn}`;
  const author = book.authors[0] ? authorSurname(book.authors[0]) : 'unknown';
  return `title:${normalizeTitle(book.title)}|${author}`;
}
