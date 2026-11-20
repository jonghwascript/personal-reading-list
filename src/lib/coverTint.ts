import { useEffect, useState } from 'react';
import { resizeCover } from './openLibrary';

/** The cream used for text on tinted bands; every tint is darkened until it reaches 7:1 against it. */
export const TINT_TEXT = '#f6efe6';
const MIN_CONTRAST = 7;

const cache = new Map<string, string | null>();

/**
 * A deep, cloth-like colour taken from a book's cover, for the dashboard's reading cards: the
 * cover's most colourful average, darkened (and calmed) until cream text on it reaches WCAG AAA.
 * Until the cover has been sampled, and for books whose cover can't be read, `fallback` (a hex
 * colour) is used, deepened the same way.
 * Open Library serves covers with CORS headers, so the pixels can be sampled.
 */
export function useCoverTint(coverUrl: string | null, fallback: string): string {
  const src = resizeCover(coverUrl, 'S');
  const [tint, setTint] = useState<string | null>(() => (src ? (cache.get(src) ?? null) : null));

  useEffect(() => {
    if (!src || cache.has(src)) {
      setTint(src ? (cache.get(src) ?? null) : null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      const result = img.naturalWidth > 1 ? sample(img) : null;
      cache.set(src, result);
      if (!cancelled) setTint(result);
    };
    img.onerror = () => {
      cache.set(src, null);
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return tint ?? deepen([1, 3, 5].map((i) => parseInt(fallback.slice(i, i + 2), 16)) as [number, number, number]);
}

function sample(img: HTMLImageElement): string | null {
  try {
    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    // Weight each pixel by its saturation so a colourful cover doesn't average out to mud.
    let [r, g, b, total] = [0, 0, 0, 0];
    for (let i = 0; i < data.length; i += 4) {
      const [pr, pg, pb] = [data[i]!, data[i + 1]!, data[i + 2]!];
      const weight = 0.08 + (Math.max(pr, pg, pb) - Math.min(pr, pg, pb)) / 255;
      r += pr * weight;
      g += pg * weight;
      b += pb * weight;
      total += weight;
    }
    return deepen([r / total, g / total, b / total]);
  } catch {
    return null; // A tainted canvas (no CORS) or no canvas support: use the fallback.
  }
}

/** Calms the saturation and lowers the lightness until cream text clears MIN_CONTRAST. */
export function deepen([r, g, b]: [number, number, number]): string {
  let [h, s, l] = rgbToHsl(r, g, b);
  s = Math.min(s, 0.45);
  l = Math.min(l, 0.32);
  let hex = hslToHex(h, s, l);
  while (contrast(hex, TINT_TEXT) < MIN_CONTRAST && l > 0.04) {
    l -= 0.02;
    hex = hslToHex(h, s, l);
  }
  return hex;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  [r, g, b] = [r / 255, g / 255, b / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
