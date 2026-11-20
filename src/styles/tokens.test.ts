// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guards the palette: reads starter/tokens.css and checks WCAG contrast for every text/background
 * pairing the UI actually uses, in both modes. Change a colour and this tells you if it's still legible.
 */
const css = readFileSync(resolve(__dirname, '../../starter/tokens.css'), 'utf8');
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--(color-[\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]));
}

const light = tokens(css.slice(0, darkStart));
const dark = { ...light, ...tokens(css.slice(darkStart)) };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const BACKGROUNDS = ['color-bg-primary', 'color-bg-secondary', 'color-bg-tertiary', 'color-surface'];
const TEXT = ['color-text-primary', 'color-text-secondary', 'color-text-tertiary', 'color-accent', 'color-success', 'color-warning', 'color-error'];

describe.each([
  ['light', light, '#ffffff'],
  ['dark', dark, '#0f1e1d'],
])('%s palette', (_mode, p, onAccent) => {
  it.each(TEXT.flatMap((t) => BACKGROUNDS.map((bg) => [t, bg])))('%s on %s ≥ 4.5:1', (text, bg) => {
    expect(contrast(p[text]!, p[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it('button labels on the accent ≥ 4.5:1', () => {
    expect(contrast(onAccent, p['color-accent']!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(onAccent, p['color-accent-hover']!)).toBeGreaterThanOrEqual(4.5);
  });

  it('progress and rating marks ≥ 3:1 against their backgrounds', () => {
    expect(contrast(p['color-progress']!, p['color-bg-tertiary']!)).toBeGreaterThanOrEqual(3);
    expect(contrast(p['color-rating']!, p['color-surface']!)).toBeGreaterThanOrEqual(3);
  });
});
