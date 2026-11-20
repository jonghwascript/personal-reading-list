import { Monitor, Moon, Sun } from 'lucide-react';
import { useThemePreference, type ThemePreference } from '../../lib/theme';
import { ChoiceGroup, type Choice } from '../ui/ChoiceGroup';

const OPTIONS: Choice<ThemePreference>[] = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

/** Stretch #15 — "System" follows the OS and is the default. */
export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const [pref, setPref] = useThemePreference();
  return <ChoiceGroup legend="Theme" value={pref} options={OPTIONS} onChange={setPref} compact={compact} />;
}
