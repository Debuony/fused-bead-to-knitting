import { describe, expect, it } from 'vitest';
import { suggestMainYarns } from '../src/lib/auto';
import { deltaE, hexToRgb, rgbToLab } from '../src/lib/color';
import { createGrid } from '../src/lib/grid';
import { DEFAULT_CHART_OPTIONS, buildChart } from '../src/lib/knitChart';
import { DEFAULT_SCARF_OPTIONS, applyColorChange, effectiveCurl } from '../src/lib/scarfRender';

function heart() {
  const g = createGrid(4, 4, [{ id: 'r', name: 'red', hex: '#e3263a' }, { id: 'g', name: 'green', hex: '#36b45b' }]);
  g.cells = [-1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 1, 0, -1, 0, 0, -1];
  return g;
}

describe('scarf effects', () => {
  it('predicts curl from the edge stitch', () => {
    const g = heart();
    const opts = DEFAULT_SCARF_OPTIONS;
    expect(effectiveCurl(buildChart(g, { ...DEFAULT_CHART_OPTIONS, borderStyle: 'none' }), opts)).toBeGreaterThan(0.7);
    expect(effectiveCurl(buildChart(g, { ...DEFAULT_CHART_OPTIONS, borderSts: 0 }), opts)).toBeGreaterThan(0.7);
    expect(effectiveCurl(buildChart(g, { ...DEFAULT_CHART_OPTIONS, borderSts: 4 }), opts)).toBeLessThan(0.1);
    expect(effectiveCurl(buildChart(g, DEFAULT_CHART_OPTIONS), { ...opts, curl: 0.3 })).toBe(0.3);
  });

  it('colour-changing yarn only recolours the main yarn', () => {
    const chart = buildChart(heart(), DEFAULT_CHART_OPTIONS);
    for (const mode of ['gradient', 'stripes'] as const) {
      const out = applyColorChange(chart, { ...DEFAULT_SCARF_OPTIONS, colorChange: mode });
      chart.cells.forEach((c, i) => {
        if (c !== 0) expect(out.cells[i]).toBe(c);
      });
      const mainish = new Set(out.cells.filter((_, i) => chart.cells[i] === 0));
      expect(mainish.size).toBeGreaterThan(1);
    }
  });

  it('suggests main yarns that stand apart from the motif', () => {
    const g = heart();
    const motif = g.colors.map((c) => rgbToLab(hexToRgb(c.hex)));
    const picks = suggestMainYarns(g);
    expect(picks.length).toBe(3);
    for (const p of picks) {
      const lab = rgbToLab(hexToRgb(p));
      expect(Math.min(...motif.map((m) => deltaE(m, lab)))).toBeGreaterThanOrEqual(20);
    }
  });
});
