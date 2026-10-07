import { contrastText } from './color';
import type { KnitChart, Rect } from './knitChart';

export interface ChartRenderOptions {
  cell: number;
  /** Fill squares with yarn colour (false = symbols only, printer friendly). */
  colored: boolean;
  showSymbols: boolean;
  showNumbers: boolean;
  /** Draw purl bumps for textured stitches. */
  showTexture: boolean;
}

const MARGIN = 28;

/**
 * Draws a knitting chart for `region`. Row 1 is at the bottom; right-side (odd)
 * rows are numbered on the right and read right → left, wrong-side rows on the left.
 */
export function renderChart(chart: KnitChart, region: Rect, opts: ChartRenderOptions, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const c = canvas ?? document.createElement('canvas');
  const { cell } = opts;
  const pad = opts.showNumbers ? MARGIN : 2;
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  const cssW = region.w * cell + pad * 2;
  const cssH = region.h * cell + pad * 2;
  c.width = Math.round(cssW * dpr);
  c.height = Math.round(cssH * dpr);
  c.style.width = `${cssW}px`;
  c.style.height = `${cssH}px`;
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssW, cssH);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.max(7, cell * 0.62)}px system-ui, sans-serif`;
  for (let y = 0; y < region.h; y++) {
    for (let x = 0; x < region.w; x++) {
      const i = (region.y + y) * chart.w + region.x + x;
      const yarn = chart.yarns[chart.cells[i]];
      const px = pad + x * cell;
      const py = pad + y * cell;
      if (opts.colored) {
        ctx.fillStyle = yarn.hex;
        ctx.fillRect(px, py, cell, cell);
      }
      if (opts.showTexture && chart.stitch[i] === 1) {
        ctx.fillStyle = opts.colored ? contrastText(yarn.hex) : '#333';
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc(px + cell / 2, py + cell / 2, Math.max(1, cell * 0.12), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (opts.showSymbols && yarn.symbol && cell >= 8) {
        ctx.fillStyle = opts.colored ? contrastText(yarn.hex) : '#1d1b1a';
        ctx.fillText(yarn.symbol, px + cell / 2, py + cell / 2 + 0.5);
      }
    }
  }

  // Grid lines; every 10th stitch/row (counted from bottom-right) is bold.
  const totalRows = chart.h;
  for (let x = 0; x <= region.w; x++) {
    const stitchFromRight = chart.w - (region.x + x);
    ctx.strokeStyle = stitchFromRight % 10 === 0 ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.18)';
    ctx.lineWidth = stitchFromRight % 10 === 0 ? 1.2 : 0.6;
    ctx.beginPath();
    ctx.moveTo(pad + x * cell, pad);
    ctx.lineTo(pad + x * cell, pad + region.h * cell);
    ctx.stroke();
  }
  for (let y = 0; y <= region.h; y++) {
    const rowFromBottom = totalRows - (region.y + y);
    ctx.strokeStyle = rowFromBottom % 10 === 0 ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.18)';
    ctx.lineWidth = rowFromBottom % 10 === 0 ? 1.2 : 0.6;
    ctx.beginPath();
    ctx.moveTo(pad, pad + y * cell);
    ctx.lineTo(pad + region.w * cell, pad + y * cell);
    ctx.stroke();
  }

  if (opts.showNumbers) {
    ctx.fillStyle = '#555';
    ctx.font = `${Math.min(11, Math.max(8, cell * 0.6))}px system-ui, sans-serif`;
    const every = cell >= 12 ? 1 : 5;
    for (let y = 0; y < region.h; y++) {
      const row = totalRows - (region.y + y);
      if (row % every !== 0 && row !== 1) continue;
      const cy = pad + y * cell + cell / 2;
      if (row % 2 === 1) ctx.fillText(String(row), pad + region.w * cell + pad / 2, cy);
      else ctx.fillText(String(row), pad / 2, cy);
    }
    for (let x = 0; x < region.w; x++) {
      const st = chart.w - (region.x + x);
      if (st % every !== 0 && st !== 1) continue;
      ctx.fillText(String(st), pad + x * cell + cell / 2, pad + region.h * cell + pad / 2);
    }
  }
  return c;
}
