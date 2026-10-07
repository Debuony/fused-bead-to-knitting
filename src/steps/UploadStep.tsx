import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Slider } from '../components/Field';
import { autoCrop } from '../lib/auto';
import { runFullAuto } from '../lib/autoPipeline';
import { FULL_CROP, canvasImageData, loadImage, normaliseUpload, readFileAsDataUrl, transformImage, workingImage, type CropRect } from '../lib/imageUtils';
import { backgroundQuality } from '../lib/pixelize';
import { useProject } from '../store/projectStore';

type Drag = { mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; startX: number; startY: number; crop: CropRect } | null;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function UploadStep() {
  const { t } = useTranslation();
  const { image, rotation, crop, setImage, setTransform, goTo } = useProject();
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const [bgQuality, setBgQuality] = useState<'good' | 'busy' | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag>(null);

  const handleFile = async (file?: File) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError(t('upload.notImage'));
    try {
      const url = await normaliseUpload(await readFileAsDataUrl(file));
      setImage(url);
    } catch {
      setError(t('upload.unsupported'));
    }
  };

  // Paste from clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith('image/'));
      if (f) handleFile(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // Check whether the photo was taken on a clean, solid background.
  useEffect(() => {
    setBgQuality(null);
    if (!image) return;
    let alive = true;
    workingImage(image, 0, FULL_CROP, 400).then((c) => alive && setBgQuality(backgroundQuality(canvasImageData(c))));
    return () => { alive = false; };
  }, [image]);

  const doAutoCrop = async () => {
    if (!image) return;
    const full = await workingImage(image, rotation, FULL_CROP, 600);
    setTransform({ crop: autoCrop(canvasImageData(full)) });
  };

  const oneClick = async () => {
    setBusy(true);
    try {
      await runFullAuto();
    } catch {
      setError(t('upload.autoFailed'));
    } finally {
      setBusy(false);
    }
  };

  // Draw the rotated (uncropped) image.
  useEffect(() => {
    if (!image) return;
    let alive = true;
    loadImage(image).then((img) => {
      if (!alive || !canvasRef.current) return;
      const rotated = transformImage(img, rotation, FULL_CROP);
      const c = canvasRef.current;
      c.width = rotated.width;
      c.height = rotated.height;
      c.getContext('2d')!.drawImage(rotated, 0, 0);
    });
    return () => { alive = false; };
  }, [image, rotation]);

  const onPointerDown = (mode: NonNullable<Drag>['mode']) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, crop };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const wrap = wrapRef.current;
    if (!d || !wrap) return;
    const r = wrap.getBoundingClientRect();
    const dx = (e.clientX - d.startX) / r.width;
    const dy = (e.clientY - d.startY) / r.height;
    const c = { ...d.crop };
    const min = 0.05;
    if (d.mode === 'move') {
      c.x = clamp(c.x + dx, 0, 1 - c.w);
      c.y = clamp(c.y + dy, 0, 1 - c.h);
    } else {
      let x0 = c.x, y0 = c.y, x1 = c.x + c.w, y1 = c.y + c.h;
      if (d.mode.includes('w')) x0 = clamp(x0 + dx, 0, x1 - min);
      if (d.mode.includes('e')) x1 = clamp(x1 + dx, x0 + min, 1);
      if (d.mode.includes('n')) y0 = clamp(y0 + dy, 0, y1 - min);
      if (d.mode.includes('s')) y1 = clamp(y1 + dy, y0 + min, 1);
      Object.assign(c, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    setTransform({ crop: c });
  };
  const onPointerUp = () => { drag.current = null; };

  if (!image) {
    return (
      <div className="panel">
        <div
          className={`dropzone ${over ? 'over' : ''}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); handleFile(e.dataTransfer.files[0]); }}
        >
          <div className="big">📷</div>
          <h2>{t('upload.title')}</h2>
          <p className="hint">{t('upload.hint')}</p>
          <div className="photo-guide">
            <div className="good">
              <b>✅ {t('upload.guideGood')}</b>
              <span>{t('upload.guideGood1')}</span>
              <span>{t('upload.guideGood2')}</span>
              <span>{t('upload.guideGood3')}</span>
            </div>
            <div className="bad">
              <b>❌ {t('upload.guideBad')}</b>
              <span>{t('upload.guideBad1')}</span>
              <span>{t('upload.guideBad2')}</span>
              <span>{t('upload.guideBad3')}</span>
            </div>
          </div>
          <button className="btn primary" style={{ marginTop: 12 }} onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
            {t('upload.choose')}
          </button>
          {error && <p style={{ color: '#c0392b', fontWeight: 700 }}>{error}</p>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
    );
  }

  return (
    <div className="step-layout">
      <div className="panel sidebar">
        <button className="btn primary big" onClick={oneClick} disabled={busy}>
          {busy ? `⏳ ${t('upload.working')}` : `✨ ${t('upload.oneClick')}`}
        </button>
        <p className="hint">{t('upload.oneClickHint')}</p>
        {bgQuality === 'busy' && <div className="warn">⚠️ {t('upload.busyBg')}</div>}
        {error && <div className="warn">{error}</div>}
        <div className="divider" />
        <h3>{t('upload.adjust')}</h3>
        <p className="hint">{t('upload.cropHint')}</p>
        <Slider label={t('upload.rotate')} value={rotation} min={-45} max={45} step={0.5} onChange={(v) => setTransform({ rotation: v })} format={(v) => `${v}°`} />
        <div className="btn-row">
          <button className="btn small" onClick={() => setTransform({ rotation: ((rotation - 90 + 540) % 360) - 180 })}>⟲ 90°</button>
          <button className="btn small" onClick={() => setTransform({ rotation: ((rotation + 90 + 540) % 360) - 180 })}>⟳ 90°</button>
          <button className="btn small ghost" onClick={() => setTransform({ rotation: 0, crop: FULL_CROP })}>{t('common.reset')}</button>
        </div>
        <button className="btn small" onClick={doAutoCrop}>✨ {t('upload.autoCrop')}</button>
        <div className="divider" />
        <button className="btn" onClick={() => fileRef.current?.click()}>{t('upload.replace')}</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
        <button className="btn" onClick={() => goTo(1)}>{t('upload.manual')} →</button>
      </div>
      <div className="panel">
        <div className="stage center">
          <div ref={wrapRef} className="crop-wrap" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
            <canvas ref={canvasRef} />
            <div
              className="crop-box"
              style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
              onPointerDown={onPointerDown('move')}
            >
              <div className="gridlines" />
              {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
                <div key={h} className={`h ${h}`} onPointerDown={onPointerDown(h)} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
