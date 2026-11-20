import { useCallback, useEffect, useState } from 'react';
import { canAnimate } from './motion';

/** "system" follows prefers-color-scheme; the other two override it. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** Also read by the inline script in index.html, which applies it before first paint. */
export const THEME_STORAGE_KEY = 'bookshelf:theme';

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** Reflects a preference on <html data-theme>, which tokens.css keys the dark palette off. */
export function applyThemePreference(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
}

/** Whether the dark palette is showing right now (chosen, or inherited from the system). */
export function isDarkThemeActive(): boolean {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'dark') return true;
  if (chosen === 'light') return false;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => unknown };

/**
 * Saves and applies a theme. Where the browser supports View Transitions the whole page
 * cross-fades between palettes; otherwise (or under reduced motion) it switches instantly.
 */
export function setThemePreference(pref: ThemePreference): void {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  const doc = document as ViewTransitionDocument;
  if (canAnimate() && typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(() => applyThemePreference(pref));
  } else {
    applyThemePreference(pref);
  }
}

/** Current preference plus a setter; stays in sync when another tab changes it. */
export function useThemePreference(): [ThemePreference, (pref: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>(readThemePreference);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      const next = readThemePreference();
      applyThemePreference(next);
      setPref(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((next: ThemePreference) => {
    setThemePreference(next);
    setPref(next);
  }, []);

  return [pref, update];
}
