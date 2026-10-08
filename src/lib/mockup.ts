import { shade } from './color';
import type { Grid } from './grid';
import type { KnitChart } from './knitChart';
import { mulberry32 } from './quantize';
import { renderScarf, type ScarfRenderOptions } from './scarfRender';

export type MockupScene = 'trench' | 'y2k' | 'giftbox' | 'flatlay';
export const MOCKUP_SCENES: MockupScene[] = ['trench', 'y2k', 'giftbox', 'flatlay'];

export interface MockupOptions {
  /** Text on the gift tag / card. */
  tagText: string;
}

const W = 900;
const H = 1125; // 4:5, good for social posts

type Pt = { x: number; y: number };

/** The knitted scarf as a vertical texture, plus the source rectangle that holds it. */
interface ScarfTexture {
  img: HTMLCanvasElement;
  sx: number;
  sw: number;
  /** First and last row (px) including fringe. */
  y0: number;
  y1: number;
}

function scarfTexture(chart: KnitChart, scarf: ScarfRenderOptions): ScarfTexture {
  const stitchPx = 6;
  const img = renderScarf(chart, { ...scarf, stitchPx, orientation: 'vertical', drape: false, shadow: false });
  const m = stitchPx * 4;
  return { img, sx: m / 2, sw: img.width - m, y0: m, y1: img.height - m };
}

/** Smooth Catmull-Rom curve through control points, sampled densely. */
function spline(ctrl: Pt[], per = 40): Pt[] {
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

function pathLength(pts: Pt[]) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

/**
 * Draw a band of the scarf texture along a path. Source rows `from`→`to` are
 * spread over the path (to < from draws it reversed).
 */
function drawStrip(ctx: CanvasRenderingContext2D, tex: ScarfTexture, from: number, to: number, ctrl: Pt[], width: number, shading = true) {
  const pts = spline(ctrl);
  const L = pathLength(pts);
  let seg = 0;
  let segStart = 0;
  const slice = Math.abs(to - from) / L;
  for (let s = 0; s < L; s += 0.5) {
    while (seg < pts.length - 2) {
      const len = Math.hypot(pts[seg + 1].x - pts[seg].x, pts[seg + 1].y - pts[seg].y);
      if (segStart + len >= s) break;
      segStart += len;
      seg++;
    }
    const a = pts[seg];
    const b = pts[seg + 1] ?? a;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const f = Math.min(1, (s - segStart) / len);
    const x = a.x + (b.x - a.x) * f;
    const y = a.y + (b.y - a.y) * f;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const sy = from + (to - from) * (s / L);
    const srcY = Math.max(0, Math.min(tex.img.height - 1, Math.min(sy, sy + (to > from ? slice : -slice))));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang - Math.PI / 2);
    ctx.drawImage(tex.img, tex.sx, srcY, tex.sw, Math.max(1, slice * 1.5), -width / 2, 0, width, 2.4);
    ctx.restore();
  }
  if (!shading) return;
  // Soft cylindrical shading so the band reads as a rounded, padded scarf.
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(60,40,30,0.18)';
  ctx.lineWidth = width;
  stroke(ctx, pts);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = width * 0.45;
  stroke(ctx, pts);
  ctx.restore();
}

function stroke(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

/** Draw scarf pieces on their own layer, then drop it on the scene with a soft shadow. */
function withShadow(ctx: CanvasRenderingContext2D, draw: (l: CanvasRenderingContext2D) => void, blur = 16, dy = 8) {
  const layer = document.createElement('canvas');
  layer.width = W;
  layer.height = H;
  const l = layer.getContext('2d')!;
  draw(l);
  ctx.save();
  ctx.shadowColor = 'rgba(40,25,15,0.28)';
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = dy;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

/** Scarf worn around the neck: a front loop and two hanging ends showing the motif ends. */
function wornScarf(ctx: CanvasRenderingContext2D, tex: ScarfTexture, width: number, neckY: number, leftEnd: Pt[], rightEnd: Pt[]) {
  const scale = tex.sw / width;
  const lenL = pathLength(spline(leftEnd)) * scale;
  const lenR = pathLength(spline(rightEnd)) * scale;
  const mid = (tex.y0 + tex.y1) / 2;
  const band = [{ x: 450 - 78, y: neckY - 8 }, { x: 450, y: neckY + 22 }, { x: 450 + 78, y: neckY - 8 }];
  const bandLen = pathLength(spline(band)) * scale;
  withShadow(ctx, (l) => {
    drawStrip(l, tex, tex.y1 - lenR, tex.y1, rightEnd, width);
    drawStrip(l, tex, tex.y0 + lenL, tex.y0, leftEnd, width);
    drawStrip(l, tex, mid - bandLen / 2, mid + bandLen / 2, band, width * 0.85);
  });
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

function poly(ctx: CanvasRenderingContext2D, pts: [number, number][], fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

const SKIN = '#f1caa8';

/** Faceless fashion-illustration head, neck and hair. */
function head(ctx: CanvasRenderingContext2D, hair: string, style: 'long' | 'buns') {
  if (style === 'long') {
    poly(ctx, [[350, 230], [550, 230], [585, 520], [315, 520]], hair);
  }
  ctx.fillStyle = shade(SKIN, -0.08);
  ctx.fillRect(418, 300, 64, 130);
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.ellipse(450, 235, 78, 98, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.ellipse(450, 190, 86, 70, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(366, 200);
  ctx.quadraticCurveTo(420, 120, 520, 165);
  ctx.quadraticCurveTo(470, 175, 430, 215);
  ctx.quadraticCurveTo(395, 230, 366, 260);
  ctx.closePath();
  ctx.fill();
  if (style === 'buns') {
    for (const x of [380, 520]) {
      ctx.beginPath();
      ctx.arc(x, 130, 38, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(255,140,150,0.35)';
  for (const x of [410, 490]) {
    ctx.beginPath();
    ctx.ellipse(x, 268, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function sceneTrench(ctx: CanvasRenderingContext2D, tex: ScarfTexture) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f1e8dc');
  g.addColorStop(1, '#e2d2bd');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(450, 520, 380, 0, Math.PI * 2);
  ctx.fill();

  head(ctx, '#3b2a22', 'long');
  const coat = '#c9a679';
  // Sleeves / arms.
  poly(ctx, [[300, 440], [240, 480], [215, 1125], [300, 1125], [330, 560]], shade(coat, -0.06));
  poly(ctx, [[600, 440], [660, 480], [685, 1125], [600, 1125], [570, 560]], shade(coat, -0.06));
  // Body.
  poly(ctx, [[300, 440], [405, 405], [495, 405], [600, 440], [640, 1125], [260, 1125]], coat);
  // Shirt.
  poly(ctx, [[408, 410], [492, 410], [450, 600]], '#fbf8f3');
  // Lapels.
  poly(ctx, [[405, 405], [318, 455], [395, 650], [452, 600]], shade(coat, -0.14));
  poly(ctx, [[495, 405], [582, 455], [505, 650], [448, 600]], shade(coat, -0.14));
  // Belt and buttons.
  ctx.fillStyle = shade(coat, -0.1);
  ctx.fillRect(268, 800, 364, 36);
  ctx.strokeStyle = '#6b5236';
  ctx.lineWidth = 5;
  ctx.strokeRect(430, 804, 40, 28);
  ctx.fillStyle = '#5a4330';
  for (const y of [690, 740, 900, 960]) for (const x of [400, 500]) {
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  wornScarf(ctx, tex, 104, 400,
    [{ x: 398, y: 405 }, { x: 382, y: 600 }, { x: 392, y: 930 }],
    [{ x: 502, y: 405 }, { x: 528, y: 600 }, { x: 520, y: 840 }]);
}

function sceneY2K(ctx: CanvasRenderingContext2D, tex: ScarfTexture) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#ffd6ec');
  g.addColorStop(1, '#d6c8ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const rand = mulberry32(5);
  for (let i = 0; i < 26; i++) sparkle(ctx, rand() * W, rand() * H, 6 + rand() * 16, i % 3 ? 'rgba(255,255,255,0.8)' : 'rgba(255,240,150,0.9)');
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'italic 800 64px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText('y2k ♡', 60, 110);

  head(ctx, '#f4cf86', 'buns');
  // Butterfly clips and tinted shades on the head.
  for (const [x, y, c] of [[392, 178, '#7cc6fe'], [505, 170, '#ff8fc8'], [450, 150, '#b28dff']] as [number, number, string][]) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(x - 9, y, 10, 7, -0.6, 0, Math.PI * 2);
    ctx.ellipse(x + 9, y, 10, 7, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(178,141,255,0.55)';
  for (const x of [415, 485]) {
    ctx.beginPath();
    ctx.ellipse(x, 140, 30, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Arms, baby tee, low-rise jeans.
  poly(ctx, [[330, 450], [280, 490], [255, 1125], [320, 1125], [345, 600]], SKIN);
  poly(ctx, [[570, 450], [620, 490], [645, 1125], [580, 1125], [555, 600]], SKIN);
  poly(ctx, [[330, 450], [410, 418], [490, 418], [570, 450], [592, 560], [552, 570], [548, 860], [352, 860], [348, 570], [308, 560]], '#ff9ecf');
  ctx.fillStyle = SKIN;
  ctx.fillRect(352, 860, 196, 60);
  poly(ctx, [[340, 920], [560, 920], [600, 1125], [300, 1125]], '#86a9dc');
  ctx.fillStyle = '#c9d8ef';
  ctx.fillRect(340, 920, 220, 16);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('♥', 450, 720);
  ctx.textAlign = 'left';
  wornScarf(ctx, tex, 82, 408,
    [{ x: 404, y: 412 }, { x: 410, y: 620 }, { x: 400, y: 880 }],
    [{ x: 496, y: 412 }, { x: 486, y: 600 }, { x: 500, y: 800 }]);
}

function drawBeadCharm(ctx: CanvasRenderingContext2D, grid: Grid, cx: number, cy: number, size: number) {
  const cell = size / Math.max(grid.w, grid.h);
  const x0 = cx - (grid.w * cell) / 2;
  const y0 = cy - (grid.h * cell) / 2;
  for (let y = 0; y < grid.h; y++)
    for (let x = 0; x < grid.w; x++) {
      const v = grid.cells[y * grid.w + x];
      if (v < 0) continue;
      const hex = grid.colors[v].hex;
      ctx.fillStyle = hex;
      ctx.beginPath();
      ctx.arc(x0 + (x + 0.5) * cell, y0 + (y + 0.5) * cell, cell * 0.48, 0, Math.PI * 2);
      ctx.fill();
      if (cell > 5) {
        ctx.fillStyle = shade(hex, -0.3);
        ctx.beginPath();
        ctx.arc(x0 + (x + 0.5) * cell, y0 + (y + 0.5) * cell, cell * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
}

function tag(ctx: CanvasRenderingContext2D, grid: Grid, text: string, x: number, y: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = '#fffaf3';
  ctx.beginPath();
  ctx.moveTo(-90, -40);
  ctx.lineTo(60, -110);
  ctx.lineTo(90, -60);
  ctx.lineTo(90, 150);
  ctx.lineTo(-90, 150);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#d9c7b4';
  ctx.beginPath();
  ctx.arc(55, -70, 8, 0, Math.PI * 2);
  ctx.fill();
  drawBeadCharm(ctx, grid, 0, 15, 70);
  ctx.fillStyle = '#5b4a3f';
  ctx.textAlign = 'center';
  ctx.font = '600 20px "PingFang SC", system-ui, sans-serif';
  wrapText(ctx, text, 0, 85, 160, 24);
  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const chars = [...text];
  let line = '';
  let yy = y;
  for (const ch of chars) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = ch.trimStart();
      yy += lh;
    } else line += ch;
  }
  if (line) ctx.fillText(line, x, yy);
}

function sceneGiftbox(ctx: CanvasRenderingContext2D, tex: ScarfTexture, grid: Grid, o: MockupOptions) {
  ctx.fillStyle = '#f4e9df';
  ctx.fillRect(0, 0, W, H);
  const rand = mulberry32(11);
  ctx.fillStyle = 'rgba(180,150,120,0.08)';
  for (let i = 0; i < 400; i++) ctx.fillRect(rand() * W, rand() * H, 2, 2);
  // Lid with ribbon, leaning behind the box.
  ctx.save();
  ctx.translate(560, 230);
  ctx.rotate(0.12);
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#e8c7c9';
  ctx.fillRect(-250, -150, 500, 300);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#d76f8b';
  ctx.fillRect(-250, -18, 500, 36);
  ctx.fillRect(-18, -150, 36, 300);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * 40, 0, 46, 24, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Box.
  ctx.save();
  ctx.shadowColor = 'rgba(60,35,20,0.3)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#d4a982';
  ctx.fillRect(150, 300, 600, 640);
  ctx.restore();
  ctx.fillStyle = '#fff6f2';
  ctx.fillRect(172, 322, 556, 596);
  ctx.strokeStyle = 'rgba(220,180,180,0.4)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    const x = 172 + rand() * 556;
    const y = 322 + rand() * 596;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 120, y + (rand() - 0.5) * 60);
    ctx.stroke();
  }
  // Folded scarf: stacked layers; the top one shows the motif end and fringe.
  const width = 190;
  const scale = tex.sw / width;
  const layer = (y: number, from: number, x0 = 210, x1 = 690) => {
    const len = (x1 - x0) * scale;
    withShadow(ctx, (l) => drawStrip(l, tex, from + len, from, [{ x: x0, y }, { x: x1, y }], width, false), 14, 6);
  };
  const mid = (tex.y0 + tex.y1) / 2;
  layer(760, mid);
  layer(640, mid - 600);
  layer(520, tex.y0, 150, 690);
  tag(ctx, grid, o.tagText, 690, 930, 0.12);
}

function sceneFlatlay(ctx: CanvasRenderingContext2D, tex: ScarfTexture, grid: Grid, o: MockupOptions) {
  ctx.fillStyle = '#eee6da';
  ctx.fillRect(0, 0, W, H);
  const rand = mulberry32(3);
  ctx.strokeStyle = 'rgba(150,130,100,0.10)';
  for (let y = 0; y < H; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y + rand());
    ctx.lineTo(W, y + rand());
    ctx.stroke();
  }
  // Mug.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(770, 150, 78, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#8a5a3c';
  ctx.beginPath();
  ctx.arc(770, 150, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f3e3cf';
  ctx.beginPath();
  ctx.ellipse(770, 150, 22, 14, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Scarf in an S-curve.
  const ctrl = [{ x: 130, y: 170 }, { x: 520, y: 320 }, { x: 380, y: 560 }, { x: 560, y: 800 }, { x: 760, y: 1050 }];
  const L = pathLength(spline(ctrl));
  const width = Math.max(90, Math.min(170, (L * tex.sw) / (tex.y1 - tex.y0)));
  withShadow(ctx, (l) => drawStrip(l, tex, tex.y0, tex.y1, ctrl, width), 18, 9);
  // The original bead piece and a card.
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 5;
  drawBeadCharm(ctx, grid, 175, 720, 190);
  ctx.restore();
  tag(ctx, grid, o.tagText, 190, 990, -0.08);
}

/** Render a lifestyle or product mockup of the scarf. */
export function renderMockup(scene: MockupScene, chart: KnitChart, scarf: ScarfRenderOptions, grid: Grid, o: MockupOptions): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const tex = scarfTexture(chart, scarf);
  if (scene === 'trench') sceneTrench(ctx, tex);
  else if (scene === 'y2k') sceneY2K(ctx, tex);
  else if (scene === 'giftbox') sceneGiftbox(ctx, tex, grid, o);
  else sceneFlatlay(ctx, tex, grid, o);
  return c;
}
