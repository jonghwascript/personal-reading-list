import { applyPreferences, readPreferences, READING_STORAGE_KEY, savePreferences, DEFAULT_PREFERENCES } from './preferences';

const root = document.documentElement;
const attrs = () => ({
  contrast: root.getAttribute('data-contrast'),
  text: root.getAttribute('data-text'),
  spacing: root.getAttribute('data-spacing'),
  font: root.getAttribute('data-font'),
});

beforeEach(() => {
  localStorage.clear();
  applyPreferences(DEFAULT_PREFERENCES);
});
afterEach(() => vi.unstubAllGlobals());

describe('reading preferences', () => {
  it('defaults to nothing on <html>', () => {
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(attrs()).toEqual({ contrast: null, text: null, spacing: null, font: null });
  });

  it('saves only what differs from the defaults and reflects it on <html>', () => {
    savePreferences({ contrast: 'more', textSize: 'larger', spacing: 'relaxed', font: 'default' });
    expect(JSON.parse(localStorage.getItem(READING_STORAGE_KEY)!)).toEqual({ contrast: 'more', textSize: 'larger', spacing: 'relaxed' });
    expect(attrs()).toEqual({ contrast: 'more', text: 'larger', spacing: 'relaxed', font: null });
    savePreferences(DEFAULT_PREFERENCES);
    expect(localStorage.getItem(READING_STORAGE_KEY)).toBeNull();
    expect(attrs()).toEqual({ contrast: null, text: null, spacing: null, font: null });
  });

  it('ignores unknown or malformed stored values', () => {
    localStorage.setItem(READING_STORAGE_KEY, JSON.stringify({ textSize: 'gigantic', font: 'dyslexic' }));
    expect(readPreferences()).toEqual({ ...DEFAULT_PREFERENCES, font: 'dyslexic' });
    localStorage.setItem(READING_STORAGE_KEY, '{not json');
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it('"system" contrast follows prefers-contrast: more; "standard" overrides it', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('prefers-contrast: more'), addEventListener() {} }));
    applyPreferences({ ...DEFAULT_PREFERENCES, contrast: 'system' });
    expect(root.getAttribute('data-contrast')).toBe('more');
    applyPreferences({ ...DEFAULT_PREFERENCES, contrast: 'standard' });
    expect(root.getAttribute('data-contrast')).toBeNull();
  });
});
