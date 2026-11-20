import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import styles from './Toasts.module.css';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
  action?: { label: string; onClick(): void };
}

const ICONS = { info: Info, success: CircleCheck, error: CircleAlert };

/** Visual-only; announcements go through the live regions in AnnouncerProvider. */
export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss(id: number): void }) {
  return (
    <ol className={styles.region} role="list" aria-label="Notifications">
      {toasts.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <li key={t.id} className={`${styles.toast} ${styles[t.tone]}`}>
            <Icon className={styles.icon} aria-hidden="true" size={18} />
            <p className={styles.message}>{t.message}</p>
            {t.action && (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  t.action!.onClick();
                  onDismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className={styles.close} onClick={() => onDismiss(t.id)}>
              <X size={16} aria-hidden="true" />
              <span className="u-sr-only">Dismiss notification</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
