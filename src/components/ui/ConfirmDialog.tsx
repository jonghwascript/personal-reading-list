import type { ReactNode } from 'react';
import { useAnimatedDialog } from '../../lib/motion';
import { Button } from './Button';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  onConfirm(): void;
  onCancel(): void;
}

/**
 * Built on native <dialog>: focus trapping, Escape, inert background and focus return to the
 * trigger all come from the platform. Reserved for destructive actions (patterns.md).
 */
export function ConfirmDialog({ open, title, children, confirmLabel, tone = 'primary', onConfirm, onCancel }: ConfirmDialogProps) {
  // Springs in, sinks out (GSAP); instant under reduced motion.
  const ref = useAnimatedDialog(open);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        // Clicking the backdrop (the dialog element itself, outside the panel) cancels.
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className={styles.panel}>
        <h2 id="confirm-title" className={styles.title}>
          {title}
        </h2>
        {children && (
          <div id="confirm-body" className={styles.body}>
            {children}
          </div>
        )}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel} autoFocus>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
