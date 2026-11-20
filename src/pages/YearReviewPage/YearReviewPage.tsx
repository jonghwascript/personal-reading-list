import { ArrowLeft, ArrowRight, BookOpen, Download, Share2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { BookCover } from '../../components/BookCover/BookCover';
import { StarRating } from '../../components/StarRating/StarRating';
import { Button, ButtonLink } from '../../components/ui/Button';
import { formatAuthors, pluralize } from '../../lib/format';
import { canvasToBlob, drawShareCard } from '../../lib/shareCard';
import { usePageTitle } from '../../lib/usePageTitle';
import { buildYearReview, countWord, MONTHS, reviewSentence, yearsWithFinishedBooks, type YearReview } from '../../lib/yearReview';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useLibrary } from '../../state/LibraryContext';
import type { LibraryEntry } from '../../types';
import styles from './YearReviewPage.module.css';
import { useReviewMotion } from './useReviewMotion';

/**
 * Design challenge #1. Starts from the books themselves — covers and one sentence — so a reader
 * with three books gets a story, not a sparse dashboard. Charts sit below for those who want them.
 */
export function YearReviewPage() {
  const { year: yearParam } = useParams();
  const { entries } = useLibrary();
  const now = new Date();
  const year = yearParam ? Number(yearParam) : now.getFullYear();
  usePageTitle(`${year} in books`);

  const review = useMemo(() => buildYearReview(entries, year, now), [entries, year]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageRef = useRef<HTMLDivElement>(null);
  // Re-run the scroll story when the year or its book count changes.
  useReviewMotion(pageRef, `${year}:${review.finished.length}`);
  const years = useMemo(() => {
    const set = new Set(yearsWithFinishedBooks(entries));
    set.add(now.getFullYear());
    return [...set].sort((a, b) => a - b);
  }, [entries]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!Number.isInteger(year) || year < 1900 || year > now.getFullYear()) return <Navigate to="/review" replace />;

  const prev = years.filter((y) => y < year).at(-1);
  const next = years.find((y) => y > year);

  return (
    <div className={styles.page} ref={pageRef}>
      <Hero review={review} prev={prev} next={next} />
      {review.finished.length > 0 ? (
        <>
          <MonthChart review={review} />
          {(review.genres || review.pages) && (
            <div className={styles.facts} data-anim="reveal">
              {review.genres && <GenreBreakdown genres={review.genres} total={review.finished.length} />}
              {review.pages && <PageTotal pages={review.pages} />}
            </div>
          )}
          <BooksByMonth review={review} />
        </>
      ) : null}
    </div>
  );
}

function Hero({ review, prev, next }: { review: YearReview; prev?: number; next?: number }) {
  const { entries, shelves } = useLibrary();
  const [sharing, setSharing] = useState(false);
  const n = review.finished.length;
  const eyebrow = review.isCurrentYear
    ? `${review.year} so far · as of ${MONTHS[review.asOf!.getMonth()]} ${review.asOf!.getDate()}`
    : `Your ${review.year} in books`;

  const readingShelf = shelves.find((s) => s.kind === 'reading');
  const reading = entries.filter((e) => e.shelfId === readingShelf?.id);
  const featureAll = n <= 6;

  return (
    <section className={styles.hero} aria-labelledby="review-title">
      <nav className={styles.yearNav} aria-label="Other years">
        {prev ? (
          <Link to={`/review/${prev}`} className={styles.yearLink}>
            <ArrowLeft size={16} aria-hidden="true" /> {prev}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={next === new Date().getFullYear() ? '/review' : `/review/${next}`} className={styles.yearLink}>
            {next} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        )}
      </nav>

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

      {n === 0 && (
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
          ) : (
            <>
              <p className={styles.sentence}>Finish a book and it will appear here, along with the month you closed it.</p>
              <ButtonLink to="/discover" variant="primary">
                Find something to read
              </ButtonLink>
            </>
          )}
        </div>
      )}

      {n > 0 && (
        <ul role="list" className={`${styles.covers} ${featureAll ? styles.coversAll : styles.coversFan}`} aria-label={featureAll ? 'Books finished' : 'Highlights'}>
          {review.featured.map((entry, i) => (
            <li key={entry.id} className={styles.coverItem} style={{ '--i': i } as React.CSSProperties}>
              <Link to={`/books/${entry.id}`} className={styles.coverLink}>
                <BookCover book={entry.book} size={featureAll ? 'L' : 'M'} priority />
                <span className={featureAll ? styles.coverCaption : 'u-sr-only'}>
                  {featureAll && <span className={styles.coverMonth}>{MONTHS[new Date(entry.finishedAt!).getMonth()]}</span>}
                  <span className={featureAll ? styles.coverTitle : undefined}>{entry.book.title}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {n > 0 && (
        <div className={styles.heroActions}>
          <Button variant="secondary" icon={sharing ? <X /> : <Share2 />} aria-expanded={sharing} aria-controls="share-panel" onClick={() => setSharing((s) => !s)}>
            {sharing ? 'Close sharing' : 'Share as an image'}
          </Button>
        </div>
      )}
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
      theme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
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
      <div className={styles.chart} aria-hidden="true" data-anim="chart">
        {review.byMonth.map((count, m) => {
          const future = m >= review.monthsElapsed;
          return (
            <div key={m} className={styles.bar} data-future={future} data-top={review.topMonth?.month === m}>
              <span className={styles.barValue}>{future ? '' : count}</span>
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

function GenreBreakdown({ genres, total }: { genres: NonNullable<YearReview['genres']>; total: number }) {
  return (
    <section className={styles.card} aria-labelledby="genres-title">
      <h2 id="genres-title" className={styles.cardTitle}>
        What you read most
      </h2>
      <ul role="list" className={styles.genreList}>
        {genres.map(({ genre, count }) => (
          <li key={genre} className={styles.genre}>
            <span className={styles.genreName}>{genre}</span>
            <span className={styles.genreTrack} aria-hidden="true">
              <span className={styles.genreFill} data-anim="genre" style={{ inlineSize: `${(count / total) * 100}%` }} />
            </span>
            <span className={styles.genreCount}>{pluralize(count, 'book')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PageTotal({ pages }: { pages: NonNullable<YearReview['pages']> }) {
  return (
    <section className={styles.card} aria-labelledby="pages-title">
      <h2 id="pages-title" className={styles.cardTitle}>
        Pages turned
      </h2>
      <p className={styles.pageNumber}>
        <span aria-hidden="true" data-anim="count-on-scroll" data-count={pages.total}>
          {pages.total.toLocaleString()}
        </span>
        <span className="u-sr-only">{pages.total.toLocaleString()}</span>
      </p>
      <p className={styles.cardNote}>
        {pages.known === pages.of
          ? `Across all ${countWord(pages.of)} books.`
          : `Across the ${pages.known} of ${pages.of} books with a known page count.`}
      </p>
    </section>
  );
}

function BooksByMonth({ review }: { review: YearReview }) {
  const groups = new Map<number, LibraryEntry[]>();
  for (const e of review.finished) {
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
