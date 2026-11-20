import { useRef, type PointerEvent, type ReactNode } from 'react';
import styles from './TiltCover.module.css';

const MAX_TILT_DEG = 8;

interface TiltCoverProps {
  children: ReactNode;
  /** Extra class on the tilting layer (e.g. a card's own settle animation or spacing). */
  className?: string;
}

/**
 * The shared 3D hover for every book cover in a grid: the cover tilts toward the mouse, lifts, and
 * catches a soft glare. Hovering the cover triggers it; so does hovering any ancestor marked
 * `data-tilt-trigger` (a whole library card). Mouse only — touch never sees a stuck tilt — and
 * under prefers-reduced-motion it falls back to a static shadow.
 */
export function TiltCover({ children, className }: TiltCoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse') return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty('--tilt-x', `${(-y * MAX_TILT_DEG).toFixed(2)}deg`);
    el.style.setProperty('--tilt-y', `${(x * MAX_TILT_DEG).toFixed(2)}deg`);
    el.style.setProperty('--glare-x', `${((x + 0.5) * 100).toFixed(0)}%`);
  };

  const onPointerLeave = () => {
    ref.current?.style.removeProperty('--tilt-x');
    ref.current?.style.removeProperty('--tilt-y');
  };

  return (
    <div className={styles.frame} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <div ref={ref} className={[styles.tilt, className].filter(Boolean).join(' ')}>
        {children}
        <span className={styles.glare} aria-hidden="true" />
      </div>
    </div>
  );
}
