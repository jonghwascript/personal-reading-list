import { Star } from 'lucide-react';
import { useId } from 'react';
import styles from './StarRating.module.css';

interface StarRatingProps {
  value: number | null;
  onChange?(value: number | null): void;
  label?: string;
}

const LABELS = ['', 'Didn’t like it', 'It was okay', 'Liked it', 'Really liked it', 'Loved it'];

/**
 * Editable mode is a native radio group: arrow keys, number keys (via the radios' order) and
 * screen readers all work without custom ARIA. Choosing the current value again clears it.
 */
export function StarRating({ value, onChange, label = 'Your rating' }: StarRatingProps) {
  const name = useId();

  if (!onChange) {
    if (!value) return null;
    return (
      <span className={styles.static} role="img" aria-label={`Rated ${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} size={16} aria-hidden="true" className={n <= value ? styles.on : styles.off} />
        ))}
      </span>
    );
  }

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>{label}</legend>
      <div className={styles.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={styles.star} data-on={value !== null && n <= value} title={LABELS[n]}>
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              className="u-sr-only"
              onChange={() => onChange(n)}
              onClick={() => {
                if (value === n) onChange(null);
              }}
            />
            <Star aria-hidden="true" size={26} />
            <span className="u-sr-only">
              {n} {n === 1 ? 'star' : 'stars'}, {LABELS[n]}
            </span>
          </label>
        ))}
      </div>
      <p className={styles.caption} aria-hidden="true">
        {value ? LABELS[value] : 'Not rated yet'}
        <span className={styles.keyHint}> · keys 1–5, 0 clears</span>
      </p>
    </fieldset>
  );
}
