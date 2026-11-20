import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/Logo/Logo';
import styles from './AuthPages.module.css';

export function AuthLayout({ title, lede, children, footer }: { title: string; lede?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className={styles.screen}>
      <a href="#main" className="u-skip-link">
        Skip to content
      </a>
      <header className={styles.top}>
        <Link to="/" className={styles.brand}>
          <Logo />
          {' '}<span className="u-sr-only">home</span>
        </Link>
      </header>
      <main id="main" className={styles.main}>
        <div className={styles.card}>
          <h1 className={styles.title}>{title}</h1>
          {lede && <p className={styles.lede}>{lede}</p>}
          {children}
        </div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </main>
    </div>
  );
}
