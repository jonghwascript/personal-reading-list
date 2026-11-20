import { Monitor, Moon, Sun } from 'lucide-react';
import { useId } from 'react';
import { useThemePreference, type ThemePreference } from '../../lib/theme';
import styles from './ThemeSwitcher.module.css';

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

/**
 * Stretch #15 — theme choice as a native radio group (arrow keys move between options, screen
 * readers announce "Theme, Dark, 3 of 3"). "System" follows the OS and is the default.
 */
export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const [pref, setPref] = useThemePreference();
  const name = useId();

  return (
    <fieldset className={`${styles.switcher} ${compact ? styles.compact : ''}`}>
      <legend className={styles.legend}>Theme</legend>
      <div className={styles.segments}>
        {OPTIONS.map(({ value, label, Icon }) => (
          <label key={value} className={styles.segment} title={compact ? label : undefined}>
            <input type="radio" name={name} value={value} checked={pref === value} onChange={() => setPref(value)} className="u-sr-only" />
            <Icon size={16} aria-hidden="true" />
            <span className={compact ? 'u-sr-only' : undefined}>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
