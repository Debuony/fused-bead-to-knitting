import type { Ctx2D } from './canvas';

export type Pt = { x: number; y: number };

/** Texture of a vertical scarf: columns sx..sx+sw hold the fabric, rows run along its length. */
export interface StripTexture {
  img: CanvasImageSource & { width: number; height: number };
  sx: number;
  sw: number;
  /** Transparent margin on each side of the fabric inside sx..sx+sw, as a fraction of sw. */
  inset?: number;
}

/** Smooth Catmull-Rom curve through control points, sampled densely. */
export function spline(ctrl: Pt[], per = 40): Pt[] {
  if (ctrl.length === 2) return [ctrl[0], ctrl[1]];
  const out: Pt[] = [];
  const p = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  for (let i = 1; i < p.length - 2; i++)
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p[i - 1].x, p[i].x, p[i + 1].x, p[i + 2].x), y: f(p[i - 1].y, p[i].y, p[i + 1].y, p[i + 2].y) });
    }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

export function pathLength(pts: Pt[]) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

/** Points spaced evenly (by arc length) along a polyline. */
export function resample(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let d = step - carry;
    while (d <= len) {
      out.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });
      d += step;
    }
    carry = len - (d - step);
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > step * 0.3) out.push(last);
  return out;
}

/** Draw the source triangle s0,s1,s2 of `img` into the destination triangle d0,d1,d2 (affine). */
function drawTriangle(ctx: Ctx2D, img: StripTexture['img'], s: [Pt, Pt, Pt], d: [Pt, Pt, Pt]) {
  const [s0, s1, s2] = s;
  const [d0, d1, d2] = d;
  const det = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y);
  if (Math.abs(det) < 1e-6) return;
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / det;
  const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / det;
  const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / det;
  const dd = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / det;
  const e = d0.x - a * s0.x - c * s0.y;
  const f = d0.y - b * s0.x - dd * s0.y;
  // Clip to the destination triangle, grown by ~0.6px so neighbours overlap (no hairline seams).
  const cx = (d0.x + d1.x + d2.x) / 3;
  const cy = (d0.y + d1.y + d2.y) / 3;
  const grow = (p: Pt) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const l = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / l) * 0.6, y: p.y + (dy / l) * 0.6 };
  };
  const g0 = grow(d0);
  const g1 = grow(d1);
  const g2 = grow(d2);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(g0.x, g0.y);
  ctx.lineTo(g1.x, g1.y);
  ctx.lineTo(g2.x, g2.y);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, dd, e, f);
  // Only sample the source triangle's bounding box (much cheaper than the whole texture).
  const x0 = Math.max(0, Math.floor(Math.min(s0.x, s1.x, s2.x)) - 1);
  const y0 = Math.max(0, Math.floor(Math.min(s0.y, s1.y, s2.y)) - 1);
  const x1 = Math.min(img.width, Math.ceil(Math.max(s0.x, s1.x, s2.x)) + 1);
  const y1 = Math.min(img.height, Math.ceil(Math.max(s0.y, s1.y, s2.y)) + 1);
  if (x1 > x0 && y1 > y0) ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}

export interface MeshOptions {
  /** Spacing of mesh rows along the scarf, in px (smaller = smoother, slower). */
  step?: number;
  /** Darken/lighten compressed/stretched fabric and draw creases at tight bends. */
  creases?: boolean;
}

/**
 * Draw a band of scarf texture along a smooth centre line as one continuous
 * textured mesh: stitches flow unbroken through every bend. Where the inside of
 * a bend would have to compress, the fabric bunches up (never folds through
 * itself) and gets crease lines; the stretched outside catches a bit of light.
 * Source rows `from`→`to` are laid along the line (to < from runs reversed).
 */
export function drawStripMesh(ctx: Ctx2D, tex: StripTexture, from: number, to: number, line: Pt[], width: number, opts: MeshOptions = {}) {
  const step = opts.step ?? 5;
  const c = resample(line, step);
  const n = c.length;
  if (n < 2) return;
  const half = width / 2;
  const tan: Pt[] = c.map((_, i) => {
    const a = c[Math.max(0, i - 1)];
    const b = c[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  });
  const L: Pt[] = [];
  const R: Pt[] = [];
  const minAdvance = step * 0.12;
  for (let i = 0; i < n; i++) {
    const t = tan[i];
    let l = { x: c[i].x - t.y * half, y: c[i].y + t.x * half };
    let r = { x: c[i].x + t.y * half, y: c[i].y - t.x * half };
    // Inside of a tight bend: don't let the edge run backwards (that would fold the
    // fabric through itself) — bunch it up instead.
    if (i > 0) {
      const pl = L[i - 1];
      if ((l.x - pl.x) * t.x + (l.y - pl.y) * t.y < minAdvance) l = { x: pl.x + t.x * minAdvance, y: pl.y + t.y * minAdvance };
      const pr = R[i - 1];
      if ((r.x - pr.x) * t.x + (r.y - pr.y) * t.y < minAdvance) r = { x: pr.x + t.x * minAdvance, y: pr.y + t.y * minAdvance };
    }
    L.push(l);
    R.push(r);
  }
  const rowAt = (i: number) => from + ((to - from) * i) / (n - 1);
  const sx0 = tex.sx;
  const sx1 = tex.sx + tex.sw;
  for (let i = 0; i < n - 1; i++) {
    const v0 = rowAt(i);
    const v1 = rowAt(i + 1);
    drawTriangle(ctx, tex.img, [{ x: sx0, y: v0 }, { x: sx1, y: v0 }, { x: sx0, y: v1 }], [L[i], R[i], L[i + 1]]);
    drawTriangle(ctx, tex.img, [{ x: sx1, y: v0 }, { x: sx1, y: v1 }, { x: sx0, y: v1 }], [R[i], R[i + 1], L[i + 1]]);
  }
  if (opts.creases === false) return;

  // The visible fabric edges (the texture has a transparent margin around the fabric).
  const k = 1 - 2 * (tex.inset ?? 0);
  const FL = L.map((p, i) => ({ x: c[i].x + (p.x - c[i].x) * k, y: c[i].y + (p.y - c[i].y) * k }));
  const FR = R.map((p, i) => ({ x: c[i].x + (p.x - c[i].x) * k, y: c[i].y + (p.y - c[i].y) * k }));
  const fHalf = half * k;
  // Paint shading only onto the fabric itself.
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';

  // How squeezed/stretched each edge is per segment, smoothed along the scarf so the
  // shading follows the bend instead of flickering segment to segment.
  const ratios = [FL, FR].map((E) => {
    const raw = Array.from({ length: n - 1 }, (_, i) => {
      const centre = Math.hypot(c[i + 1].x - c[i].x, c[i + 1].y - c[i].y) || 1;
      return Math.hypot(E[i + 1].x - E[i].x, E[i + 1].y - E[i].y) / centre;
    });
    return raw.map((_, i) => {
      let sum = 0;
      let k = 0;
      for (let j = Math.max(0, i - 3); j <= Math.min(raw.length - 1, i + 3); j++) { sum += raw[j]; k++; }
      return sum / k;
    });
  });

  // Shade each half of the band by how much that edge is squeezed or stretched.
  for (let i = 0; i < n - 1; i++) {
    for (const [E, sgn, side] of [[FL, 1, 0], [FR, -1, 1]] as [Pt[], number, number][]) {
      const ratio = ratios[side][i];
      // Ignore the gentle squeeze of ordinary curves; only real bunching gets dark.
      const squeeze = Math.max(0, 0.85 - ratio) / 0.85;
      const dark = Math.min(0.26, squeeze * squeeze * 0.6);
      const light = Math.min(0.08, Math.max(0, (ratio - 1.15) * 0.25));
      if (dark < 0.01 && light < 0.01) continue;
      ctx.fillStyle = dark >= light ? `rgba(40,25,15,${dark})` : `rgba(255,255,255,${light})`;
      ctx.beginPath();
      ctx.moveTo(c[i].x, c[i].y);
      ctx.lineTo(E[i].x, E[i].y);
      ctx.lineTo(E[i + 1].x, E[i + 1].y);
      ctx.lineTo(c[i + 1].x, c[i + 1].y);
      ctx.closePath();
      ctx.fill();
      // Creases fan out from a tightly bunched edge.
      if (ratio < 0.55 && i % 3 === 0) {
        const len = fHalf * Math.min(0.8, (0.55 - ratio) * 2 + 0.25);
        const nx = (c[i].x - E[i].x) / fHalf;
        const ny = (c[i].y - E[i].y) / fHalf;
        const wob = Math.sin(i * 1.7) * 0.25 * sgn;
        const ex = E[i].x + (nx + wob * ny) * len;
        const ey = E[i].y + (ny - wob * nx) * len;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(40,25,15,0.2)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(E[i].x, E[i].y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(E[i].x + 1.4, E[i].y + 1.4);
        ctx.lineTo(ex + 1.4, ey + 1.4);
        ctx.stroke();
      }
    }
  }
  // Soft darker edges: the fabric rounds off at its long sides.
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(40,25,15,0.12)';
  for (const E of [FL, FR]) {
    ctx.beginPath();
    ctx.moveTo(E[0].x, E[0].y);
    for (const p of E) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  ctx.restore();
}
