import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

// jsdom lacks <dialog> methods.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

beforeEach(() => {
  sessionStorage.clear();
});

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

describe('guest experience', () => {
  it('enters the pre-filled sample library from /guest', async () => {
    renderAt('/guest');
    expect(await screen.findByRole('heading', { level: 1, name: /a reader’s library/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /currently reading/i })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: /reading goal/i }).length).toBeGreaterThan(0);
    // Gentle prompt, not a gate.
    expect(screen.getByRole('complementary', { name: /guest mode/i })).toBeInTheDocument();
  });

  it('moves a book to another shelf from its detail page', async () => {
    const user = userEvent.setup();
    renderAt('/guest');
    await screen.findByRole('heading', { level: 1, name: /a reader’s library/i });
    const reading = screen.getByRole('list', { name: 'Want to Read' });
    const firstBook = within(reading).getAllByRole('link')[0]!;
    const title = firstBook.getAttribute('aria-label')!.split(',')[0]!;
    await user.click(firstBook);

    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: /shelf/i }), 'Currently Reading');
    expect(await screen.findByRole('heading', { name: /reading progress/i })).toBeInTheDocument();
  });

  it('searches your own library from the "/" shortcut, including notes', async () => {
    const user = userEvent.setup();
    renderAt('/guest');
    await screen.findByRole('heading', { level: 1, name: /a reader’s library/i });

    await user.keyboard('/');
    expect(await screen.findByRole('heading', { level: 1, name: /search your library/i })).toBeInTheDocument();
    const input = screen.getByRole('searchbox', { name: /search your library/i });
    expect(input).toHaveFocus();

    // Author: both Le Guin books in the sample library.
    await user.type(input, 'le guin');
    let results = await screen.findByRole('list', { name: 'Search results' });
    expect(within(results).getAllByRole('link')).toHaveLength(2);
    expect(results).toHaveTextContent('The Left Hand of Darkness');
    expect(results).toHaveTextContent('The Dispossessed');

    // Every word must match: narrowing to one title.
    await user.type(input, ' left');
    results = await screen.findByRole('list', { name: 'Search results' });
    expect(within(results).getAllByRole('link')).toHaveLength(1);

    // Only in a personal note ("Kvothe’s voice carries everything…" on The Name of the Wind).
    await user.clear(input);
    await user.type(input, 'kvothe');
    results = await screen.findByRole('list', { name: 'Search results' });
    expect(results).toHaveTextContent('The Name of the Wind');
    expect(screen.getByText(/matched only in your notes/i)).toBeInTheDocument();

    // Nothing found: offer Open Library instead.
    await user.clear(input);
    await user.type(input, 'zzzz unknown');
    expect(await screen.findByRole('link', { name: /search open library for “zzzz unknown”/i })).toHaveAttribute(
      'href',
      '/discover?q=zzzz%20unknown',
    );
  });

  it('protects library routes from signed-out visitors', async () => {
    renderAt('/library');
    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  });

  it('shows dual CTAs on the landing page', () => {
    renderAt('/');
    expect(screen.getAllByRole('link', { name: /sign up/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /try as guest/i })).toBeInTheDocument();
  });
});
