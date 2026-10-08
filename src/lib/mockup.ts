import { ctx2d, makeCanvas, type Canvas, type Ctx2D } from './canvas';
import { shade } from './color';
import type { Grid } from './grid';
import type { KnitChart } from './knitChart';
import { mulberry32 } from './quantize';
import { renderScarf, type ScarfRenderOptions } from './scarfRender';
import { drawStripMesh, pathLength, spline, type Pt } from './stripMesh';

export type MockupScene = 'trench' | 'y2k' | 'giftbox' | 'flatlay';
export const MOCKUP_SCENES: MockupScene[] = ['trench', 'y2k', 'giftbox', 'flatlay'];

export type HairStyle = 'long' | 'bob' | 'buns' | 'ponytail' | 'curly' | 'pixie';
export const HAIR_STYLES: HairStyle[] = ['long', 'bob', 'ponytail', 'buns', 'curly', 'pixie'];
export const SKIN_TONES = ['#f8dcc7', '#f1caa8', '#dcaa83', '#c18a5f', '#8d5a3b', '#5e3a26'];
export const HAIR_COLORS = ['#2b1d17', '#5a3a26', '#a0673c', '#e6c27a', '#f2a7c3', '#c9cbd1', '#8b6fd6'];

export interface MockupOptions {
  showMessage: boolean;
  message: string;
  /** Show the original bead piece in the picture. */
  showBeads: boolean;
  hairStyle: HairStyle;
  hairColor: string;
  skin: string;
  /** Gift-message typeface and size (1 = default). */
  messageFont: MessageFont;
  messageSize: number;
}

export type MessageFont = 'rounded' | 'hand' | 'serif' | 'sans' | 'cursive' | 'comic' | 'typewriter' | 'marker';
export const MESSAGE_FONTS: MessageFont[] = ['rounded', 'hand', 'serif', 'sans', 'cursive', 'comic', 'typewriter', 'marker'];

/** System fonts only (also usable inside the render worker), with Chinese coverage on Mac and Windows. */
export const FONT_STACKS: Record<MessageFont, { family: string; weight: number }> = {
  rounded: { family: '"Yuanti SC", "Hiragino Maru Gothic ProN", "Arial Rounded MT Bold", "Microsoft YaHei", sans-serif', weight: 600 },
  hand: { family: '"Kaiti SC", "STKaiti", "KaiTi", "Bradley Hand", "Segoe Print", cursive', weight: 500 },
  serif: { family: '"Songti SC", "STSong", "SimSun", Georgia, "Times New Roman", serif', weight: 500 },
  sans: { family: '"PingFang SC", "Microsoft YaHei", "Helvetica Neue", system-ui, sans-serif', weight: 600 },
  // English-style fonts; Chinese characters fall back to a matching Chinese face.
  cursive: { family: '"Snell Roundhand", "Apple Chancery", "Brush Script MT", "Segoe Script", "Kaiti SC", "KaiTi", cursive', weight: 500 },
  comic: { family: '"Comic Sans MS", "Chalkboard SE", "Comic Neue", "Yuanti SC", "Microsoft YaHei", cursive', weight: 600 },
  typewriter: { family: '"American Typewriter", "Courier New", "Courier", "Songti SC", "SimSun", monospace', weight: 500 },
  marker: { family: '"Marker Felt", "Chalkduster", "Segoe Print", "Bradley Hand", "Yuanti SC", "Microsoft YaHei", fantasy', weight: 500 },
};

function messageFont(m: MessageFont, px: number) {
  const f = FONT_STACKS[m] ?? FONT_STACKS.sans;
  return `${f.weight} ${Math.round(px)}px ${f.family}`;
}

export const DEFAULT_MOCKUP_OPTIONS: MockupOptions = {
  showMessage: true,
  message: '',
  showBeads: true,
  hairStyle: 'long',
  hairColor: HAIR_COLORS[0],
  skin: SKIN_TONES[1],
  messageFont: 'rounded',
  messageSize: 1,
};

/** Scenes with a person in them. */
export const hasAvatar = (s: MockupScene) => s === 'trench' || s === 'y2k';

const W = 900;
const H = 1125; // 4:5, good for social posts


/** The knitted scarf as a vertical texture, plus the source rectangle that holds it. */
interface ScarfTexture {
  img: Canvas;
  sx: number;
  sw: number;
  /** First and last row (px) including fringe. */
  y0: number;
  y1: number;
  /** Margin around the fabric, as a fraction of sw. */
  inset: number;
}

function scarfTexture(chart: KnitChart, scarf: ScarfRenderOptions): ScarfTexture {
  const stitchPx = 4;
  const img = renderScarf(chart, { ...scarf, stitchPx, orientation: 'vertical', drape: false, shadow: false });
  const m = stitchPx * 4;
  const sw = img.width - m;
  // The fabric sits inside a margin of m on each side of the texture.
  return { img, sx: m / 2, sw, y0: m, y1: img.height - m, inset: m / 2 / sw };
}

/**
 * Draw a band of the scarf texture along a path. Source rows `from`→`to` are
 * spread over the path (to < from draws it reversed).
 */
function drawStrip(ctx: Ctx2D, tex: ScarfTexture, from: number, to: number, ctrl: Pt[], width: number, shading = true) {
  const pts = spline(ctrl);
  const L = pathLength(pts);
  const straight = pts.length === 2;
  if (straight) {
    // Straight bands: one rotated draw instead of many slices.
    const [a, b] = pts;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2);
    if (to < from) {
      ctx.scale(1, -1);
      ctx.translate(0, -L);
    }
    ctx.drawImage(tex.img, tex.sx, Math.min(from, to), tex.sw, Math.abs(to - from), -width / 2, 0, width, L);
    ctx.restore();
  } else {
    // Curved bands: one continuous textured mesh, so stitches flow through bends.
    drawStripMesh(ctx, tex, from, to, pts, width, { creases: shading });
  }
  if (!shading) return;
  // Soft cylindrical shading so the band reads as a rounded, padded scarf.
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(60,40,30,0.10)';
  ctx.lineWidth = width;
  stroke(ctx, pts);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = width * 0.45;
  stroke(ctx, pts);
  ctx.restore();
}

function stroke(ctx: Ctx2D, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts) ctx.lineTo(p.x, p.y);
  ctx.stroke();
}

function makeLayer() {
  return makeCanvas(W, H);
}

/** Draw scarf pieces on their own layer, then drop it on the scene with a soft shadow. */
function withShadow(ctx: Ctx2D, draw: (l: Ctx2D) => void, blur = 16, dy = 8) {
  const layer = makeLayer();
  draw(ctx2d(layer));
  ctx.save();
  ctx.shadowColor = 'rgba(40,25,15,0.28)';
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = dy;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

/** Scarf worn around the neck: a front loop and two hanging ends showing the motif ends. */
function wornScarf(ctx: Ctx2D, tex: ScarfTexture, width: number, neckY: number, leftEnd: Pt[], rightEnd: Pt[]) {
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

function sparkle(ctx: Ctx2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

function poly(ctx: Ctx2D, pts: [number, number][], fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
}

function circle(ctx: Ctx2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/* ---------- Avatar (faceless fashion-illustration style) ---------- */

function hairBack(ctx: Ctx2D, style: HairStyle, color: string) {
  ctx.fillStyle = color;
  if (style === 'long') {
    poly(ctx, [[350, 230], [550, 230], [585, 520], [315, 520]], color);
  } else if (style === 'bob') {
    ctx.beginPath();
    ctx.moveTo(358, 210);
    ctx.lineTo(352, 330);
    ctx.quadraticCurveTo(450, 372, 548, 330);
    ctx.lineTo(542, 210);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'ponytail') {
    ctx.beginPath();
    ctx.moveTo(505, 165);
    ctx.bezierCurveTo(620, 160, 640, 300, 590, 430);
    ctx.bezierCurveTo(575, 350, 560, 260, 515, 215);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'curly') {
    const rand = mulberry32(9);
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand());
      circle(ctx, 450 + Math.cos(a) * 140 * r, 290 + Math.sin(a) * 170 * r, 30 + rand() * 12);
    }
  }
}

function hairFront(ctx: Ctx2D, style: HairStyle, color: string) {
  ctx.fillStyle = color;
  // Crown.
  ctx.beginPath();
  ctx.ellipse(450, 190, style === 'pixie' ? 88 : 86, style === 'pixie' ? 74 : 70, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  if (style === 'bob') {
    ctx.beginPath();
    ctx.moveTo(366, 205);
    ctx.quadraticCurveTo(450, 150, 534, 205);
    ctx.lineTo(534, 200);
    ctx.quadraticCurveTo(450, 225, 366, 205);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(374, 160, 152, 50, [30, 30, 6, 6]);
    ctx.fill();
  } else if (style === 'curly') {
    const rand = mulberry32(4);
    for (let i = 0; i < 14; i++) circle(ctx, 372 + i * 12, 175 + Math.sin(i) * 8 + rand() * 6, 18);
  } else if (style === 'pixie') {
    ctx.beginPath();
    ctx.moveTo(368, 215);
    ctx.quadraticCurveTo(400, 130, 530, 160);
    ctx.quadraticCurveTo(470, 185, 420, 230);
    ctx.closePath();
    ctx.fill();
  } else {
    // Side-swept part.
    ctx.beginPath();
    ctx.moveTo(366, 200);
    ctx.quadraticCurveTo(420, 120, 520, 165);
    ctx.quadraticCurveTo(470, 175, 430, 215);
    ctx.quadraticCurveTo(395, 230, 366, 260);
    ctx.closePath();
    ctx.fill();
  }
  if (style === 'buns') {
    circle(ctx, 380, 130, 38);
    circle(ctx, 520, 130, 38);
  }
  if (style === 'ponytail') {
    ctx.fillStyle = '#e26d8a';
    circle(ctx, 516, 172, 9);
  }
}

function head(ctx: Ctx2D, m: MockupOptions) {
  hairBack(ctx, m.hairStyle, m.hairColor);
  ctx.fillStyle = shade(m.skin, -0.08);
  ctx.fillRect(418, 300, 64, 130);
  ctx.fillStyle = m.skin;
  ctx.beginPath();
  ctx.ellipse(450, 235, 78, 98, 0, 0, Math.PI * 2);
  ctx.fill();
  hairFront(ctx, m.hairStyle, m.hairColor);
  ctx.fillStyle = 'rgba(255,140,150,0.32)';
  for (const x of [410, 490]) {
    ctx.beginPath();
    ctx.ellipse(x, 268, 14, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ---------- Extras: bead piece and message card ---------- */

function drawBeadCharm(ctx: Ctx2D, grid: Grid, cx: number, cy: number, size: number) {
  const cell = size / Math.max(grid.w, grid.h);
  const x0 = cx - (grid.w * cell) / 2;
  const y0 = cy - (grid.h * cell) / 2;
  for (let y = 0; y < grid.h; y++)
    for (let x = 0; x < grid.w; x++) {
      const v = grid.cells[y * grid.w + x];
      if (v < 0) continue;
      const hex = grid.colors[v].hex;
      ctx.fillStyle = hex;
      circle(ctx, x0 + (x + 0.5) * cell, y0 + (y + 0.5) * cell, cell * 0.48);
      if (cell > 5) {
        ctx.fillStyle = shade(hex, -0.3);
        circle(ctx, x0 + (x + 0.5) * cell, y0 + (y + 0.5) * cell, cell * 0.15);
      }
    }
}

/** The original bead piece, like a little fused-bead keepsake with a soft shadow. */
function beadPiece(ctx: Ctx2D, grid: Grid, x: number, y: number, size: number, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  drawBeadCharm(ctx, grid, 0, 0, size);
  ctx.restore();
}

/** Wrap text to `maxW`: Latin words stay whole, Chinese/Japanese break between characters. */
function wrapText(ctx: Ctx2D, text: string, x: number, y: number, maxW: number, lh: number) {
  // Tokens: runs of Latin letters/digits (with trailing punctuation) or single other characters.
  const tokens = text.match(/[A-Za-z0-9'’.,!?:;-]+\s*|\s+|./gu) ?? [];
  let line = '';
  let yy = y;
  for (const tok of tokens) {
    const tryLine = line + tok;
    if (ctx.measureText(tryLine.trimEnd()).width > maxW && line.trim()) {
      ctx.fillText(line.trimEnd(), x, yy);
      line = tok.trimStart();
      yy += lh;
    } else line = tryLine;
  }
  if (line.trim()) ctx.fillText(line.trimEnd(), x, yy);
}

/** Gift tag with the message and (optionally) a tiny bead charm. */
function tag(ctx: Ctx2D, grid: Grid | null, text: string | null, x: number, y: number, rot: number, m: MockupOptions) {
  if (!grid && !text) return;
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
  circle(ctx, 55, -70, 8);
  ctx.strokeStyle = '#c9a98a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(55, -70);
  ctx.quadraticCurveTo(110, -120, 140, -90);
  ctx.stroke();
  if (grid) drawBeadCharm(ctx, grid, 0, text ? 15 : 45, text ? 70 : 110);
  if (text) {
    ctx.fillStyle = '#5b4a3f';
    ctx.textAlign = 'center';
    const px = 20 * m.messageSize;
    ctx.font = messageFont(m.messageFont, px);
    wrapText(ctx, text, 0, grid ? 85 : 20, 160, px * 1.2);
  }
  ctx.restore();
}

/** Folded note card for the outfit scenes. */
function noteCard(ctx: Ctx2D, text: string, x: number, y: number, rot: number, accent: string, m: MockupOptions) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#fffdf8';
  ctx.fillRect(-130, -80, 260, 160);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = accent;
  ctx.fillRect(-130, -80, 260, 10);
  ctx.fillStyle = '#5b4a3f';
  ctx.textAlign = 'center';
  const px = 24 * m.messageSize;
  ctx.font = messageFont(m.messageFont, px);
  wrapText(ctx, text, 0, -20 - (m.messageSize - 1) * 14, 220, px * 1.25);
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText('♡', 0, 58);
  ctx.restore();
}

/** Bead piece + message card placed in the lower corners of a portrait scene. */
function portraitExtras(ctx: Ctx2D, grid: Grid, m: MockupOptions, message: string, accent: string) {
  if (m.showBeads) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.roundRect(40, 900, 190, 190, 18);
    ctx.fill();
    ctx.restore();
    beadPiece(ctx, grid, 135, 995, 150);
  }
  if (m.showMessage && message) noteCard(ctx, message, 720, 1000, -0.06, accent, m);
}

/* ---------- Scenes ---------- */

function sceneTrench(ctx: Ctx2D, tex: ScarfTexture, m: MockupOptions) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#f1e8dc');
  g.addColorStop(1, '#e2d2bd');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  circle(ctx, 450, 520, 380);

  head(ctx, m);
  const coat = '#c9a679';
  poly(ctx, [[300, 440], [240, 480], [215, 1125], [300, 1125], [330, 560]], shade(coat, -0.06));
  poly(ctx, [[600, 440], [660, 480], [685, 1125], [600, 1125], [570, 560]], shade(coat, -0.06));
  poly(ctx, [[300, 440], [405, 405], [495, 405], [600, 440], [640, 1125], [260, 1125]], coat);
  poly(ctx, [[408, 410], [492, 410], [450, 600]], '#fbf8f3');
  poly(ctx, [[405, 405], [318, 455], [395, 650], [452, 600]], shade(coat, -0.14));
  poly(ctx, [[495, 405], [582, 455], [505, 650], [448, 600]], shade(coat, -0.14));
  ctx.fillStyle = shade(coat, -0.1);
  ctx.fillRect(268, 800, 364, 36);
  ctx.strokeStyle = '#6b5236';
  ctx.lineWidth = 5;
  ctx.strokeRect(430, 804, 40, 28);
  ctx.fillStyle = '#5a4330';
  for (const y of [690, 740, 900, 960]) for (const x of [400, 500]) circle(ctx, x, y, 8);
  wornScarf(ctx, tex, 104, 400,
    [{ x: 398, y: 405 }, { x: 382, y: 600 }, { x: 392, y: 930 }],
    [{ x: 502, y: 405 }, { x: 528, y: 600 }, { x: 520, y: 840 }]);
}

function sceneY2K(ctx: Ctx2D, tex: ScarfTexture, m: MockupOptions) {
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

  head(ctx, m);
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
  poly(ctx, [[330, 450], [280, 490], [255, 1125], [320, 1125], [345, 600]], m.skin);
  poly(ctx, [[570, 450], [620, 490], [645, 1125], [580, 1125], [555, 600]], m.skin);
  poly(ctx, [[330, 450], [410, 418], [490, 418], [570, 450], [592, 560], [552, 570], [548, 860], [352, 860], [348, 570], [308, 560]], '#ff9ecf');
  ctx.fillStyle = m.skin;
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

/**
 * Scarf folded zig-zag into a neat stack, seen from above. The layers sit almost
 * exactly on top of each other (a few px lower each, which reads as thickness);
 * at each end the fabric visibly wraps around a rounded fold — the texture keeps
 * going through the fold, squeezed and shaded like a half cylinder.
 */
function foldedScarf(ctx: Ctx2D, tex: ScarfTexture, x0: number, x1: number, yTop: number, width: number) {
  const scale = tex.sw / width;
  const cap = width * 0.13; // how far a fold bulges past the stack, on screen
  const runLen = (x1 - x0) * scale;
  const foldLen = cap * Math.PI * scale; // fabric that goes around each fold
  const fringeSrc = (tex.sx / 2) * 12; // renderScarf's fringe length (12 stitches), in source px
  const total = tex.y1 - tex.y0;
  const layers = Math.max(2, Math.min(4, Math.floor((total - fringeSrc) / (runLen + foldLen))));
  const dy = 9;

  type Span = { from: number; to: number; ltr: boolean; y: number };
  const spans: Span[] = [];
  let pos = tex.y0;
  for (let k = 0; k < layers; k++) {
    const len = k === 0 ? fringeSrc + runLen : runLen;
    spans.push({ from: pos, to: pos + len, ltr: k % 2 === 0, y: yTop + k * dy });
    pos += len + foldLen;
  }

  const drawLayer = (l: Ctx2D, k: number) => {
    const { from, to, ltr, y } = spans[k];
    const start = k === 0 ? (ltr ? x0 - fringeSrc / scale : x1 + fringeSrc / scale) : ltr ? x0 : x1;
    drawStrip(l, tex, from, to, [{ x: start, y }, { x: ltr ? x1 : x0, y }], width, false);
    const top = y - width / 2;
    // Plump, slightly rounded cross-section.
    const g = l.createLinearGradient(0, top, 0, top + width);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.18, 'rgba(255,255,255,0)');
    g.addColorStop(0.8, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(40,25,15,0.22)');
    l.save();
    l.globalCompositeOperation = 'source-atop';
    l.fillStyle = g;
    l.fillRect(Math.min(start, x0) - 5, top, Math.abs(x1 - x0) + fringeSrc / scale + 10, width);
    l.restore();
  };

  /** The fold joining layer k to k+1: a half-cylinder past the stack's edge. */
  const drawFold = (l: Ctx2D, k: number) => {
    const a = spans[k];
    const b = spans[k + 1];
    const right = a.ltr;
    const edge = right ? x1 : x0;
    const yMid = (a.y + b.y) / 2;
    const top = yMid - width / 2;
    const layer = makeLayer();
    const f = ctx2d(layer);
    // Texture of the fabric that goes around the fold, squeezed into the cap.
    const outer = right ? edge + cap : edge - cap;
    drawStrip(f, tex, a.to, a.to + foldLen, [{ x: edge, y: yMid }, { x: outer, y: yMid }], width, false);
    f.globalCompositeOperation = 'destination-in';
    f.beginPath();
    f.ellipse(edge, yMid, cap, width / 2, 0, right ? -Math.PI / 2 : Math.PI / 2, right ? Math.PI / 2 : (3 * Math.PI) / 2);
    f.closePath();
    f.fill();
    // Cylinder shading: lit near the stack, darkening as it turns away.
    f.globalCompositeOperation = 'source-atop';
    const g = f.createLinearGradient(edge, 0, outer, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.18)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.05)');
    g.addColorStop(1, 'rgba(40,25,15,0.45)');
    f.fillStyle = g;
    f.fillRect(Math.min(edge, outer), top, cap, width);
    // Vertical rounding of the cap.
    const v = f.createLinearGradient(0, top, 0, top + width);
    v.addColorStop(0, 'rgba(255,255,255,0.08)');
    v.addColorStop(1, 'rgba(40,25,15,0.25)');
    f.fillStyle = v;
    f.fillRect(Math.min(edge, outer), top, cap, width);
    l.drawImage(layer, 0, 0);
  };

  // Bottom layer first; each fold is drawn between the two layers it joins.
  const stack = makeLayer();
  const s = ctx2d(stack);
  for (let k = layers - 1; k >= 0; k--) {
    if (k < layers - 1) drawFold(s, k);
    const layer = makeLayer();
    const l = ctx2d(layer);
    drawLayer(l, k);
    if (k > 0) {
      // Thin shadow line where the layer above sits on this one.
      s.save();
      s.shadowColor = 'rgba(40,25,15,0.25)';
      s.shadowBlur = 4;
      s.shadowOffsetY = 2;
      s.drawImage(layer, 0, 0);
      s.restore();
    } else {
      s.save();
      s.shadowColor = 'rgba(40,25,15,0.3)';
      s.shadowBlur = 6;
      s.shadowOffsetY = 3;
      s.drawImage(layer, 0, 0);
      s.restore();
    }
  }
  ctx.save();
  ctx.shadowColor = 'rgba(40,25,15,0.30)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 8;
  ctx.drawImage(stack, 0, 0);
  ctx.restore();
}

function sceneGiftbox(ctx: Ctx2D, tex: ScarfTexture, grid: Grid, m: MockupOptions, message: string) {
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
  // Box with inner walls (light from the top left).
  ctx.save();
  ctx.shadowColor = 'rgba(60,35,20,0.3)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#d4a982';
  ctx.fillRect(150, 300, 600, 640);
  ctx.restore();
  ctx.fillStyle = '#fff6f2';
  ctx.fillRect(172, 322, 556, 596);
  const wall = ctx.createLinearGradient(0, 322, 0, 360);
  wall.addColorStop(0, 'rgba(120,80,50,0.25)');
  wall.addColorStop(1, 'rgba(120,80,50,0)');
  ctx.fillStyle = wall;
  ctx.fillRect(172, 322, 556, 40);
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
  foldedScarf(ctx, tex, 255, 645, 600, 210);
  tag(ctx, m.showBeads ? grid : null, m.showMessage ? message : null, 690, 930, 0.12, m);
}

function sceneFlatlay(ctx: Ctx2D, tex: ScarfTexture, grid: Grid, m: MockupOptions, message: string) {
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
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#ffffff';
  circle(ctx, 770, 150, 78);
  ctx.restore();
  ctx.fillStyle = '#8a5a3c';
  circle(ctx, 770, 150, 60);
  ctx.fillStyle = '#f3e3cf';
  ctx.beginPath();
  ctx.ellipse(770, 150, 22, 14, 0.3, 0, Math.PI * 2);
  ctx.fill();
  const ctrl = [{ x: 130, y: 170 }, { x: 520, y: 320 }, { x: 380, y: 560 }, { x: 560, y: 800 }, { x: 760, y: 1050 }];
  const L = pathLength(spline(ctrl));
  const width = Math.max(90, Math.min(170, (L * tex.sw) / (tex.y1 - tex.y0)));
  withShadow(ctx, (l) => drawStrip(l, tex, tex.y0, tex.y1, ctrl, width), 18, 9);
  if (m.showBeads) beadPiece(ctx, grid, 175, 720, 190, -0.05);
  if (m.showMessage && message) tag(ctx, null, message, 190, 990, -0.08, m);
}

/** Render a lifestyle or product mockup of the scarf. `message` is the gift text to show. */
export function renderMockup(scene: MockupScene, chart: KnitChart, scarf: ScarfRenderOptions, grid: Grid, m: MockupOptions, message: string): Canvas {
  const c = makeCanvas(W, H);
  const ctx = ctx2d(c);
  const tex = scarfTexture(chart, scarf);
  if (scene === 'trench') {
    sceneTrench(ctx, tex, m);
    portraitExtras(ctx, grid, m, message, '#c9a679');
  } else if (scene === 'y2k') {
    sceneY2K(ctx, tex, m);
    portraitExtras(ctx, grid, m, message, '#ff9ecf');
  } else if (scene === 'giftbox') sceneGiftbox(ctx, tex, grid, m, message);
  else sceneFlatlay(ctx, tex, grid, m, message);
  return c;
}
