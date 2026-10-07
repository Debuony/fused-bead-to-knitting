import { describe, expect, it } from 'vitest';
import { createGrid, type Grid } from '../src/lib/grid';
import { DEFAULT_CHART_OPTIONS, buildChart, motifSize, yarnUsage } from '../src/lib/knitChart';

function sampleGrid(): Grid {
  const g = createGrid(10, 10, [
    { id: 'A', name: 'Red', hex: '#ff0000' },
    { id: 'B', name: 'Blue', hex: '#0000ff' },
  ]);
  for (let i = 0; i < g.cells.length; i++) g.cells[i] = i % 3 === 0 ? -1 : i % 2;
  return g;
}

describe('knitChart', () => {
  it('corrects proportions using the gauge', () => {
    const { mw, mh } = motifSize(sampleGrid(), { gaugeSts: 20, gaugeRows: 28, motifWidthSts: 0 });
    expect(mw).toBe(10);
    expect(mh).toBe(14);
    expect(motifSize(sampleGrid(), { gaugeSts: 20, gaugeRows: 28, motifWidthSts: 20 })).toEqual({ mw: 20, mh: 28 });
  });

  it('builds a scarf of the requested length', () => {
    const chart = buildChart(sampleGrid(), { ...DEFAULT_CHART_OPTIONS, lengthCm: 100, scarfWidthSts: 30 });
    expect(chart.w).toBe(30);
    expect(chart.h).toBe(280);
    expect(chart.yarns.length).toBe(3);
    expect(chart.motifs.length).toBe(2);
  });

  it('legend counts add up to the total stitches', () => {
    for (const placement of ['center', 'repeat', 'ends'] as const) {
      const chart = buildChart(sampleGrid(), { ...DEFAULT_CHART_OPTIONS, placement });
      const total = yarnUsage(chart).reduce((a, u) => a + u.stitches, 0);
      expect(total).toBe(chart.w * chart.h);
    }
  });

  it('rotates the top motif in "ends" placement', () => {
    const g = createGrid(2, 2, [{ id: 'A', name: 'A', hex: '#ff0000' }]);
    g.cells = [0, -1, -1, -1];
    const chart = buildChart(g, { ...DEFAULT_CHART_OPTIONS, gaugeSts: 10, gaugeRows: 10, lengthCm: 20, spacingRows: 1, borderSts: 0, scarfWidthSts: 2 });
    const [bottom, top] = chart.motifs;
    expect(chart.cells[bottom.y * chart.w + bottom.x]).toBe(1);
    expect(chart.cells[(top.y + 1) * chart.w + top.x + 1]).toBe(1);
  });

  it('applies yarn overrides', () => {
    const chart = buildChart(sampleGrid(), { ...DEFAULT_CHART_OPTIONS, yarnOverrides: { '#ff0000': { name: 'Cherry' } } });
    expect(chart.yarns[1].name).toBe('Cherry');
  });
});
