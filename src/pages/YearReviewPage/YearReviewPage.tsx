import { BookOpen, Download, Share2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useNavigationType, useParams } from 'react-router-dom';
import { BookCover } from '../../components/BookCover/BookCover';
import { StarRating } from '../../components/StarRating/StarRating';
import { Button, ButtonLink } from '../../components/ui/Button';
import { formatAuthors, formatDate, pluralize } from '../../lib/format';
import { canvasToBlob, drawShareCard } from '../../lib/shareCard';
import { usePageTitle } from '../../lib/usePageTitle';
import { buildYearReview, MONTHS, reviewSentence, yearsWithFinishedBooks, type YearReview } from '../../lib/yearReview';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useLibrary } from '../../state/LibraryContext';
import { useSession } from '../../state/SessionContext';
import type { LibraryEntry } from '../../types';
import styles from './YearReviewPage.module.css';
import { useReviewMotion } from './useReviewMotion';
import { isDarkThemeActive } from '../../lib/theme';

/**
 * Design challenge #1. Starts from the books themselves — covers and one sentence — so a reader
 * with three books gets a story, not a sparse dashboard. Charts sit below for those who want them.
 */
const listReturn = new Map<string, number>();

export function YearBooksPage() {
  return <YearReviewPage full />;
}

export function YearReviewPage({ full = false }: { full?: boolean }) {
  const { year: yearParam } = useParams();
  const { entries } = useLibrary();
  const { status } = useSession();
  const navigationType = useNavigationType();
  const location = useLocation();
  const navigate = useNavigate();
  const now = new Date();
  const year = yearParam ? Number(yearParam) : now.getFullYear();
  usePageTitle(`${year} in books`);

  const review = useMemo(() => buildYearReview(entries, year, now), [entries, year]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageRef = useRef<HTMLDivElement>(null);
  const fullListRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const top = listReturn.get(location.key);
    if (full || navigationType !== 'POP' || top === undefined) return;
    listReturn.delete(location.key);
    const frame = requestAnimationFrame(() => {
      fullListRef.current?.focus({ preventScroll: true });
      window.scrollTo(0, top);
    });
    return () => cancelAnimationFrame(frame);
  }, [full, navigationType, location.key]);
  // Re-run the scroll story when the year or its book count changes.
  useReviewMotion(pageRef, `${year}:${review.finished.length}`);
  const years = useMemo(() => {
    const set = new Set(yearsWithFinishedBooks(entries));
    set.add(now.getFullYear());
    return [...set].sort((a, b) => a - b);
  }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!Number.isInteger(year) || year < 1900 || year > now.getFullYear()) return <Navigate to="/review" replace />;

  if (full) return (
    <div className={styles.page}>
      <Link to={`/review/${year}`} onClick={(event) => {
        if (!location.state?.fromReview || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        void navigate(-1);
      }}>Back to the {year} review</Link>
      <h1>Books finished in {year}</h1>
      <BooksByMonth review={review} />
    </div>
  );

  return (
    <div className={styles.page} ref={pageRef}>
      <Hero review={review} years={years} />
      {review.finished.length > 6 && <Link ref={fullListRef} to={`/review/${year}/books`} state={{ fromReview: true }} onClick={(event) => {
        if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          listReturn.clear();
          listReturn.set(location.key, window.scrollY);
        }
      }}>View all finished books</Link>}
      {review.finished.length > 1 && <MonthChart review={review} />}
      {review.finished.length > 0 && <ReviewSharing key={year} review={review} />}
      {status === 'guest' && <section>
        <h2>Start your own reading record</h2>
        <p>Create an account to save your books and goals. Your personal shelves start empty.</p>
        <ButtonLink to={`/signup?review=${year}`} variant="primary">Create an account</ButtonLink>
      </section>}
    </div>
  );
}

function Hero({ review, years }: { review: YearReview; years: number[] }) {
  const { entries, shelves, goals, moveEntries } = useLibrary();
  const navigate = useNavigate();
  const [startError, setStartError] = useState(false);
  const n = review.finished.length;
  const eyebrow = review.isCurrentYear
    ? `${review.year} so far · as of ${MONTHS[review.asOf!.getMonth()]} ${review.asOf!.getDate()}`
    : `Your ${review.year} in books`;

  const readingShelf = shelves.find((s) => s.kind === 'reading');
  const reading = entries.filter((e) => e.shelfId === readingShelf?.id);
  const wantShelf = shelves.find((s) => s.kind === 'want');
  const wanted = entries.filter((entry) => entry.shelfId === wantShelf?.id)
    .sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt)).slice(0, 3);
  const goal = goals.find((item) => item.year === review.year);

  return (
    <section className={styles.hero} aria-labelledby="review-title">
      <label className={styles.yearNav}>
        Year <select value={review.year} onChange={(event) => navigate(`/review/${event.target.value}`)}>
          {[...years].reverse().map((year) => <option key={year}>{year}</option>)}
        </select>
      </label>

      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1 id="review-title" className={styles.headline}>
        {n === 0 ? (
          review.isCurrentYear ? (
            <>Your {review.year} is just getting started</>
          ) : (
            <>No finished books logged for {review.year}</>
          )
        ) : (
          <>
            {/* The visible number counts up (aria-hidden); assistive tech reads the final value at once. */}
            <span className={styles.bigNumber} aria-hidden="true" data-anim="count" data-count={n}>
              {n}
            </span>
            <span className="u-sr-only">{n}</span> {n === 1 ? 'book' : 'books'} finished
          </>
        )}
      </h1>

      {n > 0 && <p className={styles.sentence}>{reviewSentence(review)}</p>}
      {goal && <p>{n} / {goal.target} books toward your goal</p>}

      {n === 0 && review.isCurrentYear && (
        <div className={styles.emptyActions}>
          {reading[0] ? (
            <>
              <p className={styles.sentence}>
                The first finish is closer than it looks — you’re partway through <cite>{reading[0].book.title}</cite>.
              </p>
              <ButtonLink to={`/books/${reading[0].id}`} variant="primary" icon={<BookOpen />}>
                Back to {reading[0].book.title}
              </ButtonLink>
            </>
          ) : wanted.length && readingShelf && wantShelf ? (
            <>
              <ul>
                {wanted.map((entry) => <li key={entry.id}>
                  <Link to={`/books/${entry.id}`}><BookCover book={entry.book} size="S" />{entry.book.title}</Link>
                  <Button onClick={() => {
                    setStartError(false);
                    void moveEntries([entry.id], readingShelf.id).catch(() => setStartError(true));
                  }}>Start reading</Button>
                </li>)}
              </ul>
              <Link to={`/shelves/${wantShelf.id}`}>View all Want to Read books</Link>
              {startError && <p role="alert">Couldn’t move this book. Please try again.</p>}
            </>
          ) : (
            <>
              <p className={styles.sentence}>Finish a book and it will appear here, along with the month you closed it.</p>
              <ButtonLink to={entries.length ? '/library' : '/discover'} variant="primary">
                {entries.length ? 'View your library' : 'Add your first book'}
              </ButtonLink>
            </>
          )}
        </div>
      )}

      {n > 0 && (
        <ul role="list" className={`${styles.covers} ${styles.coversAll}`} aria-label="Books finished">
          {[...review.finished].reverse().slice(0, 6).map((entry, i) => (
            <li key={entry.id} className={styles.coverItem} style={{ '--i': i } as React.CSSProperties}>
              <Link to={`/books/${entry.id}`} className={styles.coverLink}>
                <BookCover book={entry.book} size="L" priority />
                <span className={styles.coverCaption}>
                  {entry.finishedAt && <span className={styles.coverMonth}>{formatDate(entry.finishedAt)}</span>}
                  <span className={styles.coverTitle}>{entry.book.title}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

    </section>
  );
}

function ReviewSharing({ review }: { review: YearReview }) {
  const [sharing, setSharing] = useState(false);
  return (
    <section aria-label="Share this year">
      <div className={styles.heroActions}>
        <Button variant="secondary" icon={sharing ? <X /> : <Share2 />} aria-expanded={sharing}
          aria-controls={sharing ? 'share-panel' : undefined} onClick={() => setSharing(!sharing)}>
          {sharing ? 'Close sharing' : 'Share as an image'}
        </Button>
      </div>
      {sharing && <SharePanel review={review} />}
    </section>
  );
}

const SHARE_MAX = 10;

/** Preview first, then download — the reader sees and chooses exactly which books go public. */
function SharePanel({ review }: { review: YearReview }) {
  const { notify } = useAnnouncer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const id = useId();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(review.featured.slice(0, SHARE_MAX).map((e) => e.id)));
  const [rendering, setRendering] = useState(true);
  const chosen = review.finished.filter((e) => selected.has(e.id));

  useEffect(() => {
    let cancelled = false;
    setRendering(true);
    drawShareCard(canvasRef.current!, {
      year: review.year,
      count: review.finished.length,
      isCurrentYear: review.isCurrentYear,
      asOf: review.asOf,
      books: chosen.map((e) => e.book),
      theme: isDarkThemeActive() ? 'dark' : 'light',
    }).finally(() => {
      if (!cancelled) setRendering(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selected, review]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async () => {
    const blob = await canvasToBlob(canvasRef.current!);
    if (!blob) {
      notify('Couldn’t create the image — a cover may have blocked export. Try leaving that book out.', 'error');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookshelf-${review.year}.png`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Image downloaded.', 'success');
  };

  return (
    <div id="share-panel" className={styles.share}>
      <figure className={styles.preview}>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
        <figcaption className={styles.previewCaption} aria-live="polite">
          {rendering ? 'Drawing preview…' : `Preview · ${pluralize(chosen.length, 'cover')} · 1080 × 1080`}
        </figcaption>
      </figure>
      <div className={styles.shareControls}>
        <fieldset className={styles.pickList}>
          <legend className={styles.pickLegend}>
            Covers on the image <span>({chosen.length} of up to {SHARE_MAX})</span>
          </legend>
          <ul role="list">
            {review.finished.map((entry) => {
              const checked = selected.has(entry.id);
              return (
                <li key={entry.id}>
                  <label className={styles.pick}>
                    <input
                      type="checkbox"
                      name={`${id}-book`}
                      checked={checked}
                      disabled={!checked && selected.size >= SHARE_MAX}
                      onChange={() =>
                        setSelected((prev) => {
                          const nextSet = new Set(prev);
                          if (nextSet.has(entry.id)) nextSet.delete(entry.id);
                          else nextSet.add(entry.id);
                          return nextSet;
                        })
                      }
                    />
                    {entry.book.title}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        <p className={styles.shareNote}>Only the covers you tick, your book count and the year are shown — no ratings or notes.</p>
        <Button variant="primary" icon={<Download />} onClick={download} disabled={rendering}>
          Download image
        </Button>
      </div>
    </div>
  );
}

function MonthChart({ review }: { review: YearReview }) {
  const max = Math.max(1, ...review.byMonth);
  return (
    <section className={styles.section} aria-labelledby="months-title">
      <h2 id="months-title" className={styles.sectionTitle}>
        Month by month
      </h2>
      {review.isCurrentYear && <p>{MONTHS[review.monthsElapsed - 1]}: {review.byMonth[review.monthsElapsed - 1]} finished so far · counting in progress</p>}
      <div className={styles.chart} style={{ gridTemplateColumns: `repeat(${review.monthsElapsed}, minmax(0, 1fr))` }} aria-hidden="true" data-anim="chart">
        {review.byMonth.slice(0, review.monthsElapsed).map((count, m) => {
          return (
            <div key={m} className={styles.bar} data-top={review.topMonth?.month === m}>
              <span className={styles.barValue}>{count}</span>
              <span className={styles.barFill} data-anim="bar" style={{ blockSize: `${(count / max) * 100}%` }} />
              <span className={styles.barLabel}>{MONTHS[m]!.slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
      {/* The same data as a table for screen readers. */}
      <table className="u-sr-only">
        <caption>Books finished per month in {review.year}</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Books finished</th>
          </tr>
        </thead>
        <tbody>
          {review.byMonth.slice(0, review.monthsElapsed).map((count, m) => (
            <tr key={m}>
              <th scope="row">{MONTHS[m]}</th>
              <td>{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function BooksByMonth({ review }: { review: YearReview }) {
  const groups = new Map<number, LibraryEntry[]>();
  for (const e of [...review.finished].reverse()) {
    const m = new Date(e.finishedAt!).getMonth();
    groups.set(m, [...(groups.get(m) ?? []), e]);
  }
  return (
    <section className={styles.section} aria-labelledby="all-title">
      <h2 id="all-title" className={styles.sectionTitle}>
        Every book, in the order you finished
      </h2>
      <ol className={styles.timeline}>
        {[...groups.entries()].map(([month, list]) => (
          <li key={month} className={styles.monthGroup} data-anim="reveal">
            <h3 className={styles.monthName}>{MONTHS[month]}</h3>
            <ul role="list" className={styles.monthBooks}>
              {list.map((e) => (
                <li key={e.id}>
                  <Link to={`/books/${e.id}`} className={styles.monthBook}>
                    <span className={styles.monthCover}>
                      <BookCover book={e.book} size="S" />
                    </span>
                    <span className={styles.monthText}>
                      <span className={styles.monthTitle}>{e.book.title}</span>
                      <span className={styles.monthAuthor}>{formatAuthors(e.book.authors)}</span>
                      <StarRating value={e.rating} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
