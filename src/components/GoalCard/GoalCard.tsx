import { PartyPopper, Target, TrendingDown, TrendingUp, Check } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { booksFinishedInYear, goalProgress, type PaceStatus } from '../../lib/goal';
import { pluralize } from '../../lib/format';
import { useAnnouncer } from '../../state/AnnouncerContext';
import { useLibrary } from '../../state/LibraryContext';
import { Button } from '../ui/Button';
import styles from './GoalCard.module.css';

const STATUS_COPY: Record<PaceStatus, { label: string; Icon: typeof Check }> = {
  complete: { label: 'Goal reached', Icon: PartyPopper },
  ahead: { label: 'Ahead of pace', Icon: TrendingUp },
  'on-track': { label: 'On track', Icon: Check },
  behind: { label: 'Behind pace', Icon: TrendingDown },
};

export function GoalCard() {
  const { goals, entries, setGoal, clearGoal } = useLibrary();
  const { notify } = useAnnouncer();
  const year = new Date().getFullYear();
  const goal = goals.find((g) => g.year === year);
  const completed = booksFinishedInYear(entries, year).length;
  const [editing, setEditing] = useState(false);

  // Celebrate the moment of crossing the target, not every render after it.
  const wasComplete = useRef<boolean | null>(null);
  const progress = goal ? goalProgress(goal, completed) : null;
  const isComplete = progress?.status === 'complete';
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (wasComplete.current === false && isComplete) {
      setCelebrate(true);
      notify(`You reached your ${year} reading goal of ${goal?.target} books!`, 'success');
    }
    wasComplete.current = isComplete;
  }, [isComplete, notify, year, goal?.target]);

  if (editing || !goal) {
    if (!goal && !editing) {
      return (
        <section className={`${styles.card} ${styles.empty}`} aria-labelledby="goal-heading">
          <div className={styles.emptyIcon} aria-hidden="true">
            <Target size={22} />
          </div>
          <div>
            <h2 id="goal-heading" className={styles.heading}>
              Set a {year} reading goal
            </h2>
            <p className={styles.sub}>
              {completed > 0 ? `You’ve already finished ${pluralize(completed, 'book')} this year. ` : ''}A gentle target
              helps you keep reading — no pressure.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setEditing(true)}>
            Set a goal
          </Button>
        </section>
      );
    }
    return (
      <GoalForm
        year={year}
        initial={goal?.target ?? Math.max(12, completed + 6)}
        onCancel={() => setEditing(false)}
        onRemove={goal ? () => clearGoal(year).then(() => setEditing(false)) : undefined}
        onSave={async (target) => {
          await setGoal(year, target);
          setEditing(false);
          notify(`Reading goal set: ${pluralize(target, 'book')} in ${year}.`, 'success');
        }}
      />
    );
  }

  const { label, Icon } = STATUS_COPY[progress!.status];
  const remaining = Math.max(0, goal.target - completed);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  return (
    <section
      className={`${styles.card} ${isComplete ? styles.complete : ''} ${celebrate ? styles.celebrate : ''}`}
      aria-labelledby="goal-heading"
    >
      <div className={styles.ringWrap}>
        <svg viewBox="0 0 100 100" className={styles.ring} aria-hidden="true">
          <circle cx="50" cy="50" r={radius} className={styles.ringTrack} />
          <circle
            cx="50"
            cy="50"
            r={radius}
            className={styles.ringFill}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress!.percent / 100)}
          />
        </svg>
        <div className={styles.ringLabel} aria-hidden="true">
          <span className={styles.ringValue}>{completed}</span>
          <span className={styles.ringTarget}>of {goal.target}</span>
        </div>
      </div>
      <div className={styles.body}>
        <h2 id="goal-heading" className={styles.heading}>
          {year} reading goal
        </h2>
        <p className={styles.summary}>
          <span className="u-sr-only">
            {completed} of {goal.target} books read.{' '}
          </span>
          <span className={styles.status} data-status={progress!.status}>
            <Icon size={14} aria-hidden="true" /> {label}
          </span>
        </p>
        <p className={styles.sub}>
          {isComplete
            ? completed > goal.target
              ? `${pluralize(completed - goal.target, 'book')} past your target. Wonderful.`
              : 'Every book you read from here is a bonus.'
            : progress!.status === 'behind'
              ? `${pluralize(remaining, 'book')} to go — a few short reads would close the gap.`
              : `${pluralize(remaining, 'book')} to go.`}
        </p>
        <button type="button" className={styles.edit} onClick={() => setEditing(true)}>
          Edit goal
        </button>
      </div>
    </section>
  );
}

function GoalForm({
  year,
  initial,
  onSave,
  onCancel,
  onRemove,
}: {
  year: number;
  initial: number;
  onSave(target: number): Promise<void>;
  onCancel(): void;
  onRemove?: () => Promise<void>;
}) {
  const [value, setValue] = useState(String(initial));
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.select(), []);
  const target = Number.parseInt(value, 10);
  const valid = Number.isInteger(target) && target >= 1 && target <= 1000;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (valid) await onSave(target);
  };

  return (
    <form className={`${styles.card} ${styles.form}`} onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <label htmlFor="goal-target" className={styles.heading}>
        How many books in {year}?
      </label>
      <div className={styles.formRow}>
        <input
          ref={inputRef}
          id="goal-target"
          type="number"
          inputMode="numeric"
          min={1}
          max={1000}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={styles.input}
          aria-describedby="goal-hint"
          aria-invalid={!valid}
        />
        <Button type="submit" variant="primary" disabled={!valid}>
          Save goal
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p id="goal-hint" className={styles.sub}>
        {valid ? `About ${pluralize(Math.max(1, Math.round(target / 12)), 'book')} a month.` : 'Enter a number between 1 and 1000.'}
      </p>
      {onRemove && (
        <button type="button" className={styles.edit} onClick={() => void onRemove()}>
          Remove goal
        </button>
      )}
    </form>
  );
}
