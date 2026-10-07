import { shade } from './color';
import type { KnitChart } from './knitChart';
import { mulberry32 } from './quantize';

export interface ScarfRenderOptions {
  /** On-screen width of one stitch in px. */
  stitchPx: number;
  orientation: 'horizontal' | 'vertical';
  fringe: boolean;
  /** Soft lengthwise folds and a gentle wave. */
  drape: boolean;
  /** Fibre fuzz amount 0–1. */
  fuzz: number;
  /** Yarn plumpness 0.7–1.3 (how much each leg fills its cell). */
  thickness: number;
  shadow: boolean;
  seed?: number;
}

export const DEFAULT_SCARF_OPTIONS: ScarfRenderOptions = {
  stitchPx: 8,
  orientation: 'horizontal',
  fringe: true,
  drape: true,
  fuzz: 0.5,
  thickness: 1,
  shadow: true,
};

const VARIANTS = 3;

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** One knit "V" (two tilted loops) or a purl bump, pre-rendered for speed. */
function stitchSprite(hex: string, purl: boolean, w: number, h: number, opts: ScarfRenderOptions, variant: number): HTMLCanvasElement {
  const padY = h * 0.4;
  const c = makeCanvas(w, h + padY * 2);
  const ctx = c.getContext('2d')!;
  const rand = mulberry32((opts.seed ?? 1) * 997 + variant * 131 + hex.length);
  const base = shade(hex, (variant - 1) * 0.035);
  const light = shade(base, 0.22);
  const dark = shade(base, -0.2);
  const t = opts.thickness;

  const leg = (cx: number, cy: number, rx: number, ry: number, rot: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const g = ctx.createRadialGradient(-rx * 0.25, -ry * 0.35, rx * 0.1, 0, 0, Math.max(rx, ry));
    g.addColorStop(0, light);
    g.addColorStop(0.55, base);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.13)';
    ctx.lineWidth = Math.max(0.5, w * 0.04);
    ctx.stroke();
    // Fibre strands and fuzz.
    if (opts.fuzz > 0) {
      ctx.clip();
      const n = Math.round(4 + opts.fuzz * 6);
      for (let i = 0; i < n; i++) {
        ctx.strokeStyle = rand() > 0.5 ? `rgba(255,255,255,${0.16 * opts.fuzz})` : `rgba(0,0,0,${0.07 * opts.fuzz})`;
        ctx.lineWidth = Math.max(0.4, w * 0.03);
        const ox = (rand() - 0.5) * rx * 1.6;
        ctx.beginPath();
        ctx.moveTo(ox - rx * 0.2, -ry);
        ctx.quadraticCurveTo(ox + (rand() - 0.5) * rx, 0, ox + rx * 0.2, ry);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  const midY = padY + h / 2;
  if (purl) {
    leg(w / 2, midY - h * 0.12, (w * 0.56 * t), h * 0.36 * t, 0);
    leg(w / 2, midY + h * 0.3, (w * 0.5 * t), h * 0.26 * t, 0);
  } else {
    const rx = w * 0.25 * t;
    const ry = h * 0.78 * t;
    leg(w * 0.3, midY, rx, ry, -0.42);
    leg(w * 0.7, midY, rx, ry, 0.42);
  }
  // Fuzz halo.
  if (opts.fuzz > 0.3) {
    ctx.strokeStyle = `rgba(255,255,255,${0.08 * opts.fuzz})`;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) {
      const x = rand() * w;
      const y = padY + rand() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * w * 0.6, y + (rand() - 0.5) * h * 0.8);
      ctx.stroke();
    }
  }
  return c;
}

/** Renders the flat knitted fabric (length runs top → bottom). */
function renderFabric(chart: KnitChart, opts: ScarfRenderOptions): HTMLCanvasElement {
  const w = opts.stitchPx;
  const h = (opts.stitchPx * chart.gaugeSts) / chart.gaugeRows;
  const c = makeCanvas(chart.w * w, chart.h * h);
  const ctx = c.getContext('2d')!;
  const sprites = new Map<string, HTMLCanvasElement>();
  const sprite = (yarn: number, purl: number, v: number) => {
    const key = `${yarn}-${purl}-${v}`;
    let s = sprites.get(key);
    if (!s) {
      s = stitchSprite(chart.yarns[yarn].hex, purl === 1, w, h, opts, v);
      sprites.set(key, s);
    }
    return s;
  };
  // Gaps between stitches show a darker tone of the yarn.
  for (let y = 0; y < chart.h; y++)
    for (let x = 0; x < chart.w; x++) {
      ctx.fillStyle = shade(chart.yarns[chart.cells[y * chart.w + x]].hex, -0.16);
      ctx.fillRect(x * w, y * h, w + 0.5, h + 0.5);
    }
  const rand = mulberry32(opts.seed ?? 1);
  const padY = h * 0.4;
  for (let y = 0; y < chart.h; y++)
    for (let x = 0; x < chart.w; x++) {
      const i = y * chart.w + x;
      const s = sprite(chart.cells[i], chart.stitch[i], Math.floor(rand() * VARIANTS));
      ctx.drawImage(s, x * w, y * h - padY);
    }
  return c;
}

function drawFringe(ctx: CanvasRenderingContext2D, chart: KnitChart, opts: ScarfRenderOptions, offsetX: number, edgeY: number, dir: 1 | -1, row: number) {
  const w = opts.stitchPx;
  const len = w * 10;
  const rand = mulberry32((opts.seed ?? 1) + (dir > 0 ? 11 : 23));
  const group = 3;
  for (let x = 1; x < chart.w - 1; x += group) {
    const hex = chart.yarns[chart.cells[row * chart.w + Math.min(chart.w - 1, x + 1)]].hex;
    const cx = offsetX + (x + group / 2) * w;
    const strands = 7;
    for (let s = 0; s < strands; s++) {
      const sx = cx + (s - strands / 2) * w * 0.18;
      const l = len * (0.85 + rand() * 0.25);
      const sway = (rand() - 0.5) * w * 1.4;
      ctx.strokeStyle = shade(hex, (rand() - 0.5) * 0.25);
      ctx.lineWidth = Math.max(1, w * 0.22 * opts.thickness);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, edgeY + dir * w * 0.6);
      ctx.bezierCurveTo(sx, edgeY + dir * l * 0.35, sx + sway, edgeY + dir * l * 0.7, sx + sway * 1.4, edgeY + dir * l);
      ctx.stroke();
    }
    // Knot.
    ctx.fillStyle = shade(hex, -0.15);
    ctx.beginPath();
    ctx.ellipse(cx, edgeY + dir * w * 0.8, w * 0.55, w * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Full scarf mockup with drape, fringe and shadow on a transparent canvas. */
export function renderScarf(chart: KnitChart, opts: ScarfRenderOptions): HTMLCanvasElement {
  const fabric = renderFabric(chart, opts);
  const w = opts.stitchPx;
  const amp = opts.drape ? w * 0.9 : 0;
  const fringeLen = opts.fringe ? w * 12 : 0;
  const margin = w * 4 + amp;
  const outW = fabric.width + margin * 2;
  const outH = fabric.height + fringeLen * 2 + margin * 2;
  const v = makeCanvas(outW, outH);
  const ctx = v.getContext('2d')!;
  const top = margin + fringeLen;
  const period = fabric.height / 2.3;
  const waveAt = (y: number) => (opts.drape ? Math.sin((y / period) * Math.PI * 2) * amp : 0);

  if (opts.fringe) {
    drawFringe(ctx, chart, opts, margin + waveAt(0), top, -1, 0);
    drawFringe(ctx, chart, opts, margin + waveAt(fabric.height), top + fabric.height, 1, chart.h - 1);
  }

  ctx.save();
  if (opts.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = w * 3;
    ctx.shadowOffsetY = w * 1.2;
    ctx.shadowOffsetX = w * 0.6;
  }
  const slice = 3;
  for (let y = 0; y < fabric.height; y += slice) {
    const hgt = Math.min(slice, fabric.height - y);
    ctx.drawImage(fabric, 0, y, fabric.width, hgt, margin + waveAt(y), top + y, fabric.width, hgt + 0.6);
  }
  ctx.restore();

  if (opts.drape) {
    // Soft lengthwise folds: alternating light/dark bands across the width, following the wave.
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    for (let y = 0; y < fabric.height; y += slice) {
      const x0 = margin + waveAt(y);
      const g = ctx.createLinearGradient(x0, 0, x0 + fabric.width, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.16)');
      g.addColorStop(0.18, 'rgba(255,255,255,0.10)');
      g.addColorStop(0.42, 'rgba(0,0,0,0.10)');
      g.addColorStop(0.65, 'rgba(255,255,255,0.12)');
      g.addColorStop(0.86, 'rgba(0,0,0,0.08)');
      g.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, top + y, fabric.width, slice + 0.6);
    }
    ctx.restore();
  }

  if (opts.orientation === 'vertical') return v;
  const hz = makeCanvas(outH, outW);
  const hctx = hz.getContext('2d')!;
  hctx.translate(outH, 0);
  hctx.rotate(Math.PI / 2);
  hctx.drawImage(v, 0, 0);
  return hz;
}
