import styles from './Logo.module.css';

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={`${styles.logo} ${styles[size]}`}>
      <svg viewBox="0 0 32 32" className={styles.mark} aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="var(--color-accent)" />
        <rect x="7" y="8" width="4" height="16" rx="1" fill="var(--color-bg-primary)" />
        <rect x="12.5" y="6" width="4" height="18" rx="1" fill="var(--color-bg-primary)" opacity=".85" />
        <rect x="18" y="9.5" width="4" height="14.5" rx="1" fill="var(--color-bg-primary)" transform="rotate(-12 20 16.75)" />
        <rect x="6" y="24.5" width="20" height="1.75" rx=".875" fill="var(--color-bg-primary)" />
      </svg>
      <span className={styles.word}>Bookshelf</span>
    </span>
  );
}
