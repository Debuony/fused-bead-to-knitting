import { renderChart } from './chartRender';
import { chartSizeCm, yarnUsage, type KnitChart, type Rect } from './knitChart';

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

export function downloadJson(data: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface PdfLabels {
  title: string;
  size: string;
  legend: string;
  stitches: string;
  meters: string;
  readNote: string;
}

/**
 * Builds an A4 PDF: a legend page then the chart tiled across pages. Charts are
 * rendered to images so the Unicode symbols print correctly.
 */
export async function exportChartPdf(chart: KnitChart, region: Rect, colored: boolean, labels: PdfLabels, filename: string) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  const m = 12;

  // Legend page — rendered on a canvas to support Chinese text.
  const usage = yarnUsage(chart);
  const size = chartSizeCm(chart);
  const lc = document.createElement('canvas');
  const scale = 4; // px per mm
  lc.width = (pageW - 2 * m) * scale;
  lc.height = (pageH - 2 * m) * scale;
  const ctx = lc.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, lc.width, lc.height);
  ctx.fillStyle = '#1d1b1a';
  ctx.font = `bold ${8 * scale}px system-ui, sans-serif`;
  ctx.fillText(labels.title, 0, 10 * scale);
  ctx.font = `${4 * scale}px system-ui, sans-serif`;
  ctx.fillText(`${labels.size}: ${chart.w} × ${chart.h} · ${size.widthCm.toFixed(0)} × ${size.lengthCm.toFixed(0)} cm`, 0, 20 * scale);
  ctx.fillText(labels.readNote, 0, 27 * scale);
  ctx.font = `bold ${5 * scale}px system-ui, sans-serif`;
  ctx.fillText(labels.legend, 0, 40 * scale);
  ctx.font = `${4 * scale}px system-ui, sans-serif`;
  chart.yarns.forEach((y, i) => {
    const top = (46 + i * 9) * scale;
    if (top > lc.height - 10 * scale) return;
    ctx.fillStyle = y.hex;
    ctx.fillRect(0, top, 7 * scale, 7 * scale);
    ctx.strokeStyle = '#999';
    ctx.strokeRect(0, top, 7 * scale, 7 * scale);
    ctx.fillStyle = '#1d1b1a';
    ctx.textAlign = 'center';
    ctx.fillText(y.symbol, 3.5 * scale, top + 5 * scale);
    ctx.textAlign = 'left';
    ctx.fillText(`${y.name}  ${y.hex}  ·  ${usage[i].stitches} ${labels.stitches}  ·  ≈${usage[i].meters.toFixed(1)} ${labels.meters}`, 10 * scale, top + 5 * scale);
  });
  pdf.addImage(lc.toDataURL('image/png'), 'PNG', m, m, pageW - 2 * m, pageH - 2 * m);

  // Chart pages: pick tile size so cells are ≥ 3.5 mm.
  const cellMm = 3.5;
  const colsPerPage = Math.floor((pageW - 2 * m - 16) / cellMm);
  const rowsPerPage = Math.floor((pageH - 2 * m - 22) / cellMm);
  let page = 1;
  // Tile from the bottom (row 1) upwards so page 1 is where knitting starts.
  for (let yEnd = region.y + region.h; yEnd > region.y; yEnd -= rowsPerPage) {
    const y0 = Math.max(region.y, yEnd - rowsPerPage);
    for (let xEnd = region.x + region.w; xEnd > region.x; xEnd -= colsPerPage) {
      const x0 = Math.max(region.x, xEnd - colsPerPage);
      const tile = { x: x0, y: y0, w: xEnd - x0, h: yEnd - y0 };
      const c = renderChart(chart, tile, { cell: 24, colored, showSymbols: true, showNumbers: true, showTexture: true });
      pdf.addPage();
      const pxPerMm = 24 / cellMm;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const wMm = c.width / dpr / pxPerMm;
      const hMm = c.height / dpr / pxPerMm;
      pdf.addImage(c.toDataURL('image/png'), 'PNG', m, m + 8, wMm, hMm);
      pdf.setFontSize(9);
      pdf.text(`${page++}`, pageW - m, pageH - m / 2, { align: 'right' });
    }
  }
  pdf.save(filename);
}
