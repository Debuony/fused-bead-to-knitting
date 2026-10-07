import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, NumberField, Seg, Slider } from '../components/Field';
import { GridCanvas, type BeadStyle } from '../components/GridCanvas';
import { countColors, type Grid } from '../lib/grid';
import { canvasImageData, loadImage, transformImage } from '../lib/imageUtils';
import { AUTO_PALETTE_ID, PALETTES, getPalette } from '../lib/palettes';
import { detectGridCount, pixelize } from '../lib/pixelize';
import { useProject } from '../store/projectStore';
import { useSettings } from '../store/settingsStore';

export function PixelizeStep() {
  const { t } = useTranslation();
  const settings = useSettings();
  const { image, rotation, crop, grid: savedGrid, maxStep, commitGrid, goTo } = useProject();

  const [gridW, setGridW] = useState(savedGrid?.w ?? settings.gridW);
  const [gridH, setGridH] = useState(savedGrid?.h ?? settings.gridH);
  const [lock, setLock] = useState(false);
  const [paletteId, setPaletteId] = useState(settings.paletteId);
  const [maxColors, setMaxColors] = useState(settings.maxColors);
  const [removeBg, setRemoveBg] = useState(false);
  const [bgTol, setBgTol] = useState(12);
  const [sample, setSample] = useState(0.6);
  const [beadStyle, setBeadStyle] = useState<BeadStyle>('bead');
  const [preview, setPreview] = useState<Grid | null>(null);
  const [cropped, setCropped] = useState<{ url: string; data: ImageData } | null>(null);
  const [note, setNote] = useState('');
  const timer = useRef<number>();

  // Prepare the cropped working image (max ~900 px for speed).
  useEffect(() => {
    if (!image) return;
    let alive = true;
    loadImage(image).then((img) => {
      if (!alive) return;
      const c = transformImage(img, rotation, crop);
      const scale = Math.min(1, 900 / Math.max(c.width, c.height));
      const s = document.createElement('canvas');
      s.width = Math.max(1, Math.round(c.width * scale));
      s.height = Math.max(1, Math.round(c.height * scale));
      s.getContext('2d')!.drawImage(c, 0, 0, s.width, s.height);
      setCropped({ url: s.toDataURL('image/png'), data: canvasImageData(s) });
    });
    return () => { alive = false; };
  }, [image, rotation, crop]);

  // Live preview (debounced).
  useEffect(() => {
    if (!cropped) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const palette = paletteId === AUTO_PALETTE_ID ? undefined : getPalette(paletteId)?.colors;
      setPreview(pixelize(cropped.data, { gridW, gridH, palette, maxColors, removeBackground: removeBg, bgTolerance: bgTol, sampleRatio: sample }));
    }, 120);
    return () => window.clearTimeout(timer.current);
  }, [cropped, gridW, gridH, paletteId, maxColors, removeBg, bgTol, sample]);

  const aspect = cropped ? cropped.data.height / cropped.data.width : 1;
  const setW = (w: number) => { setGridW(w); if (lock) setGridH(Math.max(1, Math.round(w * aspect))); };
  const setH = (h: number) => { setGridH(h); if (lock) setGridW(Math.max(1, Math.round(h / aspect))); };

  const autoDetect = () => {
    if (!cropped) return;
    const w = detectGridCount(cropped.data, 'x');
    const h = detectGridCount(cropped.data, 'y');
    if (w && h) {
      setGridW(w);
      setGridH(h);
      setNote(t('pixelize.detected', { w, h }));
    } else {
      setNote(t('pixelize.detectFailed'));
    }
  };

  const counts = useMemo(() => (preview ? countColors(preview) : []), [preview]);
  const beads = counts.reduce((a, b) => a + b, 0);
  const cell = preview ? Math.max(4, Math.min(22, Math.floor(460 / Math.max(preview.w, preview.h)))) : 10;

  if (!image) {
    return (
      <div className="panel empty">
        <p>{t('pixelize.noImage')}</p>
        <button className="btn primary" onClick={() => goTo(0)}>{t('steps.upload')}</button>
      </div>
    );
  }

  const confirm = () => {
    if (!preview) return;
    if (maxStep >= 2 && savedGrid && !window.confirm(t('pixelize.overwrite'))) return;
    commitGrid(preview);
    goTo(2);
  };

  return (
    <div className="step-layout">
      <div className="panel sidebar">
        <h3>{t('pixelize.title')}</h3>
        <p className="hint">{t('pixelize.hint')}</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <NumberField label={t('pixelize.width')} value={gridW} min={2} max={200} onChange={setW} />
          <span style={{ paddingBottom: 8 }}>×</span>
          <NumberField label={t('pixelize.height')} value={gridH} min={2} max={200} onChange={setH} />
        </div>
        <div className="btn-row">
          <button className="btn small" onClick={autoDetect}>🔍 {t('pixelize.autoDetect')}</button>
          {[29, 50].map((n) => (
            <button key={n} className="btn small ghost" onClick={() => { setGridW(n); setGridH(n); }}>{n}×{n}</button>
          ))}
        </div>
        <Check label={t('pixelize.lockAspect')} checked={lock} onChange={setLock} />
        {note && <p className="hint">{note}</p>}
        <div className="divider" />
        <label className="field">
          {t('pixelize.palette')}
          <select value={paletteId} onChange={(e) => setPaletteId(e.target.value)}>
            {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.colors.length})</option>)}
            <option value={AUTO_PALETTE_ID}>{t('pixelize.autoPalette')}</option>
          </select>
        </label>
        <Slider label={t('pixelize.maxColors')} value={maxColors} min={2} max={32} onChange={setMaxColors} />
        <Slider label={t('pixelize.sample')} value={sample} min={0.2} max={1} step={0.05} onChange={setSample} format={(v) => `${Math.round(v * 100)}%`} />
        <Check label={t('pixelize.removeBg')} checked={removeBg} onChange={setRemoveBg} />
        {removeBg && <Slider label={t('pixelize.bgTolerance')} value={bgTol} min={2} max={40} onChange={setBgTol} />}
        <div className="divider" />
        <div className="stats">
          <div className="stat"><b>{preview ? `${preview.w}×${preview.h}` : '–'}</b><span>{t('pixelize.size')}</span></div>
          <div className="stat"><b>{preview?.colors.length ?? '–'}</b><span>{t('pixelize.colors')}</span></div>
          <div className="stat"><b>{beads}</b><span>{t('pixelize.beads')}</span></div>
        </div>
        <div className="footer-nav">
          <button className="btn" onClick={() => goTo(0)}>← {t('common.back')}</button>
          <button className="btn primary" onClick={confirm} disabled={!preview}>{t('pixelize.confirm')} →</button>
        </div>
      </div>
      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <Seg<BeadStyle> value={beadStyle} onChange={setBeadStyle} options={[{ value: 'bead', label: t('edit.beadView') }, { value: 'square', label: t('edit.squareView') }]} />
        </div>
        <div className="compare">
          <div>
            <span className="label">{t('pixelize.original')}</span>
            {cropped && <img src={cropped.url} alt="" />}
          </div>
          <div>
            <span className="label">{t('pixelize.pattern')}</span>
            {preview && <GridCanvas grid={preview} cell={cell} beadStyle={beadStyle} />}
          </div>
        </div>
      </div>
    </div>
  );
}
