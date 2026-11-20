import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  /** Square icon-only button; children become the accessible label. */
  iconOnly?: boolean;
}

function classes({ variant = 'secondary', size = 'md', iconOnly }: CommonProps, extra?: string) {
  return [styles.button, styles[variant], styles[size], iconOnly && styles.iconOnly, extra].filter(Boolean).join(' ');
}

function Content({ icon, iconOnly, children }: CommonProps & { children?: ReactNode }) {
  return (
    <>
      {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
      {iconOnly ? <span className="u-sr-only">{children}</span> : children}
    </>
  );
}

export const Button = forwardRef<HTMLButtonElement, CommonProps & ButtonHTMLAttributes<HTMLButtonElement>>(
  function Button({ variant, size, icon, iconOnly, className, children, type = 'button', ...rest }, ref) {
    return (
      <button ref={ref} type={type} className={classes({ variant, size, iconOnly }, className)} {...rest}>
        <Content icon={icon} iconOnly={iconOnly}>
          {children}
        </Content>
      </button>
    );
  },
);

export function ButtonLink({ variant, size, icon, iconOnly, className, children, ...rest }: CommonProps & LinkProps) {
  return (
    <Link className={classes({ variant, size, iconOnly }, className)} {...rest}>
      <Content icon={icon} iconOnly={iconOnly}>
        {children}
      </Content>
    </Link>
  );
}
