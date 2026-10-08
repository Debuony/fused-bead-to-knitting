import { useEffect, useRef } from 'react';
import { hexToRgb } from '../lib/color';
import type { KnitChart } from '../lib/knitChart';

/** Tiny horizontal overview of the whole scarf (one pixel per stitch). Row 1 is on the left. */
export function MiniScarf({ chart }: { chart: KnitChart }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = chart.h;
    c.height = chart.w;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(chart.h, chart.w);
    const rgb = chart.yarns.map((y) => hexToRgb(y.hex));
    for (let y = 0; y < chart.h; y++)
      for (let x = 0; x < chart.w; x++) {
        const [r, g, b] = rgb[chart.cells[y * chart.w + x]];
        const i = (x * chart.h + (chart.h - 1 - y)) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  }, [chart]);
  return <canvas ref={ref} className="mini-scarf" />;
}
