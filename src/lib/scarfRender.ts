import { ctx2d, makeCanvas, type Canvas, type Ctx2D } from './canvas';
import { hexToRgb, rgbToHex, shade } from './color';
import type { KnitChart, Yarn } from './knitChart';
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
  /** Fibre type: classic wool or fuzzy mohair. */
  yarnType: 'wool' | 'mohair';
  /** Colour-changing main yarn. */
  colorChange: 'none' | 'gradient' | 'stripes';
  /** Extra colours for the colour-changing yarn (empty = suggested from the motif). */
  changeColors: string[];
  /** How much the long edges roll in ("sausage" effect), 0–1; -1 = predict from the edge stitch. */
  curl: number;
}

export const DEFAULT_SCARF_OPTIONS: ScarfRenderOptions = {
  stitchPx: 8,
  orientation: 'horizontal',
  fringe: true,
  drape: true,
  fuzz: 0.5,
  thickness: 1,
  shadow: true,
  yarnType: 'wool',
  colorChange: 'none',
  changeColors: [],
  curl: -1,
};

/**
 * Stockinette rolls in along its long edges. A seed or garter edge mostly stops it,
 * a narrow one only partly; with no edge the scarf turns into a "sausage".
 */
export function effectiveCurl(chart: KnitChart, opts: ScarfRenderOptions): number {
  if (opts.curl >= 0) return opts.curl;
  if (chart.borderStyle === 'none' || chart.borderSts === 0) return 0.85;
  if (chart.borderSts <= 2) return 0.4;
  return 0.06;
}

/** Colours for the colour-changing yarn: given ones, or soft tints taken from the motif. */
export function changeColorsFor(chart: KnitChart, opts: ScarfRenderOptions): string[] {
  if (opts.changeColors.length) return [chart.yarns[0].hex, ...opts.changeColors];
  const counts = chart.yarns.map(() => 0);
  for (const c of chart.cells) counts[c]++;
  const motif = chart.yarns
    .map((y, i) => ({ y, n: counts[i], i }))
    .filter((x) => x.i > 0 && x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.y.hex);
  const main = chart.yarns[0].hex;
  const picks = motif.slice(0, 2).map((h) => mix(main, h, 0.35));
  while (picks.length < 2) picks.push(shade(main, picks.length ? -0.18 : -0.1));
  return [main, ...picks];
}

function mix(a: string, b: string, t: number) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

/**
 * Replace the main yarn with a colour-changing one: a slow gradient along the
 * length (and back, so both ends match) or self-striping bands.
 */
export function applyColorChange(chart: KnitChart, opts: ScarfRenderOptions): KnitChart {
  if (opts.colorChange === 'none') return chart;
  const colors = changeColorsFor(chart, opts);
  const yarns: Yarn[] = chart.yarns.slice();
  const indexOf = new Map<string, number>();
  const yarnFor = (hex: string) => {
    let i = indexOf.get(hex);
    if (i === undefined) {
      i = yarns.length;
      yarns.push({ hex, name: hex, symbol: '' });
      indexOf.set(hex, i);
    }
    return i;
  };
  const rowYarn: number[] = [];
  const stripe = Math.max(4, Math.round(chart.h / 28));
  for (let y = 0; y < chart.h; y++) {
    let hex: string;
    if (opts.colorChange === 'stripes') {
      hex = colors[Math.floor(y / stripe) % colors.length];
    } else {
      // c0 → c1 → c2 → c1 → c0 along the scarf, quantised into soft steps.
      const seq = [...colors, ...colors.slice(0, -1).reverse()];
      const t = (y / Math.max(1, chart.h - 1)) * (seq.length - 1);
      const k = Math.min(seq.length - 2, Math.floor(t));
      const f = Math.round((t - k) * 12) / 12;
      hex = mix(seq[k], seq[k + 1], f);
    }
    rowYarn.push(yarnFor(hex));
  }
  const cells = chart.cells.map((c, i) => (c === 0 ? rowYarn[Math.floor(i / chart.w)] : c));
  return { ...chart, yarns, cells };
}

/** Mohair: soften stitch definition and add loose fibres that wander across stitches. */
function mohairize(c: Canvas, chart: KnitChart, w: number, h: number, seed: number) {
  const ctx = ctx2d(c);
  // Soften stitch definition: a half-size copy scaled back up is a cheap blur.
  const soft = makeCanvas(c.width / 2, c.height / 2);
  ctx2d(soft).drawImage(c, 0, 0, soft.width, soft.height);
  ctx.globalAlpha = 0.6;
  ctx.drawImage(soft, 0, 0, c.width, c.height);
  ctx.globalAlpha = 1;
  const rand = mulberry32(seed * 31 + 7);
  // Batch fibres into a few paths per yarn (by tint and opacity) — far faster than one stroke each.
  const paths = chart.yarns.map(() => [new Path2D(), new Path2D(), new Path2D(), new Path2D()]);
  for (let y = 0; y < chart.h; y++)
    for (let x = 0; x < chart.w; x++) {
      const yarn = chart.cells[y * chart.w + x];
      const n = 2 + (rand() < 0.5 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        const x0 = (x + rand()) * w;
        const y0 = (y + rand()) * h;
        const len = w * (1.5 + rand() * 2.5);
        const a = rand() * Math.PI * 2;
        const path = paths[yarn][Math.floor(rand() * 4)];
        path.moveTo(x0, y0);
        path.quadraticCurveTo(x0 + Math.cos(a + 0.8) * len * 0.5, y0 + Math.sin(a + 0.8) * len * 0.5, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
      }
    }
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(0.4, w * 0.05);
  chart.yarns.forEach((yarn, i) =>
    paths[i].forEach((path, b) => {
      ctx.strokeStyle = shade(yarn.hex, b % 2 ? 0.35 : 0.15);
      ctx.globalAlpha = b < 2 ? 0.3 : 0.45;
      ctx.stroke(path);
    }),
  );
  ctx.globalAlpha = 1;
}

/**
 * Roll the long edges under (cylinder projection per row). The ends stay a bit
 * flatter, like a real curled scarf.
 */
function curlPixels(src: ImageData, amount: number): ImageData {
  const W = src.width;
  const H = src.height;
  const out = new ImageData(W, H);
  const cx = W / 2;
  // Rolls right up to the ends — the cast-on/bind-off edge is soft and rolls too,
  // only easing very slightly in the last ~3%.
  const endZone = Math.max(1, H * 0.03);
  const L = [-0.42, 0.88]; // light from the left, mostly frontal (x, z)
  for (let y = 0; y < H; y++) {
    const e0 = Math.min(1, Math.min(y, H - 1 - y) / endZone);
    const e = e0 * e0 * (3 - 2 * e0);
    const a = amount * (0.88 + 0.12 * e);
    const outHalf = (W / 2) * (1 - 0.62 * a);
    const srcHalf = (W / 2) * (1 - 0.5 * a);
    // How far around the cylinder the visible face reaches (flat → 0, full tube → 90°).
    const maxAngle = (Math.PI / 2) * a;
    for (let x = Math.floor(cx - outHalf); x < Math.ceil(cx + outHalf); x++) {
      if (x < 0 || x >= W) continue;
      const t = Math.max(-1, Math.min(1, (x + 0.5 - cx) / outHalf));
      const sx = Math.min(W - 1, Math.max(0, Math.round(cx + (Math.asin(t) / (Math.PI / 2)) * srcHalf)));
      const theta = t * maxAngle;
      const nx = Math.sin(theta);
      const nz = Math.cos(theta);
      const diffuse = Math.max(0, nx * L[0] + nz * L[1]) / L[1];
      const rim = Math.pow(Math.abs(t), 6) * a * 0.18; // edges tuck under → a little darker
      const light = Math.max(0.6, (0.5 + 0.5 * diffuse) - rim);
      const spec = Math.pow(Math.max(0, nx * L[0] + nz * L[1]), 24) * a * 18;
      const si = (y * W + sx) * 4;
      const oi = (y * W + x) * 4;
      out.data[oi] = Math.min(255, src.data[si] * light + spec);
      out.data[oi + 1] = Math.min(255, src.data[si + 1] * light + spec);
      out.data[oi + 2] = Math.min(255, src.data[si + 2] * light + spec);
      out.data[oi + 3] = src.data[si + 3];
    }
  }
  return out;
}

const VARIANTS = 3;


/** One knit "V" (two tilted loops) or a purl bump, pre-rendered for speed. */
function stitchSprite(hex: string, purl: boolean, w: number, h: number, opts: ScarfRenderOptions, variant: number): Canvas {
  const padY = h * 0.4;
  const c = makeCanvas(w, h + padY * 2);
  // CPU-backed: we read the pixels straight back, which is slow from a GPU canvas.
  const ctx = ctx2d(c, { willReadFrequently: true });
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
function renderFabric(chart: KnitChart, opts: ScarfRenderOptions): Canvas {
  const w = opts.stitchPx;
  const h = (opts.stitchPx * chart.gaugeSts) / chart.gaugeRows;
  const c = makeCanvas(chart.w * w, chart.h * h);
  const W = c.width;
  const H = c.height;
  // Composite straight into a pixel buffer: thousands of tiny drawImage calls are the
  // slowest part of canvas rendering, a typed-array blend is ~50× faster.
  const out = new ImageData(W, H);
  const px = out.data;

  // Gaps between stitches show a darker tone of the yarn.
  const px32 = new Uint32Array(px.buffer);
  const gap = chart.yarns.map((y) => {
    const [r, g, b] = hexToRgb(shade(y.hex, -0.16));
    return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; // RGBA bytes on little-endian
  });
  for (let y = 0; y < chart.h; y++) {
    const y0 = Math.floor(y * h);
    const y1 = Math.min(H, Math.ceil((y + 1) * h));
    for (let x = 0; x < chart.w; x++) {
      const v = gap[chart.cells[y * chart.w + x]];
      for (let yy = y0; yy < y1; yy++) px32.fill(v, yy * W + x * w, yy * W + (x + 1) * w);
    }
  }

  const sprites = new Map<string, ImageData>();
  const sprite = (yarn: number, purl: number, v: number) => {
    const key = `${yarn}-${purl}-${v}`;
    let s = sprites.get(key);
    if (!s) {
      const o = opts.yarnType === 'mohair' ? { ...opts, fuzz: Math.max(opts.fuzz, 0.9) } : opts;
      const sc = stitchSprite(chart.yarns[yarn].hex, purl === 1, w, h, o, v);
      s = ctx2d(sc).getImageData(0, 0, sc.width, sc.height);
      sprites.set(key, s);
    }
    return s;
  };
  const rand = mulberry32(opts.seed ?? 1);
  const padY = h * 0.4;
  for (let y = 0; y < chart.h; y++)
    for (let x = 0; x < chart.w; x++) {
      const i = y * chart.w + x;
      const s = sprite(chart.cells[i], chart.stitch[i], Math.floor(rand() * VARIANTS));
      blit(px, W, H, s, x * w, Math.round(y * h - padY));
    }

  const ctx = ctx2d(c, { willReadFrequently: opts.yarnType === 'mohair' });
  const curl = effectiveCurl(chart, opts);
  if (opts.yarnType === 'mohair') {
    ctx.putImageData(out, 0, 0);
    mohairize(c, chart, w, h, opts.seed ?? 1);
    if (curl >= MIN_VISIBLE_CURL) {
      const img = ctx.getImageData(0, 0, W, H);
      ctx.putImageData(curlPixels(img, curl), 0, 0);
    }
  } else {
    ctx.putImageData(curl >= MIN_VISIBLE_CURL ? curlPixels(out, curl) : out, 0, 0);
  }
  return c;
}

/** Below this the roll isn't visible, so skip the (per-pixel) curl pass. */
const MIN_VISIBLE_CURL = 0.1;

/** Alpha-blend a sprite into an RGBA buffer at integer position (dx, dy). */
function blit(dst: Uint8ClampedArray, W: number, H: number, s: ImageData, dx: number, dy: number) {
  const sd = s.data;
  for (let y = 0; y < s.height; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= H) continue;
    for (let x = 0; x < s.width; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= W) continue;
      const si = (y * s.width + x) * 4;
      const a = sd[si + 3];
      if (a === 0) continue;
      const di = (ty * W + tx) * 4;
      if (a === 255) {
        dst[di] = sd[si];
        dst[di + 1] = sd[si + 1];
        dst[di + 2] = sd[si + 2];
        dst[di + 3] = 255;
      } else {
        const f = a / 255;
        dst[di] = sd[si] * f + dst[di] * (1 - f);
        dst[di + 1] = sd[si + 1] * f + dst[di + 1] * (1 - f);
        dst[di + 2] = sd[si + 2] * f + dst[di + 2] * (1 - f);
        dst[di + 3] = Math.max(dst[di + 3], a);
      }
    }
  }
}

/**
 * Fringe at one end. `curl` (0–1) is how much the scarf rolls: the fringe then
 * gathers into the tube's width and each strand curls inwards — towards the
 * middle and, near the edges, back over itself, like yarn that wants to roll too.
 */
function drawFringe(ctx: Ctx2D, chart: KnitChart, opts: ScarfRenderOptions, offsetX: number, edgeY: number, dir: 1 | -1, row: number, curl = 0) {
  const w = opts.stitchPx;
  const len = w * 10 * (1 - 0.25 * curl);
  const rand = mulberry32((opts.seed ?? 1) + (dir > 0 ? 11 : 23));
  const group = 3;
  const mid = (chart.w * w) / 2;
  // Matches the rolled fabric's outer width at the ends.
  const squeeze = 1 - 0.62 * curl * 0.88;
  for (let x = 1; x < chart.w - 1; x += group) {
    const hex = chart.yarns[chart.cells[row * chart.w + Math.min(chart.w - 1, x + 1)]].hex;
    const rel = ((x + group / 2) * w - mid) / mid; // -1 (left edge) … 1 (right edge)
    const cx = offsetX + mid + rel * mid * squeeze;
    const strands = 7;
    for (let s = 0; s < strands; s++) {
      const sx = cx + (s - strands / 2) * w * 0.18 * (1 - 0.5 * curl);
      const l = len * (0.85 + rand() * 0.25);
      const sway = (rand() - 0.5) * w * 1.4 * (1 - curl);
      // Curl: strands sweep towards the middle; outer ones hook back on themselves.
      const inward = -rel * curl * mid * squeeze * 0.75;
      const hook = Math.abs(rel) * curl * l * 0.45;
      ctx.strokeStyle = shade(hex, (rand() - 0.5) * 0.25 - curl * 0.12 * Math.abs(rel));
      ctx.lineWidth = Math.max(1, w * 0.22 * opts.thickness);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, edgeY + dir * w * 0.6);
      ctx.bezierCurveTo(
        sx + inward * 0.2, edgeY + dir * l * 0.35,
        sx + sway + inward * 0.9, edgeY + dir * (l * 0.75),
        sx + sway * 1.4 + inward, edgeY + dir * (l - hook),
      );
      ctx.stroke();
    }
    // Knot.
    ctx.fillStyle = shade(hex, -0.15);
    ctx.beginPath();
    ctx.ellipse(cx, edgeY + dir * w * 0.8, w * 0.55 * (1 - 0.3 * curl), w * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Full scarf mockup with drape, fringe and shadow on a transparent canvas. */
/**
 * Lighting for a gently draped scarf: a low-resolution height field (the scarf
 * tilting as it snakes, plus a few soft folds that come and go) shaded by a
 * light from the upper left. Returned as an overlay map (mid-grey = no change).
 */
function drapeLighting(fw: number, fh: number, period: number, seed: number): Canvas {
  const gw = 24;
  const gh = Math.max(8, Math.round(fh / 16));
  const sx = fw / gw;
  const sy = fh / gh;
  const rand = mulberry32(seed * 17 + 3);
  const folds = Array.from({ length: Math.max(2, Math.round(fh / (fw * 2.2))) }, () => ({
    c: 0.25 + rand() * 0.5,
    slope: (rand() - 0.5) * 0.35,
    y: rand() * fh,
    len: fw * (1.6 + rand() * 2),
    width: 0.14 + rand() * 0.12,
    amp: fw * (0.04 + rand() * 0.04) * (rand() < 0.75 ? 1 : -1),
  }));
  const height = (u: number, y: number) => {
    // The scarf tilts across its width as it bends (matches the sideways wave).
    let h = (u - 0.5) * fw * 0.22 * Math.cos((y / period) * Math.PI * 2);
    for (const f of folds) {
      const dy = (y - f.y) / f.len;
      if (Math.abs(dy) > 1.5) continue;
      const centre = f.c + f.slope * dy;
      h += f.amp * Math.exp(-(((u - centre) / f.width) ** 2)) * Math.exp(-dy * dy * 2);
    }
    return h;
  };
  const c = makeCanvas(gw, gh);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(gw, gh);
  const L = [-0.45, -0.55, 0.7];
  const Ln = Math.hypot(L[0], L[1], L[2]);
  const flat = L[2] / Ln;
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const u = (i + 0.5) / gw;
      const y = (j + 0.5) * sy;
      const dx = (height(u + 0.5 / gw, y) - height(u - 0.5 / gw, y)) / sx;
      const dy = (height(u, y + sy / 2) - height(u, y - sy / 2)) / sy;
      const n = [-dx, -dy, 1];
      const nn = Math.hypot(n[0], n[1], n[2]);
      const lit = (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / (nn * Ln) / flat;
      const v = Math.max(0, Math.min(255, 128 + (lit - 1) * 95));
      const k = (j * gw + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = v;
      img.data[k + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Short hash of a chart's content, so identical charts share cache entries (also across a worker boundary). */
function chartKey(c: KnitChart): string {
  let h = 2166136261;
  const mixIn = (n: number) => {
    h ^= n;
    h = Math.imul(h, 16777619);
  };
  mixIn(c.w);
  mixIn(c.h);
  for (const v of c.cells) mixIn(v);
  for (const v of c.stitch) mixIn(v + 7);
  const meta = JSON.stringify([c.yarns.map((y) => y.hex), c.gaugeSts, c.gaugeRows, c.borderStyle, c.borderSts]);
  for (let i = 0; i < meta.length; i++) mixIn(meta.charCodeAt(i));
  return (h >>> 0).toString(36);
}

/** Recently rendered scarves keyed by chart content + options (small LRU). */
const cache = new Map<string, Canvas>();

/**
 * Render the knitted scarf. Results are cached, so switching views, scenes or
 * typing a gift message doesn't re-knit the whole thing. Treat the result as read-only.
 */
export function renderScarf(source: KnitChart, opts: ScarfRenderOptions): Canvas {
  const key = chartKey(source) + JSON.stringify(opts);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const out = renderScarfUncached(source, opts);
  cache.set(key, out);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  return out;
}

/**
 * Quarter-size soft silhouette of `src` in one colour (for shadows and halos).
 * Blurred by shrinking and scaling back up with smoothing, then tinted — no
 * ctx.filter (missing in Safari) and no off-canvas shadow tricks (browsers
 * disagree on those, which could show stray copies of the scarf).
 */
function softCopy(src: Canvas, blurPx: number, color: string): Canvas {
  // Shrink by at most 4× (so the scarf's gentle wave survives) and let bilinear
  // upscaling do the softening; a second, smaller pass softens a bit more.
  const k = Math.max(1, Math.min(4, blurPx / 3));
  const small = makeCanvas(src.width / k, src.height / k);
  const sctx = ctx2d(small);
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(src, 0, 0, small.width, small.height);
  const half = makeCanvas(small.width / 2, small.height / 2);
  const hctx = ctx2d(half);
  hctx.imageSmoothingEnabled = true;
  hctx.drawImage(small, 0, 0, half.width, half.height);
  sctx.clearRect(0, 0, small.width, small.height);
  sctx.globalAlpha = 0.6;
  sctx.drawImage(src, 0, 0, small.width, small.height);
  sctx.globalAlpha = 0.4;
  sctx.drawImage(half, 0, 0, small.width, small.height);
  sctx.globalAlpha = 1;
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = color;
  sctx.fillRect(0, 0, small.width, small.height);
  return small;
}

function renderScarfUncached(source: KnitChart, opts: ScarfRenderOptions): Canvas {
  const chart = applyColorChange(source, opts);
  const fabric = renderFabric(chart, opts);
  const w = opts.stitchPx;
  const amp = opts.drape ? w * 0.9 : 0;
  const fringeLen = opts.fringe ? w * 12 : 0;
  const margin = w * 4 + amp;
  const outW = fabric.width + margin * 2;
  const outH = fabric.height + fringeLen * 2 + margin * 2;
  const top = margin + fringeLen;
  const period = fabric.height / 2.3;
  const waveAt = (y: number) => (opts.drape ? Math.sin((y / period) * Math.PI * 2) * amp : 0);

  // 1. The scarf itself (fringe + fabric following the wave) on its own layer.
  const body = makeCanvas(outW, outH);
  const bctx = ctx2d(body);
  if (opts.fringe) {
    // Curled ends are narrower, and the fringe rolls inwards with them.
    const curl = effectiveCurl(chart, opts);
    drawFringe(bctx, chart, opts, margin + waveAt(0), top, -1, 0, curl);
    drawFringe(bctx, chart, opts, margin + waveAt(fabric.height), top + fabric.height, 1, chart.h - 1, curl);
  }
  const slice = opts.drape ? 3 : fabric.height;
  for (let y = 0; y < fabric.height; y += slice) {
    const hgt = Math.min(slice, fabric.height - y);
    bctx.drawImage(fabric, 0, y, fabric.width, hgt, margin + waveAt(y), top + y, fabric.width, hgt + (opts.drape ? 0.6 : 0));
  }

  // 2. Drape lighting, masked to the fabric and blended with "overlay".
  if (opts.drape) {
    const light = drapeLighting(fabric.width, fabric.height, period, opts.seed ?? 1);
    const layer = makeCanvas(outW, outH);
    const lctx = ctx2d(layer);
    const chunk = 12;
    const ls = light.height / fabric.height;
    for (let y = 0; y < fabric.height; y += chunk) {
      const hgt = Math.min(chunk, fabric.height - y);
      lctx.drawImage(light, 0, y * ls, light.width, hgt * ls, margin + waveAt(y), top + y, fabric.width, hgt + 0.6);
    }
    lctx.globalCompositeOperation = 'destination-in';
    lctx.drawImage(body, 0, 0);
    bctx.save();
    bctx.globalCompositeOperation = 'overlay';
    bctx.drawImage(layer, 0, 0);
    bctx.restore();
  }

  // 3. Compose: mohair halo and the drop shadow are applied once to the whole layer.
  // Blurs are done on a quarter-size copy and scaled back up: shadows and halos are
  // soft anyway, and blurring a full-size scarf is the slowest step otherwise.
  const v = makeCanvas(outW, outH);
  const ctx = ctx2d(v);
  if (opts.shadow) ctx.drawImage(softCopy(body, w * 1.6, 'rgba(0,0,0,0.26)'), w * 0.3, w * 0.7, outW, outH);
  if (opts.yarnType === 'mohair') {
    // Fuzzy halo in the main yarn's colour.
    const [r, g, b] = hexToRgb(shade(chart.yarns[0].hex, 0.15));
    ctx.drawImage(softCopy(body, Math.max(4, w * 1.4), `rgba(${r},${g},${b},0.85)`), 0, 0, outW, outH);
  }
  ctx.drawImage(body, 0, 0);

  if (opts.orientation === 'vertical') return v;
  const hz = makeCanvas(outH, outW);
  const hctx = ctx2d(hz);
  hctx.translate(outH, 0);
  hctx.rotate(Math.PI / 2);
  hctx.drawImage(v, 0, 0);
  return hz;
}
