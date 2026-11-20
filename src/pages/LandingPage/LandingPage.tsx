import { ArrowRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import sampleBooks from '../../../data/sample-books.json';
import { BookCover } from '../../components/BookCover/BookCover';
import { Logo } from '../../components/Logo/Logo';
import { SpineFace, spineStyle } from '../../components/SpineShelf/SpineShelf';
import { Button, ButtonLink } from '../../components/ui/Button';
import { afterLoad } from '../../lib/afterLoad';
import { canAnimate, EASE } from '../../lib/motion';
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
  // A layout effect runs before first paint, so nothing flashes; reduced motion skips it entirely.
  // The headline and lede only move — never fade from 0 — so they still count as painted at once
  // (they are the page's Largest Contentful Paint). Times in ms from the start of the intro.
  useLayoutEffect(() => {
    const hero = heroRef.current;
    if (!hero || !canAnimate()) return;
    const all = (selector: string) => [...hero.querySelectorAll<HTMLElement>(selector)];
    const rise = (els: HTMLElement[], at: number, y: number, duration: number, opts: { fade?: boolean; stagger?: number; easing?: string } = {}) =>
      els.map((el, i) =>
        el.animate([{ transform: `translateY(${y}px)`, ...(opts.fade ? { opacity: 0 } : {}) }, { transform: 'none', ...(opts.fade ? { opacity: 1 } : {}) }], {
          duration,
          delay: at + i * (opts.stagger ?? 0),
          easing: opts.easing ?? EASE.outStrong,
          fill: 'backwards',
        }),
      );
    const animations = [
      ...rise(all('[data-enter="kicker"]'), 0, 14, 500, { fade: true }),
      ...rise(all('[data-enter="line"]'), 300, 24, 800, { stagger: 120 }),
      ...rise(all('[data-enter="lede"]'), 770, 12, 600),
      ...rise(all('[data-enter="ledger"]'), 970, 16, 600, { fade: true }),
      ...rise(all('[data-enter="cta"] > *'), 1220, 14, 500, { fade: true, stagger: 80 }),
      // Spines slide up out of their planks (which clip them), left to right.
      ...all('[data-enter="spine"]').map((el, i) =>
        el.animate([{ transform: 'translateY(105%)' }, { transform: 'none' }], { duration: 700, delay: 150 + i * 30, easing: EASE.back, fill: 'backwards' }),
      ),
    ];
    return () => animations.forEach((a) => a.cancel());
  }, []);

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
        {/* M is plenty at this size, and keeps these below-the-fold covers off the first paint's network. */}
        <BookCover book={{ title, authors: [sample.author], coverUrl: sample.coverUrl }} size="M" />
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
 * Scrubbed to the scroll position, so scrolling back turns it back. GSAP and ScrollTrigger are
 * fetched after the page has loaded, keeping them off the first paint (the chapters sit below the
 * fold); until then, and without motion, the books simply rest at an angle with their covers showing.
 */
function useChapterMotion(scope: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!canAnimate() || !scope.current) return;
    let ctx: gsap.Context | undefined;
    let cancelled = false;
    const cancelLoad = afterLoad(() => void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([{ gsap }, { ScrollTrigger }]) => {
      if (cancelled || !scope.current) return;
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        gsap.utils.toArray<HTMLElement>('[data-chapter]').forEach((chapter) => {
          const scrollTrigger = { trigger: chapter, start: 'top 85%', end: 'center 55%', scrub: 0.6 };
          gsap.fromTo(chapter.querySelector('[data-book]'), { rotateY: 88, y: 48 }, { rotateY: 18, y: 0, ease: 'power2.out', scrollTrigger });
          gsap.from(chapter.querySelector('[data-chapter-copy]'), { opacity: 0, y: 32, ease: 'power2.out', scrollTrigger: { ...scrollTrigger, end: 'top 45%' } });
        });
      }, scope.current);
    }));
    return () => {
      cancelled = true;
      cancelLoad();
      ctx?.revert();
    };
  }, [scope]);
}
