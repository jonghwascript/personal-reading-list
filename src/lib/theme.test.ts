import { act, renderHook } from '@testing-library/react';
import { applyThemePreference, isDarkThemeActive, readThemePreference, setThemePreference, THEME_STORAGE_KEY, useThemePreference } from './theme';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('theme preference', () => {
  it('defaults to following the system', () => {
    expect(readThemePreference()).toBe('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('saves a choice and reflects it on <html data-theme>', () => {
    setThemePreference('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(isDarkThemeActive()).toBe(true);

    setThemePreference('light');
    expect(isDarkThemeActive()).toBe(false);
  });

  it('"system" clears the override and the stored value', () => {
    setThemePreference('dark');
    setThemePreference('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('ignores junk in storage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(readThemePreference()).toBe('system');
  });

  it('follows a change made in another tab', () => {
    const { result } = renderHook(() => useThemePreference());
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY }));
    });
    expect(result.current[0]).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyThemePreference('system');
  });
});
