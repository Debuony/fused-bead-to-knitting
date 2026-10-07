import { deltaE, hexToRgb, nearestIndex, rgbToHex, rgbToLab, type RGB } from './color';
import { EMPTY, compactGrid, type Grid } from './grid';
import type { PaletteColor } from './palettes';
import { kmeans, reduceColors } from './quantize';

export interface ImageLike {
  width: number;
  height: number;
  data: Uint8ClampedArray | number[];
}

export interface PixelizeOptions {
  gridW: number;
  gridH: number;
  /** Bead palette to snap to. Empty/undefined → derive colours from the photo with k-means. */
  palette?: PaletteColor[];
  /** Maximum number of colours in the result (0 = unlimited). */
  maxColors: number;
  /** Fraction (0–1) of each cell's centre that is sampled, to skip bead holes and gaps. */
  sampleRatio?: number;
  /** Flood-fill from the border to remove the background (pegboard, table…). */
  removeBackground?: boolean;
  /** ΔE tolerance for background removal. */
  bgTolerance?: number;
}

const median = (arr: number[]) => {
  const s = arr.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
};

/** Sample one representative colour per grid cell (median of the cell's centre). Null = transparent cell. */
export function sampleCells(img: ImageLike, gridW: number, gridH: number, sampleRatio = 0.6): (RGB | null)[] {
  const out: (RGB | null)[] = [];
  const cw = img.width / gridW;
  const ch = img.height / gridH;
  const margin = (1 - sampleRatio) / 2;
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const x0 = Math.floor((gx + margin) * cw);
      const x1 = Math.max(x0 + 1, Math.ceil((gx + 1 - margin) * cw));
      const y0 = Math.floor((gy + margin) * ch);
      const y1 = Math.max(y0 + 1, Math.ceil((gy + 1 - margin) * ch));
      const rs: number[] = [];
      const gs: number[] = [];
      const bs: number[] = [];
      let total = 0;
      for (let y = y0; y < Math.min(y1, img.height); y++) {
        for (let x = x0; x < Math.min(x1, img.width); x++) {
          const i = (y * img.width + x) * 4;
          total++;
          if (img.data[i + 3] < 128) continue;
          rs.push(img.data[i]);
          gs.push(img.data[i + 1]);
          bs.push(img.data[i + 2]);
        }
      }
      out.push(rs.length > total / 2 ? [median(rs), median(gs), median(bs)] : null);
    }
  }
  return out;
}

/** Mark cells connected to the border whose colour is close to the border's dominant colour. */
function backgroundMask(samples: (RGB | null)[], w: number, h: number, tolerance: number): boolean[] {
  const mask = samples.map((s) => s === null);
  const border: RGB[] = [];
  for (let x = 0; x < w; x++) {
    const a = samples[x];
    const b = samples[(h - 1) * w + x];
    if (a) border.push(a);
    if (b) border.push(b);
  }
  for (let y = 0; y < h; y++) {
    const a = samples[y * w];
    const b = samples[y * w + w - 1];
    if (a) border.push(a);
    if (b) border.push(b);
  }
  if (!border.length) return mask;
  const bg = rgbToLab([median(border.map((c) => c[0])), median(border.map((c) => c[1])), median(border.map((c) => c[2]))]);
  const isBg = (i: number) => {
    const s = samples[i];
    return s === null || deltaE(rgbToLab(s), bg) <= tolerance;
  };
  const seen = new Array(w * h).fill(false);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (seen[i]) continue;
    seen[i] = true;
    if (!isBg(i)) continue;
    mask[i] = true;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  return mask;
}

export function pixelize(img: ImageLike, opts: PixelizeOptions): Grid {
  const { gridW: w, gridH: h } = opts;
  const samples = sampleCells(img, w, h, opts.sampleRatio ?? 0.6);
  const mask = opts.removeBackground ? backgroundMask(samples, w, h, opts.bgTolerance ?? 12) : samples.map((s) => s === null);
  const live = samples.map((s, i) => (mask[i] ? null : s));
  const liveColors = live.filter((s): s is RGB => s !== null);

  let colors: PaletteColor[];
  if (opts.palette && opts.palette.length) {
    colors = opts.palette;
  } else {
    const k = opts.maxColors > 0 ? opts.maxColors : 16;
    colors = kmeans(liveColors, k).map((rgb, i) => ({ id: `C${i + 1}`, name: `Colour ${i + 1}`, hex: rgbToHex(rgb) }));
  }
  const labs = colors.map((c) => rgbToLab(hexToRgb(c.hex)));
  let cells = live.map((s) => (s ? nearestIndex(rgbToLab(s), labs) : EMPTY));
  if (opts.maxColors > 0) cells = reduceColors(cells, labs, opts.maxColors);
  return compactGrid({ w, h, cells, colors });
}

/**
 * Estimate how many beads span the image by finding the dominant period of the
 * brightness profile (beads have holes/gaps that repeat regularly).
 * Returns null when no clear period is found.
 */
export function detectGridCount(img: ImageLike, axis: 'x' | 'y'): number | null {
  const len = axis === 'x' ? img.width : img.height;
  const other = axis === 'x' ? img.height : img.width;
  const profile = new Array(len).fill(0);
  for (let a = 0; a < len; a++) {
    let sum = 0;
    for (let b = 0; b < other; b += 2) {
      const x = axis === 'x' ? a : b;
      const y = axis === 'x' ? b : a;
      const i = (y * img.width + x) * 4;
      sum += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
    }
    profile[a] = sum;
  }
  // Detrend with a moving average so slow lighting changes don't dominate.
  const win = Math.max(3, Math.round(len / 10));
  const detr = profile.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(len - 1, i + win); j++) { s += profile[j]; n++; }
    return profile[i] - s / n;
  });
  const minP = Math.max(3, Math.floor(len / 120));
  const maxP = Math.floor(len / 5);
  let bestP = 0;
  let bestScore = 0;
  const energy = detr.reduce((s, v) => s + v * v, 0) || 1;
  for (let p = minP; p <= maxP; p++) {
    let s = 0;
    for (let i = 0; i + p < len; i++) s += detr[i] * detr[i + p];
    const score = s / energy;
    if (score > bestScore) { bestScore = score; bestP = p; }
  }
  if (!bestP || bestScore < 0.15) return null;
  return Math.round(len / bestP);
}
