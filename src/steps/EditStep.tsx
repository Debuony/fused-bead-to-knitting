import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionRail, More } from '../components/ActionRail';
import { Check, Seg, Slider } from '../components/Field';
import { GridCanvas, drawGrid, type BeadStyle } from '../components/GridCanvas';
import { PaletteEditor } from '../components/PaletteEditor';
import { PaletteSelect } from '../components/PaletteSelect';
import { autoRemoveBackground, despeckle } from '../lib/auto';
import { contrastText } from '../lib/color';
import { downloadCanvas, downloadJson } from '../lib/export';
import {
  EMPTY, compactGrid, countColors, cropToContent, ensureColor, fillRect, floodFill, mirrorH, mirrorV,
  paintBrush, replaceColor, resizeEdge, rotate90, type Grid,
} from '../lib/grid';
import { workingImage } from '../lib/imageUtils';
import { AUTO_PALETTE_ID, CUSTOM_PREFIX, PALETTES, getPalette, type PaletteColor } from '../lib/palettes';
import { useProject } from '../store/projectStore';
import { useSettings } from '../store/settingsStore';

type Tool = 'pencil' | 'eraser' | 'fill' | 'wand' | 'rect' | 'picker' | 'replace';

const TOOLS: { id: Tool; icon: string; key: string }[] = [
  { id: 'pencil', icon: '✏️', key: 'b' },
  { id: 'eraser', icon: '🧽', key: 'e' },
  { id: 'fill', icon: '🪣', key: 'g' },
  { id: 'wand', icon: '🪄', key: 'w' },
  { id: 'rect', icon: '▭', key: 'u' },
  { id: 'picker', icon: '💧', key: 'i' },
  { id: 'replace', icon: '🔁', key: 'r' },
];

/** Value used by the palette dropdown for "colours already in the pattern". */
const PATTERN_PALETTE = 'pattern';

export function EditStep() {
  const { t } = useTranslation();
  const { grid, image, rotation, crop, past, future, setGrid, commitGrid, checkpoint, undo, redo, goTo } = useProject();
  const settings = useSettings();
  const [tool, setTool] = useState<Tool>('pencil');
  const [active, setActive] = useState<PaletteColor | null>(grid?.colors[0] ?? null);
  const [brush, setBrush] = useState(1);
  const [cell, setCell] = useState(() => (grid ? Math.max(6, Math.min(26, Math.floor(620 / Math.max(grid.w, grid.h)))) : 16));
  const [beadStyle, setBeadStyle] = useState<BeadStyle>('bead');
  const [showGrid, setShowGrid] = useState(true);
  const [paletteId, setPaletteId] = useState(() => {
    const p = settings.paletteId;
    return p === AUTO_PALETTE_ID ? PALETTES[0].id : p;
  });
  const [editor, setEditor] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [photo, setPhoto] = useState<HTMLCanvasElement | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [photoOpacity, setPhotoOpacity] = useState(0.4);
  const importRef = useRef<HTMLInputElement>(null);
  const rectStart = useRef<{ x: number; y: number; base: Grid } | null>(null);

  // The cropped photo, for tracing over.
  useEffect(() => {
    if (!image) return;
    let alive = true;
    workingImage(image, rotation, crop).then((c) => alive && setPhoto(c));
    return () => { alive = false; };
  }, [image, rotation, crop]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      const tl = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (tl && !e.metaKey && !e.ctrlKey) setTool(tl.id);
      if (['1', '2', '3'].includes(e.key)) setBrush(Number(e.key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const counts = useMemo(() => (grid ? countColors(grid) : []), [grid]);
  const swatches = paletteId === PATTERN_PALETTE ? grid?.colors ?? [] : getPalette(paletteId, settings.customPalettes)?.colors ?? [];

  if (!grid) {
    return (
      <div className="panel empty">
        <p>{t('edit.noGrid')}</p>
        <button className="btn primary" onClick={() => goTo(0)}>{t('steps.upload')}</button>
      </div>
    );
  }

  const pick = (c: PaletteColor) => {
    setActive(c);
    if (tool === 'eraser' || tool === 'picker' || tool === 'wand') setTool('pencil');
  };

  /** Grid that contains the active colour, plus that colour's index. */
  const withActive = (g: Grid): [Grid, number] | null => (active ? ensureColor(g, active) : null);

  const onCell = (x: number, y: number, phase: 'down' | 'move' | 'up') => {
    if (phase === 'up') { rectStart.current = null; return; }
    if (x < 0) return;
    const g = useProject.getState().grid!;
    const i = y * g.w + x;
    switch (tool) {
      case 'picker':
        if (phase === 'down' && g.cells[i] >= 0) { setActive(g.colors[g.cells[i]]); setTool('pencil'); }
        return;
      case 'wand':
        if (phase === 'down' && g.cells[i] >= 0) commitGrid(floodFill(g, x, y, EMPTY));
        return;
      case 'fill':
      case 'replace': {
        if (phase !== 'down') return;
        const r = withActive(g);
        if (!r) return;
        const [g2, idx] = r;
        const next = tool === 'fill' ? floodFill(g2, x, y, idx) : g2.cells[i] >= 0 ? replaceColor(g2, g2.cells[i], idx) : g2;
        if (next !== g) commitGrid(compactGrid(next));
        return;
      }
      case 'rect': {
        if (phase === 'down') { checkpoint(); rectStart.current = { x, y, base: g }; }
        const start = rectStart.current;
        if (!start) return;
        const r = withActive(start.base);
        if (!r) return;
        setGrid(fillRect(r[0], start.x, start.y, x, y, r[1]));
        return;
      }
      default: {
        let g2 = g;
        let value = EMPTY;
        if (tool === 'pencil') {
          const r = withActive(g);
          if (!r) return;
          [g2, value] = r;
        }
        if (phase === 'down') checkpoint();
        const next = paintBrush(g2, x, y, brush, value);
        if (next !== g) setGrid(next);
      }
    }
  };

  const apply = (fn: (g: Grid) => Grid) => commitGrid(fn(grid));

  const exportPng = () => {
    const c = document.createElement('canvas');
    const px = 24;
    c.width = grid.w * px;
    c.height = grid.h * px;
    drawGrid(c.getContext('2d')!, grid, px, beadStyle, true);
    downloadCanvas(c, 'bead-pattern.png');
  };

  const importJson = async (file?: File) => {
    if (!file) return;
    try {
      const g = JSON.parse(await file.text()) as Grid;
      if (!g.w || !g.h || !Array.isArray(g.cells) || !Array.isArray(g.colors)) throw new Error();
      commitGrid(g);
    } catch {
      alert(t('edit.importFailed'));
    }
  };

  const edgeBtn = (edge: 'top' | 'bottom' | 'left' | 'right', label: string) => (
    <div className="btn-row" style={{ alignItems: 'center' }}>
      <span className="hint" style={{ width: 48 }}>{label}</span>
      <button className="btn small" onClick={() => apply((g) => resizeEdge(g, edge, 1))}>+1</button>
      <button className="btn small" onClick={() => apply((g) => resizeEdge(g, edge, -1))}>−1</button>
    </div>
  );

  const isActive = (c: PaletteColor) => !!active && active.hex.toLowerCase() === c.hex.toLowerCase();

  return (
    <div className="step-layout three">
      <div className="panel sidebar">
        <h3>{t('edit.paintWith')}</h3>
        <div className="row" style={{ display: 'flex', gap: 6 }}>
          <PaletteSelect value={paletteId} onChange={setPaletteId} allowAuto={false} extra={{ value: PATTERN_PALETTE, label: `🟥 ${t('edit.patternColors')}` }} />
          <button className="btn small" title={t('palette.manage')} onClick={() => setEditor({ open: true, id: paletteId.startsWith(CUSTOM_PREFIX) ? paletteId : null })}>
            {paletteId.startsWith(CUSTOM_PREFIX) ? '✎' : '＋'}
          </button>
        </div>
        <div className="swatches">
          {swatches.map((c, i) => (
            <button
              key={`${c.hex}-${i}`}
              className={`swatch ${isActive(c) && tool !== 'eraser' ? 'on' : ''}`}
              style={{ background: c.hex }}
              title={`${c.id} ${c.name}`}
              onClick={() => pick(c)}
            />
          ))}
          <label className="swatch custom" title={t('edit.customColor')}>
            <input type="color" onChange={(e) => pick({ id: 'X', name: e.target.value, hex: e.target.value })} />
            ＋
          </label>
        </div>

        <h3>{t('edit.colors')} ({grid.colors.length})</h3>
        <div className="color-list">
          {grid.colors.map((c, i) => (
            <div key={`${c.id}-${i}`} className={`color-item ${isActive(c) && tool !== 'eraser' ? 'on' : ''}`} onClick={() => pick(c)}>
              <span className="dot" style={{ background: c.hex, color: contrastText(c.hex) }} />
              <span className="name" title={c.name}>{c.id} · {c.name}</span>
              <span className="n">{counts[i]}</span>
            </div>
          ))}
        </div>
        <button className="btn small ghost" onClick={() => apply(compactGrid)} title={t('edit.cleanHint')}>{t('edit.clean')}</button>

        <More title={t('edit.canvas')}>
        {edgeBtn('top', t('edit.top'))}
        {edgeBtn('bottom', t('edit.bottom'))}
        {edgeBtn('left', t('edit.left'))}
        {edgeBtn('right', t('edit.right'))}
        <div className="btn-row">
          <button className="btn small" onClick={() => apply(mirrorH)}>⇋ {t('edit.mirrorH')}</button>
          <button className="btn small" onClick={() => apply(mirrorV)}>⇵ {t('edit.mirrorV')}</button>
          <button className="btn small" onClick={() => apply(rotate90)}>⟳ 90°</button>
          <button className="btn small" onClick={() => apply(cropToContent)}>✂ {t('edit.trim')}</button>
        </div>
        </More>
        <More title={t('edit.saveLoad')}>
        <div className="btn-row">
          <button className="btn small" onClick={exportPng}>⬇ PNG</button>
          <button className="btn small" onClick={() => downloadJson(grid, 'bead-pattern.json')}>⬇ JSON</button>
          <button className="btn small ghost" onClick={() => importRef.current?.click()}>⬆ {t('edit.import')}</button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => importJson(e.target.files?.[0])} />
        </div>
        </More>
      </div>

      <div className="panel">
        <div className="toolbar">
          {TOOLS.map((tl) => (
            <button key={tl.id} className={`btn tool ${tool === tl.id ? 'active' : ''}`} onClick={() => setTool(tl.id)} title={`${t(`edit.tools.${tl.id}`)} (${tl.key.toUpperCase()})`}>
              {tl.icon}
            </button>
          ))}
          {active && <span className="swatch on" style={{ background: active.hex, cursor: 'default' }} title={active.name} />}
          {(tool === 'pencil' || tool === 'eraser') && (
            <Seg value={String(brush)} onChange={(v) => setBrush(Number(v))} options={[1, 2, 3].map((n) => ({ value: String(n), label: `${n}×${n}` }))} />
          )}
          <span className="sep" />
          <button className="btn tool" onClick={undo} disabled={!past.length} title={`${t('edit.undo')} (Ctrl+Z)`}>↶</button>
          <button className="btn tool" onClick={redo} disabled={!future.length} title={`${t('edit.redo')} (Ctrl+Shift+Z)`}>↷</button>
        </div>
        <div className="toolbar">
          <Seg<BeadStyle> value={beadStyle} onChange={setBeadStyle} options={[{ value: 'bead', label: t('edit.beadView') }, { value: 'square', label: t('edit.squareView') }]} />
          <Check label={t('edit.gridLines')} checked={showGrid} onChange={setShowGrid} />
          {photo && <Check label={`📷 ${t('edit.photoOverlay')}`} checked={showPhoto} onChange={setShowPhoto} />}
          {photo && showPhoto && (
            <div style={{ width: 170 }}>
              <Slider label={t('edit.opacity')} value={photoOpacity} min={0.1} max={0.9} step={0.05} onChange={setPhotoOpacity} format={(v) => `${Math.round(v * 100)}%`} />
            </div>
          )}
          <div style={{ width: 170 }}>
            <Slider label={t('edit.zoom')} value={cell} min={4} max={40} onChange={setCell} format={(v) => `${v}px`} />
          </div>
        </div>
        <p className="hint" style={{ marginBottom: 8 }}>{t(`edit.toolHints.${tool}`)} · {grid.w}×{grid.h}</p>
        <div className="stage" style={{ maxHeight: '70vh' }}>
          <GridCanvas
            grid={grid}
            cell={cell}
            beadStyle={beadStyle}
            showGrid={showGrid}
            onCell={onCell}
            overlay={showPhoto ? photo : null}
            overlayOpacity={photoOpacity}
          />
        </div>
      </div>
      <ActionRail
        autoLabel={t('edit.autoTidy')}
        autoHint={t('edit.autoTidyHint')}
        onAuto={() => apply((g) => compactGrid(despeckle(autoRemoveBackground(g))))}
        back={() => goTo(1)}
        next={{ label: t('edit.confirm'), onClick: () => goTo(3) }}
      >
        <p className="hint">💡 {t('edit.railTip')}</p>
      </ActionRail>
      <PaletteEditor
        open={editor.open}
        paletteId={editor.id}
        onClose={() => setEditor({ open: false, id: null })}
        onSaved={setPaletteId}
        patternColors={grid.colors}
      />
    </div>
  );
}
