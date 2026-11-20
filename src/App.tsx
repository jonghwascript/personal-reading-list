import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell/AppShell';
import { BookGridSkeleton } from './components/BookGrid/BookGrid';
import { Button, ButtonLink } from './components/ui/Button';
import { LandingPage } from './pages/LandingPage/LandingPage';
import { LibraryPage } from './pages/LibraryPage/LibraryPage';
import page from './pages/Page.module.css';
import { AnnouncerProvider } from './state/AnnouncerContext';
import { LibraryProvider, useLibrary } from './state/LibraryContext';
import { SessionProvider, useSession } from './state/SessionContext';

// The landing page and library (the two first screens) ship in the main bundle; every other screen
// is split into its own chunk and fetched on first visit.
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const DiscoverPage = named(() => import('./pages/DiscoverPage/DiscoverPage'), 'DiscoverPage');
const ShelvesPage = named(() => import('./pages/ShelvesPage/ShelvesPage'), 'ShelvesPage');
const ShelfPage = named(() => import('./pages/ShelfPage/ShelfPage'), 'ShelfPage');
const BookDetailPage = named(() => import('./pages/BookDetailPage/BookDetailPage'), 'BookDetailPage');
const YearReviewPage = named(() => import('./pages/YearReviewPage/YearReviewPage'), 'YearReviewPage');
const AccountPage = named(() => import('./pages/AccountPage/AccountPage'), 'AccountPage');
const SignInPage = named(() => import('./pages/AuthPages/AuthPages'), 'SignInPage');
const SignUpPage = named(() => import('./pages/AuthPages/AuthPages'), 'SignUpPage');
const ForgotPasswordPage = named(() => import('./pages/AuthPages/AuthPages'), 'ForgotPasswordPage');
const ResetPasswordPage = named(() => import('./pages/AuthPages/AuthPages'), 'ResetPasswordPage');

export function App() {
  return (
    // BASE_URL is "/" locally and on Vercel, "/personal-reading-list/" on GitHub Pages.
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AnnouncerProvider>
        <SessionProvider>
          <Suspense fallback={<FullPageLoading />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/guest" element={<EnterGuest />} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route
              element={
                <RequireLibrary>
                  <AppShell />
                </RequireLibrary>
              }
            >
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/shelves" element={<ShelvesPage />} />
              <Route path="/shelves/:shelfId" element={<ShelfPage />} />
              <Route path="/books/:entryId" element={<BookDetailPage />} />
              <Route path="/review" element={<YearReviewPage />} />
              <Route path="/review/:year" element={<YearReviewPage />} />
              <Route path="/account" element={<AccountPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </SessionProvider>
      </AnnouncerProvider>
    </BrowserRouter>
  );
}

/** `/guest` is the URL shared in portfolios: one hop straight into the sample library. */
function EnterGuest() {
  const { status, startGuest } = useSession();
  useEffect(() => {
    if (status === 'signed-out' || status === 'loading') startGuest();
  }, [status, startGuest]);
  if (status !== 'guest' && status !== 'account') return <FullPageLoading />;
  return <Navigate to="/library" replace />;
}

/** Protected area: guests and signed-in users only; everyone else goes to sign-in. */
function RequireLibrary({ children }: { children: ReactNode }) {
  const { status, repository } = useSession();
  const location = useLocation();
  if (status === 'loading') return <FullPageLoading />;
  if (!repository) return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />;
  return (
    <LibraryProvider key={repository.kind} repository={repository}>
      <LibraryGate>{children}</LibraryGate>
    </LibraryProvider>
  );
}

function LibraryGate({ children }: { children: ReactNode }) {
  const { load, reload } = useLibrary();
  if (load.status === 'loading') return <FullPageLoading />;
  if (load.status === 'error') {
    return (
      <main className={page.centered}>
        <div className={page.errorBox} role="alert">
          <h1>We couldn’t load your library</h1>
          <p>Your books are safe — we just couldn’t reach the database. ({load.message})</p>
          <Button variant="primary" onClick={() => void reload()}>
            Try again
          </Button>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}

function FullPageLoading() {
  return (
    <main style={{ padding: 'var(--space-10) var(--space-4)', maxWidth: 'var(--library-max-width)', margin: '0 auto' }}>
      <BookGridSkeleton count={10} label="Loading your library" />
    </main>
  );
}

function NotFound() {
  return (
    <main className={page.centered}>
      <div style={{ display: 'grid', gap: 'var(--space-4)', justifyItems: 'center', textAlign: 'center', padding: 'var(--space-6)' }}>
        <p className={page.eyebrow}>404</p>
        <h1 className={page.title}>This page is missing from the shelf</h1>
        <p>It may have been moved, or the link might be mistyped.</p>
        <ButtonLink to="/" variant="primary">
          Back to Bookshelf
        </ButtonLink>
      </div>
    </main>
  );
}
