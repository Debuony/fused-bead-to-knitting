import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Seg, Slider } from '../components/Field';
import { GridCanvas, drawGrid, type BeadStyle } from '../components/GridCanvas';
import { contrastText } from '../lib/color';
import { downloadCanvas, downloadJson } from '../lib/export';
import {
  EMPTY, compactGrid, countColors, cropToContent, ensureColor, floodFill, mirrorH, mirrorV,
  replaceColor, resizeEdge, rotate90, type Grid,
} from '../lib/grid';
import { PALETTES, type PaletteColor } from '../lib/palettes';
import { useProject } from '../store/projectStore';
import { useSettings } from '../store/settingsStore';

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'replace';

const TOOLS: { id: Tool; icon: string; key: string }[] = [
  { id: 'pencil', icon: '✏️', key: 'b' },
  { id: 'eraser', icon: '🧽', key: 'e' },
  { id: 'fill', icon: '🪣', key: 'g' },
  { id: 'picker', icon: '💧', key: 'i' },
  { id: 'replace', icon: '🔁', key: 'r' },
];

export function EditStep() {
  const { t } = useTranslation();
  const { grid, past, future, setGrid, commitGrid, checkpoint, undo, redo, goTo } = useProject();
  const paletteDefault = useSettings((s) => s.paletteId);
  const [tool, setTool] = useState<Tool>('pencil');
  const [active, setActive] = useState(0);
  const [cell, setCell] = useState(() => (grid ? Math.max(6, Math.min(26, Math.floor(620 / Math.max(grid.w, grid.h)))) : 16));
  const [beadStyle, setBeadStyle] = useState<BeadStyle>('bead');
  const [showGrid, setShowGrid] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addPalette, setAddPalette] = useState(PALETTES.find((p) => p.id === paletteDefault)?.id ?? PALETTES[0].id);
  const importRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      const tl = TOOLS.find((x) => x.key === e.key.toLowerCase());
      if (tl && !e.metaKey && !e.ctrlKey) setTool(tl.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const counts = useMemo(() => (grid ? countColors(grid) : []), [grid]);

  if (!grid) {
    return (
      <div className="panel empty">
        <p>{t('edit.noGrid')}</p>
        <button className="btn primary" onClick={() => goTo(0)}>{t('steps.upload')}</button>
      </div>
    );
  }

  const activeIdx = Math.min(active, grid.colors.length - 1);

  const onCell = (x: number, y: number, phase: 'down' | 'move' | 'up') => {
    if (phase === 'up' || x < 0) return;
    const g = useProject.getState().grid!;
    const i = y * g.w + x;
    if (tool === 'picker') {
      if (phase === 'down' && g.cells[i] >= 0) { setActive(g.cells[i]); setTool('pencil'); }
      return;
    }
    if (tool === 'fill' || tool === 'replace') {
      if (phase !== 'down' || activeIdx < 0) return;
      const next = tool === 'fill' ? floodFill(g, x, y, activeIdx) : g.cells[i] >= 0 ? replaceColor(g, g.cells[i], activeIdx) : g;
      if (next !== g) commitGrid(next);
      return;
    }
    const value = tool === 'eraser' ? EMPTY : activeIdx;
    if (value === undefined || (value !== EMPTY && value < 0)) return;
    if (phase === 'down') checkpoint();
    if (g.cells[i] === value) return;
    const cells = g.cells.slice();
    cells[i] = value;
    setGrid({ ...g, cells });
  };

  const apply = (fn: (g: Grid) => Grid) => commitGrid(fn(grid));

  const addColor = (c: PaletteColor) => {
    const [g, idx] = ensureColor(grid, c);
    if (g !== grid) commitGrid(g);
    setActive(idx);
    setAdding(false);
    if (tool === 'eraser' || tool === 'picker') setTool('pencil');
  };

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

  return (
    <div className="step-layout">
      <div className="panel sidebar">
        <h3>{t('edit.colors')} ({grid.colors.length})</h3>
        <div className="color-list">
          {grid.colors.map((c, i) => (
            <div key={`${c.id}-${i}`} className={`color-item ${i === activeIdx && tool !== 'eraser' ? 'on' : ''}`} onClick={() => { setActive(i); if (tool === 'eraser' || tool === 'picker') setTool('pencil'); }}>
              <span className="dot" style={{ background: c.hex, color: contrastText(c.hex) }} />
              <span className="name" title={c.name}>{c.id} · {c.name}</span>
              <span className="n">{counts[i]}</span>
            </div>
          ))}
        </div>
        <div style={{ position: 'relative' }}>
          <div className="btn-row">
            <button className="btn small" onClick={() => setAdding((v) => !v)}>＋ {t('edit.addColor')}</button>
            <button className="btn small ghost" onClick={() => { apply(compactGrid); setActive(0); }} title={t('edit.cleanHint')}>{t('edit.clean')}</button>
          </div>
          {adding && (
            <div className="popover" style={{ top: 40, left: 0 }}>
              <select value={addPalette} onChange={(e) => setAddPalette(e.target.value)} style={{ width: '100%', marginBottom: 8 }}>
                {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <div className="swatches">
                {PALETTES.find((p) => p.id === addPalette)!.colors.map((c) => (
                  <button key={c.id} className="swatch" style={{ background: c.hex }} title={`${c.id} ${c.name}`} onClick={() => addColor(c)} />
                ))}
              </div>
              <label className="field" style={{ marginTop: 10 }}>
                {t('edit.customColor')}
                <input type="color" onChange={(e) => addColor({ id: 'X', name: e.target.value, hex: e.target.value })} />
              </label>
            </div>
          )}
        </div>
        <div className="divider" />
        <h3>{t('edit.canvas')}</h3>
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
        <div className="divider" />
        <div className="btn-row">
          <button className="btn small" onClick={exportPng}>⬇ PNG</button>
          <button className="btn small" onClick={() => downloadJson(grid, 'bead-pattern.json')}>⬇ JSON</button>
          <button className="btn small ghost" onClick={() => importRef.current?.click()}>⬆ {t('edit.import')}</button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => importJson(e.target.files?.[0])} />
        </div>
        <div className="footer-nav">
          <button className="btn" onClick={() => goTo(1)}>← {t('common.back')}</button>
          <button className="btn primary" onClick={() => goTo(3)}>{t('edit.confirm')} →</button>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          {TOOLS.map((tl) => (
            <button key={tl.id} className={`btn tool ${tool === tl.id ? 'active' : ''}`} onClick={() => setTool(tl.id)} title={`${t(`edit.tools.${tl.id}`)} (${tl.key.toUpperCase()})`}>
              {tl.icon}
            </button>
          ))}
          {grid.colors[activeIdx] && (
            <span className="swatch on" style={{ background: grid.colors[activeIdx].hex, cursor: 'default' }} title={grid.colors[activeIdx].name} />
          )}
          <span className="sep" />
          <button className="btn tool" onClick={undo} disabled={!past.length} title={`${t('edit.undo')} (Ctrl+Z)`}>↶</button>
          <button className="btn tool" onClick={redo} disabled={!future.length} title={`${t('edit.redo')} (Ctrl+Shift+Z)`}>↷</button>
          <span className="sep" />
          <Seg<BeadStyle> value={beadStyle} onChange={setBeadStyle} options={[{ value: 'bead', label: t('edit.beadView') }, { value: 'square', label: t('edit.squareView') }]} />
          <Check label={t('edit.gridLines')} checked={showGrid} onChange={setShowGrid} />
          <div style={{ width: 160 }}>
            <Slider label={t('edit.zoom')} value={cell} min={4} max={40} onChange={setCell} format={(v) => `${v}px`} />
          </div>
        </div>
        <p className="hint" style={{ marginBottom: 8 }}>{t(`edit.toolHints.${tool}`)} · {grid.w}×{grid.h}</p>
        <div className="stage" style={{ maxHeight: '70vh' }}>
          <GridCanvas grid={grid} cell={cell} beadStyle={beadStyle} showGrid={showGrid} onCell={onCell} />
        </div>
      </div>
    </div>
  );
}
