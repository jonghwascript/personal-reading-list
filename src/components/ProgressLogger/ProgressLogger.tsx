import { BookCheck, PenLine, Undo2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { formatWhen, pluralize } from '../../lib/format';
import { booksFinishedInYear } from '../../lib/goal';
import { currentPosition, describePosition, describeRemaining, positionModel, type Milestone, type ProgressInput } from '../../lib/progress';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useLibrary } from '../../state/LibraryContext';
import type { LibraryEntry } from '../../types';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/ProgressBar';
import styles from './ProgressLogger.module.css';

interface ProgressLoggerProps {
  entry: LibraryEntry;
  /** Card: dashboard tile. Detail: book page, slightly roomier. */
  variant?: 'card' | 'detail';
}

type Mode =
  | { kind: 'view' }
  | { kind: 'edit' }
  | { kind: 'saved'; message: string; undo: () => Promise<void> }
  | { kind: 'finish-prompt'; undo: () => Promise<void> }
  | { kind: 'finished'; message: string };

const UNDO_WINDOW_MS = 8000;

const MILESTONE_COPY: Record<Exclude<Milestone, 'end' | null>, string> = {
  started: 'Off you go — first page logged.',
  halfway: 'Halfway there.',
  almost: 'Almost done.',
};

/**
 * Design challenge #3. One low-friction action most days ("Log progress" → last position → Save),
 * one explicit confirmation at the end ("Mark as finished"). Saves are optimistic and undoable for
 * a few seconds, so a mistyped page never needs a correction form.
 */
export function ProgressLogger({ entry, variant = 'card' }: ProgressLoggerProps) {
  const { setProgress, markFinished, entries } = useLibrary();
  const { announce, notify } = useAnnouncer();
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const logButtonRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const percent = entry.progress?.percent ?? null;
  const remaining = describeRemaining(entry);

  // The undo affordance quietly expires; the saved position stays.
  useEffect(() => {
    if (mode.kind !== 'saved') return;
    const t = window.setTimeout(() => setMode({ kind: 'view' }), UNDO_WINDOW_MS);
    return () => window.clearTimeout(t);
  }, [mode]);

  const backToView = () => {
    setMode({ kind: 'view' });
    requestAnimationFrame(() => logButtonRef.current?.focus());
  };

  const save = async (input: ProgressInput) => {
    let result;
    try {
      result = await setProgress(entry.id, input);
    } catch {
      return; // LibraryContext already rolled back and explained the failure.
    }
    const { milestone, undo } = result;
    if (milestone === 'end') {
      setMode({ kind: 'finish-prompt', undo });
      announce(`You reached the end of ${entry.book.title}. Mark it as finished?`);
      return;
    }
    const message = milestone ? `${MILESTONE_COPY[milestone]} Saved.` : 'Saved.';
    setMode({ kind: 'saved', message, undo });
    announce(message);
  };

  const finish = async () => {
    const year = new Date().getFullYear();
    const before = booksFinishedInYear(entries, year).length;
    await markFinished(entry.id);
    const message = `Finished! That’s ${pluralize(before + 1, 'book')} in ${year}.`;
    setMode({ kind: 'finished', message });
    notify(`You finished “${entry.book.title}”. ${message}`, 'success');
  };

  const marks = [
    { at: 50, label: 'Halfway' },
    { at: 90, label: '90%' },
  ];

  return (
    <div className={`${styles.logger} ${styles[variant]}`}>
      <div className={styles.readout}>
        <p className={styles.position}>{describePosition(entry)}</p>
        {remaining && <p className={styles.remaining}>{remaining}</p>}
      </div>

      {percent !== null ? (
        <ProgressBar
          value={percent}
          marks={marks}
          label={`Progress in ${entry.book.title}`}
          valueText={`${describePosition(entry)}, ${Math.round(percent)}%`}
          tone={percent >= 100 ? 'success' : 'progress'}
          size={variant === 'card' ? 'sm' : 'md'}
        />
      ) : (
        <p className={styles.unknownTotal}>
          {entry.format === 'audio' ? 'Audiobook length unknown' : 'Total pages unknown'}
          {variant === 'card' ? (
            <>
              {' · '}
              <Link to={`/books/${entry.id}#format`}>add your edition’s length</Link>
            </>
          ) : (
            ' — add it below to see a percentage.'
          )}
        </p>
      )}

      {mode.kind === 'edit' ? (
        <PositionForm
          entry={entry}
          idPrefix={id}
          onCancel={backToView}
          onSave={async (input) => {
            await save(input);
          }}
        />
      ) : mode.kind === 'finish-prompt' ? (
        <div className={styles.finishPrompt}>
          <p>
            <BookCheck size={18} aria-hidden="true" /> That’s the last page. Mark it as finished?
          </p>
          <div className={styles.actions}>
            <Button variant="primary" size="sm" onClick={finish}>
              Mark as finished
            </Button>
            <Button variant="ghost" size="sm" onClick={backToView}>
              Not yet
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Undo2 />}
              onClick={async () => {
                await mode.undo();
                announce('Progress update undone.');
                backToView();
              }}
            >
              Undo
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.footer}>
          <p className={styles.status} aria-hidden={mode.kind === 'view' ? undefined : true}>
            {mode.kind === 'saved' || mode.kind === 'finished' ? (
              <span className={styles.flash}>{mode.message}</span>
            ) : entry.progress ? (
              `Updated ${formatWhen(entry.progress.updatedAt)}`
            ) : (
              'Not started yet'
            )}
          </p>
          <div className={styles.actions}>
            {mode.kind === 'saved' && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Undo2 />}
                onClick={async () => {
                  await mode.undo();
                  announce('Progress update undone.');
                  backToView();
                }}
              >
                Undo
              </Button>
            )}
            {mode.kind !== 'finished' && (
              <Button ref={logButtonRef} variant="secondary" size="sm" icon={<PenLine />} onClick={() => setMode({ kind: 'edit' })}>
                Log progress{' '}<span className="u-sr-only">for {entry.book.title}</span>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PositionForm({
  entry,
  idPrefix,
  onSave,
  onCancel,
}: {
  entry: LibraryEntry;
  idPrefix: string;
  onSave(input: ProgressInput): Promise<void>;
  onCancel(): void;
}) {
  const { format, total } = positionModel(entry);
  const position = currentPosition(entry);
  const [value, setValue] = useState(String(position));
  const [hours, setHours] = useState(String(Math.floor(position / 60)));
  const [mins, setMins] = useState(String(position % 60));
  const [busy, setBusy] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    firstRef.current?.select();
  }, []);

  const audioMinutes = Number(hours || 0) * 60 + Number(mins || 0);
  const numeric = format === 'audio' ? audioMinutes : Number(value);
  const max = total ?? Infinity;
  const valid =
    format === 'audio'
      ? [hours, mins].every((v) => v === '' || /^\d+$/.test(v)) && Number(mins || 0) < 60 && audioMinutes <= max
      : value.trim() !== '' && Number.isFinite(numeric) && numeric >= 0 && numeric <= max;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    const input: ProgressInput = format === 'ebook' ? { percent: numeric } : format === 'audio' ? { minutes: numeric } : { page: numeric };
    await onSave(input);
    setBusy(false);
  };

  const hintId = `${idPrefix}-hint`;
  const hint =
    format === 'print'
      ? total
        ? `Page 0–${total}.`
        : 'Enter the last page you read.'
      : format === 'ebook'
        ? 'Your e-reader’s percentage, 0–100.'
        : total
          ? 'Where you paused in the recording.'
          : 'Where you paused in the recording.';

  return (
    <form className={styles.form} onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onCancel()} aria-label={`Log progress for ${entry.book.title}`}>
      {format === 'audio' ? (
        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>Listening position</legend>
          <div className={styles.row}>
            <label className={styles.unitField}>
              <input
                ref={firstRef}
                type="number"
                inputMode="numeric"
                min={0}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className={`${styles.input} ${styles.short}`}
                aria-describedby={hintId}
              />
              <span>h</span>
            </label>
            <label className={styles.unitField}>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                value={mins}
                onChange={(e) => setMins(e.target.value)}
                className={`${styles.input} ${styles.short}`}
                aria-describedby={hintId}
              />
              <span>min</span>
            </label>
          </div>
        </fieldset>
      ) : (
        <div className={styles.fieldset}>
          <label htmlFor={`${idPrefix}-value`} className={styles.label}>
            {format === 'ebook' ? 'Percent read' : 'Last page read'}
          </label>
          <div className={styles.row}>
            <input
              ref={firstRef}
              id={`${idPrefix}-value`}
              type="number"
              inputMode="numeric"
              min={0}
              max={total ?? undefined}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={styles.input}
              aria-invalid={!valid}
              aria-describedby={hintId}
            />
            <span className={styles.suffix} aria-hidden="true">
              {format === 'ebook' ? '%' : total ? `/ ${total}` : ''}
            </span>
          </div>
        </div>
      )}
      <p id={hintId} className={valid ? styles.hint : styles.error}>
        {valid ? hint : format === 'audio' ? 'Check the hours and minutes.' : `Enter a number from 0 to ${total ?? 'the last page'}.`}
      </p>
      <div className={styles.actions}>
        <Button type="submit" variant="primary" size="sm" disabled={!valid || busy}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
