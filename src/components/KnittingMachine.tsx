import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { shade } from '../lib/color';
import type { KnitChart } from '../lib/knitChart';
import { renderScarf, type ScarfRenderOptions } from '../lib/scarfRender';
import { useSettings } from '../store/settingsStore';
import { Seg, Slider } from './Field';

type Mode = 'auto' | 'manual';

interface Props {
  chart: KnitChart;
  options: ScarfRenderOptions;
  onDone?: () => void;
}

interface Particle { x: number; y: number; vx: number; vy: number; color: string; rot: number; life: number }

const HEIGHT = 600;
const BED_Y = 150;
const BED_H = 24;
const KEY_SPEED = 520; // px per second when steering with the keyboard

/**
 * A cute flat-bed knitting machine. The carriage slides across the needle bed;
 * every pass knits a few rows and the scarf grows out underneath. In manual mode
 * the user pushes the carriage (drag, arrow keys / A D, or the mouse wheel).
 */
export function KnittingMachine({ chart, options, onDone }: Props) {
  const { t } = useTranslation();
  const accent = useSettings((s) => s.accent);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('auto');
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(2);
  const [display, setDisplay] = useState({ rows: 0, done: false });
  const [width, setWidth] = useState(720);

  // Mutable animation state (kept out of React to avoid re-rendering every frame).
  const sim = useRef({ rows: 0, carX: 0, dir: 1, keys: new Set<string>(), dragging: false, done: false, particles: [] as Particle[], blink: 0, bounce: 0 });
  const cfg = useRef({ mode, playing, speed, onDone });
  cfg.current = { mode, playing, speed, onDone };

  const sp = Math.max(3, Math.min(12, Math.floor(Math.min(340, width * 0.55) / chart.w)));
  const fabric = useMemo(
    () => renderScarf(chart, { ...options, stitchPx: sp, orientation: 'vertical', drape: false, shadow: false }),
    [chart, options, sp],
  );
  const rowsPerPass = Math.max(1, Math.round(chart.h / 70));

  // Distinct yarns, main first, for the cones.
  const cones = useMemo(() => chart.yarns.slice(0, 6), [chart]);
  // Colour feeding the carriage for each row: the most-used contrast yarn, else main.
  const rowYarn = useMemo(() => {
    const out: number[] = [];
    for (let y = 0; y < chart.h; y++) {
      const counts = new Map<number, number>();
      for (let x = 0; x < chart.w; x++) {
        const v = chart.cells[y * chart.w + x];
        if (v !== 0) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      let best = 0;
      let n = 0;
      for (const [k, c] of counts) if (c > n) { n = c; best = k; }
      out.push(best);
    }
    return out;
  }, [chart]);

  const restart = () => {
    const s = sim.current;
    s.rows = 0;
    s.done = false;
    s.particles = [];
    setDisplay({ rows: 0, done: false });
    setPlaying(true);
  };

  useEffect(() => { restart(); }, [chart]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track container width.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(320, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyboard steering.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'a', 'd'].includes(k)) {
        e.preventDefault();
        if (cfg.current.mode !== 'manual') setMode('manual');
        sim.current.keys.add(k);
      } else if (k === ' ' && cfg.current.mode === 'auto') {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    const up = (e: KeyboardEvent) => sim.current.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Animation loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${HEIGHT}px`;
    const ctx = canvas.getContext('2d')!;
    const scarfW = chart.w * sp;
    const x0 = Math.round(width / 2 - scarfW / 2);
    const minX = x0;
    const maxX = x0 + scarfW;
    const travel = Math.max(1, maxX - minX);
    const margin = sp * 4; // renderScarf's side margin when drape is off
    const s = sim.current;
    if (s.carX < minX || s.carX > maxX) s.carX = minX;
    let last = performance.now();
    let lastDisplay = 0;
    let raf = 0;

    const finish = () => {
      s.done = true;
      s.rows = chart.h;
      const colors = chart.yarns.map((y) => y.hex).concat([accent, '#ffd93b', '#7cc6fe']);
      for (let i = 0; i < 90; i++)
        s.particles.push({
          x: width / 2, y: BED_Y, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 9 - 3,
          color: colors[i % colors.length], rot: Math.random() * 6, life: 1,
        });
      cfg.current.onDone?.();
    };

    const advance = (dx: number) => {
      if (s.done || dx === 0) return;
      s.dir = Math.sign(dx);
      s.rows = Math.min(chart.h, s.rows + (Math.abs(dx) / travel) * rowsPerPass);
      s.bounce = 1;
      if (s.rows >= chart.h) finish();
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { mode: m, playing: p, speed: v } = cfg.current;

      if (!s.done) {
        if (m === 'auto' && p) {
          s.rows = Math.min(chart.h, s.rows + dt * v * rowsPerPass);
          const passes = s.rows / rowsPerPass;
          const pass = Math.floor(passes);
          const f = 0.5 - 0.5 * Math.cos(Math.PI * (passes - pass));
          const nx = pass % 2 === 0 ? minX + f * travel : maxX - f * travel;
          s.dir = Math.sign(nx - s.carX) || s.dir;
          s.carX = nx;
          s.bounce = 1;
          if (s.rows >= chart.h) finish();
        } else if (m === 'manual' && s.keys.size) {
          const left = s.keys.has('arrowleft') || s.keys.has('a');
          const right = s.keys.has('arrowright') || s.keys.has('d');
          const dx = (right ? 1 : 0) - (left ? 1 : 0);
          const nx = Math.max(minX, Math.min(maxX, s.carX + dx * KEY_SPEED * dt));
          advance(nx - s.carX);
          s.carX = nx;
        }
      }
      s.bounce = Math.max(0, s.bounce - dt * 3);
      s.blink = (s.blink + dt) % 4;

      draw(ctx, dpr, now / 1000);
      if (now - lastDisplay > 90) {
        lastDisplay = now;
        setDisplay((d) => (d.rows === Math.floor(s.rows) && d.done === s.done ? d : { rows: Math.floor(s.rows), done: s.done }));
      }
      raf = requestAnimationFrame(frame);
    };

    const draw = (c: CanvasRenderingContext2D, scale: number, time: number) => {
      c.setTransform(scale, 0, 0, scale, 0, 0);
      c.clearRect(0, 0, width, HEIGHT);
      const bedLeft = minX - 70;
      const bedRight = maxX + 70;
      const bedBottom = BED_Y + BED_H;

      // Legs.
      c.fillStyle = '#9aa3ad';
      c.fillRect(bedLeft + 14, bedBottom, 10, HEIGHT - bedBottom);
      c.fillRect(bedRight - 24, bedBottom, 10, HEIGHT - bedBottom);

      // Fabric emerging below the bed: newest row right under the needles.
      const reveal = (s.rows / chart.h) * fabric.height;
      if (reveal > 0.5) {
        c.save();
        c.shadowColor = 'rgba(0,0,0,0.18)';
        c.shadowBlur = 10;
        c.shadowOffsetY = 4;
        c.drawImage(fabric, 0, fabric.height - reveal, fabric.width, reveal, x0 - margin, bedBottom + 2, fabric.width, reveal);
        c.restore();
      }

      // Yarn cones.
      const rowIdx = Math.max(0, Math.min(chart.h - 1, chart.h - 1 - Math.floor(s.rows)));
      const activeYarn = s.done ? 0 : Math.min(cones.length - 1, rowYarn[rowIdx]);
      cones.forEach((y, i) => {
        const cx = 34 + i * 40;
        const cy = 52 - (i === activeYarn ? Math.sin(time * 10) * 2 * s.bounce : 0);
        c.fillStyle = '#d9c3a5';
        c.fillRect(cx - 3, cy - 30, 6, 8);
        c.fillStyle = y.hex;
        c.beginPath();
        c.moveTo(cx - 8, cy - 24);
        c.lineTo(cx + 8, cy - 24);
        c.lineTo(cx + 15, cy + 18);
        c.lineTo(cx - 15, cy + 18);
        c.closePath();
        c.fill();
        c.strokeStyle = shade(y.hex, -0.25);
        c.lineWidth = 1;
        for (let k = 0; k < 5; k++) {
          const yy = cy - 18 + k * 8;
          const half = 8 + ((yy - (cy - 24)) / 42) * 7;
          c.beginPath();
          c.moveTo(cx - half + 1, yy);
          c.lineTo(cx + half - 1, yy + 2);
          c.stroke();
        }
      });

      // Yarn from the active cone to the carriage.
      const coneX = 34 + activeYarn * 40;
      c.strokeStyle = chart.yarns[activeYarn]?.hex ?? '#ccc';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(coneX, 26);
      c.quadraticCurveTo((coneX + s.carX) / 2, 10, s.carX, BED_Y - 44);
      c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.15)';
      c.lineWidth = 0.6;
      c.stroke();

      // Needle bed.
      const g = c.createLinearGradient(0, BED_Y, 0, bedBottom);
      g.addColorStop(0, '#e3e7eb');
      g.addColorStop(1, '#aeb6bf');
      c.fillStyle = g;
      roundRect(c, bedLeft, BED_Y, bedRight - bedLeft, BED_H, 6);
      c.fill();
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.font = '700 9px system-ui, sans-serif';
      c.textAlign = 'left';
      c.fillText('KNIT-O-MATIC', bedLeft + 8, bedBottom - 7);

      // Needles (the ones under the carriage pop up).
      c.strokeStyle = '#6f7882';
      c.lineWidth = Math.max(1, sp * 0.18);
      const step = sp >= 4 ? 1 : 2;
      for (let i = 0; i < chart.w; i += step) {
        const nx = x0 + (i + 0.5) * sp;
        const lift = Math.max(0, 1 - Math.abs(nx - s.carX) / 55) * 14;
        c.beginPath();
        c.moveTo(nx, bedBottom + 6);
        c.lineTo(nx, BED_Y + 4 - lift);
        c.stroke();
      }

      // Carriage with a face.
      const cw = 88;
      const ch = 56;
      const bob = Math.sin(time * 14) * 1.5 * s.bounce;
      const cx = s.carX - cw / 2;
      const cy = BED_Y - ch + 18 + bob;
      c.fillStyle = shade(accent, -0.25);
      roundRect(c, s.carX - 10, cy - 14, 20, 16, 5);
      c.fill();
      c.fillStyle = accent;
      roundRect(c, cx, cy, cw, ch, 14);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.25)';
      roundRect(c, cx + 6, cy + 5, cw - 12, 10, 5);
      c.fill();
      // Eyes look where it's going; blink now and then; ^ ^ when finished.
      const look = s.dir * 2.5;
      c.fillStyle = '#2a2522';
      c.strokeStyle = '#2a2522';
      c.lineWidth = 2.4;
      c.lineCap = 'round';
      for (const ex of [s.carX - 16, s.carX + 16]) {
        const ey = cy + 26;
        if (s.done) {
          c.beginPath();
          c.moveTo(ex - 6, ey + 2);
          c.lineTo(ex, ey - 4);
          c.lineTo(ex + 6, ey + 2);
          c.stroke();
        } else if (s.blink > 3.85) {
          c.beginPath();
          c.moveTo(ex - 5, ey);
          c.lineTo(ex + 5, ey);
          c.stroke();
        } else {
          c.beginPath();
          c.arc(ex + look, ey, 5, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#fff';
          c.beginPath();
          c.arc(ex + look + 1.5, ey - 1.8, 1.6, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#2a2522';
        }
      }
      c.fillStyle = 'rgba(255,150,170,0.6)';
      for (const bx of [s.carX - 30, s.carX + 30]) {
        c.beginPath();
        c.ellipse(bx, cy + 36, 6, 3.5, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.beginPath();
      c.lineWidth = 2.2;
      c.arc(s.carX, cy + 34, s.done ? 7 : 5, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();

      // Confetti.
      for (const p of s.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25;
        p.rot += 0.2;
        p.life -= 0.006;
        c.save();
        c.globalAlpha = Math.max(0, p.life);
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillStyle = p.color;
        c.fillRect(-4, -2.5, 8, 5);
        c.restore();
      }
      s.particles = s.particles.filter((p) => p.life > 0 && p.y < HEIGHT + 20);
    };

    // Pointer steering: drag anywhere to push the carriage.
    const toX = (e: PointerEvent) => e.clientX - canvas.getBoundingClientRect().left;
    const onDown = (e: PointerEvent) => {
      s.dragging = true;
      canvas.setPointerCapture(e.pointerId);
      if (cfg.current.mode !== 'manual') setMode('manual');
    };
    const onMove = (e: PointerEvent) => {
      if (!s.dragging || s.done) return;
      const nx = Math.max(minX, Math.min(maxX, toX(e)));
      advance(nx - s.carX);
      s.carX = nx;
    };
    const onUp = () => { s.dragging = false; };
    const onWheel = (e: WheelEvent) => {
      if (cfg.current.mode !== 'manual' || s.done) return;
      e.preventDefault();
      const nx = Math.max(minX, Math.min(maxX, s.carX + (e.deltaY + e.deltaX) * 0.6));
      advance(nx - s.carX);
      s.carX = nx;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [chart, fabric, sp, width, accent, cones, rowYarn, rowsPerPass]);

  const pct = Math.round((display.rows / chart.h) * 100);

  return (
    <div className="machine">
      <div className="toolbar">
        <Seg<Mode>
          value={mode}
          onChange={(m) => { setMode(m); if (m === 'auto') setPlaying(true); }}
          options={[{ value: 'auto', label: `🤖 ${t('machine.auto')}` }, { value: 'manual', label: `✋ ${t('machine.manual')}` }]}
        />
        {mode === 'auto' && !display.done && (
          <button className="btn small" onClick={() => setPlaying((p) => !p)}>{playing ? `⏸ ${t('machine.pause')}` : `▶ ${t('machine.play')}`}</button>
        )}
        {mode === 'auto' && (
          <div style={{ width: 150 }}>
            <Slider label={t('machine.speed')} value={speed} min={0.5} max={8} step={0.5} onChange={setSpeed} format={(v) => `${v}×`} />
          </div>
        )}
        <button className="btn small ghost" onClick={restart}>↺ {t('machine.restart')}</button>
        {!display.done && (
          <button className="btn small ghost" onClick={() => { sim.current.rows = chart.h - 0.01; setMode('auto'); setPlaying(true); }}>⏭ {t('machine.skip')}</button>
        )}
      </div>
      <p className="hint">{mode === 'manual' ? t('machine.manualHint') : t('machine.autoHint')}</p>
      <div ref={wrapRef} className="machine-stage">
        <canvas ref={canvasRef} style={{ touchAction: 'none', cursor: mode === 'manual' ? 'ew-resize' : 'pointer' }} />
        {display.done && <div className="machine-done">🎉 {t('machine.done')}</div>}
      </div>
      <div className="progress">
        <div className="bar"><div style={{ width: `${pct}%` }} /></div>
        <span>{t('machine.rows', { n: display.rows, total: chart.h })} · {pct}%</span>
      </div>
    </div>
  );
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
