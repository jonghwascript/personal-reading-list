import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../App';
import { buildGuestSnapshot } from '../../data/guestSeed';
import { __resetOpenLibraryForTests } from '../../lib/openLibrary';

const CSV = [
  'Title,Author,ISBN13,My Rating,Date Read,Date Added,Bookshelves,Exclusive Shelf,My Review',
  'Dune,Frank Herbert,"=""9780441013593""",5,2025/07/04,2025/05/15,"favorites, space-opera",read,<i>Epic</i>',
  'Circe,Madeline Miller,,0,,2025/11/01,,currently-reading,',
  'Dune,Frank Herbert,,4,,,,read,',
  ',Nobody,,,,,,read,',
].join('\n');

beforeEach(() => {
  sessionStorage.clear();
  __resetOpenLibraryForTests();
  // The sample library minus Dune and Circe, so both arrive as new books.
  const seed = buildGuestSnapshot();
  const entries = seed.entries.filter((e) => !/^(dune|circe)$/i.test(e.book.title));
  sessionStorage.setItem('bookshelf:guest:v2', JSON.stringify({ ...seed, entries }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ numFound: 0, docs: [] }), { status: 200 })),
  );
});

afterEach(() => vi.unstubAllGlobals());

const storedShelfCount = () => JSON.parse(sessionStorage.getItem('bookshelf:guest:v2')!).shelves.length as number;

it('previews, maps shelves, imports and reports a Goodreads export', async () => {
  const user = userEvent.setup();
  window.history.pushState({}, '', '/guest');
  render(<App />);
  await screen.findByRole('heading', { level: 1 });
  window.history.pushState({}, '', '/import');
  window.dispatchEvent(new PopStateEvent('popstate'));

  expect(await screen.findByRole('heading', { level: 1, name: 'Bring your Goodreads library' })).toBeInTheDocument();
  await user.upload(screen.getByLabelText('Choose CSV file'), new File([CSV], 'goodreads_library_export.csv', { type: 'text/csv' }));

  // Preview: nothing saved yet; the repeat and the untitled row are called out.
  expect(await screen.findByRole('heading', { level: 1, name: 'Check before importing' })).toHaveFocus();
  expect(screen.getByText('Listed twice (line 2) — skipped')).toBeInTheDocument();
  expect(screen.getByText('Rows we couldn’t read').nextSibling).toHaveTextContent('1');

  // A custom shelf reuses a same-named shelf (the sample library has Favorites), otherwise
  // defaults to a new one; turn one into a genre tag instead.
  expect(screen.getByRole('combobox', { name: /favorites/ })).toHaveDisplayValue('Favorites');
  expect(screen.getByRole('combobox', { name: /space-opera/ })).toHaveDisplayValue('New shelf “Space opera”');
  await user.selectOptions(screen.getByRole('combobox', { name: /space-opera/ }), 'genre');

  await user.click(screen.getByRole('button', { name: 'Import 2 books' }));

  expect(await screen.findByRole('heading', { level: 1, name: 'Import complete' }, { timeout: 5000 })).toBeInTheDocument();
  const report = screen.getByRole('heading', { level: 2, name: '2 books added' }).parentElement!;
  expect(within(report).getByText(/duplicate skipped/).textContent).toMatch(/^1/);
  // The stubbed Open Library knows neither book, so both are reported (and still added).
  await user.click(within(report).getByText('Books not found on Open Library'));
  expect(within(report).getByText('Circe')).toBeVisible();

  // Dune landed on the existing Favorites shelf with its Goodreads details; no shelf was created.
  expect(storedShelfCount()).toBe(buildGuestSnapshot().shelves.length);
  const stored = JSON.parse(sessionStorage.getItem('bookshelf:guest:v2')!);
  const favorites = stored.shelves.find((s: { name: string }) => s.name === 'Favorites');
  const dune = stored.entries.find((e: { book: { title: string } }) => e.book.title === 'Dune');
  expect(dune).toMatchObject({ shelfId: favorites.id, rating: 5, notes: 'Epic', finishedAt: '2025-07-04T12:00:00.000Z' });
  expect(dune.book.genres).toContain('Space opera');
});
