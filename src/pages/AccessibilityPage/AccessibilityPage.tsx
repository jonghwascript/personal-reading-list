import { Link } from 'react-router-dom';
import { Logo } from '../../components/Logo/Logo';
import { usePageTitle } from '../../lib/usePageTitle';
import styles from './AccessibilityPage.module.css';

const SHORTCUTS: [string, string][] = [
  ['/ or Ctrl+K (⌘K)', 'Search your library from anywhere in the app'],
  ['Arrow keys, Home, End', 'Move between books in a shelf grid'],
  ['Enter', 'Open the focused book'],
  ['Space, then ↑ / ↓, then Space', 'Pick up a book, choose a shelf, drop it there (Esc cancels)'],
  ['1 – 5', 'Rate the book you’re viewing (0 clears the rating)'],
  ['Esc', 'Close a dialog'],
];

/**
 * Accessibility statement: what's built in, how it was checked, and what isn't done yet.
 * Public (no sign-in needed) so it can be linked from the landing page.
 */
export function AccessibilityPage() {
  usePageTitle('Accessibility');
  return (
    <div className={styles.screen}>
      <a href="#main" className="u-skip-link">
        Skip to content
      </a>
      <header className={styles.top}>
        <Link to="/" className={styles.brand}>
          <Logo />
          {' '}<span className="u-sr-only">home</span>
        </Link>
      </header>

      <main id="main" className={styles.main}>
        <p className={styles.eyebrow}>Accessibility statement</p>
        <h1 className={styles.title}>Books are for everyone — so is Bookshelf</h1>
        <p className={styles.lede}>
          Bookshelf aims to meet <strong>WCAG 2.2 level AA</strong> throughout, with an optional high-contrast mode that meets
          level AAA for text. This page lists what’s built in, how it has been checked, and what isn’t done yet.
        </p>

        <section aria-labelledby="settings-heading">
          <h2 id="settings-heading">Make it yours</h2>
          <p>
            In <Link to="/account#appearance">Account → Appearance &amp; reading</Link> (available in the guest library too) you can
            choose:
          </p>
          <ul>
            <li>
              <strong>Theme</strong> — follow your device, or always light or dark.
            </li>
            <li>
              <strong>Contrast</strong> — high contrast raises all text to at least 7:1 and strengthens borders; “System” turns it on
              when your device asks for more contrast.
            </li>
            <li>
              <strong>Text size</strong> — 112.5% or 125%; the whole interface scales, book covers included.
            </li>
            <li>
              <strong>Line spacing</strong> — roomier lines plus a little extra letter and word spacing.
            </li>
            <li>
              <strong>Font</strong> — OpenDyslexic, a typeface some dyslexic readers find easier.
            </li>
          </ul>
          <p>Choices are remembered on your device and applied before the page first appears, so nothing flashes.</p>
        </section>

        <section aria-labelledby="keyboard-heading">
          <h2 id="keyboard-heading">Keyboard shortcuts</h2>
          <table className={styles.table}>
            <caption className="u-sr-only">Keyboard shortcuts</caption>
            <thead>
              <tr>
                <th scope="col">Keys</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map(([keys, action]) => (
                <tr key={keys}>
                  <td>
                    <kbd>{keys}</kbd>
                  </td>
                  <td>{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Shortcuts that use plain keys never fire while you’re typing in a field.</p>
        </section>

        <section aria-labelledby="built-heading">
          <h2 id="built-heading">What’s built in</h2>
          <ul>
            <li>Semantic landmarks, one logical heading hierarchy per page, and a skip link.</li>
            <li>Focus moves to each new page’s heading (or the field the page is for), so screen reader users hear where they are.</li>
            <li>
              Live-region announcements for things that change without a page load: saving progress, moving books, search result
              counts, undo.
            </li>
            <li>Every control works by keyboard, including drag-and-drop between shelves; focus outlines are never removed.</li>
            <li>Status is never shown by colour alone — reading goals, progress and selected options also use icons, text or weight.</li>
            <li>Charts have a table equivalent; counting-up numbers are hidden from screen readers, which get the final value.</li>
            <li>Dialogs use the native &lt;dialog&gt; element: focus stays inside, Escape closes, focus returns where it was.</li>
            <li>
              All animation respects <em>reduce motion</em>: with it on, nothing moves except what you move.
            </li>
            <li>
              Main controls (navigation, primary buttons, rating stars, inputs) are at least 44 × 44 px; compact secondary buttons
              are 36 px tall.
            </li>
            <li>The layout reflows down to 320 px wide without horizontal scrolling.</li>
          </ul>
        </section>

        <section aria-labelledby="tested-heading">
          <h2 id="tested-heading">How it has been checked</h2>
          <ul>
            <li>
              <strong>Automated contrast tests</strong> read the colour tokens and fail the build if any text/background pair drops
              below 4.5:1 (or 7:1 in high contrast), in both light and dark.
            </li>
            <li>
              <strong>Lighthouse accessibility: 100</strong> on desktop and on mobile (deployed site).
            </li>
            <li>
              <strong>Automated interaction tests</strong> drive the app by roles and accessible names (the way assistive tech sees
              it): keyboard search shortcut, dialogs opening and closing, focus landing on the right element.
            </li>
            <li>Theme and preference combinations were checked in a real (headless) Chrome.</li>
          </ul>
        </section>

        <section aria-labelledby="gaps-heading">
          <h2 id="gaps-heading">Known gaps</h2>
          <ul>
            <li>
              <strong>Not yet tested with screen readers</strong> such as NVDA, JAWS, VoiceOver or TalkBack. The structure is designed
              for them, but real-world testing is still to do.
            </li>
            <li>
              Book cover images come from Open Library and have no descriptions of their own; covers next to a visible title are
              treated as decorative, and the book page names the cover by its title.
            </li>
            <li>The shareable year-in-review image is a picture; the same information is available as text on the page.</li>
          </ul>
        </section>

        <section aria-labelledby="contact-heading">
          <h2 id="contact-heading">Found a barrier?</h2>
          <p>
            Please open an issue at{' '}
            <a href="https://github.com/jonghwascript/personal-reading-list/issues">github.com/jonghwascript/personal-reading-list/issues</a>{' '}
            and describe what you were trying to do and with which browser or assistive technology.
          </p>
        </section>

        <p className={styles.meta}>Last reviewed: November 20, 2026.</p>
      </main>
    </div>
  );
}
