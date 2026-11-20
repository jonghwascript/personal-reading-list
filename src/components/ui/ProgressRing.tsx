import styles from './ProgressRing.module.css';

interface ProgressRingProps {
  value: number;
  label: string;
  /** Human text for assistive tech, e.g. "Page 147 of 350". Defaults to the percentage. */
  valueText?: string;
  tone?: 'progress' | 'success';
  /** Milestone ticks around the ring (e.g. 50%). Decorative only. */
  marks?: number[];
}

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The dashboard's one big number: progress as a ring with the percentage inside. Same progressbar
 * semantics as ProgressBar; the drawing and the number in the middle are decorative.
 */
export function ProgressRing({ value, label, valueText, tone = 'progress', marks = [] }: ProgressRingProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={styles.ring}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-valuetext={valueText ?? `${Math.round(clamped)}%`}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <circle className={styles.track} cx="32" cy="32" r={RADIUS} />
        <circle
          className={`${styles.fill} ${styles[tone]}`}
          cx="32"
          cy="32"
          r={RADIUS}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - clamped / 100)}
        />
        {marks.map((at) => {
          // The svg is turned -90°, so 0 rad (3 o'clock in svg space) is the top of the dial.
          const angle = (at / 100) * 2 * Math.PI;
          const [x1, y1, x2, y2] = [RADIUS - 5, RADIUS + 5].flatMap((r) => [32 + r * Math.cos(angle), 32 + r * Math.sin(angle)]);
          return <line key={at} className={styles.mark} data-passed={clamped >= at} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </svg>
      <span className={styles.value} aria-hidden="true">
        {Math.round(clamped)}
        <span className={styles.unit}>%</span>
      </span>
    </div>
  );
}
