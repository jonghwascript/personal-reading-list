import { ArrowRight, BookMarked, ChartNoAxesColumn, Search, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import sampleBooks from '../../../data/sample-books.json';
import { BookCover } from '../../components/BookCover/BookCover';
import { Logo } from '../../components/Logo/Logo';
import { Button, ButtonLink } from '../../components/ui/Button';
import { usePageTitle } from '../../lib/usePageTitle';
import { useSession } from '../../state/SessionContext';
import styles from './LandingPage.module.css';

type Sample = { title: string; author: string; coverUrl: string | null };
const books = sampleBooks as Sample[];
const pick = (title: string) => {
  const b = books.find((s) => s.title.startsWith(title))!;
  return { title: b.title, authors: [b.author], coverUrl: b.coverUrl };
};

// Hand-picked for colour variety across the collage; Piranesi shows off the styled placeholder.
const HERO = ['Project Hail Mary', 'Circe', 'The Great Gatsby', 'Dune', 'Educated', 'Piranesi', 'The Fifth Season', 'Atomic Habits', 'Normal People'].map(pick);
const SHELF = ['Neuromancer', 'Born a Crime', 'The Left Hand of Darkness', 'The Pragmatic Programmer', '1984', 'Beloved'].map(pick);

const FEATURES = [
  { Icon: Search, title: 'Find any book', body: 'Search millions of titles by name, author or ISBN — covers and details filled in for you.' },
  { Icon: BookMarked, title: 'Shelves that feel like yours', body: 'Want to Read, Currently Reading, Read — plus shelves for favourites, book clubs and loans.' },
  { Icon: Target, title: 'Goals without guilt', body: 'Set a yearly target and see, at a glance, whether you’re ahead, on track, or due a short read.' },
  { Icon: ChartNoAxesColumn, title: 'Your year in books', body: 'Books per month, genres, pages and pace — a reading year worth looking back on.' },
];

export function LandingPage() {
  usePageTitle('');
  const { status, startGuest } = useSession();
  const navigate = useNavigate();
  const inSession = status === 'guest' || status === 'account';

  const tryGuest = () => {
    startGuest();
    navigate('/library');
  };

  return (
    <div className={styles.page}>
      <a href="#main" className="u-skip-link">
        Skip to content
      </a>
      <header className={styles.nav}>
        <Logo />
        <nav aria-label="Account" className={styles.navLinks}>
          {inSession ? (
            <ButtonLink to="/library" variant="primary" size="sm">
              Open my library
            </ButtonLink>
          ) : (
            <>
              <ButtonLink to="/signin" variant="ghost" size="sm">
                Sign in
              </ButtonLink>
              <ButtonLink to="/signup" variant="secondary" size="sm">
                Sign up
              </ButtonLink>
            </>
          )}
        </nav>
      </header>

      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>A personal reading tracker</p>
            <h1 id="hero-title" className={styles.heroTitle}>
              Your reading life, <em>beautifully organized.</em>
            </h1>
            <p className={styles.heroLede}>
              Track what you’re reading, shelve what you’ve loved, and watch your year in books take shape. No feeds, no
              ads, no strangers’ opinions — just you and your books.
            </p>
            <div className={styles.ctas}>
              <ButtonLink to="/signup" variant="primary" size="lg">
                Sign up — it’s free
              </ButtonLink>
              <Button variant="secondary" size="lg" onClick={tryGuest} icon={<ArrowRight />}>
                Try as guest
              </Button>
            </div>
            <p className={styles.ctaNote}>The guest library comes stocked with 45 real books. No account needed.</p>
          </div>

          <div className={styles.collage} aria-hidden="true">
            {HERO.map((book, i) => (
              <div key={book.title} className={styles.collageItem} style={{ '--i': i } as React.CSSProperties}>
                <BookCover book={book} size="M" priority={i < 6} />
              </div>
            ))}
          </div>
        </section>

        <section className={styles.features} aria-labelledby="features-title">
          <h2 id="features-title" className="u-sr-only">
            What Bookshelf does
          </h2>
          <ul role="list" className={styles.featureList}>
            {FEATURES.map(({ Icon, title, body }) => (
              <li key={title} className={styles.feature}>
                <span className={styles.featureIcon} aria-hidden="true">
                  <Icon size={22} />
                </span>
                <h3 className={styles.featureTitle}>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.showcase} aria-labelledby="showcase-title">
          <div className={styles.showcaseCopy}>
            <h2 id="showcase-title" className={styles.sectionTitle}>
              A library that looks as good as the one at home
            </h2>
            <p>
              Real covers, warm typography, and room to breathe. Missing covers get a hand-set placeholder instead of a
              broken image, so every shelf keeps its rhythm.
            </p>
          </div>
          <figure className={styles.mock}>
            <div className={styles.mockHeader}>
              <span className={styles.mockTitle}>Read this year</span>
              <span className={styles.mockGoal}>
                <span className={styles.mockGoalValue}>21</span> of 24 · On track
              </span>
            </div>
            <div className={styles.mockShelf}>
              {SHELF.map((book) => (
                <div key={book.title} className={styles.mockBook}>
                  <BookCover book={book} size="M" />
                </div>
              ))}
            </div>
            <figcaption className="u-sr-only">A preview of a Read shelf with six book covers and a reading goal of 21 of 24 books.</figcaption>
          </figure>
        </section>

        <section className={styles.closing} aria-labelledby="closing-title">
          <h2 id="closing-title" className={styles.sectionTitle}>
            Start with the book on your nightstand.
          </h2>
          <div className={styles.ctas}>
            <ButtonLink to="/signup" variant="primary" size="lg">
              Create your library
            </ButtonLink>
            <Button variant="secondary" size="lg" onClick={tryGuest}>
              Explore the sample library
            </Button>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>
          Book data from <a href="https://openlibrary.org">Open Library</a>. Built for the Frontend Mentor product
          challenge.
        </p>
      </footer>
    </div>
  );
}
