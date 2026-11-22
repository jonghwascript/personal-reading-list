import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { GuestRepository } from './data/guestRepository';
import { GUEST_SHELVES } from './data/guestSeed';
import { __resetOpenLibraryForTests } from './lib/openLibrary';

/**
 * The design challenges as one journey: an empty library → add a curated book (choosing an
 * edition) → log progress from the dashboard → finish it → see it in the year in review.
 */
beforeEach(() => {
  sessionStorage.clear();
  __resetOpenLibraryForTests();
  // Start the guest session with empty shelves instead of the sample library.
  sessionStorage.setItem('bookshelf:guest:v2', JSON.stringify({ shelves: GUEST_SHELVES, entries: [], goals: [], logs: [] }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes('/editions.json')
          ? {
              entries: [
                { key: '/books/OL1M', title: 'Small Things Like These', number_of_pages: 116, publishers: ['Grove Press'], publish_date: '2021', physical_format: 'Hardcover', languages: [{ key: '/languages/eng' }] },
              ],
            }
          : { numFound: 0, docs: [] },
    })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('takes a new reader from an empty shelf to their year in review', async () => {
  const user = userEvent.setup();
  window.history.pushState({}, '', '/guest');
  render(<App />);

  // 1. Empty library: search plus curated lists, no dead end.
  expect(await screen.findByRole('heading', { level: 1, name: /fill your first shelf/i })).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Add your first book' }));
  expect(await screen.findByRole('searchbox', { name: /search books/i })).toBeInTheDocument();
  const shortNovels = await screen.findByRole('list', { name: 'Short novels for a weekend' });

  // 2. The optional edition picker lets the reader choose a specific copy.
  await user.click(within(shortNovels).getByRole('button', { name: /other editions of small things like these/i }));
  expect(await screen.findByRole('heading', { name: /which edition of small things like these/i })).toBeInTheDocument();
  // The edition choice opens as a modal dialog named by its question.
  expect(screen.getByRole('dialog', { name: /which edition of small things like these/i })).toBeInTheDocument();
  await user.click(await screen.findByRole('radio', { name: /116 pages/i }, { timeout: 3000 }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Shelf' }), 'Currently Reading');
  await user.click(screen.getByRole('button', { name: 'Add to Currently Reading' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Currently Reading' })).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /small things like these/i })).toBeInTheDocument();

  // 3. Dashboard: log the last page from the Currently Reading card.
  await user.click(screen.getAllByRole('link', { name: 'Library' })[0]!);
  expect(await screen.findByText('0 / 116 pages')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /log progress for small things like these/i }));
  const pageInput = screen.getByRole('spinbutton', { name: /last page read/i });
  await user.clear(pageInput);
  await user.type(pageInput, '58');
  vi.spyOn(GuestRepository.prototype, 'saveProgress').mockRejectedValueOnce(new Error('Offline'));
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('Couldn’t save progress. Try again.')).toHaveAttribute('role', 'alert');
  expect(pageInput).toHaveValue(58);
  expect(screen.getByText('0 / 116 pages')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Try saving again' }));
  expect(await screen.findByText('58 / 116 pages')).toBeInTheDocument();
  expect(screen.getByText(/halfway there/i)).toBeInTheDocument();

  // Undo restores the previous position.
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(await screen.findByText('0 / 116 pages')).toBeInTheDocument();

  // 4. The last page offers an explicit finish.
  await user.click(screen.getByRole('button', { name: /log progress for small things like these/i }));
  const again = screen.getByRole('spinbutton', { name: /last page read/i });
  await user.clear(again);
  await user.type(again, '116');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await user.click(await screen.findByRole('button', { name: 'Not yet' }));
  await user.click(screen.getByRole('button', { name: 'Move to Read' }));

  // 5. It shows up in the year in review.
  await user.click(screen.getAllByRole('link', { name: /year in review|review/i })[0]!);
  expect(await screen.findByRole('heading', { level: 1, name: /1 book finished/i })).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Books finished' })).toHaveTextContent('Small Things Like These');
});
