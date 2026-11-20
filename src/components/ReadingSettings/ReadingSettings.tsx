import { Link } from 'react-router-dom';
import { usePreferences, type ReadingPreferences } from '../../lib/preferences';
import { ThemeSwitcher } from '../ThemeSwitcher/ThemeSwitcher';
import { ChoiceGroup } from '../ui/ChoiceGroup';
import styles from './ReadingSettings.module.css';

/**
 * Appearance & reading preferences (accessibility-first differentiator). Every change applies
 * immediately and is remembered on this device; the sample paragraph shows the result in place.
 */
export function ReadingSettings() {
  const [prefs, update] = usePreferences();
  const set = <K extends keyof ReadingPreferences>(key: K) => (value: ReadingPreferences[K]) => update({ [key]: value } as Partial<ReadingPreferences>);

  return (
    <div className={styles.settings}>
      <ThemeSwitcher />
      <ChoiceGroup
        legend="Contrast"
        value={prefs.contrast}
        onChange={set('contrast')}
        options={[
          { value: 'system', label: 'System' },
          { value: 'standard', label: 'Standard' },
          { value: 'more', label: 'High' },
        ]}
      />
      <ChoiceGroup
        legend="Text size"
        value={prefs.textSize}
        onChange={set('textSize')}
        options={[
          { value: 'default', label: 'Default' },
          { value: 'large', label: 'Large' },
          { value: 'larger', label: 'Larger' },
        ]}
      />
      <ChoiceGroup
        legend="Line spacing"
        value={prefs.spacing}
        onChange={set('spacing')}
        options={[
          { value: 'default', label: 'Default' },
          { value: 'relaxed', label: 'Relaxed' },
        ]}
      />
      <ChoiceGroup
        legend="Font"
        value={prefs.font}
        onChange={set('font')}
        options={[
          { value: 'default', label: 'Lora & Inter' },
          { value: 'dyslexic', label: 'OpenDyslexic' },
        ]}
      />

      <figure className={styles.sample}>
        <figcaption className={styles.sampleLabel}>Preview</figcaption>
        <p className={styles.sampleTitle}>A reading nook with good lighting</p>
        <p className={styles.sampleBody}>
          Book descriptions and your notes use these settings too. Pick whatever makes a page feel easy to settle into — you can
          change it any time.
        </p>
      </figure>

      <p className={styles.note}>
        “System” follows your device’s settings. Choices are remembered on this device. See the{' '}
        <Link to="/accessibility">accessibility statement</Link> for keyboard shortcuts and what has been tested.
      </p>
    </div>
  );
}
