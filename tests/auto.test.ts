import { describe, expect, it } from 'vitest';
import { autoCrop, autoMainYarn, autoPixelize, autoRemoveBackground, despeckle } from '../src/lib/auto';
import { createGrid } from '../src/lib/grid';
import { backgroundQuality, type ImageLike } from '../src/lib/pixelize';

const COLORS: Record<string, [number, number, number]> = {
  R: [227, 38, 58], G: [54, 180, 91], W: [255, 255, 255], B: [200, 200, 200], T: [201, 167, 124],
};

/** Beads (circles with holes) on a grey board with an optional wooden table margin. */
function beadPhoto(pattern: string[], cell = 16, table = 0, boardMargin = 2): ImageLike {
  const gw = pattern[0].length + boardMargin * 2;
  const gh = pattern.length + boardMargin * 2;
  const w = gw * cell + table * 2;
  const h = gh * cell + table * 2;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let rgb = COLORS.T;
      const bx = x - table;
      const by = y - table;
      if (bx >= 0 && by >= 0 && bx < gw * cell && by < gh * cell) {
        rgb = COLORS.B;
        const px = Math.floor(bx / cell) - boardMargin;
        const py = Math.floor(by / cell) - boardMargin;
        const ch = pattern[py]?.[px];
        const dx = (bx % cell) - cell / 2;
        const dy = (by % cell) - cell / 2;
        const r2 = dx * dx + dy * dy;
        if (ch && ch !== '.' && r2 < (cell * 0.47) ** 2) rgb = r2 < (cell * 0.14) ** 2 ? [60, 60, 60] : COLORS[ch];
        else if (r2 < (cell * 0.12) ** 2) rgb = [170, 170, 170];
      }
      const i = (y * w + x) * 4;
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
    }
  return { width: w, height: h, data };
}

const HEART = ['.RR.RR.', 'RRRRRRR', 'RRWRRRR', '.RRRRR.', '..RRR..', '...R...'];

describe('auto', () => {
  it('crops a pegboard on a table down to the beads', () => {
    const img = beadPhoto(HEART, 16, 40);
    const crop = autoCrop(img);
    // Beads start at table(40) + boardMargin(2)*16 = 72px of a 7+4=11 cell wide board + 80px table.
    expect(crop.x * img.width).toBeGreaterThan(55);
    expect(crop.x * img.width).toBeLessThan(80);
    expect(crop.w * img.width).toBeLessThan(7 * 16 + 20);
  });

  it('pixelizes a photo with no settings at all', () => {
    const res = autoPixelize(beadPhoto(HEART, 16, 0));
    expect(res.detected).toBe(true);
    expect([res.gridW, res.gridH]).toEqual([11, 10]);
    expect(res.removeBg).toBe(true);
    const kept = res.grid.cells.filter((c) => c >= 0).length;
    expect(kept).toBe(HEART.join('').replace(/\./g, '').length);
  });

  it('crop then pixelize removes table, board and pegs', () => {
    const img = beadPhoto(HEART, 16, 40);
    const c = autoCrop(img);
    const x0 = Math.round(c.x * img.width);
    const y0 = Math.round(c.y * img.height);
    const w = Math.round(c.w * img.width);
    const h = Math.round(c.h * img.height);
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (let k = 0; k < 4; k++) data[(y * w + x) * 4 + k] = img.data[((y + y0) * img.width + x + x0) * 4 + k];
    const res = autoPixelize({ width: w, height: h, data });
    expect([res.gridW, res.gridH]).toEqual([7, 6]);
    expect(res.grid.cells.filter((v) => v >= 0).length).toBe(HEART.join('').replace(/\./g, '').length);
  });

  it('rates a plain background as good', () => {
    expect(backgroundQuality(beadPhoto(HEART, 16, 0))).toBe('good');
  });

  it('despeckles noise but keeps distinct details', () => {
    const g = createGrid(5, 5, [
      { id: 'a', name: 'red', hex: '#e3263a' },
      { id: 'b', name: 'darker red', hex: '#c81f33' },
      { id: 'c', name: 'yellow seed', hex: '#fff3a3' },
    ]);
    g.cells = g.cells.map(() => 0);
    g.cells[12] = 1; // shading noise
    g.cells[6] = 2; // a seed
    const out = despeckle(g);
    expect(out.cells[12]).toBe(0);
    expect(out.cells[6]).toBe(2);
  });

  it('erases a leftover background colour touching the border', () => {
    const g = createGrid(5, 5, [{ id: 'a', name: 'a', hex: '#cccccc' }, { id: 'b', name: 'b', hex: '#ff0000' }]);
    g.cells = g.cells.map((_, i) => (i === 12 ? 1 : 0));
    const out = autoRemoveBackground(g);
    expect(out.cells.filter((c) => c >= 0)).toEqual([1]);
  });

  it('picks a contrasting main yarn', () => {
    const g = createGrid(1, 1, [{ id: 'a', name: 'a', hex: '#f3ede2' }]);
    g.cells = [0];
    expect(autoMainYarn(g)).not.toBe('#f3ede2');
  });
});
