import { ArrowRight, FileUp, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { StarRating } from '../../components/StarRating/StarRating';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { formatAuthors, formatDate, pluralize } from '../../lib/format';
import {
  buildEntry,
  buildImportPlan,
  defaultMapping,
  findCatalogMatches,
  mergeCatalogMatch,
  parseGoodreadsCsv,
  prettyShelfName,
  rowToBook,
  STANDARD_SHELVES,
  type GoodreadsRow,
  type ImportItem,
  type ImportPlan,
  type ParsedExport,
  type ResolvedShelves,
  type ShelfMapping,
} from '../../lib/goodreadsImport';
import { findDuplicate } from '../../lib/libraryRules';
import { usePageTitle } from '../../lib/usePageTitle';
import type { LibraryEntry, Shelf, ShelfKind } from '../../types';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useLibrary } from '../../state/LibraryContext';
import page from '../Page.module.css';
import button from '../../components/ui/Button.module.css';
import styles from './ImportPage.module.css';

interface Preview {
  fileName: string;
  parsed: ParsedExport;
  plan: ImportPlan;
}

interface Report {
  added: number;
  duplicates: number;
  /** Looked up on Open Library without a match — added with the Goodreads details. */
  notFound: string[];
  /** Not looked up: the reader skipped the rest, or Open Library stopped answering. */
  notChecked: number;
  lookupFailure: string | null;
  unreadable: number;
  saveError: string | null;
  failedToSave: number;
}

type Stage =
  | { step: 'choose'; error: string | null }
  | { step: 'preview' }
  | { step: 'working'; phase: 'lookup' | 'save'; done: number; total: number }
  | { step: 'done'; report: Report };

type ListFilter = 'all' | 'new' | 'duplicates';

const STANDARD_LABELS: Record<string, string> = { read: 'read', 'to-read': 'to-read', 'currently-reading': 'currently-reading' };

/**
 * Stretch #13 — bring a Goodreads history in. Nothing is written until the reader has seen the
 * preview: which books are new, which are already here, and where every Goodreads shelf will go.
 */
export function ImportPage() {
  usePageTitle('Import from Goodreads');
  const { entries, shelves, defaultShelf, importBooks } = useLibrary();
  const { announce, notify } = useAnnouncer();
  const [stage, setStage] = useState<Stage>({ step: 'choose', error: null });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mappings, setMappings] = useState<Record<string, ShelfMapping>>({});
  const [lookup, setLookup] = useState(true);
  const [filter, setFilter] = useState<ListFilter>('all');
  const skip = useRef<AbortController | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Each step replaces the page's content, so move focus to its heading (and say where we are).
  useEffect(() => {
    if (stage.step !== 'working') headingRef.current?.focus();
  }, [stage.step]);

  useEffect(() => () => skip.current?.abort(), []);

  const load = (fileName: string, text: string) => {
    try {
      const parsed = parseGoodreadsCsv(text);
      if (parsed.rows.length === 0) {
        setStage({ step: 'choose', error: 'That file has no books in it.' });
        return;
      }
      const plan = buildImportPlan(parsed.rows, entries);
      setPreview({ fileName, parsed, plan });
      setMappings(Object.fromEntries(plan.customShelves.map((s) => [s.slug, defaultMapping(s, shelves)])));
      setFilter('all');
      setStage({ step: 'preview' });
    } catch (err) {
      setStage({ step: 'choose', error: err instanceof Error ? err.message : 'We couldn’t read that file.' });
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      load(file.name, await file.text());
    } catch {
      setStage({ step: 'choose', error: 'We couldn’t open that file. Try exporting it from Goodreads again.' });
    }
  };

  const loadSample = async () => {
    const { default: text } = await import('../../../data/sample-books.csv?raw');
    load('sample-goodreads-export.csv', text);
  };

  const shelfName = (row: GoodreadsRow): string => {
    for (const slug of [row.exclusiveShelf, ...row.tags]) {
      const m = mappings[slug];
      if (m?.action === 'create') return m.name;
      if (m?.action === 'existing') return shelves.find((s) => s.id === m.shelfId)?.name ?? '';
    }
    return defaultShelf(statusOf(row)).name;
  };

  const run = async () => {
    if (!preview) return;
    const fresh = preview.plan.items.filter((i) => i.status === 'new').map((i) => i.row);
    const controller = new AbortController();
    skip.current = controller;

    let matches = new Map<number, LibraryEntry['book']>();
    let checked = new Set<number>(fresh.map((r) => r.line));
    let lookupFailure: string | null = null;
    if (lookup) {
      setStage({ step: 'working', phase: 'lookup', done: 0, total: fresh.length });
      announce(`Looking up ${pluralize(fresh.length, 'book')} on Open Library.`);
      const result = await findCatalogMatches(fresh, {
        signal: controller.signal,
        onProgress: (done) => setStage({ step: 'working', phase: 'lookup', done, total: fresh.length }),
      });
      ({ matches, checked } = result);
      lookupFailure = result.failure;
    }

    // Shelves the reader chose to create, then where each Goodreads shelf lands.
    const newShelves: Shelf[] = [];
    const resolved: ResolvedShelves = {
      byKind: { want: defaultShelf('want'), reading: defaultShelf('reading'), read: defaultShelf('read') },
      bySlug: new Map(),
      genreBySlug: new Map(),
    };
    for (const [slug, m] of Object.entries(mappings)) {
      if (m.action === 'create') {
        const existing = [...shelves, ...newShelves].find((s) => s.name.toLowerCase() === m.name.toLowerCase());
        const shelf = existing ?? { id: crypto.randomUUID(), name: m.name, position: shelves.length + newShelves.length, kind: null };
        if (!existing) newShelves.push(shelf);
        resolved.bySlug.set(slug, shelf);
      } else if (m.action === 'existing') {
        const shelf = shelves.find((s) => s.id === m.shelfId);
        if (shelf) resolved.bySlug.set(slug, shelf);
      } else if (m.action === 'genre') resolved.genreBySlug.set(slug, m.genre);
    }

    // A catalog match can reveal a duplicate the Goodreads details alone didn't (same work, other edition).
    const toSave: LibraryEntry[] = [];
    let lateDuplicates = 0;
    for (const row of fresh) {
      const book = mergeCatalogMatch(rowToBook(row, `import:${crypto.randomUUID()}`), matches.get(row.line));
      if (findDuplicate([...entries, ...toSave], book)) {
        lateDuplicates++;
        continue;
      }
      toSave.push(buildEntry(row, book, resolved, { entryId: crypto.randomUUID() }));
    }

    setStage({ step: 'working', phase: 'save', done: 0, total: toSave.length });
    const outcome = await importBooks(newShelves, toSave, (done) => setStage({ step: 'working', phase: 'save', done, total: toSave.length }));
    skip.current = null;

    const report: Report = {
      added: outcome.saved,
      duplicates: preview.plan.items.length - fresh.length + lateDuplicates,
      notFound: lookup ? fresh.filter((r) => checked.has(r.line) && !matches.has(r.line)).map((r) => r.title) : [],
      notChecked: lookup ? fresh.filter((r) => !checked.has(r.line)).length : 0,
      lookupFailure,
      unreadable: preview.parsed.problems.length,
      saveError: outcome.error,
      failedToSave: toSave.length - outcome.saved,
    };
    setStage({ step: 'done', report });
    if (outcome.error) notify(`Import stopped after ${pluralize(outcome.saved, 'book')}: ${outcome.error}`, 'error');
  };

  const restart = () => {
    setPreview(null);
    setStage({ step: 'choose', error: null });
  };

  return (
    <div className={page.page}>
      <header>
        <p className={page.eyebrow}>Import</p>
        <h1 className={page.title} ref={headingRef} tabIndex={-1}>
          {stage.step === 'choose' && 'Bring your Goodreads library'}
          {stage.step === 'preview' && 'Check before importing'}
          {stage.step === 'working' && 'Importing…'}
          {stage.step === 'done' && (stage.report.saveError ? 'Import stopped part-way' : 'Import complete')}
        </h1>
      </header>

      {stage.step === 'choose' && <ChooseStep error={stage.error} onFile={onFile} onSample={loadSample} />}

      {stage.step === 'preview' && preview && (
        <PreviewStep
          preview={preview}
          shelves={shelves}
          defaultShelf={defaultShelf}
          mappings={mappings}
          onMapping={(slug, m) => setMappings((all) => ({ ...all, [slug]: m }))}
          shelfName={shelfName}
          lookup={lookup}
          onLookup={setLookup}
          filter={filter}
          onFilter={setFilter}
          onImport={run}
          onCancel={restart}
        />
      )}

      {stage.step === 'working' && (
        <section className={styles.card} aria-labelledby="working-heading">
          <h2 id="working-heading" className={styles.cardTitle}>
            {stage.phase === 'lookup' ? 'Finding covers and genres on Open Library' : 'Saving to your library'}
          </h2>
          <ProgressBar
            value={stage.total ? (stage.done / stage.total) * 100 : 0}
            label={stage.phase === 'lookup' ? 'Lookup progress' : 'Save progress'}
            valueText={`${stage.done} of ${stage.total}`}
          />
          <p className={styles.muted} aria-hidden="true">
            {stage.done} of {stage.total}
          </p>
          {stage.phase === 'lookup' && (
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => skip.current?.abort()}>
                Skip the rest
              </Button>
              <p className={styles.muted}>Skipped books are still imported, with the details from your Goodreads file.</p>
            </div>
          )}
        </section>
      )}

      {stage.step === 'done' && <DoneStep report={stage.report} onAgain={restart} />}
    </div>
  );
}

function statusOf(row: GoodreadsRow): ShelfKind {
  return STANDARD_SHELVES[row.exclusiveShelf] ?? (row.dateRead ? 'read' : 'want');
}

function ChooseStep({ error, onFile, onSample }: { error: string | null; onFile(e: ChangeEvent<HTMLInputElement>): void; onSample(): void }) {
  return (
    <section className={styles.card} aria-labelledby="choose-heading">
      <h2 id="choose-heading" className={styles.cardTitle}>
        Choose your export file
      </h2>
      <ol className={styles.steps}>
        <li>
          On Goodreads, open <strong>My Books</strong> and choose <strong>Import and export</strong>.
        </li>
        <li>
          Select <strong>Export library</strong> and download the CSV file.
        </li>
        <li>Choose that file below. You’ll see everything before anything is added.</li>
      </ol>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <label className={`${button.button} ${button.primary} ${button.md} ${styles.fileButton}`}>
          <FileUp size={18} aria-hidden="true" />
          Choose CSV file
          <input type="file" accept=".csv,text/csv" className="u-sr-only" onChange={onFile} aria-describedby={error ? undefined : 'choose-note'} />
        </label>
        <Button variant="ghost" onClick={onSample}>
          Try a sample export
        </Button>
      </div>
      <p id="choose-note" className={styles.muted}>
        The file is read in your browser. Books already in your library are skipped.
      </p>
    </section>
  );
}

interface PreviewProps {
  preview: Preview;
  shelves: Shelf[];
  defaultShelf(kind: ShelfKind): Shelf;
  mappings: Record<string, ShelfMapping>;
  onMapping(slug: string, m: ShelfMapping): void;
  shelfName(row: GoodreadsRow): string;
  lookup: boolean;
  onLookup(v: boolean): void;
  filter: ListFilter;
  onFilter(f: ListFilter): void;
  onImport(): void;
  onCancel(): void;
}

function PreviewStep({
  preview,
  shelves,
  defaultShelf,
  mappings,
  onMapping,
  shelfName,
  lookup,
  onLookup,
  filter,
  onFilter,
  onImport,
  onCancel,
}: PreviewProps) {
  const { plan, parsed, fileName } = preview;
  const fresh = plan.items.filter((i) => i.status === 'new').length;
  const duplicates = plan.items.length - fresh;
  const visible = useMemo(
    () => plan.items.filter((i) => filter === 'all' || (filter === 'new' ? i.status === 'new' : i.status !== 'new')),
    [plan.items, filter],
  );

  return (
    <>
      <section className={styles.card} aria-labelledby="summary-heading">
        <h2 id="summary-heading" className={styles.cardTitle}>
          {fileName}
        </h2>
        <dl className={styles.summary}>
          <div>
            <dt>To import</dt>
            <dd>{fresh}</dd>
          </div>
          <div>
            <dt>Already in your library</dt>
            <dd>{duplicates}</dd>
          </div>
          {parsed.problems.length > 0 && (
            <div>
              <dt>Rows we couldn’t read</dt>
              <dd>{parsed.problems.length}</dd>
            </div>
          )}
        </dl>
        {parsed.problems.length > 0 && (
          <details className={styles.details}>
            <summary>Which rows?</summary>
            <ul>
              {parsed.problems.map((p) => (
                <li key={p.line}>
                  Line {p.line}: {p.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
        {parsed.missingColumns.length > 0 && (
          <p className={styles.muted}>
            This file has no {parsed.missingColumns.join(', ')} column{parsed.missingColumns.length > 1 ? 's' : ''}, so those details will be left
            empty.
          </p>
        )}
      </section>

      {fresh > 0 && (
        <section className={styles.card} aria-labelledby="shelves-heading">
          <h2 id="shelves-heading" className={styles.cardTitle}>
            Where your Goodreads shelves go
          </h2>
          <ul className={styles.mapList}>
            {Object.entries(plan.standardCounts)
              .filter(([, n]) => n > 0)
              .map(([slug, n]) => (
                <li key={slug} className={styles.mapRow}>
                  <span className={styles.mapFrom}>
                    {STANDARD_LABELS[slug]} <span className={styles.muted}>({n})</span>
                  </span>
                  <ArrowRight size={16} aria-hidden="true" className={styles.mapArrow} />
                  <span>{defaultShelf(STANDARD_SHELVES[slug]!).name}</span>
                </li>
              ))}
            {plan.customShelves.map((custom) => {
              const id = `map-${custom.slug}`;
              const m = mappings[custom.slug] ?? { action: 'ignore' };
              const value = m.action === 'existing' ? `existing:${m.shelfId}` : m.action;
              return (
                <li key={custom.slug} className={styles.mapRow}>
                  <label htmlFor={id} className={styles.mapFrom}>
                    {custom.slug} <span className={styles.muted}>({custom.count})</span>
                  </label>
                  <ArrowRight size={16} aria-hidden="true" className={styles.mapArrow} />
                  <select
                    id={id}
                    className={page.select}
                    value={value}
                    onChange={(e) => {
                      const v = e.target.value;
                      const name = prettyShelfName(custom.slug);
                      onMapping(
                        custom.slug,
                        v.startsWith('existing:')
                          ? { action: 'existing', shelfId: v.slice('existing:'.length) }
                          : v === 'create'
                            ? { action: 'create', name }
                            : v === 'genre'
                              ? { action: 'genre', genre: name }
                              : { action: 'ignore' },
                      );
                    }}
                  >
                    {!shelves.some((s) => s.name.toLowerCase() === prettyShelfName(custom.slug).toLowerCase()) && (
                      <option value="create">New shelf “{prettyShelfName(custom.slug)}”</option>
                    )}
                    <optgroup label="Your shelves">
                      {shelves.map((s) => (
                        <option key={s.id} value={`existing:${s.id}`}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                    <option value="genre">Genre tag “{prettyShelfName(custom.slug)}”</option>
                    <option value="ignore">{custom.exclusive ? 'Don’t keep — use the reading status' : 'Don’t keep'}</option>
                  </select>
                </li>
              );
            })}
          </ul>
          {plan.customShelves.length > 0 && (
            <p className={styles.muted}>
              A book sits on one shelf here. Books on a custom shelf go there and keep their reading status, dates and rating.
            </p>
          )}
        </section>
      )}

      <section className={page.section} aria-labelledby="books-heading">
        <div className={page.sectionHeader}>
          <h2 id="books-heading" className={page.sectionTitle}>
            Books <span className={page.sectionCount}>{visible.length}</span>
          </h2>
          <label className={page.field}>
            Show
            <select className={page.select} value={filter} onChange={(e) => onFilter(e.target.value as ListFilter)}>
              <option value="all">All ({plan.items.length})</option>
              <option value="new">To import ({fresh})</option>
              <option value="duplicates">Already in your library ({duplicates})</option>
            </select>
          </label>
        </div>
        <ul className={styles.bookList}>
          {visible.map((item) => (
            <BookRow key={item.row.line} item={item} shelf={item.status === 'new' ? shelfName(item.row) : null} />
          ))}
        </ul>
      </section>

      <div className={styles.footer}>
        <label className={styles.checkbox}>
          <input type="checkbox" checked={lookup} onChange={(e) => onLookup(e.target.checked)} />
          Find covers and genres on Open Library
          <span className={styles.muted}> — can take a minute for a big library, and you can skip it</span>
        </label>
        <div className={styles.actions}>
          <Button variant="primary" onClick={onImport} disabled={fresh === 0}>
            {fresh === 0 ? 'Nothing new to import' : `Import ${pluralize(fresh, 'book')}`}
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            Choose another file
          </Button>
        </div>
      </div>
    </>
  );
}

function BookRow({ item, shelf }: { item: ImportItem; shelf: string | null }) {
  const { row } = item;
  return (
    <li className={styles.bookRow} data-status={item.status}>
      <div className={styles.bookMain}>
        <p className={styles.bookTitle}>{row.title}</p>
        {row.authors.length > 0 && <p className={styles.muted}>{formatAuthors(row.authors)}</p>}
      </div>
      <div className={styles.bookMeta}>
        {row.rating && <StarRating value={row.rating} />}
        {row.dateRead && <span className={styles.muted}>Read {formatDate(row.dateRead)}</span>}
      </div>
      <p className={styles.bookStatus}>
        {item.status === 'new' && (
          <>
            <span className="u-sr-only">Goes to </span>
            {shelf}
          </>
        )}
        {item.status === 'in-library' && <span className={styles.badge}>Already in your library — skipped</span>}
        {item.status === 'repeated' && <span className={styles.badge}>Listed twice (line {item.firstLine}) — skipped</span>}
      </p>
    </li>
  );
}

function DoneStep({ report, onAgain }: { report: Report; onAgain(): void }) {
  return (
    <section className={styles.card} aria-labelledby="report-heading">
      <h2 id="report-heading" className={styles.cardTitle}>
        {pluralize(report.added, 'book')} added
      </h2>
      <ul className={styles.report}>
        <li>
          <strong>{report.added}</strong> {report.added === 1 ? 'book' : 'books'} added
        </li>
        <li>
          <strong>{report.duplicates}</strong> {report.duplicates === 1 ? 'duplicate' : 'duplicates'} skipped
        </li>
        <li>
          <strong>{report.notFound.length}</strong> not found on Open Library
          {report.notFound.length > 0 && <span className={styles.muted}> — added with your Goodreads details, without a cover</span>}
        </li>
        {report.notChecked > 0 && (
          <li>
            <strong>{report.notChecked}</strong> not looked up
            <span className={styles.muted}> — {report.lookupFailure ? `Open Library stopped answering (${report.lookupFailure})` : 'you skipped the rest'}</span>
          </li>
        )}
        {report.unreadable > 0 && (
          <li>
            <strong>{report.unreadable}</strong> {report.unreadable === 1 ? 'row' : 'rows'} couldn’t be read
          </li>
        )}
      </ul>
      {report.notFound.length > 0 && (
        <details className={styles.details}>
          <summary>Books not found on Open Library</summary>
          <ul>
            {report.notFound.map((title, i) => (
              <li key={`${title}-${i}`}>{title}</li>
            ))}
          </ul>
        </details>
      )}
      {report.saveError && (
        <p className={styles.error} role="alert">
          Saving stopped with {pluralize(report.failedToSave, 'book')} left ({report.saveError}). Everything listed as added is safe — import the same file
          again and those books will be skipped as duplicates.
        </p>
      )}
      <div className={styles.actions}>
        <ButtonLink to="/library" variant="primary" icon={<ArrowRight />}>
          Go to your library
        </ButtonLink>
        <Button variant="ghost" icon={<RotateCcw />} onClick={onAgain}>
          Import another file
        </Button>
      </div>
      <p className={styles.muted}>
        Ratings, read dates and your Goodreads review and notes came along too. <Link to="/shelves">Review your shelves</Link>.
      </p>
    </section>
  );
}
