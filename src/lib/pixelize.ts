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

/** Brightness profile along one axis (sampling every 2nd pixel across), as first differences. */
function edgeProfile(img: ImageLike, axis: 'x' | 'y'): number[] {
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
  // First differences: bead edges and holes stand out, large shapes (whole pieces) fade.
  return profile.slice(1).map((v, i) => v - profile[i]);
}

/** Spectral power of `d` at each candidate period, normalised so the strongest is 1. */
function periodPower(d: number[], periods: number[]): number[] {
  const n = d.length;
  const pw = periods.map((p) => {
    let re = 0;
    let im = 0;
    const w = (2 * Math.PI) / p;
    for (let i = 0; i < n; i++) {
      re += d[i] * Math.cos(w * i);
      im += d[i] * Math.sin(w * i);
    }
    return (re * re + im * im) / n;
  });
  const max = Math.max(...pw) || 1;
  return pw.map((v) => v / max);
}

/**
 * Bead pitch in px. Beads are square, so one pitch must explain the texture in
 * both directions: we add up the spectra of both axes. A bead's hole, highlight and
 * the gaps between beads repeat 2–4× per bead, so the strongest period is often a
 * fraction of the bead. Like pitch detection in audio, we use a harmonic sum: the
 * bead size P is the period whose "overtones" P/2, P/3, P/4 are also strong and
 * which itself carries energy.
 */
export function detectPitch(img: ImageLike): number | null {
  const shortSide = Math.min(img.width, img.height);
  const maxP = Math.max(5, shortSide / 2.5);
  const periods: number[] = [];
  for (let p = 3; p <= maxP; p += p < 20 ? 0.2 : 0.5) periods.push(p);
  if (periods.length < 3) return null;
  const px = periodPower(edgeProfile(img, 'x'), periods);
  const py = periodPower(edgeProfile(img, 'y'), periods);
  const score = periods.map((_, i) => (px[i] + py[i]) / 2);
  const at = (p: number) => {
    if (p < periods[0]) return 0;
    let k = 0;
    while (k < periods.length - 1 && periods[k + 1] <= p) k++;
    // Peaks are narrow; look at a small neighbourhood.
    return Math.max(score[k], score[Math.max(0, k - 1)], score[Math.min(periods.length - 1, k + 1)]);
  };
  let best = -1;
  let bestSum = 0;
  periods.forEach((P, i) => {
    if (P < 4 || score[i] < 0.12) return; // the bead size itself must show up
    // Only count overtones above the shortest period we can see.
    let sum = 0;
    for (let n = 1; n <= 4; n++) sum += at(P / n);
    if (sum > bestSum * 1.02) {
      bestSum = sum;
      best = i;
    }
  });
  if (best < 0 || bestSum < 0.6) return null;
  let pitch = periods[best];
  // When the true bead size barely shows in the spectrum (tiny beads, soft photos),
  // the winner can still be half a bead: cells then split every bead in two, which
  // shows up as colour changes at only every other cell boundary.
  // (Only with enough beads to judge: the doubled grid must still be ≥ 5 beads across.)
  if (pitch * 2 <= Math.max(maxP, pitch) && shortSide / (pitch * 2) >= 5) {
    const half = splitEvidence(img, pitch);
    if (half > 0.9 && half > 1.4 * splitEvidence(img, pitch * 2)) pitch *= 2;
  }
  return pitch;
}

/**
 * "Split evidence" for cells of `pitch` px. If a cell is only part of a bead, colour
 * changes happen at just some cell boundaries (between beads, never inside one), so
 * the per-boundary totals alternate high/low. Measured locally, so a slightly-off
 * pitch drifting in and out of phase doesn't cancel it. Lowest at the true bead size.
 */
function splitEvidence(img: ImageLike, pitch: number): number {
  const gw = Math.max(3, Math.round(img.width / pitch));
  const gh = Math.max(3, Math.round(img.height / pitch));
  const cells = sampleCells(img, gw, gh, 0.5);
  const dist = (a: RGB, b: RGB) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  const D = new Array(gw - 1).fill(0);
  const E = new Array(gh - 1).fill(0);
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) {
      const a = cells[y * gw + x];
      if (!a) continue;
      const r = x + 1 < gw ? cells[y * gw + x + 1] : null;
      const d = y + 1 < gh ? cells[(y + 1) * gw + x] : null;
      if (r) D[x] += dist(a, r);
      if (d) E[y] += dist(a, d);
    }
  const alternation = (v: number[]) => {
    let num = 0;
    let den = 0;
    for (let i = 1; i + 1 < v.length; i++) {
      num += Math.abs(v[i] - (v[i - 1] + v[i + 1]) / 2);
      den += v[i];
    }
    return den ? num / den : 0;
  };
  const wD = D.reduce((a, b) => a + b, 0);
  const wE = E.reduce((a, b) => a + b, 0);
  return (alternation(D) * wD + alternation(E) * wE) / (wD + wE || 1) / 0.4;
}


/** How many beads span the image along one axis (null when no clear bead texture). */
export function detectGridCount(img: ImageLike, axis: 'x' | 'y'): number | null {
  const pitch = detectPitch(img);
  if (!pitch) return null;
  return Math.max(1, Math.round((axis === 'x' ? img.width : img.height) / pitch));
}
