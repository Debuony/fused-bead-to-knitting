import type { PaletteColor } from './palettes';

/** A bead pattern. `cells[y * w + x]` is an index into `colors`, or -1 for an empty peg. */
export interface Grid {
  w: number;
  h: number;
  cells: number[];
  colors: PaletteColor[];
}

export const EMPTY = -1;

export function createGrid(w: number, h: number, colors: PaletteColor[] = []): Grid {
  return { w, h, cells: new Array(w * h).fill(EMPTY), colors };
}

export function cloneGrid(g: Grid): Grid {
  return { w: g.w, h: g.h, cells: g.cells.slice(), colors: g.colors.slice() };
}

export function countColors(g: Grid): number[] {
  const counts = new Array(g.colors.length).fill(0);
  for (const c of g.cells) if (c >= 0) counts[c]++;
  return counts;
}

/** Drop colours that are no longer used and re-index cells. */
export function compactGrid(g: Grid): Grid {
  const counts = countColors(g);
  const remap: number[] = [];
  const colors: PaletteColor[] = [];
  counts.forEach((n, i) => {
    if (n > 0) {
      remap[i] = colors.length;
      colors.push(g.colors[i]);
    }
  });
  return { ...g, colors, cells: g.cells.map((c) => (c >= 0 ? remap[c] : EMPTY)) };
}

/** Returns the colour index for a hex, adding it to the grid's colour list if missing. */
export function ensureColor(g: Grid, color: PaletteColor): [Grid, number] {
  const idx = g.colors.findIndex((c) => c.hex.toLowerCase() === color.hex.toLowerCase());
  if (idx >= 0) return [g, idx];
  return [{ ...g, colors: [...g.colors, color] }, g.colors.length];
}

export function floodFill(g: Grid, x: number, y: number, value: number): Grid {
  const target = g.cells[y * g.w + x];
  if (target === value) return g;
  const cells = g.cells.slice();
  const stack = [y * g.w + x];
  while (stack.length) {
    const i = stack.pop()!;
    if (cells[i] !== target) continue;
    cells[i] = value;
    const cx = i % g.w;
    const cy = (i - cx) / g.w;
    if (cx > 0) stack.push(i - 1);
    if (cx < g.w - 1) stack.push(i + 1);
    if (cy > 0) stack.push(i - g.w);
    if (cy < g.h - 1) stack.push(i + g.w);
  }
  return { ...g, cells };
}

export function replaceColor(g: Grid, from: number, to: number): Grid {
  return { ...g, cells: g.cells.map((c) => (c === from ? to : c)) };
}

export function mirrorH(g: Grid): Grid {
  const cells = g.cells.slice();
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) cells[y * g.w + x] = g.cells[y * g.w + (g.w - 1 - x)];
  return { ...g, cells };
}

export function mirrorV(g: Grid): Grid {
  const cells = g.cells.slice();
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) cells[y * g.w + x] = g.cells[(g.h - 1 - y) * g.w + x];
  return { ...g, cells };
}

export function rotate90(g: Grid): Grid {
  const w = g.h;
  const h = g.w;
  const cells = new Array(w * h);
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) cells[x * w + (g.h - 1 - y)] = g.cells[y * g.w + x];
  return { ...g, w, h, cells };
}

/** Add/remove rows or columns at an edge. `delta` > 0 adds empty lines, < 0 removes. */
export function resizeEdge(g: Grid, edge: 'top' | 'bottom' | 'left' | 'right', delta: number): Grid {
  const horizontal = edge === 'left' || edge === 'right';
  const w = horizontal ? g.w + delta : g.w;
  const h = horizontal ? g.h : g.h + delta;
  if (w < 1 || h < 1 || w > 300 || h > 300) return g;
  const offX = edge === 'left' ? delta : 0;
  const offY = edge === 'top' ? delta : 0;
  const cells = new Array(w * h).fill(EMPTY);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = x - offX;
      const sy = y - offY;
      if (sx >= 0 && sy >= 0 && sx < g.w && sy < g.h) cells[y * w + x] = g.cells[sy * g.w + sx];
    }
  return { ...g, w, h, cells };
}

/** Trim empty rows/columns around the motif. */
export function cropToContent(g: Grid): Grid {
  let minX = g.w, minY = g.h, maxX = -1, maxY = -1;
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++)
      if (g.cells[y * g.w + x] >= 0) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
  if (maxX < 0) return g;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const cells = new Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) cells[y * w + x] = g.cells[(y + minY) * g.w + x + minX];
  return { ...g, w, h, cells };
}

/** Fill the rectangle spanned by two corners. */
export function fillRect(g: Grid, x0: number, y0: number, x1: number, y1: number, value: number): Grid {
  const cells = g.cells.slice();
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) cells[y * g.w + x] = value;
  return { ...g, cells };
}

/** Paint a square brush of `size` cells centred on (x, y). */
export function paintBrush(g: Grid, x: number, y: number, size: number, value: number): Grid {
  const r0 = -Math.floor((size - 1) / 2);
  let changed = false;
  const cells = g.cells.slice();
  for (let dy = r0; dy < r0 + size; dy++)
    for (let dx = r0; dx < r0 + size; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      if (cells[ny * g.w + nx] !== value) { cells[ny * g.w + nx] = value; changed = true; }
    }
  return changed ? { ...g, cells } : g;
}
