import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readFileAsDataUrl, normaliseUpload } from '../lib/imageUtils';
import { useProject } from '../store/projectStore';
import { ACCENTS, BACKGROUND_PRESETS, YARN_WEIGHTS, useSettings, type Lang } from '../store/settingsStore';
import { NumberField, Seg, Slider } from './Field';
import { PaletteEditor } from './PaletteEditor';
import { PaletteSelect } from './PaletteSelect';

/** Applies theme settings to the document as CSS variables. */
export function useApplyTheme() {
  const s = useSettings();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (i18n.language !== s.lang) i18n.changeLanguage(s.lang);
    document.documentElement.lang = s.lang === 'zh' ? 'zh-CN' : 'en';
  }, [s.lang, i18n]);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = s.mode === 'dark' || (s.mode === 'auto' && mq.matches);
      root.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [s.mode]);

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--accent', s.accent);
    root.setProperty('--font-scale', String(s.fontScale));
    root.setProperty('--panel-opacity', String(s.panelOpacity));
    let bg = '#f6efe6';
    let size = 'auto';
    if (s.backgroundId === 'custom-color') bg = s.customColor;
    else if (s.backgroundId === 'custom-image' && s.customImage) {
      bg = `center / cover no-repeat url("${s.customImage}")`;
      size = 'cover';
    } else {
      const p = BACKGROUND_PRESETS.find((b) => b.id === s.backgroundId) ?? BACKGROUND_PRESETS[0];
      bg = p.css;
      size = p.size ?? 'auto';
    }
    root.setProperty('--page-bg', bg);
    root.setProperty('--page-bg-size', size);
  }, [s.accent, s.fontScale, s.panelOpacity, s.backgroundId, s.customColor, s.customImage]);
}

export function LanguageToggle() {
  const { lang, set } = useSettings();
  return (
    <Seg<Lang>
      value={lang}
      onChange={(v) => set({ lang: v })}
      options={[
        { value: 'zh', label: '中文' },
        { value: 'en', label: 'EN' },
      ]}
    />
  );
}

export function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const setChartOptions = useProject((p) => p.setChartOptions);
  const fileRef = useRef<HTMLInputElement>(null);
  const [editor, setEditor] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const uploadBg = async (file?: File) => {
    if (!file) return;
    const url = await normaliseUpload(await readFileAsDataUrl(file), 1920, 'image/jpeg', 0.82);
    try {
      s.set({ customImage: url, backgroundId: 'custom-image' });
    } catch {
      alert(t('settings.bgTooLarge'));
    }
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={t('settings.title')}>
        <header>
          <h2>⚙️ {t('settings.title')}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="close">✕</button>
        </header>

        <section>
          <h4>{t('settings.language')}</h4>
          <LanguageToggle />
        </section>

        <section>
          <h4>{t('settings.background')}</h4>
          <div className="bg-grid">
            {BACKGROUND_PRESETS.map((b) => (
              <button
                key={b.id}
                className={`bg-tile ${s.backgroundId === b.id ? 'on' : ''}`}
                style={{ background: b.css, backgroundSize: b.size }}
                onClick={() => s.set({ backgroundId: b.id })}
                title={t(`bg.${b.label}`)}
              >
                <span>{t(`bg.${b.label}`)}</span>
              </button>
            ))}
            <label className={`bg-tile ${s.backgroundId === 'custom-color' ? 'on' : ''}`} style={{ background: s.customColor }}>
              <input
                type="color"
                value={s.customColor}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                onChange={(e) => s.set({ customColor: e.target.value, backgroundId: 'custom-color' })}
              />
              <span>🎨 {t('bg.customColor')}</span>
            </label>
            <button
              className={`bg-tile ${s.backgroundId === 'custom-image' ? 'on' : ''}`}
              style={s.customImage ? { background: `center/cover url("${s.customImage}")` } : undefined}
              onClick={() => (s.customImage ? s.set({ backgroundId: 'custom-image' }) : fileRef.current?.click())}
            >
              <span>🖼 {t('bg.customImage')}</span>
            </button>
          </div>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn small" onClick={() => fileRef.current?.click()}>{t('settings.uploadBg')}</button>
            {s.customImage && (
              <button className="btn small ghost" onClick={() => s.set({ customImage: '', backgroundId: 'cream' })}>
                {t('settings.removeBg')}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => uploadBg(e.target.files?.[0])} />
        </section>

        <section>
          <h4>{t('settings.appearance')}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Seg
              value={s.mode}
              onChange={(v) => s.set({ mode: v })}
              options={[
                { value: 'light', label: `☀️ ${t('settings.light')}` },
                { value: 'dark', label: `🌙 ${t('settings.dark')}` },
                { value: 'auto', label: t('settings.auto') },
              ]}
            />
            <div className="field">
              {t('settings.accent')}
              <div className="row">
                {ACCENTS.map((a) => (
                  <button key={a} className={`accent-dot ${s.accent === a ? 'on' : ''}`} style={{ background: a }} onClick={() => s.set({ accent: a })} />
                ))}
                <input type="color" value={s.accent} onChange={(e) => s.set({ accent: e.target.value })} />
              </div>
            </div>
            <Slider label={t('settings.fontSize')} value={s.fontScale} min={0.85} max={1.3} step={0.05} onChange={(v) => s.set({ fontScale: v })} format={(v) => `${Math.round(v * 100)}%`} />
            <Slider label={t('settings.panelOpacity')} value={s.panelOpacity} min={0.5} max={1} step={0.02} onChange={(v) => s.set({ panelOpacity: v })} format={(v) => `${Math.round(v * 100)}%`} />
          </div>
        </section>

        <section>
          <h4>{t('settings.defaults')}</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="field">
              {t('pixelize.palette')}
              <PaletteSelect value={s.paletteId} onChange={(v) => s.set({ paletteId: v })} />
            </label>
            <div className="row" style={{ display: 'flex', gap: 12 }}>
              <NumberField label={t('pixelize.width')} value={s.gridW} min={4} max={200} onChange={(v) => s.set({ gridW: v })} />
              <NumberField label={t('pixelize.height')} value={s.gridH} min={4} max={200} onChange={(v) => s.set({ gridH: v })} />
            </div>
            <Slider label={t('pixelize.maxColors')} value={s.maxColors} min={2} max={32} onChange={(v) => s.set({ maxColors: v })} />
            <label className="field">
              {t('chart.yarnWeight')}
              <select
                value={s.yarnWeight}
                onChange={(e) => {
                  const g = YARN_WEIGHTS[e.target.value];
                  s.set({ yarnWeight: e.target.value, gaugeSts: g.sts, gaugeRows: g.rows });
                  setChartOptions({ gaugeSts: g.sts, gaugeRows: g.rows });
                }}
              >
                {Object.keys(YARN_WEIGHTS).map((k) => <option key={k} value={k}>{t(`yarn.${k}`)}</option>)}
              </select>
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <NumberField label={t('chart.gaugeSts')} value={s.gaugeSts} min={5} max={50} onChange={(v) => { s.set({ gaugeSts: v }); setChartOptions({ gaugeSts: v }); }} />
              <NumberField label={t('chart.gaugeRows')} value={s.gaugeRows} min={5} max={60} onChange={(v) => { s.set({ gaugeRows: v }); setChartOptions({ gaugeRows: v }); }} />
            </div>
            <NumberField label={t('chart.length')} value={s.scarfLengthCm} min={20} max={400} suffix="cm" onChange={(v) => { s.set({ scarfLengthCm: v }); setChartOptions({ lengthCm: v }); }} />
          </div>
        </section>

        <section>
          <h4>{t('palette.mine')}</h4>
          <div className="color-list">
            {s.customPalettes.map((p) => (
              <div key={p.id} className="color-item" onClick={() => setEditor({ open: true, id: p.id })}>
                <span className="mini-swatches">
                  {p.colors.slice(0, 8).map((c, i) => <i key={i} style={{ background: c.hex }} />)}
                </span>
                <span className="name">{p.label}</span>
                <span className="n">✎</span>
              </div>
            ))}
          </div>
          {!s.customPalettes.length && <p className="hint">{t('palette.none')}</p>}
          <button className="btn small" style={{ marginTop: 8 }} onClick={() => setEditor({ open: true, id: null })}>＋ {t('palette.create')}</button>
        </section>

        <button className="btn" onClick={() => s.reset()}>↺ {t('settings.reset')}</button>
        <PaletteEditor open={editor.open} paletteId={editor.id} onClose={() => setEditor({ open: false, id: null })} />
      </aside>
    </>
  );
}
