import { useEffect, useRef } from 'react';
import { shade } from '../lib/color';
import type { Grid } from '../lib/grid';

export type BeadStyle = 'bead' | 'square';

interface Props {
  grid: Grid;
  cell: number;
  beadStyle?: BeadStyle;
  showGrid?: boolean;
  /** Pointer callback in grid coordinates. */
  onCell?: (x: number, y: number, phase: 'down' | 'move' | 'up') => void;
  cursor?: string;
}

/** Draws a bead grid either as fused beads (rings) or flat squares. */
export function drawGrid(ctx: CanvasRenderingContext2D, grid: Grid, cell: number, beadStyle: BeadStyle, showGrid: boolean) {
  const W = grid.w * cell;
  const H = grid.h * cell;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const v = grid.cells[y * grid.w + x];
      const px = x * cell;
      const py = y * cell;
      if (v < 0) {
        // Empty peg.
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.beginPath();
        ctx.arc(px + cell / 2, py + cell / 2, Math.max(1, cell * 0.12), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const hex = grid.colors[v].hex;
      if (beadStyle === 'square') {
        ctx.fillStyle = hex;
        ctx.fillRect(px, py, cell, cell);
      } else {
        const r = cell * 0.47;
        const g = ctx.createRadialGradient(px + cell * 0.38, py + cell * 0.35, cell * 0.05, px + cell / 2, py + cell / 2, r);
        g.addColorStop(0, shade(hex, 0.25));
        g.addColorStop(0.7, hex);
        g.addColorStop(1, shade(hex, -0.2));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px + cell / 2, py + cell / 2, r, 0, Math.PI * 2);
        ctx.fill();
        if (cell >= 8) {
          ctx.fillStyle = shade(hex, -0.35);
          ctx.beginPath();
          ctx.arc(px + cell / 2, py + cell / 2, cell * 0.15, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  if (showGrid && cell >= 6) {
    for (let x = 0; x <= grid.w; x++) {
      ctx.strokeStyle = x % 5 === 0 ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.1)';
      ctx.lineWidth = x % 5 === 0 ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x * cell + 0.25, 0);
      ctx.lineTo(x * cell + 0.25, H);
      ctx.stroke();
    }
    for (let y = 0; y <= grid.h; y++) {
      ctx.strokeStyle = y % 5 === 0 ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.1)';
      ctx.lineWidth = y % 5 === 0 ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y * cell + 0.25);
      ctx.lineTo(W, y * cell + 0.25);
      ctx.stroke();
    }
  }
}

export function GridCanvas({ grid, cell, beadStyle = 'bead', showGrid = true, onCell, cursor }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<string>('');

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = grid.w * cell * dpr;
    c.height = grid.h * cell * dpr;
    c.style.width = `${grid.w * cell}px`;
    c.style.height = `${grid.h * cell}px`;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawGrid(ctx, grid, cell, beadStyle, showGrid);
  }, [grid, cell, beadStyle, showGrid]);

  const toCell = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * grid.w);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * grid.h);
    if (x < 0 || y < 0 || x >= grid.w || y >= grid.h) return null;
    return [x, y] as const;
  };

  return (
    <canvas
      ref={ref}
      style={{ cursor: cursor ?? (onCell ? 'crosshair' : 'default'), touchAction: 'none', borderRadius: 6 }}
      onPointerDown={(e) => {
        if (!onCell || e.button !== 0) return;
        const p = toCell(e);
        if (!p) return;
        drawing.current = true;
        last.current = `${p[0]},${p[1]}`;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        onCell(p[0], p[1], 'down');
      }}
      onPointerMove={(e) => {
        if (!onCell || !drawing.current) return;
        const p = toCell(e);
        if (!p) return;
        const key = `${p[0]},${p[1]}`;
        if (key === last.current) return;
        last.current = key;
        onCell(p[0], p[1], 'move');
      }}
      onPointerUp={(e) => {
        if (!onCell || !drawing.current) return;
        drawing.current = false;
        const p = toCell(e);
        onCell(p ? p[0] : -1, p ? p[1] : -1, 'up');
      }}
    />
  );
}
