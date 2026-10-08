import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KnitChart } from '../lib/knitChart';
import { render, type Rendered } from '../lib/renderClient';
import type { ScarfRenderOptions } from '../lib/scarfRender';
import { drawStripMesh, spline, type Pt, type StripTexture } from '../lib/stripMesh';

interface Props {
  chart: KnitChart;
  options: ScarfRenderOptions;
}

const HEIGHT = 560;
const MARGIN = 30;

interface Node { x: number; y: number; px: number; py: number; lift: number }

/**
 * The finished scarf lying on a table. Grab it anywhere and drag: the grabbed
 * part lifts (with a shadow), the rest trails along with fabric-like friction,
 * resists sharp kinks and bunches up with creases where it bends.
 */
export function ScarfPlayground({ chart, options }: Props) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const [tex, setTex] = useState<{ t: StripTexture; y0: number; y1: number } | null>(null);
  const [layoutKey, setLayoutKey] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(320, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Lay the scarf at its true proportions, about 1.25× the table width long (slimmer if it would be too fat).
  const rowPx = chart.gaugeSts / chart.gaugeRows;
  const aspect = (chart.h * rowPx) / chart.w; // length ÷ width
  const fabricW = Math.max(36, Math.min(HEIGHT * 0.2, (width * 1.25) / aspect));
  const screenLen = fabricW * aspect;
  // Knit the texture at roughly screen resolution.
  const sp = Math.max(2, Math.min(6, Math.round(screenLen / (chart.h * rowPx))));
  useEffect(() => {
    let alive = true;
    render({ kind: 'scarf', chart, opts: { ...options, stitchPx: sp, orientation: 'vertical', drape: false, shadow: false } }, 'playground')
      .then((img: Rendered) => {
        if (!alive) return;
        const m = sp * 4;
        const sw = img.width - m;
        setTex({ t: { img, sx: m / 2, sw, inset: m / 2 / sw }, y0: m, y1: img.height - m });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [chart, options, sp]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tex) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${HEIGHT}px`;
    const ctx = canvas.getContext('2d')!;
    // Texture px → screen px.
    const scale = fabricW / (chart.w * sp);
    const ribbon = tex.t.sw * scale;
    const fabricHalf = fabricW / 2;
    const length = (tex.y1 - tex.y0) * scale;
    const N = Math.max(24, Math.min(90, Math.round(length / 12)));
    const seg = length / (N - 1);
    // Knitted fabric can't fold to a point: keep bends wider than the scarf itself.
    const minRadius = fabricW * 0.8;
    const minChord = 2 * seg * Math.cos(Math.min(1.2, seg / (2 * minRadius)));
    const edge = fabricHalf + 8;
    const clampPt = (p: Pt): Pt => ({ x: Math.max(edge, Math.min(width - edge, p.x)), y: Math.max(edge, Math.min(HEIGHT - edge, p.y)) });

    // Initial layout: a relaxed S across the table whose arc length matches the scarf.
    const nodes: Node[] = initialLayout(N, seg, width, HEIGHT).map((p) => ({ x: p.x, y: p.y, px: p.x, py: p.y, lift: 0 }));
    let grabbed = -1;
    let target: Pt = { x: 0, y: 0 };
    let raf = 0;
    let running = false;
    let calm = 0;

    const step = () => {
      for (const n of nodes) {
        const air = n.lift > 2;
        const damp = air ? 0.94 : 0.8; // friction on the table, freer in the air
        const vx = (n.x - n.px) * damp;
        const vy = (n.y - n.py) * damp;
        n.px = n.x;
        n.py = n.y;
        n.x += vx;
        n.y += vy;
      }
      for (let it = 0; it < 24; it++) {
        if (grabbed >= 0) {
          nodes[grabbed].x = target.x;
          nodes[grabbed].y = target.y;
        }
        // Keep the spacing (fabric doesn't stretch)…
        for (let i = 0; i < N - 1; i++) satisfy(nodes, i, i + 1, seg, seg, grabbed);
        // …and resist sharp kinks (bending stiffness).
        for (let i = 0; i < N - 2; i++) satisfy(nodes, i, i + 2, minChord, seg * 2, grabbed);
        // Gentle smoothing so the fabric curves evenly instead of zig-zagging between points.
        if (it % 6 === 0)
          for (let i = 1; i < N - 1; i++) {
            if (i === grabbed) continue;
            const n = nodes[i];
            n.x += ((nodes[i - 1].x + nodes[i + 1].x) / 2 - n.x) * 0.12;
            n.y += ((nodes[i - 1].y + nodes[i + 1].y) / 2 - n.y) * 0.12;
          }
        // Stay on the table: keep the whole width of the scarf inside it.
        for (const n of nodes) {
          n.x = Math.max(edge, Math.min(width - edge, n.x));
          n.y = Math.max(edge, Math.min(HEIGHT - edge, n.y));
        }
      }
      // Lift: nodes near the grabbed one rise, then settle back down.
      let motion = 0;
      nodes.forEach((n, i) => {
        const want = grabbed >= 0 ? Math.max(0, 1 - Math.abs(i - grabbed) / (N * 0.18)) * 26 : 0;
        n.lift += (want - n.lift) * 0.2;
        motion += Math.abs(n.x - n.px) + Math.abs(n.y - n.py) + Math.abs(want - n.lift);
      });
      return motion;
    };

    const draw = (fine: boolean) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, HEIGHT);
      // Shadow: a soft band under the scarf, pushed further out where it's lifted.
      const shadowPts = spline(nodes.map((n) => ({ x: n.x + 3 + n.lift * 0.5, y: n.y + 5 + n.lift * 0.9 })), 4);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'butt';
      for (const [w, a] of [[fabricHalf * 2 + 10, 0.06], [fabricHalf * 2 + 2, 0.08], [fabricHalf * 2 - 8, 0.08]] as [number, number][]) {
        ctx.strokeStyle = `rgba(40,25,15,${a})`;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(shadowPts[0].x, shadowPts[0].y);
        for (const p of shadowPts) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      // The scarf itself (lifted parts shift slightly toward the viewer's top-left).
      const line = spline(nodes.map((n) => ({ x: n.x - n.lift * 0.15, y: n.y - n.lift * 0.35 })), 4);
      drawStripMesh(ctx, tex.t, tex.y0, tex.y1, line, ribbon, { step: fine ? 4 : 7 });
    };

    const loop = () => {
      const motion = step();
      calm = motion < 0.08 * N && grabbed < 0 ? calm + 1 : 0;
      draw(calm > 0);
      if (calm > 20) {
        running = false;
        draw(true);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (running) return;
      running = true;
      calm = 0;
      raf = requestAnimationFrame(loop);
    };

    const toLocal = (e: PointerEvent): Pt => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const nearest = (p: Pt) => {
      let best = -1;
      let bestD = Infinity;
      nodes.forEach((n, i) => {
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d < bestD) { bestD = d; best = i; }
      });
      return bestD <= fabricHalf + 14 ? best : -1;
    };
    const onDown = (e: PointerEvent) => {
      const p = toLocal(e);
      const i = nearest(p);
      if (i < 0) return;
      grabbed = i;
      target = clampPt(p);
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      wake();
    };
    const onMove = (e: PointerEvent) => {
      const p = toLocal(e);
      if (grabbed >= 0) {
        target = clampPt(p);
        wake();
      } else {
        canvas.style.cursor = nearest(p) >= 0 ? 'grab' : 'default';
      }
    };
    const onUp = () => {
      grabbed = -1;
      canvas.style.cursor = 'grab';
      wake();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    // Let it relax into place once, then sleep until touched.
    wake();
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, [tex, width, layoutKey, fabricW, sp, chart.w]);

  return (
    <div className="playground">
      <div className="toolbar">
        <span className="hint">🖐 {t('scarf.playHint')}</span>
        <button className="btn small ghost" onClick={() => setLayoutKey((k) => k + 1)}>↺ {t('scarf.playReset')}</button>
      </div>
      <div ref={wrapRef} className="playground-table">
        <canvas ref={canvasRef} style={{ touchAction: 'none', cursor: 'grab' }} />
        {!tex && <div className="machine-done">🧶 {t('scarf.knitting')}</div>}
      </div>
    </div>
  );
}

/** Move nodes a and b so their distance is within [min, max]; the grabbed node stays put. */
function satisfy(nodes: Node[], a: number, b: number, min: number, max: number, grabbed: number) {
  const A = nodes[a];
  const B = nodes[b];
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const d = Math.hypot(dx, dy) || 0.0001;
  const want = d < min ? min : d > max ? max : d;
  if (want === d) return;
  const diff = (d - want) / d;
  const wa = a === grabbed ? 0 : b === grabbed ? 1 : 0.5;
  const wb = b === grabbed ? 0 : a === grabbed ? 1 : 0.5;
  A.x += dx * diff * wa;
  A.y += dy * diff * wa;
  B.x -= dx * diff * wb;
  B.y -= dy * diff * wb;
}

/** N points spaced `seg` apart along a gentle S-curve that fits the table. */
function initialLayout(N: number, seg: number, w: number, h: number): Pt[] {
  const length = seg * (N - 1);
  const span = w - MARGIN * 4;
  // Find the wave amplitude that makes the curve as long as the scarf.
  const curve = (amp: number) =>
    Array.from({ length: 200 }, (_, i) => {
      const u = i / 199;
      return { x: MARGIN * 2 + u * span, y: h / 2 + Math.sin(u * Math.PI * 2) * amp };
    });
  const arc = (pts: Pt[]) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
  let lo = 0;
  let hi = h / 2 - MARGIN * 2;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (arc(curve(mid)) < length) lo = mid;
    else hi = mid;
  }
  const pts = curve(lo);
  // Walk the curve placing nodes every `seg`; if the scarf is longer than the curve, the rest relaxes.
  const out: Pt[] = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length && out.length < N; i++) {
    acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    while (acc >= seg && out.length < N) {
      acc -= seg;
      out.push(pts[i]);
    }
  }
  while (out.length < N) {
    const last = out[out.length - 1];
    out.push({ x: last.x - seg * 0.7, y: last.y + seg * 0.7 });
  }
  return out;
}
