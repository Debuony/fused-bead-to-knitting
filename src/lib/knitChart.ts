import type { Grid } from './grid';

export type Placement = 'center' | 'repeat' | 'ends';
export type BorderStyle = 'none' | 'garter' | 'seed';

export interface ChartOptions {
  /** Stitches per 10 cm. */
  gaugeSts: number;
  /** Rows per 10 cm. */
  gaugeRows: number;
  /** Width of the motif in stitches (0 = one stitch per bead). */
  motifWidthSts: number;
  /** Total scarf width in stitches (0 = automatic). */
  scarfWidthSts: number;
  /** Scarf length in cm. */
  lengthCm: number;
  placement: Placement;
  /** Rows between repeated motifs / between motif and border. */
  spacingRows: number;
  /** Main (background) yarn colour. */
  bgHex: string;
  borderSts: number;
  borderStyle: BorderStyle;
  /** Per-yarn edits keyed by the bead colour's hex (or 'main' for the main yarn). */
  yarnOverrides?: Record<string, { name?: string; hex?: string }>;
}

export interface Yarn {
  hex: string;
  name: string;
  symbol: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface KnitChart {
  w: number;
  h: number;
  /** Yarn index per stitch, row-major; row 0 is the top of the chart (last row knitted). */
  cells: number[];
  /** 0 = knit (stockinette), 1 = purl bump (texture). */
  stitch: number[];
  yarns: Yarn[];
  /** Where motifs were placed. */
  motifs: Rect[];
  gaugeSts: number;
  gaugeRows: number;
  /** Edge treatment, used to predict how much the fabric curls. */
  borderStyle: BorderStyle;
  borderSts: number;
}

export const DEFAULT_CHART_OPTIONS: ChartOptions = {
  gaugeSts: 20,
  gaugeRows: 28,
  motifWidthSts: 0,
  scarfWidthSts: 0,
  lengthCm: 160,
  placement: 'ends',
  spacingRows: 8,
  bgHex: '#f3ede2',
  borderSts: 4,
  borderStyle: 'seed',
  yarnOverrides: {},
};

/** Main-yarn suggestions, soft neutrals first. */
export const MAIN_YARNS = ['#f3ede2', '#ffffff', '#c9b79c', '#8c9aa8', '#2b2b2b', '#2d3a5c', '#7a2b33', '#506b4b'];

/** Chart symbols, assigned in order. Index 0 (main yarn) is left blank. */
export const SYMBOLS = ['', '●', '○', '▲', '△', '■', '□', '◆', '◇', '★', '☆', '✚', '✕', '♥', '♣', '♠', '♦', '◐', '◑', '▼', '▽', '/', '\\', '=', '#', '%', '@', '&', 'S', 'Z', 'Y', 'Q'];

/** Number of chart rows the motif needs so it keeps its proportions despite non-square stitches. */
export function motifSize(grid: Grid, opts: Pick<ChartOptions, 'gaugeSts' | 'gaugeRows' | 'motifWidthSts'>) {
  const mw = opts.motifWidthSts > 0 ? opts.motifWidthSts : grid.w;
  const beadSts = mw / grid.w; // stitches per bead horizontally
  const mh = Math.max(1, Math.round(grid.h * beadSts * (opts.gaugeRows / opts.gaugeSts)));
  return { mw, mh };
}

/** Nearest-neighbour resample of the bead grid into motif stitches. Returns grid colour indices (-1 = empty). */
export function resampleMotif(grid: Grid, mw: number, mh: number, rotate180 = false): number[] {
  const out = new Array(mw * mh);
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++) {
      const sx = Math.min(grid.w - 1, Math.floor(((x + 0.5) * grid.w) / mw));
      const sy = Math.min(grid.h - 1, Math.floor(((y + 0.5) * grid.h) / mh));
      const v = grid.cells[sy * grid.w + sx];
      if (rotate180) out[(mh - 1 - y) * mw + (mw - 1 - x)] = v;
      else out[y * mw + x] = v;
    }
  return out;
}

/** Stable key for a yarn: 'main' or the source bead colour's hex. */
export function yarnKey(grid: Grid, yarnIndex: number) {
  return yarnIndex === 0 ? 'main' : grid.colors[yarnIndex - 1].hex.toLowerCase();
}

export function autoScarfWidth(mw: number, borderSts: number) {
  return mw + 2 * borderSts + 2 * Math.max(2, Math.round(mw * 0.1));
}

export function buildChart(grid: Grid, opts: ChartOptions): KnitChart {
  const { mw, mh } = motifSize(grid, opts);
  const b = Math.max(0, opts.borderSts);
  const minW = mw + 2 * b;
  const W = opts.scarfWidthSts > 0 ? Math.max(minW, opts.scarfWidthSts) : autoScarfWidth(mw, b);
  const rowsForLength = Math.round((opts.lengthCm * opts.gaugeRows) / 10);
  const minH = mh + 2 * b + 2 * opts.spacingRows;
  const H = Math.max(minH, rowsForLength);

  const yarns: Yarn[] = [{ hex: opts.bgHex, name: 'Main', symbol: SYMBOLS[0] }];
  grid.colors.forEach((c, i) => yarns.push({ hex: c.hex, name: c.name, symbol: SYMBOLS[(i + 1) % SYMBOLS.length] }));
  yarns.forEach((y, i) => {
    const o = opts.yarnOverrides?.[yarnKey(grid, i)];
    if (o?.name) y.name = o.name;
    if (o?.hex) y.hex = o.hex;
  });

  const cells = new Array(W * H).fill(0);
  const stitch = new Array(W * H).fill(0);

  // Border texture.
  if (opts.borderStyle !== 'none' && b > 0) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const inBorder = x < b || x >= W - b || y < b || y >= H - b;
        if (!inBorder) continue;
        stitch[y * W + x] = opts.borderStyle === 'garter' ? y % 2 : (x + y) % 2;
      }
  }

  const x0 = Math.floor((W - mw) / 2);
  const motifs: Rect[] = [];
  const place = (y0: number, rotate: boolean) => {
    const m = resampleMotif(grid, mw, mh, rotate);
    for (let y = 0; y < mh; y++)
      for (let x = 0; x < mw; x++) {
        const v = m[y * mw + x];
        if (v >= 0) cells[(y0 + y) * W + x0 + x] = v + 1;
      }
    motifs.push({ x: x0, y: y0, w: mw, h: mh });
  };

  const top = b + opts.spacingRows;
  const bottom = H - b - opts.spacingRows; // exclusive
  if (opts.placement === 'center') {
    place(Math.floor((H - mh) / 2), false);
  } else if (opts.placement === 'repeat') {
    const step = mh + opts.spacingRows;
    const count = Math.max(1, Math.floor((bottom - top + opts.spacingRows) / step));
    const used = count * mh + (count - 1) * opts.spacingRows;
    const start = top + Math.floor((bottom - top - used) / 2);
    for (let i = 0; i < count; i++) place(start + i * step, false);
  } else {
    // One motif at each end. Row 1 (bottom) is cast on; the top motif is rotated so
    // both read upright when the scarf hangs around the neck.
    place(bottom - mh, false);
    if (bottom - mh - top >= mh + opts.spacingRows) place(top, true);
  }

  return {
    w: W, h: H, cells, stitch, yarns, motifs, gaugeSts: opts.gaugeSts, gaugeRows: opts.gaugeRows,
    borderStyle: opts.borderSts > 0 ? opts.borderStyle : 'none', borderSts: opts.borderSts,
  };
}

export interface YarnUsage {
  stitches: number;
  meters: number;
}

/** Rough yarn estimate: each stitch uses about 3.5× its width in yarn. */
export function yarnUsage(chart: KnitChart): YarnUsage[] {
  const counts = chart.yarns.map(() => 0);
  for (const c of chart.cells) counts[c]++;
  const stitchWidthCm = 10 / chart.gaugeSts;
  return counts.map((n) => ({ stitches: n, meters: (n * stitchWidthCm * 3.5) / 100 }));
}

/** Physical size of the finished scarf in cm. */
export function chartSizeCm(chart: KnitChart) {
  return { widthCm: (chart.w * 10) / chart.gaugeSts, lengthCm: (chart.h * 10) / chart.gaugeRows };
}

/** Row region around the first motif, for a compact printable chart. */
export function motifSection(chart: KnitChart, padRows = 3): Rect {
  const m = chart.motifs[0];
  if (!m) return { x: 0, y: 0, w: chart.w, h: chart.h };
  const y = Math.max(0, m.y - padRows);
  const yEnd = Math.min(chart.h, m.y + m.h + padRows);
  return { x: 0, y, w: chart.w, h: yEnd - y };
}
