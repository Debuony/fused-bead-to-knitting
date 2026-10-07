import { deltaE, hexToRgb, nearestIndex, rgbToHex, rgbToLab, type Lab, type RGB } from './color';
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
  /** ΔE tolerance for background removal (0/undefined = automatic). */
  bgTolerance?: number;
  /** Also remove background-coloured cells that are enclosed by the motif. */
  removeEnclosed?: boolean;
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

/**
 * Estimate the background colours from samples taken along the image border.
 * Clusters them (a pegboard, its pegs and the table can all show at the edge)
 * and keeps every cluster that covers at least `minShare` of the border (largest first).
 */
export function estimateBackground(border: RGB[], minShare = 0.12): { colors: Lab[]; spread: number } {
  if (!border.length) return { colors: [], spread: 0 };
  const centres = kmeans(border, Math.min(4, border.length), 8, 3);
  const labs = centres.map(rgbToLab);
  const counts = labs.map(() => 0);
  const dists: number[] = [];
  for (const c of border) {
    const lab = rgbToLab(c);
    let best = 0;
    let bestD = Infinity;
    labs.forEach((l, k) => {
      const d = deltaE(lab, l);
      if (d < bestD) { bestD = d; best = k; }
    });
    counts[best]++;
    dists.push(bestD);
  }
  const colors = labs
    .map((l, k) => ({ l, n: counts[k] }))
    .filter((c) => c.n >= border.length * minShare)
    .sort((a, b) => b.n - a.n)
    .map((c) => c.l);
  dists.sort((a, b) => a - b);
  return { colors, spread: dists[Math.floor(dists.length * 0.9)] ?? 0 };
}

function borderSamples(samples: (RGB | null)[], w: number, h: number): RGB[] {
  const out: RGB[] = [];
  const push = (i: number) => { const s = samples[i]; if (s) out.push(s); };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 1; y < h - 1; y++) { push(y * w); push(y * w + w - 1); }
  return out;
}

/** Automatic tolerance: wide enough to swallow the background's own variation. */
export function autoTolerance(spread: number) {
  return Math.max(8, Math.min(30, spread * 1.6 + 4));
}

/**
 * Mark background cells. By default only regions connected to the border are
 * removed (so e.g. white eyes inside a motif survive); `enclosed` also removes
 * matching cells anywhere.
 */
function backgroundMask(samples: (RGB | null)[], w: number, h: number, tolerance: number, enclosed: boolean): boolean[] {
  const mask = samples.map((s) => s === null);
  const bg = estimateBackground(borderSamples(samples, w, h));
  if (!bg.colors.length) return mask;
  // Backgrounds (paper, pegboards) are nearly always neutral while beads are colourful:
  // when the edge shows several colours, only treat the neutral ones as background.
  if (bg.colors.length > 1) {
    const neutral = bg.colors.filter((c) => Math.hypot(c[1], c[2]) < 15);
    bg.colors = neutral.length ? neutral : bg.colors.slice(0, 1);
  }
  const tol = tolerance > 0 ? tolerance : autoTolerance(bg.spread);
  const isBg = (i: number) => {
    const s = samples[i];
    if (s === null) return true;
    const lab = rgbToLab(s);
    return bg.colors.some((c) => deltaE(lab, c) <= tol);
  };
  if (enclosed) return samples.map((_, i) => isBg(i));
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

/**
 * How clean is the photo's background? Looks at a thin band around the whole
 * (uncropped) photo. Returns 'busy' when the edge has lots of different colours.
 */
export function backgroundQuality(img: ImageLike): 'good' | 'busy' {
  const band = Math.max(2, Math.round(Math.min(img.width, img.height) * 0.04));
  const step = Math.max(1, Math.round(Math.max(img.width, img.height) / 200));
  const px: RGB[] = [];
  for (let y = 0; y < img.height; y += step)
    for (let x = 0; x < img.width; x += step) {
      if (x >= band && x < img.width - band && y >= band && y < img.height - band) continue;
      const i = (y * img.width + x) * 4;
      px.push([img.data[i], img.data[i + 1], img.data[i + 2]]);
    }
  const { colors, spread } = estimateBackground(px);
  return colors.length > 1 && spread > 14 ? 'busy' : spread > 22 ? 'busy' : 'good';
}

export function pixelize(img: ImageLike, opts: PixelizeOptions): Grid {
  const { gridW: w, gridH: h } = opts;
  const samples = sampleCells(img, w, h, opts.sampleRatio ?? 0.6);
  const mask = opts.removeBackground ? backgroundMask(samples, w, h, opts.bgTolerance ?? 0, !!opts.removeEnclosed) : samples.map((s) => s === null);
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
