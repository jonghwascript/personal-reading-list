import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  value: number;
  label: string;
  /** Human text for assistive tech, e.g. "Page 147 of 350". Defaults to the percentage. */
  valueText?: string;
  tone?: 'progress' | 'success';
  size?: 'sm' | 'md';
  /** Milestone ticks (e.g. 50%, 90%). Passed marks are drawn filled. Decorative only. */
  marks?: { at: number; label: string }[];
}

export function ProgressBar({ value, label, valueText, tone = 'progress', size = 'md', marks = [] }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={styles.wrap}>
      <div
        className={`${styles.track} ${styles[size]}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-valuetext={valueText ?? `${Math.round(clamped)}%`}
      >
        <div className={`${styles.fill} ${styles[tone]}`} style={{ inlineSize: `${clamped}%` }} />
      </div>
      {marks.map((m) => (
        <span
          key={m.at}
          className={styles.mark}
          data-passed={clamped >= m.at}
          style={{ insetInlineStart: `${m.at}%` }}
          title={m.label}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
