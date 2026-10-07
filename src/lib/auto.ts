import { deltaE, hexToRgb, rgbToLab, type RGB } from './color';
import { EMPTY, countColors, floodFill, type Grid } from './grid';
import type { CropRect } from './imageUtils';
import { MAIN_YARNS } from './knitChart';
import type { PaletteColor } from './palettes';
import { autoTolerance, detectGridCount, estimateBackground, pixelize, sampleCells, type ImageLike } from './pixelize';
import { kmeans } from './quantize';

/** Bounding box of everything that isn't background, as a fraction of the image. */
function contentBox(img: ImageLike, region: CropRect, neutralOnly: boolean): CropRect | null {
  const x0 = Math.floor(region.x * img.width);
  const y0 = Math.floor(region.y * img.height);
  const w = Math.max(1, Math.floor(region.w * img.width));
  const h = Math.max(1, Math.floor(region.h * img.height));
  const step = Math.max(1, Math.round(Math.max(w, h) / 300));
  const band = Math.max(step, Math.round(Math.min(w, h) * 0.08));
  const at = (x: number, y: number): RGB => {
    const i = (y * img.width + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };
  const border: RGB[] = [];
  for (let y = y0; y < y0 + h; y += step)
    for (let x = x0; x < x0 + w; x += step)
      if (x - x0 < band || y - y0 < band || x0 + w - x <= band || y0 + h - y <= band) border.push(at(x, y));
  // Pixel-level: small but consistent clusters (pegs, board texture) are background too.
  const bg = estimateBackground(border, 0.03);
  // Inside the first crop, only neutral colours (paper, pegboard) may be background —
  // otherwise pale edge beads would be cropped away.
  if (neutralOnly) bg.colors = bg.colors.filter((c) => Math.hypot(c[1], c[2]) < 12);
  if (!bg.colors.length) return null;
  const tol = autoTolerance(bg.spread);
  const cols = Math.ceil(w / step);
  const rows = Math.ceil(h / step);
  const colHits = new Array(cols).fill(0);
  const rowHits = new Array(rows).fill(0);
  const fg = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const lab = rgbToLab(at(x0 + c * step, y0 + r * step));
      fg[r * cols + c] = bg.colors.every((b) => deltaE(lab, b) > tol) ? 1 : 0;
    }
  // Erode: ignore specks smaller than a couple of samples (pegs, dust, crumbs).
  const d = 2;
  const isFg = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows && fg[r * cols + c] === 1;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      if (isFg(c, r) && isFg(c - d, r) && isFg(c + d, r) && isFg(c, r - d) && isFg(c, r + d)) { colHits[c]++; rowHits[r]++; }
  const first = (arr: number[], n: number) => arr.findIndex((v) => v > n * 0.04);
  const last = (arr: number[], n: number) => arr.length - 1 - [...arr].reverse().findIndex((v) => v > n * 0.04);
  const c0 = first(colHits, rows);
  const r0 = first(rowHits, cols);
  if (c0 < 0 || r0 < 0) return null;
  const c1 = last(colHits, rows);
  const r1 = last(rowHits, cols);
  return {
    x: region.x + (c0 / cols) * region.w,
    y: region.y + (r0 / rows) * region.h,
    w: ((c1 - c0 + 1) / cols) * region.w,
    h: ((r1 - r0 + 1) / rows) * region.h,
  };
}

/**
 * Find the beads in the photo. Runs twice so a pegboard on a table is first
 * cropped to the board, then to the beads on the board.
 */
export function autoCrop(img: ImageLike): CropRect {
  let crop: CropRect = { x: 0, y: 0, w: 1, h: 1 };
  for (let pass = 0; pass < 2; pass++) {
    const box = contentBox(img, crop, pass > 0);
    if (!box || box.w * box.h > crop.w * crop.h * 0.97 || box.w * box.h < 0.01) break;
    crop = box;
  }
  return crop;
}

/** Bead count from the photo's periodic texture, falling back to the aspect ratio. */
export function autoGridSize(img: ImageLike): { w: number; h: number; detected: boolean } {
  const w = detectGridCount(img, 'x');
  const h = detectGridCount(img, 'y');
  const aspect = img.height / img.width;
  if (w && h) return { w, h, detected: true };
  if (w) return { w, h: Math.max(2, Math.round(w * aspect)), detected: true };
  if (h) return { w: Math.max(2, Math.round(h / aspect)), h, detected: true };
  return aspect >= 1
    ? { w: Math.max(2, Math.round(29 / aspect)), h: 29, detected: false }
    : { w: 29, h: Math.max(2, Math.round(29 * aspect)), detected: false };
}

/** Smallest number of colours that describes the beads well. */
export function autoColorCount(colors: RGB[]): number {
  if (colors.length < 3) return Math.max(1, colors.length);
  const step = Math.max(1, Math.floor(colors.length / 2000));
  const sample = colors.filter((_, i) => i % step === 0);
  const labs = sample.map(rgbToLab);
  for (let k = 2; k <= 16; k++) {
    const centres = kmeans(sample, k, 8).map(rgbToLab);
    let err = 0;
    for (const l of labs) err += Math.min(...centres.map((c) => deltaE(l, c)));
    if (err / labs.length <= 5) return k;
  }
  return 16;
}

export interface AutoPixelizeResult {
  gridW: number;
  gridH: number;
  maxColors: number;
  removeBg: boolean;
  detected: boolean;
  grid: Grid;
}

/** Pick grid size, colour count and background removal automatically. */
export function autoPixelize(img: ImageLike, palette?: PaletteColor[]): AutoPixelizeResult {
  const size = autoGridSize(img);
  const base = { gridW: size.w, gridH: size.h, palette };
  const withBg = pixelize(img, { ...base, maxColors: 0, removeBackground: true });
  const total = size.w * size.h;
  const kept = withBg.cells.filter((c) => c >= 0).length;
  const removeBg = kept >= total * 0.15 && kept <= total * 0.97;
  const samples = sampleCells(img, size.w, size.h).filter((s, i): s is RGB => s !== null && (!removeBg || withBg.cells[i] >= 0));
  const maxColors = Math.min(24, Math.max(2, autoColorCount(samples)));
  const grid = pixelize(img, { ...base, maxColors, removeBackground: removeBg });
  return { gridW: size.w, gridH: size.h, maxColors, removeBg, detected: size.detected, grid: despeckle(grid) };
}

/**
 * Replace lone beads whose neighbours mostly agree on another, *similar* colour —
 * that's photo noise (shading, glare). Clearly different lone beads (seeds, eyes,
 * sparkles) are design details and are kept.
 */
export function despeckle(g: Grid, maxDelta = 18): Grid {
  const labs = g.colors.map((c) => rgbToLab(hexToRgb(c.hex)));
  const cells = g.cells.slice();
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const v = g.cells[y * g.w + x];
      if (v === EMPTY) continue; // never fill gaps — they're usually part of the design
      const counts = new Map<number, number>();
      let same = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
          const nv = g.cells[ny * g.w + nx];
          n++;
          if (nv === v) same++;
          counts.set(nv, (counts.get(nv) ?? 0) + 1);
        }
      if (same > 0 || n < 5) continue;
      let best = v;
      let bestN = 0;
      for (const [k, c] of counts) if (c > bestN) { bestN = c; best = k; }
      if (bestN >= 5 && best !== EMPTY && deltaE(labs[v], labs[best]) <= maxDelta) cells[y * g.w + x] = best;
    }
  return { ...g, cells };
}

/**
 * Remove a leftover background in an existing pattern: if most border cells
 * share one colour, erase that colour wherever it touches the border.
 */
export function autoRemoveBackground(g: Grid): Grid {
  const border: number[] = [];
  for (let x = 0; x < g.w; x++) border.push(g.cells[x], g.cells[(g.h - 1) * g.w + x]);
  for (let y = 1; y < g.h - 1; y++) border.push(g.cells[y * g.w], g.cells[y * g.w + g.w - 1]);
  const counts = new Map<number, number>();
  for (const c of border) if (c >= 0) counts.set(c, (counts.get(c) ?? 0) + 1);
  let bg = EMPTY;
  let bgN = 0;
  for (const [k, n] of counts) if (n > bgN) { bgN = n; bg = k; }
  if (bg === EMPTY || bgN < border.length * 0.6) return g;
  let out = g;
  for (let x = 0; x < g.w; x++)
    for (const y of [0, g.h - 1]) if (out.cells[y * g.w + x] === bg) out = floodFill(out, x, y, EMPTY);
  for (let y = 0; y < g.h; y++)
    for (const x of [0, g.w - 1]) if (out.cells[y * g.w + x] === bg) out = floodFill(out, x, y, EMPTY);
  return out;
}

/** Main yarn: the first soft neutral that stands apart from every motif colour, else the most contrasting. */
export function autoMainYarn(g: Grid): string {
  const counts = countColors(g);
  const labs = g.colors.filter((_, i) => counts[i] > 0).map((c) => rgbToLab(hexToRgb(c.hex)));
  if (!labs.length) return MAIN_YARNS[0];
  let best = MAIN_YARNS[0];
  let bestD = -1;
  for (const hex of MAIN_YARNS) {
    const lab = rgbToLab(hexToRgb(hex));
    const d = Math.min(...labs.map((l) => deltaE(l, lab)));
    if (d >= 20) return hex; // first soft neutral that stands apart from the motif
    if (d > bestD) { bestD = d; best = hex; }
  }
  return best;
}
