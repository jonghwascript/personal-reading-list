import { contrast, deepen, TINT_TEXT } from './coverTint';

describe('deepen', () => {
  // Pale, saturated, dark and neutral covers: every tint must carry cream text at WCAG AAA.
  it.each([
    [255, 255, 255],
    [250, 230, 60],
    [255, 182, 185],
    [97, 192, 191],
    [200, 40, 30],
    [20, 20, 20],
    [128, 128, 128],
  ] as [number, number, number][])('rgb(%i, %i, %i) → cream text ≥ 7:1', (r, g, b) => {
    const tint = deepen([r, g, b]);
    expect(tint).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrast(tint, TINT_TEXT)).toBeGreaterThanOrEqual(7);
  });

  it('keeps the hue of a colourful cover', () => {
    const tint = deepen([200, 40, 30]);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(tint.slice(i, i + 2), 16));
    expect(r!).toBeGreaterThan(g!);
    expect(r!).toBeGreaterThan(b!);
  });
});
