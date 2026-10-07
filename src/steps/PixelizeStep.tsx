import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionRail, More } from '../components/ActionRail';
import { Check, NumberField, Seg, Slider } from '../components/Field';
import { GridCanvas, type BeadStyle } from '../components/GridCanvas';
import { PaletteEditor } from '../components/PaletteEditor';
import { PaletteSelect } from '../components/PaletteSelect';
import { autoGridSize, autoPixelize } from '../lib/auto';
import { rgbToHex } from '../lib/color';
import { countColors, type Grid } from '../lib/grid';
import { canvasImageData, workingImage } from '../lib/imageUtils';
import { CUSTOM_PREFIX, getPalette } from '../lib/palettes';
import { pixelize, sampleCells } from '../lib/pixelize';
import { kmeans } from '../lib/quantize';
import { useProject } from '../store/projectStore';
import { useSettings } from '../store/settingsStore';

export function PixelizeStep() {
  const { t } = useTranslation();
  const customPalettes = useSettings((s) => s.customPalettes);
  const { image, rotation, crop, grid: savedGrid, maxStep, pixelOptions: o, setPixelOptions, commitGrid, goTo } = useProject();

  const [beadStyle, setBeadStyle] = useState<BeadStyle>('bead');
  const [preview, setPreview] = useState<Grid | null>(null);
  const [cropped, setCropped] = useState<{ url: string; data: ImageData } | null>(null);
  const [note, setNote] = useState('');
  const [editor, setEditor] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const timer = useRef<number>();

  useEffect(() => {
    if (!image) return;
    let alive = true;
    workingImage(image, rotation, crop).then((c) => alive && setCropped({ url: c.toDataURL('image/png'), data: canvasImageData(c) }));
    return () => { alive = false; };
  }, [image, rotation, crop]);

  const palette = getPalette(o.paletteId, customPalettes)?.colors;

  // Live preview (debounced).
  useEffect(() => {
    if (!cropped) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setPreview(pixelize(cropped.data, {
        gridW: o.gridW, gridH: o.gridH, palette, maxColors: o.maxColors,
        removeBackground: o.removeBg, bgTolerance: o.bgTol, removeEnclosed: o.removeEnclosed, sampleRatio: o.sample,
      }));
    }, 120);
    return () => window.clearTimeout(timer.current);
  }, [cropped, o, palette]);

  // Suggested colours for a new palette, taken from the photo.
  const photoColors = useMemo(() => {
    if (!cropped || !editor.open) return [];
    const samples = sampleCells(cropped.data, o.gridW, o.gridH).filter((s): s is [number, number, number] => s !== null);
    return kmeans(samples, Math.max(2, o.maxColors)).map(rgbToHex);
  }, [cropped, editor.open, o.gridW, o.gridH, o.maxColors]);

  const aspect = cropped ? cropped.data.height / cropped.data.width : 1;
  const setW = (w: number) => setPixelOptions(o.lock ? { gridW: w, gridH: Math.max(1, Math.round(w * aspect)) } : { gridW: w });
  const setH = (h: number) => setPixelOptions(o.lock ? { gridH: h, gridW: Math.max(1, Math.round(h / aspect)) } : { gridH: h });

  const detect = () => {
    if (!cropped) return;
    const size = autoGridSize(cropped.data);
    setPixelOptions({ gridW: size.w, gridH: size.h });
    setNote(size.detected ? t('pixelize.detected', { w: size.w, h: size.h }) : t('pixelize.detectFailed'));
  };

  const autoAll = () => {
    if (!cropped) return;
    const res = autoPixelize(cropped.data, palette);
    setPixelOptions({ gridW: res.gridW, gridH: res.gridH, maxColors: res.maxColors, removeBg: res.removeBg, bgTol: 0 });
    setNote(t(res.detected ? 'pixelize.autoDone' : 'pixelize.autoDoneGuess', { w: res.gridW, h: res.gridH, n: res.maxColors }));
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
    <div className="step-layout three">
      <div className="panel sidebar">
        <h3>{t('pixelize.title')}</h3>
        <p className="hint">{t('pixelize.hint')}</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <NumberField label={t('pixelize.width')} value={o.gridW} min={2} max={200} onChange={setW} />
          <span style={{ paddingBottom: 8 }}>×</span>
          <NumberField label={t('pixelize.height')} value={o.gridH} min={2} max={200} onChange={setH} />
        </div>
        <button className="btn small" onClick={detect}>🔍 {t('pixelize.autoDetect')}</button>
        <label className="field">
          {t('pixelize.palette')}
          <div className="row">
            <PaletteSelect value={o.paletteId} onChange={(v) => setPixelOptions({ paletteId: v })} />
            <button
              className="btn small"
              title={t('palette.manage')}
              onClick={() => setEditor({ open: true, id: o.paletteId.startsWith(CUSTOM_PREFIX) ? o.paletteId : null })}
            >
              {o.paletteId.startsWith(CUSTOM_PREFIX) ? '✎' : '＋'}
            </button>
          </div>
        </label>
        <Slider label={t('pixelize.maxColors')} value={o.maxColors} min={2} max={32} onChange={(v) => setPixelOptions({ maxColors: v })} />
        <Check label={t('pixelize.removeBg')} checked={o.removeBg} onChange={(v) => setPixelOptions({ removeBg: v })} />
        <More title={t('common.more')}>
          <div className="btn-row">
            {[29, 50].map((n) => (
              <button key={n} className="btn small ghost" onClick={() => setPixelOptions({ gridW: n, gridH: n })}>{n}×{n}</button>
            ))}
          </div>
          <Check label={t('pixelize.lockAspect')} checked={o.lock} onChange={(v) => setPixelOptions({ lock: v })} />
          <Slider label={t('pixelize.sample')} value={o.sample} min={0.2} max={1} step={0.05} onChange={(v) => setPixelOptions({ sample: v })} format={(v) => `${Math.round(v * 100)}%`} />
          {o.removeBg && (
            <>
              <Slider
                label={t('pixelize.bgTolerance')}
                value={o.bgTol}
                min={0}
                max={40}
                onChange={(v) => setPixelOptions({ bgTol: v })}
                format={(v) => (v === 0 ? t('common.auto') : String(v))}
              />
              <Check label={t('pixelize.removeEnclosed')} checked={o.removeEnclosed} onChange={(v) => setPixelOptions({ removeEnclosed: v })} />
            </>
          )}
          <p className="hint">{o.paletteId.startsWith(CUSTOM_PREFIX) ? t('palette.editHint') : t('palette.createHint')}</p>
        </More>
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
      <ActionRail
        autoLabel={t('pixelize.autoAll')}
        autoHint={note || t('pixelize.autoHint')}
        onAuto={autoAll}
        autoDisabled={!cropped}
        back={() => goTo(0)}
        next={{ label: t('pixelize.confirm'), onClick: confirm, disabled: !preview }}
      >
        <div className="stats">
          <div className="stat"><b>{preview ? `${preview.w}×${preview.h}` : '–'}</b><span>{t('pixelize.size')}</span></div>
          <div className="stat"><b>{preview?.colors.length ?? '–'}</b><span>{t('pixelize.colors')}</span></div>
          <div className="stat"><b>{beads}</b><span>{t('pixelize.beads')}</span></div>
        </div>
        {o.removeBg && <p className="hint">{t('pixelize.bgHint')}</p>}
      </ActionRail>
      <PaletteEditor
        open={editor.open}
        paletteId={editor.id}
        onClose={() => setEditor({ open: false, id: null })}
        onSaved={(id) => setPixelOptions({ paletteId: id })}
        photoColors={photoColors}
        patternColors={preview?.colors}
      />
    </div>
  );
}
