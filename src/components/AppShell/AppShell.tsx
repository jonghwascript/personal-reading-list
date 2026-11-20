import { BookMarked, CalendarHeart, Compass, Library, LogOut, Plus, Search, Sparkles, UserRound, X } from 'lucide-react';
import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { BookGridSkeleton } from '../BookGrid/BookGrid';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useLibrary } from '../../state/LibraryContext';
import { useSession } from '../../state/SessionContext';
import { Logo } from '../Logo/Logo';
import { ShelfDndProvider, useShelfDroppable } from '../ShelfDnd/ShelfDnd';
import { ThemeSwitcher } from '../ThemeSwitcher/ThemeSwitcher';
import { LIBRARY_SEARCH_INPUT_ID } from '../../pages/LibrarySearchPage/searchInputId';
import type { Shelf } from '../../types';
import styles from './AppShell.module.css';

const BANNER_KEY = 'bookshelf:guest-banner-dismissed';

export function AppShell() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const navigate = useNavigate();

  // On client-side navigation, move focus to the new page's heading so screen reader and keyboard
  // users land at the start of the new content (and hear its title).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // A page that deliberately focused a field (e.g. a search box) keeps it.
    const active = document.activeElement;
    if (active instanceof HTMLElement && mainRef.current?.contains(active) && active.matches('input, textarea, select')) {
      window.scrollTo({ top: 0 });
      return;
    }
    const heading = mainRef.current?.querySelector<HTMLElement>('h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  // "/" or Ctrl/Cmd+K jumps to library search from anywhere in the app (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing;
      const commandK = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k';
      if ((!slash && !commandK) || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      const input = document.getElementById(LIBRARY_SEARCH_INPUT_ID) as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.select();
      } else {
        navigate('/library/search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <ShelfDndProvider>
      <div className={styles.shell}>
        <a href="#main" className="u-skip-link">
          Skip to content
        </a>
        <Sidebar />
        <MobileHeader />
        <main id="main" ref={mainRef} className={styles.main}>
          <GuestBanner />
          <Suspense fallback={<BookGridSkeleton count={8} label="Loading page" />}>
            <Outlet />
          </Suspense>
        </main>
        <BottomNav />
      </div>
    </ShelfDndProvider>
  );
}

function Sidebar() {
  const { shelves, entries } = useLibrary();
  const { status, signOut, endGuest, user } = useSession();
  const navigate = useNavigate();
  const counts = countByShelf(entries);

  return (
    <aside className={styles.sidebar} aria-label="Sidebar">
      <Link to="/library" className={styles.brand}>
        <Logo />
      </Link>

      {/* Searches *your* books; finding new ones is "Discover" just below. */}
      <Link to="/library/search" className={styles.searchLink} aria-keyshortcuts="/ Control+K Meta+K">
        <Search size={16} aria-hidden="true" />
        <span>Search your library</span>
        <kbd className={styles.searchKbd} aria-hidden="true">
          /
        </kbd>
      </Link>

      <nav aria-label="Main">
        <ul role="list" className={styles.navList}>
          <li>
            <NavLink to="/library" end className={navClass}>
              <Library size={20} aria-hidden="true" /> Library
            </NavLink>
          </li>
          <li>
            <NavLink to="/discover" className={navClass}>
              <Compass size={20} aria-hidden="true" /> Discover
            </NavLink>
          </li>
          <li>
            <NavLink to="/review" className={navClass}>
              <CalendarHeart size={20} aria-hidden="true" /> Year in review
            </NavLink>
          </li>
        </ul>
      </nav>

      <nav aria-labelledby="sidebar-shelves" className={styles.shelfNav}>
        <div className={styles.sectionHeader}>
          <h2 id="sidebar-shelves" className={styles.sectionTitle}>
            Shelves
          </h2>
          <Link to="/shelves" className={styles.manageLink}>
            Manage{' '}<span className="u-sr-only">shelves</span>
          </Link>
        </div>
        <ul role="list" className={styles.navList}>
          {shelves.map((shelf) => (
            <SidebarShelf key={shelf.id} shelf={shelf} count={counts.get(shelf.id) ?? 0} />
          ))}
        </ul>
        <NewShelfInline />
      </nav>

      <div className={styles.account}>
        <div className={styles.theme}>
          <ThemeSwitcher compact />
          <p className={styles.themeLinks}>
            <Link to="/account#appearance">Reading settings</Link>
            {' · '}
            <Link to="/accessibility">Accessibility</Link>
          </p>
        </div>
        {status === 'guest' ? (
          <>
            <p className={styles.accountNote}>
              <Sparkles size={14} aria-hidden="true" /> Guest library
            </p>
            <Link to="/signup" className={styles.accountAction}>
              <UserRound size={18} aria-hidden="true" /> Create your account
            </Link>
            <button
              type="button"
              className={styles.accountAction}
              onClick={() => {
                endGuest();
                navigate('/');
              }}
            >
              <LogOut size={18} aria-hidden="true" /> Leave guest mode
            </button>
          </>
        ) : (
          <>
            <p className={styles.accountNote} title={user?.email ?? undefined}>
              {user?.email}
            </p>
            <button
              type="button"
              className={styles.accountAction}
              onClick={async () => {
                await signOut();
                navigate('/');
              }}
            >
              <LogOut size={18} aria-hidden="true" /> Sign out
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

/** Sidebar shelves double as drop targets: drag any book onto a shelf name to move it there. */
function SidebarShelf({ shelf, count }: { shelf: Shelf; count: number }) {
  const drop = useShelfDroppable(shelf.id, 'sidebar');
  return (
    <li ref={drop.ref} className={styles.dropItem} data-candidate={drop.isCandidate || undefined} data-over={drop.isOver || undefined}>
      <NavLink to={`/shelves/${shelf.id}`} className={navClass}>
        <BookMarked size={18} aria-hidden="true" />
        <span className={styles.shelfName}>{shelf.name}</span>
        <span className={styles.count}>
          {count}
          {' '}<span className="u-sr-only">books</span>
        </span>
      </NavLink>
    </li>
  );
}

function NewShelfInline() {
  const { createShelf } = useLibrary();
  const { announce } = useAnnouncer();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setName('');
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const shelf = await createShelf(name);
    announce(`Shelf “${shelf.name}” created.`);
    setOpen(false);
    setName('');
    navigate(`/shelves/${shelf.id}`);
  };

  if (!open) {
    return (
      <button ref={triggerRef} type="button" className={styles.newShelf} onClick={() => setOpen(true)}>
        <Plus size={18} aria-hidden="true" /> New shelf
      </button>
    );
  }

  return (
    <form className={styles.newShelfForm} onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && close()}>
      <label htmlFor="new-shelf-name" className="u-sr-only">
        New shelf name
      </label>
      <input
        id="new-shelf-name"
        ref={inputRef}
        value={name}
        maxLength={60}
        placeholder="Shelf name"
        onChange={(e) => setName(e.target.value)}
        className={styles.newShelfInput}
      />
      <button type="submit" className={styles.iconButton} disabled={!name.trim()}>
        <Plus size={18} aria-hidden="true" />
        <span className="u-sr-only">Create shelf</span>
      </button>
      <button type="button" className={styles.iconButton} onClick={close}>
        <X size={18} aria-hidden="true" />
        <span className="u-sr-only">Cancel</span>
      </button>
    </form>
  );
}

function MobileHeader() {
  return (
    <header className={styles.mobileHeader}>
      <Link to="/library" className={styles.brand}>
        <Logo />
      </Link>
      <Link to="/library/search" className={styles.headerIcon}>
        <Search size={22} aria-hidden="true" />
        <span className="u-sr-only">Search your library</span>
      </Link>
    </header>
  );
}

function BottomNav() {
  const { status } = useSession();
  return (
    <nav className={styles.bottomNav} aria-label="Main">
      <NavLink to="/library" end className={bottomClass}>
        <Library size={22} aria-hidden="true" />
        Library
      </NavLink>
      <NavLink to="/shelves" className={bottomClass}>
        <BookMarked size={22} aria-hidden="true" />
        Shelves
      </NavLink>
      <NavLink to="/discover" className={bottomClass}>
        <Compass size={22} aria-hidden="true" />
        Discover
      </NavLink>
      <NavLink to="/review" className={bottomClass}>
        <CalendarHeart size={22} aria-hidden="true" />
        Review
      </NavLink>
      <NavLink to="/account" className={bottomClass}>
        <UserRound size={22} aria-hidden="true" />
        {status === 'guest' ? 'Guest' : 'Account'}
      </NavLink>
    </nav>
  );
}

function GuestBanner() {
  const { status } = useSession();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(BANNER_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (status !== 'guest' || dismissed) return null;

  return (
    <aside className={styles.guestBanner} aria-label="Guest mode">
      <Sparkles size={18} aria-hidden="true" className={styles.guestIcon} />
      <p>
        You’re exploring a sample library. Add books, move them around, rate them — changes last until you close this
        tab. <Link to="/signup">Create a free account</Link> to keep a library of your own.
      </p>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem(BANNER_KEY, '1');
          } catch {
            /* ignore */
          }
        }}
      >
        <X size={18} aria-hidden="true" />
        <span className="u-sr-only">Dismiss guest notice</span>
      </button>
    </aside>
  );
}

function countByShelf(entries: { shelfId: string }[]) {
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.shelfId, (map.get(e.shelfId) ?? 0) + 1);
  return map;
}

const navClass = ({ isActive }: { isActive: boolean }) => `${styles.navLink} ${isActive ? styles.active : ''}`;
const bottomClass = ({ isActive }: { isActive: boolean }) => `${styles.bottomLink} ${isActive ? styles.active : ''}`;
