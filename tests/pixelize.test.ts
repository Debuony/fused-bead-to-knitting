import { describe, expect, it } from 'vitest';
import { detectGridCount, pixelize, type ImageLike } from '../src/lib/pixelize';
import type { PaletteColor } from '../src/lib/palettes';

const PALETTE: PaletteColor[] = [
  { id: 'R', name: 'Red', hex: '#ff0000' },
  { id: 'G', name: 'Green', hex: '#00ff00' },
  { id: 'B', name: 'Blue', hex: '#0000ff' },
  { id: 'W', name: 'White', hex: '#ffffff' },
];

/** Build a test image of `cells` (palette indices) with `size` px per cell. */
function makeImage(cells: number[][], size: number, holes = false): ImageLike {
  const h = cells.length * size;
  const w = cells[0].length * size;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = cells[Math.floor(y / size)][Math.floor(x / size)];
      const n = parseInt(PALETTE[v].hex.slice(1), 16);
      let rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      const cx = (x % size) - size / 2;
      const cy = (y % size) - size / 2;
      if (holes && cx * cx + cy * cy < (size * 0.15) ** 2) rgb = [40, 40, 40];
      if (holes && (x % size === 0 || y % size === 0)) rgb = [30, 30, 30];
      const i = (y * w + x) * 4;
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
    }
  return { width: w, height: h, data };
}

const PATTERN = [
  [0, 1, 2, 3],
  [3, 0, 1, 2],
  [2, 3, 0, 1],
  [1, 2, 3, 0],
];

describe('pixelize', () => {
  it('recovers an exact 4×4 grid', () => {
    const g = pixelize(makeImage(PATTERN, 10), { gridW: 4, gridH: 4, palette: PALETTE, maxColors: 0 });
    const hexes = g.cells.map((c) => g.colors[c].hex);
    expect(hexes).toEqual(PATTERN.flat().map((i) => PALETTE[i].hex));
  });

  it('ignores bead holes thanks to centre median sampling', () => {
    const g = pixelize(makeImage(PATTERN, 20, true), { gridW: 4, gridH: 4, palette: PALETTE, maxColors: 0 });
    expect(g.cells.map((c) => g.colors[c].hex)).toEqual(PATTERN.flat().map((i) => PALETTE[i].hex));
  });

  it('limits colours', () => {
    const g = pixelize(makeImage(PATTERN, 10), { gridW: 4, gridH: 4, palette: PALETTE, maxColors: 2 });
    expect(g.colors.length).toBe(2);
  });

  it('removes a border-connected background', () => {
    const cells = [
      [3, 3, 3, 3],
      [3, 0, 0, 3],
      [3, 0, 3, 3],
      [3, 3, 3, 3],
    ];
    const g = pixelize(makeImage(cells, 8), { gridW: 4, gridH: 4, palette: PALETTE, maxColors: 0, removeBackground: true });
    expect(g.cells.filter((c) => c >= 0).length).toBe(3);
  });

  it('derives colours automatically when no palette is given', () => {
    const g = pixelize(makeImage(PATTERN, 6), { gridW: 4, gridH: 4, maxColors: 4 });
    expect(g.colors.length).toBe(4);
  });

  it('detects the bead count from periodic holes', () => {
    const cells = Array.from({ length: 12 }, (_, y) => Array.from({ length: 16 }, (_, x) => (x + y) % 4));
    const img = makeImage(cells, 12, true);
    expect(detectGridCount(img, 'x')).toBe(16);
    expect(detectGridCount(img, 'y')).toBe(12);
  });
});
