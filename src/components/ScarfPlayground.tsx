import { useEffect, useRef, useState } from 'react';
import { Slider } from './Field';
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

/** Everything that shapes how the scarf feels. Tunable live in the 🔧 panel. */
export interface Physics {
  /** Share of the scarf the hand holds around the grab point (0–0.5). Bigger = more of it moves together. */
  handSpan: number;
  /** How firmly that held region follows the hand (0–1). */
  hold: number;
  /** How quickly the hand catches up with the cursor per frame (0–1). Lower = calmer, less twitchy. */
  follow: number;
  /** Bending stiffness (0–1): how wide the tightest bend is, and how far stiffness reaches along the scarf. */
  stiffness: number;
  /** Speed kept per frame while lying on the table (0–0.99). Lower = more friction. */
  tableDamping: number;
  /** Speed kept per frame while lifted (0–0.99). */
  airDamping: number;
  /** Extra evening-out of curves (0–0.5). */
  smoothing: number;
  /** How high the held part lifts, in px. */
  liftHeight: number;
  /** Solver passes per frame (more = stiffer, slower). */
  iterations: number;
}

export const DEFAULT_PHYSICS: Physics = {
  handSpan: 0.05,
  hold: 0.5,
  follow: 0.35,
  stiffness: 1,
  tableDamping: 0.3,
  airDamping: 0.5,
  smoothing: 0.18,
  liftHeight: 22,
  iterations: 20,
};

const PHYSICS_KEY = 'bead2scarf-physics';

function loadPhysics(): Physics {
  try {
    const raw = localStorage.getItem(PHYSICS_KEY);
    if (raw) return { ...DEFAULT_PHYSICS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_PHYSICS };
}

/** Slider ranges for the tuning panel. */
const PHYSICS_RANGES: Record<keyof Physics, [number, number, number]> = {
  handSpan: [0, 0.5, 0.01],
  hold: [0, 1, 0.05],
  follow: [0.05, 1, 0.05],
  stiffness: [0, 1, 0.05],
  tableDamping: [0.3, 0.98, 0.01],
  airDamping: [0.5, 0.99, 0.01],
  smoothing: [0, 0.5, 0.02],
  liftHeight: [0, 60, 1],
  iterations: [4, 40, 1],
};

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
  const [physics, setPhysics] = useState<Physics>(loadPhysics);
  const phys = useRef(physics);
  phys.current = physics;
  const [copied, setCopied] = useState(false);
  const updatePhysics = (patch: Partial<Physics>) =>
    setPhysics((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PHYSICS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

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
    const edge = fabricHalf + 8;
    const clampPt = (p: Pt): Pt => ({ x: Math.max(edge, Math.min(width - edge, p.x)), y: Math.max(edge, Math.min(HEIGHT - edge, p.y)) });

    // Initial layout: a relaxed S across the table whose arc length matches the scarf.
    const nodes: Node[] = initialLayout(N, seg, width, HEIGHT).map((p) => ({ x: p.x, y: p.y, px: p.x, py: p.y, lift: 0 }));
    let grabbed = -1;
    let cursor: Pt = { x: 0, y: 0 };
    let hand: Pt = { x: 0, y: 0 };
    /** Nodes held by the hand: their offset from the grab point and how firmly they're held. */
    let held: { i: number; dx: number; dy: number; w: number }[] = [];
    let raf = 0;
    let running = false;
    let calm = 0;

    const step = () => {
      const P = phys.current;
      // Knitted fabric can't fold to a point: the tightest bend scales with stiffness.
      const minRadius = fabricW * (0.3 + 1.7 * P.stiffness);
      const chord = (k: number) => 2 * seg * (k / 2) * Math.cos(Math.min(1.3, (seg * k) / (2 * minRadius)));
      const min2 = chord(2);
      const min4 = chord(4);
      if (grabbed >= 0) {
        // The hand eases towards the cursor instead of snapping to it.
        hand = { x: hand.x + (cursor.x - hand.x) * P.follow, y: hand.y + (cursor.y - hand.y) * P.follow };
      }
      for (const n of nodes) {
        const damp = n.lift > 2 ? P.airDamping : P.tableDamping;
        const vx = (n.x - n.px) * damp;
        const vy = (n.y - n.py) * damp;
        n.px = n.x;
        n.py = n.y;
        n.x += vx;
        n.y += vy;
      }
      for (let it = 0; it < P.iterations; it++) {
        // The held region moves with the hand as a whole (keeps its shape), firmest at the grab point.
        if (grabbed >= 0) {
          for (const h of held) {
            const n = nodes[h.i];
            const k = h.i === grabbed ? 1 : h.w * P.hold;
            n.x += (hand.x + h.dx - n.x) * k;
            n.y += (hand.y + h.dy - n.y) * k;
          }
        }
        // Keep the spacing (fabric doesn't stretch)…
        for (let i = 0; i < N - 1; i++) satisfy(nodes, i, i + 1, seg, seg, grabbed);
        // …and resist bending, both locally and over a longer stretch.
        for (let i = 0; i < N - 2; i++) satisfy(nodes, i, i + 2, min2, seg * 2, grabbed);
        if (P.stiffness > 0) for (let i = 0; i < N - 4; i++) satisfy(nodes, i, i + 4, min4, seg * 4, grabbed);
        // Even out curves so they don't zig-zag between points.
        if (P.smoothing > 0 && it % 4 === 0)
          for (let i = 1; i < N - 1; i++) {
            if (i === grabbed) continue;
            const n = nodes[i];
            n.x += ((nodes[i - 1].x + nodes[i + 1].x) / 2 - n.x) * P.smoothing;
            n.y += ((nodes[i - 1].y + nodes[i + 1].y) / 2 - n.y) * P.smoothing;
          }
        // Stay on the table: keep the whole width of the scarf inside it.
        for (const n of nodes) {
          n.x = Math.max(edge, Math.min(width - edge, n.x));
          n.y = Math.max(edge, Math.min(HEIGHT - edge, n.y));
        }
      }
      // Lift: the held part rises (and a bit beyond it), then settles back down.
      let motion = 0;
      const liftSpan = Math.max(2, N * (P.handSpan + 0.08));
      nodes.forEach((n, i) => {
        const want = grabbed >= 0 ? Math.max(0, 1 - Math.abs(i - grabbed) / liftSpan) * P.liftHeight : 0;
        n.lift += (want - n.lift) * 0.2;
        motion += Math.abs(n.x - n.px) + Math.abs(n.y - n.py) + Math.abs(want - n.lift);
      });
      if (grabbed >= 0) motion += Math.abs(cursor.x - hand.x) + Math.abs(cursor.y - hand.y);
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
      cursor = clampPt(p);
      hand = { x: nodes[i].x, y: nodes[i].y };
      const span = Math.max(0, phys.current.handSpan * N);
      held = [];
      for (let j = Math.max(0, Math.floor(i - span)); j <= Math.min(N - 1, Math.ceil(i + span)); j++) {
        const t = span > 0 ? Math.abs(j - i) / (span + 1) : j === i ? 0 : 1;
        if (t >= 1) continue;
        const w = 1 - t * t * (3 - 2 * t); // smooth falloff
        held.push({ i: j, dx: nodes[j].x - hand.x, dy: nodes[j].y - hand.y, w });
      }
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      wake();
    };
    const onMove = (e: PointerEvent) => {
      const p = toLocal(e);
      if (grabbed >= 0) {
        cursor = clampPt(p);
        wake();
      } else {
        canvas.style.cursor = nearest(p) >= 0 ? 'grab' : 'default';
      }
    };
    const onUp = () => {
      grabbed = -1;
      held = [];
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
      <details className="more tuning">
        <summary>🔧 {t('physics.title')}</summary>
        <div className="more-body">
          <p className="hint">{t('physics.hint')}</p>
          <div className="tuning-grid">
            {(Object.keys(PHYSICS_RANGES) as (keyof Physics)[]).map((k) => {
              const [min, max, stepV] = PHYSICS_RANGES[k];
              return (
                <Slider
                  key={k}
                  label={<span title={t(`physics.${k}Hint`)}>{t(`physics.${k}`)}</span>}
                  value={physics[k]}
                  min={min}
                  max={max}
                  step={stepV}
                  onChange={(v) => updatePhysics({ [k]: v } as Partial<Physics>)}
                  format={(v) => (stepV >= 1 ? String(v) : v.toFixed(2))}
                />
              );
            })}
          </div>
          <div className="btn-row">
            <button
              className="btn small"
              onClick={() => {
                const text = JSON.stringify(physics);
                navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(true));
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              📋 {copied ? t('physics.copied') : t('physics.copy')}
            </button>
            <button className="btn small ghost" onClick={() => updatePhysics({ ...DEFAULT_PHYSICS })}>↺ {t('physics.reset')}</button>
          </div>
          <textarea className="text-input mono" readOnly rows={2} value={JSON.stringify(physics)} onFocus={(e) => e.currentTarget.select()} />
        </div>
      </details>
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
