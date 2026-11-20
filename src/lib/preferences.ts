import { useCallback, useEffect, useState } from 'react';

/**
 * Reading & accessibility preferences (accessibility-first differentiator). Stored per device and
 * reflected as data-* attributes on <html>, which src/styles/preferences.css keys off. The inline
 * script in index.html applies the same attributes before first paint.
 */
export interface ReadingPreferences {
  /** "system" follows prefers-contrast: more. */
  contrast: 'system' | 'standard' | 'more';
  textSize: 'default' | 'large' | 'larger';
  spacing: 'default' | 'relaxed';
  font: 'default' | 'dyslexic';
}

export const READING_STORAGE_KEY = 'bookshelf:reading';

export const DEFAULT_PREFERENCES: ReadingPreferences = { contrast: 'system', textSize: 'default', spacing: 'default', font: 'default' };

const ALLOWED: { [K in keyof ReadingPreferences]: readonly ReadingPreferences[K][] } = {
  contrast: ['system', 'standard', 'more'],
  textSize: ['default', 'large', 'larger'],
  spacing: ['default', 'relaxed'],
  font: ['default', 'dyslexic'],
};

export function readPreferences(): ReadingPreferences {
  try {
    const raw = JSON.parse(localStorage.getItem(READING_STORAGE_KEY) ?? '{}') as Partial<Record<keyof ReadingPreferences, unknown>>;
    const prefs = { ...DEFAULT_PREFERENCES };
    for (const key of Object.keys(ALLOWED) as (keyof ReadingPreferences)[]) {
      const value = raw[key];
      if ((ALLOWED[key] as readonly unknown[]).includes(value)) (prefs as Record<string, unknown>)[key] = value;
    }
    return prefs;
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function systemWantsMoreContrast(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-contrast: more)').matches;
}

let dyslexicFontRequested = false;

/** The OpenDyslexic files are a separate chunk, fetched only by readers who choose the font. */
function loadDyslexicFont() {
  if (dyslexicFontRequested) return;
  dyslexicFontRequested = true;
  void Promise.all([import('@fontsource/opendyslexic/400.css'), import('@fontsource/opendyslexic/700.css')]);
}

export function applyPreferences(prefs: ReadingPreferences): void {
  const root = document.documentElement;
  const moreContrast = prefs.contrast === 'more' || (prefs.contrast === 'system' && systemWantsMoreContrast());
  const set = (attr: string, value: string | null) => {
    if (value) root.setAttribute(attr, value);
    else root.removeAttribute(attr);
  };
  set('data-contrast', moreContrast ? 'more' : null);
  set('data-text', prefs.textSize === 'default' ? null : prefs.textSize);
  set('data-spacing', prefs.spacing === 'default' ? null : prefs.spacing);
  set('data-font', prefs.font === 'default' ? null : prefs.font);
  if (prefs.font === 'dyslexic') loadDyslexicFont();
}

export function savePreferences(prefs: ReadingPreferences): void {
  try {
    const changed = Object.fromEntries(
      (Object.keys(prefs) as (keyof ReadingPreferences)[]).filter((k) => prefs[k] !== DEFAULT_PREFERENCES[k]).map((k) => [k, prefs[k]]),
    );
    if (Object.keys(changed).length) localStorage.setItem(READING_STORAGE_KEY, JSON.stringify(changed));
    else localStorage.removeItem(READING_STORAGE_KEY);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  applyPreferences(prefs);
}

/** Called once at startup: loads the font if chosen and follows OS contrast changes live. */
export function initPreferences(): void {
  applyPreferences(readPreferences());
  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-contrast: more)').addEventListener?.('change', () => applyPreferences(readPreferences()));
  }
}

export function usePreferences(): [ReadingPreferences, (patch: Partial<ReadingPreferences>) => void] {
  const [prefs, setPrefs] = useState<ReadingPreferences>(readPreferences);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== READING_STORAGE_KEY) return;
      const next = readPreferences();
      applyPreferences(next);
      setPrefs(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((patch: Partial<ReadingPreferences>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  return [prefs, update];
}
