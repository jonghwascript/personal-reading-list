import { ArrowRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import sampleBooks from '../../../data/sample-books.json';
import { BookCover } from '../../components/BookCover/BookCover';
import { Logo } from '../../components/Logo/Logo';
import { SpineFace, spineStyle } from '../../components/SpineShelf/SpineShelf';
import { Button, ButtonLink } from '../../components/ui/Button';
import { canAnimate, gsap, useGSAP } from '../../lib/motion';
import { usePageTitle } from '../../lib/usePageTitle';
import { useSession } from '../../state/SessionContext';
import styles from './LandingPage.module.css';

type Sample = { title: string; author: string; coverUrl: string | null; pageCount: number | null };
const books = sampleBooks as Sample[];
const pick = (title: string) => books.find((s) => s.title.startsWith(title))!;

/** The hero shelf: two planks of real sample books, in an order that mixes colours and heights. */
const SHELF_ROWS = [
  ['The Great Gatsby', 'Circe', 'Dune', 'Beloved', 'Normal People', 'Neuromancer', 'Educated', 'The Road', 'Piranesi', '1984', 'Range', 'The Fifth Season', 'Born a Crime'],
  ['Project Hail Mary', 'Quiet', 'The Left Hand of Darkness', 'Atomic Habits', 'The Name of the Wind', 'Deep Work', 'Pride and Prejudice', 'Children of Time', 'Sapiens', 'The Dispossessed', 'Ancillary Justice', 'A Gentleman in Moscow'],
].map((row) => row.map(pick));

/** A couple of books lean on their neighbours, the way real shelves never stand perfectly straight. */
const LEANING: Record<string, string> = { Piranesi: '-7deg', 'Children of Time': '6deg' };

/**
 * What Bookshelf does, told one book at a time (the A24 / Stripe Press idea: objects that turn as
 * you scroll). Each chapter's book arrives spine-first and turns to show its cover; the ledger
 * beside it reads like a library catalogue card.
 */
const CHAPTERS = [
  {
    book: 'Project Hail Mary',
    title: 'Find any book',
    body: 'Search Open Library by title, author or ISBN. Choose the edition you own, and the page count every percentage is built on comes with it.',
    ledger: [
      ['Search by', 'Title · Author · ISBN'],
      ['Editions', 'Pick yours when there are several'],
    ],
  },
  {
    book: 'Circe',
    title: 'Shelve it your way',
    body: 'Want to Read, Currently Reading, Read — and shelves of your own. Drag a book to move it, or see any shelf side-on, as spines.',
    ledger: [
      ['Move', 'Drag, keyboard, or one menu'],
      ['Undo', 'Every move'],
    ],
  },
  {
    book: 'Piranesi',
    title: 'Log a page in seconds',
    body: 'The last page you read, a percentage, or where you paused the audiobook. One field, a few seconds to undo, and a clear “Mark as finished” at the end.',
    ledger: [
      ['Formats', 'Print · E-book · Audio'],
      ['Streaks', 'None. No guilt.'],
    ],
  },
  {
    book: 'Dune',
    title: 'Look back on your year',
    body: 'Books per month, genres, pages and your goal, told as a short scroll story — with a card to share when the year is done.',
    ledger: [
      ['Goal', 'Yearly, and yours to change'],
      ['Share', 'An image card'],
    ],
  },
].map((c) => ({ ...c, sample: pick(c.book) }));

export function LandingPage() {
  usePageTitle('');
  const { status, startGuest } = useSession();
  const navigate = useNavigate();
  const inSession = status === 'guest' || status === 'account';
  const heroRef = useRef<HTMLElement>(null);
  const chaptersRef = useRef<HTMLElement>(null);

  // Intro: copy rises line by line while the spines are slid onto their planks, left to right.
  // useGSAP runs before first paint, so nothing flashes; reduced motion skips it entirely.
  useGSAP(
    () => {
      if (!canAnimate()) return;
      const q = gsap.utils.selector(heroRef);
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from(q('[data-enter="kicker"]'), { y: 14, opacity: 0, duration: 0.5 })
        .from(q('[data-enter="line"]'), { y: 32, opacity: 0, duration: 0.8, stagger: 0.12 }, '-=0.2')
        .from(q('[data-enter="lede"], [data-enter="ledger"]'), { y: 16, opacity: 0, duration: 0.6, stagger: 0.1 }, '-=0.45')
        .from(q('[data-enter="cta"] > *'), { y: 14, opacity: 0, duration: 0.5, stagger: 0.08 }, '-=0.35')
        .from(q('[data-enter="spine"]'), { yPercent: 105, duration: 0.7, ease: 'back.out(1.4)', stagger: { each: 0.03, from: 'start' } }, 0.15);
    },
    { scope: heroRef },
  );

  useChapterMotion(chaptersRef);

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
        <section ref={heroRef} className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <p className={styles.kicker} data-enter="kicker">
              A personal reading tracker
            </p>
            <h1 id="hero-title" className={styles.heroTitle}>
              <span className={styles.heroLine} data-enter="line">
                Your reading life,
              </span>{' '}
              <em data-enter="line">shelved.</em>
            </h1>
            <p className={styles.heroLede} data-enter="lede">
              Track what you’re reading, shelve what you’ve loved, and watch your year in books take shape. No feeds, no
              ads, no strangers’ opinions — just you and your books.
            </p>
            <dl className={styles.ledger} data-enter="ledger">
              <div>
                <dt>Shelves</dt>
                <dd>Want to Read · Reading · Read · your own</dd>
              </div>
              <div>
                <dt>Progress</dt>
                <dd>Pages, percent or listening time</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>Free. No account needed to try.</dd>
              </div>
            </dl>
            <div className={styles.ctas} data-enter="cta">
              <ButtonLink to="/signup" variant="primary" size="lg">
                Sign up — it’s free
              </ButtonLink>
              <Button variant="secondary" size="lg" onClick={tryGuest} icon={<ArrowRight />}>
                Try as guest
              </Button>
            </div>
            <p className={styles.ctaNote}>The guest library comes stocked with 45 real books.</p>
          </div>

          <div className={styles.shelf} aria-hidden="true">
            {SHELF_ROWS.map((row, r) => (
              <div key={r} className={styles.plank}>
                {row.map((b) => (
                  <div key={b.title} className={styles.slot} style={spineStyle(b.title, b.pageCount)}>
                    <div className={styles.heroSpine} data-enter="spine" style={{ rotate: LEANING[b.title.split(':')[0]!] }}>
                      <SpineFace title={b.title.split(':')[0]!} author={b.author} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section ref={chaptersRef} className={styles.chapters} aria-labelledby="chapters-title">
          <h2 id="chapters-title" className="u-sr-only">
            What Bookshelf does
          </h2>
          {CHAPTERS.map((c, i) => (
            <article key={c.title} className={styles.chapter} data-chapter="" aria-labelledby={`chapter-${i}`}>
              <div className={styles.chapterCopy} data-chapter-copy="">
                <p className={styles.chapterNumber} aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </p>
                <h3 id={`chapter-${i}`} className={styles.chapterTitle}>
                  {c.title}
                </h3>
                <p className={styles.chapterBody}>{c.body}</p>
                <dl className={styles.ledger}>
                  {c.ledger.map(([term, value]) => (
                    <div key={term}>
                      <dt>{term}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className={styles.stage} aria-hidden="true">
                <Book3D sample={c.sample} />
              </div>
            </article>
          ))}
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
          Book data and covers from <a href="https://openlibrary.org">Open Library</a>. Built for the Frontend Mentor product
          challenge. <Link to="/accessibility">Accessibility statement</Link>.
        </p>
      </footer>
    </div>
  );
}

/** A book with real depth: cover in front, cloth spine on the left, page edges on the right. */
function Book3D({ sample }: { sample: Sample }) {
  const title = sample.title.split(':')[0]!;
  return (
    <div className={styles.book} data-book="" style={spineStyle(title, sample.pageCount)}>
      <div className={styles.bookFront}>
        <BookCover book={{ title, authors: [sample.author], coverUrl: sample.coverUrl }} size="L" />
      </div>
      <div className={styles.bookSpine}>
        <SpineFace title={title} author={sample.author} />
      </div>
      <div className={styles.bookPages} />
    </div>
  );
}

/**
 * As each chapter scrolls up, its book turns from spine-on to cover-on and its copy rises in.
 * Scrubbed to the scroll position, so scrolling back turns it back. ScrollTrigger is fetched on
 * demand to keep it out of the landing bundle; without motion the books simply rest at an angle.
 */
function useChapterMotion(scope: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!canAnimate() || !scope.current) return;
    let ctx: gsap.Context | undefined;
    let cancelled = false;
    void import('gsap/ScrollTrigger').then(({ ScrollTrigger }) => {
      if (cancelled || !scope.current) return;
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        gsap.utils.toArray<HTMLElement>('[data-chapter]').forEach((chapter) => {
          const scrollTrigger = { trigger: chapter, start: 'top 85%', end: 'center 55%', scrub: 0.6 };
          gsap.fromTo(chapter.querySelector('[data-book]'), { rotateY: 88, y: 48 }, { rotateY: 18, y: 0, ease: 'power2.out', scrollTrigger });
          gsap.from(chapter.querySelector('[data-chapter-copy]'), { opacity: 0, y: 32, ease: 'power2.out', scrollTrigger: { ...scrollTrigger, end: 'top 45%' } });
        });
      }, scope.current);
    });
    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, [scope]);
}
