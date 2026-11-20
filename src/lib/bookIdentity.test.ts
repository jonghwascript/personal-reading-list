import { catalogKey, cleanIsbn, isbn10To13, isSameBook, normalizeTitle, authorSurname } from './bookIdentity';

const base = { workKey: null, isbn10: null, isbn13: null };

describe('cleanIsbn', () => {
  it('strips Goodreads ="..." wrapping and hyphens', () => {
    expect(cleanIsbn('="0743273567"')).toBe('0743273567');
    expect(cleanIsbn('978-0-7432-7356-5')).toBe('9780743273565');
  });
  it('accepts X check digit and rejects junk', () => {
    expect(cleanIsbn('080442957x')).toBe('080442957X');
    expect(cleanIsbn('dune')).toBeNull();
    expect(cleanIsbn('')).toBeNull();
    expect(cleanIsbn(null)).toBeNull();
  });
});

describe('isbn10To13', () => {
  it('computes the 978-prefixed check digit', () => {
    expect(isbn10To13('0743273567')).toBe('9780743273565');
    expect(isbn10To13('0441013597')).toBe('9780441013593');
  });
});

describe('normalizeTitle / authorSurname', () => {
  it('drops subtitles, articles and punctuation', () => {
    expect(normalizeTitle('The Pragmatic Programmer: Your Journey to Mastery')).toBe('pragmatic programmer');
    expect(normalizeTitle('Dune (Dune Chronicles #1)')).toBe('dune');
  });
  it('handles first-last and last-first author formats', () => {
    expect(authorSurname('J.R.R. Tolkien')).toBe('tolkien');
    expect(authorSurname('Tolkien, J.R.R.')).toBe('tolkien');
  });
});

describe('isSameBook', () => {
  it('matches editions through ISBN-10 ↔ ISBN-13 conversion', () => {
    expect(
      isSameBook(
        { ...base, title: 'The Great Gatsby', authors: ['F. Scott Fitzgerald'], isbn10: '0743273567' },
        { ...base, title: 'Great Gatsby', authors: ['Fitzgerald'], isbn13: '9780743273565' },
      ),
    ).toBe(true);
  });
  it('matches ISBN-less books by title and surname', () => {
    expect(
      isSameBook(
        { ...base, title: 'Eloquent JavaScript', authors: ['Marijn Haverbeke'] },
        { ...base, title: 'Eloquent JavaScript, 3rd Edition', authors: ['Haverbeke, Marijn'], isbn13: '9781593279509' },
      ),
    ).toBe(false); // the comma subtitle is not stripped: different editions stay distinct unless keys agree
    expect(
      isSameBook(
        { ...base, title: 'Eloquent JavaScript', authors: ['Marijn Haverbeke'] },
        { ...base, title: 'Eloquent Javascript: A Modern Introduction', authors: ['Haverbeke, Marijn'] },
      ),
    ).toBe(true);
  });
  it('trusts work keys over everything else', () => {
    expect(
      isSameBook(
        { ...base, title: 'Dune', authors: ['Frank Herbert'], workKey: '/works/OL893415W' },
        { ...base, title: 'Dune', authors: ['Frank Herbert'], workKey: '/works/OL999W' },
      ),
    ).toBe(false);
  });
});

describe('catalogKey', () => {
  it('prefers work key, then ISBN-13, then title|surname', () => {
    expect(catalogKey({ ...base, title: 'X', authors: [], workKey: '/works/OL1W' })).toBe('work:/works/OL1W');
    expect(catalogKey({ ...base, title: 'X', authors: [], isbn10: '0743273567' })).toBe('isbn:9780743273565');
    expect(catalogKey({ ...base, title: 'The Road', authors: ['Cormac McCarthy'] })).toBe('title:road|mccarthy');
  });
});
