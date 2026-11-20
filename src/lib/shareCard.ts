import { MONTHS } from './yearReview';
import { resizeCover } from './openLibrary';
import type { Book } from '../types';

export const CARD_SIZE = 1080;

// Same room as the in-app review hero, in whichever palette the reader is using.
const THEMES = {
  // One look for both schemes, matching the in-app hero.
  light: { ink: '#262021', cream: '#ede6d8', muted: '#c6bcae', accent: '#d9b26a', glow: '217,178,106' },
  dark: { ink: '#262021', cream: '#ede6d8', muted: '#c6bcae', accent: '#d9b26a', glow: '217,178,106' },
} as const;
const SPINES = ['#3b4a5e', '#7a3a52', '#5a5552', '#6a5526', '#2f4a45', '#6e3f35'];

export interface ShareCardInput {
  year: number;
  count: number;
  isCurrentYear: boolean;
  asOf: Date | null;
  books: Pick<Book, 'title' | 'authors' | 'coverUrl'>[];
  theme?: keyof typeof THEMES;
}

function loadCover(url: string | null): Promise<HTMLImageElement | null> {
  const src = resizeCover(url, 'M');
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    // Open Library and archive.org send CORS headers, so the canvas stays exportable.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img.naturalWidth > 1 ? img : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = next;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  return lines;
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, book: ShareCardInput['books'][number], x: number, y: number, w: number, h: number, i: number) {
  ctx.fillStyle = SPINES[i % SPINES.length]!;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#f6efe6';
  ctx.font = `600 ${Math.round(w / 8)}px Lora, Georgia, serif`;
  const lines = wrapLines(ctx, book.title, w * 0.78, 5);
  lines.forEach((l, li) => ctx.fillText(l, x + w * 0.12, y + h * 0.18 + li * (w / 6.5)));
}

/** Draws the year card. Fonts are awaited first so the canvas never falls back to a default face. */
export async function drawShareCard(canvas: HTMLCanvasElement, input: ShareCardInput): Promise<void> {
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  await Promise.all([
    document.fonts?.load('700 200px Lora'),
    document.fonts?.load('600 56px Lora'),
    document.fonts?.load('600 28px Inter'),
  ]).catch(() => undefined);
  const covers = await Promise.all(input.books.map((b) => loadCover(b.coverUrl)));
  const { ink: INK, cream: CREAM, muted: MUTED, accent: ACCENT, glow: GLOW } = THEMES[input.theme ?? 'light'];

  // Background: the spine library's brown-black with a soft gilt glow, matching the in-app review hero.
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);
  const glow = ctx.createRadialGradient(CARD_SIZE * 0.85, 0, 50, CARD_SIZE * 0.85, 0, CARD_SIZE * 0.9);
  glow.addColorStop(0, `rgba(${GLOW},0.3)`);
  glow.addColorStop(1, `rgba(${GLOW},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_SIZE, CARD_SIZE);

  const pad = 80;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ACCENT;
  ctx.font = '600 28px Inter, system-ui, sans-serif';
  ctx.fillText('BOOKSHELF', pad, pad + 20);

  ctx.fillStyle = CREAM;
  ctx.font = '600 56px Lora, Georgia, serif';
  ctx.fillText(input.isCurrentYear ? `My ${input.year} so far` : `My ${input.year} in books`, pad, pad + 110);

  ctx.font = '700 220px Lora, Georgia, serif';
  ctx.fillText(String(input.count), pad - 8, pad + 330);
  const numberWidth = ctx.measureText(String(input.count)).width;
  ctx.fillStyle = MUTED;
  ctx.font = '500 40px Inter, system-ui, sans-serif';
  ctx.fillText(input.count === 1 ? 'book finished' : 'books finished', pad + numberWidth + 16, pad + 330);

  // Covers: one large row for a handful, two rows for more.
  const books = input.books.slice(0, 10);
  const perRow = books.length <= 5 ? books.length : Math.ceil(books.length / 2);
  const rows = books.length <= 5 ? 1 : 2;
  const gap = 24;
  const areaTop = 480;
  const areaHeight = CARD_SIZE - areaTop - 110;
  const maxW = (CARD_SIZE - pad * 2 - gap * (perRow - 1)) / Math.max(perRow, 1);
  const maxH = (areaHeight - gap * (rows - 1)) / rows;
  const h = Math.min(maxH, maxW * 1.5);
  const w = h / 1.5;

  books.forEach((book, i) => {
    const row = rows === 1 ? 0 : i < perRow ? 0 : 1;
    const inRow = rows === 1 ? books.length : row === 0 ? perRow : books.length - perRow;
    const col = row === 0 ? i : i - perRow;
    const rowWidth = inRow * w + (inRow - 1) * gap;
    const x = pad + (CARD_SIZE - pad * 2 - rowWidth) / 2 + col * (w + gap);
    const y = areaTop + row * (h + gap);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    const img = covers[i];
    if (img) ctx.drawImage(img, x, y, w, h);
    else drawPlaceholder(ctx, book, x, y, w, h, i);
    ctx.restore();
  });

  ctx.fillStyle = MUTED;
  ctx.font = '500 26px Inter, system-ui, sans-serif';
  const footer = input.asOf ? `As of ${MONTHS[input.asOf.getMonth()]} ${input.asOf.getDate()}, ${input.year}` : `${input.year} reading year`;
  ctx.fillText(footer, pad, CARD_SIZE - 60);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null); // A tainted canvas (cover without CORS) can't be exported.
    }
  });
}
