import { BookOpen, Headphones, Tablet } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { formatMinutes } from '../../lib/progress';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useLibrary } from '../../state/LibraryContext';
import type { LibraryEntry, ReadingFormat } from '../../types';
import { Button } from '../ui/Button';
import styles from './ReadingFormatEditor.module.css';

const FORMATS: { value: ReadingFormat; label: string; Icon: typeof BookOpen; unit: string }[] = [
  { value: 'print', label: 'Print', Icon: BookOpen, unit: 'pages' },
  { value: 'ebook', label: 'E-book', Icon: Tablet, unit: 'percent' },
  { value: 'audio', label: 'Audiobook', Icon: Headphones, unit: 'time' },
];

/**
 * How this copy is read, and how long it is. Editions of the same work differ in length, so the
 * user's own page count (or audiobook runtime) is what percentages are computed from.
 */
export function ReadingFormatEditor({ entry }: { entry: LibraryEntry }) {
  const { updateEntry } = useLibrary();
  const { announce } = useAnnouncer();
  const id = useId();

  return (
    <div className={styles.editor} id="format">
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Reading format</legend>
        <div className={styles.segments}>
          {FORMATS.map(({ value, label, Icon }) => (
            <label key={value} className={styles.segment}>
              <input
                type="radio"
                name={`${id}-format`}
                value={value}
                checked={entry.format === value}
                className="u-sr-only"
                onChange={async () => {
                  await updateEntry(entry.id, { format: value });
                  announce(`Format set to ${label}.`);
                }}
              />
              <Icon size={16} aria-hidden="true" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {entry.format === 'print' && <PageLength entry={entry} />}
      {entry.format === 'audio' && <AudioLength entry={entry} />}
    </div>
  );
}

function PageLength({ entry }: { entry: LibraryEntry }) {
  const { updateEntry } = useLibrary();
  const { announce } = useAnnouncer();
  const id = useId();
  const catalog = entry.book.pageCount;
  const [value, setValue] = useState(String(entry.totalPages ?? catalog ?? ''));
  const parsed = Number(value);
  const valid = value === '' || (Number.isInteger(parsed) && parsed > 0 && parsed < 20000);
  const current = entry.totalPages ?? catalog;
  const changed = valid && (value === '' ? entry.totalPages !== null : parsed !== current);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!changed) return;
    // Blank, or the catalog's own number, means "use the catalog count" — no override stored.
    const totalPages = value === '' || parsed === catalog ? null : parsed;
    await updateEntry(entry.id, { totalPages });
    announce(totalPages ? `Your edition has ${totalPages} pages.` : 'Using the catalog page count.');
  };

  return (
    <form className={styles.length} onSubmit={submit}>
      <label htmlFor={`${id}-pages`} className={styles.legend}>
        Pages in your edition
      </label>
      <div className={styles.row}>
        <input
          id={`${id}-pages`}
          type="number"
          inputMode="numeric"
          min={1}
          value={value}
          placeholder="e.g. 352"
          onChange={(e) => setValue(e.target.value)}
          className={styles.input}
          aria-invalid={!valid}
          aria-describedby={`${id}-pages-hint`}
        />
        <Button type="submit" size="sm" disabled={!changed}>
          Save
        </Button>
      </div>
      <p id={`${id}-pages-hint`} className={styles.hint}>
        {catalog
          ? `Open Library lists ${catalog} pages; editions vary. Change it if your copy differs.`
          : 'Open Library doesn’t know this book’s length — add it to see a percentage.'}
      </p>
    </form>
  );
}

function AudioLength({ entry }: { entry: LibraryEntry }) {
  const { updateEntry } = useLibrary();
  const { announce } = useAnnouncer();
  const id = useId();
  const total = entry.totalMinutes ?? 0;
  const [hours, setHours] = useState(total ? String(Math.floor(total / 60)) : '');
  const [mins, setMins] = useState(total ? String(total % 60) : '');
  const minutes = Number(hours || 0) * 60 + Number(mins || 0);
  const valid = [hours, mins].every((v) => v === '' || /^\d+$/.test(v)) && Number(mins || 0) < 60;
  const changed = valid && (minutes || null) !== entry.totalMinutes;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!changed) return;
    await updateEntry(entry.id, { totalMinutes: minutes || null });
    announce(minutes ? `Audiobook length set to ${formatMinutes(minutes)}.` : 'Audiobook length cleared.');
  };

  return (
    <form className={styles.length} onSubmit={submit}>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Audiobook length</legend>
        <div className={styles.row}>
          <label className={styles.unit}>
            <input id={`${id}-h`} type="number" inputMode="numeric" min={0} value={hours} onChange={(e) => setHours(e.target.value)} className={`${styles.input} ${styles.short}`} />
            <span>h</span>
          </label>
          <label className={styles.unit}>
            <input id={`${id}-m`} type="number" inputMode="numeric" min={0} max={59} value={mins} onChange={(e) => setMins(e.target.value)} className={`${styles.input} ${styles.short}`} />
            <span>min</span>
          </label>
          <Button type="submit" size="sm" disabled={!changed}>
            Save
          </Button>
        </div>
      </fieldset>
      <p className={styles.hint}>You can log your listening position without it; the length adds a percentage.</p>
    </form>
  );
}
