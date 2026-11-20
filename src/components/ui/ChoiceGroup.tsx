import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';
import styles from './ChoiceGroup.module.css';

export interface Choice<T extends string> {
  value: T;
  label: string;
  Icon?: LucideIcon;
}

interface ChoiceGroupProps<T extends string> {
  legend: string;
  value: T;
  options: Choice<T>[];
  onChange(value: T): void;
  /** Icon-only buttons (labels stay available to screen readers and as tooltips). */
  compact?: boolean;
  /** Visually hide the legend when a surrounding heading already names the group. */
  hideLegend?: boolean;
}

/**
 * A segmented control built from a native radio group: arrow keys move between options and screen
 * readers announce "Text size, Large, 2 of 3". Selection shows as fill + weight, never colour alone.
 */
export function ChoiceGroup<T extends string>({ legend, value, options, onChange, compact = false, hideLegend = false }: ChoiceGroupProps<T>) {
  const name = useId();
  return (
    <fieldset className={`${styles.group} ${compact ? styles.compact : ''}`}>
      <legend className={hideLegend ? 'u-sr-only' : styles.legend}>{legend}</legend>
      <div className={styles.segments}>
        {options.map(({ value: optionValue, label, Icon }) => (
          <label key={optionValue} className={styles.segment} title={compact ? label : undefined}>
            <input
              type="radio"
              name={name}
              value={optionValue}
              checked={value === optionValue}
              onChange={() => onChange(optionValue)}
              className="u-sr-only"
            />
            {Icon && <Icon size={16} aria-hidden="true" />}
            <span className={compact && Icon ? 'u-sr-only' : undefined}>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
