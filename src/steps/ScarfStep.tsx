import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { More } from '../components/ActionRail';
import { Check, Seg, Slider } from '../components/Field';
import { KnittingMachine } from '../components/KnittingMachine';
import { ScarfPlayground } from '../components/ScarfPlayground';
import { downloadCanvas } from '../lib/export';
import { buildChart, chartSizeCm, type KnitChart } from '../lib/knitChart';
import { HAIR_COLORS, HAIR_STYLES, MOCKUP_SCENES, SKIN_TONES, hasAvatar, type MockupScene } from '../lib/mockup';
import { toPageCanvas } from '../lib/canvas';
import { render } from '../lib/renderClient';
import type { RenderJob } from '../lib/renderJobs';
import { changeColorsFor, effectiveCurl, type ScarfRenderOptions } from '../lib/scarfRender';
import { useProject } from '../store/projectStore';

type View = 'machine' | 'final' | 'mockup';

/** Stitch size that makes the whole scarf about 1600 px long — sharp on screen, 4–10× fewer pixels. */
function previewStitchPx(chart: KnitChart, detail: number) {
  const rowPx = chart.gaugeSts / chart.gaugeRows;
  return Math.max(3, Math.min(detail, Math.round(1600 / (chart.h * rowPx))));
}
const SCENE_ICONS: Record<MockupScene, string> = { trench: '🧥', y2k: '🦋', giftbox: '🎁', flatlay: '☕' };

export function ScarfStep() {
  const { t } = useTranslation();
  const { grid, chartOptions, scarfOptions: o, setScarfOptions, mockupOptions: m, setMockupOptions, goTo } = useProject();
  const [view, setView] = useState<View>('machine');
  const [finalMode, setFinalMode] = useState<'fit' | 'zoom' | 'play'>('fit');
  const fit = finalMode !== 'zoom';
  const [scene, setScene] = useState<MockupScene>('trench');
  const [busy, setBusy] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLCanvasElement | null>(null);

  const chart = useMemo(() => (grid ? buildChart(grid, chartOptions) : null), [grid, chartOptions]);
  const message = m.message.trim() || t('mockup.defaultTag');
  const changeColors = useMemo(() => (chart ? changeColorsFor(chart, o).slice(1) : []), [chart, o]);

  // Finished scarf and mockups render in a background worker, then appear in the holder.
  const token = useRef(0);
  useEffect(() => {
    if (!chart || !grid || !holder.current || view === 'machine' || (view === 'final' && finalMode === 'play')) return;
    const my = ++token.current;
    setBusy(true);
    const id = window.setTimeout(async () => {
      const job: RenderJob =
        view === 'mockup'
          ? { kind: 'mockup', scene, chart, opts: o, grid, m, message }
          : {
              kind: 'scarf',
              chart,
              // Preview at about screen resolution (downloads use full detail); close-up renders bigger stitches.
              opts: { ...o, stitchPx: fit ? previewStitchPx(chart, o.stitchPx) : Math.max(o.stitchPx, Math.min(24, o.stitchPx * 2.5)) },
            };
      try {
        const result = await render(job, 'preview');
        if (my !== token.current || !holder.current) return;
        const c = toPageCanvas(result);
        if (view === 'mockup') {
          c.style.maxWidth = '100%';
          c.style.maxHeight = '75vh';
          c.style.borderRadius = '12px';
        } else {
          c.style.maxWidth = fit ? '100%' : 'none';
          c.style.maxHeight = fit ? '70vh' : 'none';
        }
        holder.current.replaceChildren(c);
        current.current = c;
      } catch {
        // Superseded by a newer render, or failed: keep showing the last good image.
      } finally {
        if (my === token.current) setBusy(false);
      }
    }, 160); // debounced: sliders and typing don't re-render on every tick
    return () => window.clearTimeout(id);
  }, [chart, grid, o, fit, view, scene, m, message, finalMode]);

  if (!chart || !grid) {
    return (
      <div className="panel empty">
        <p>{t('edit.noGrid')}</p>
        <button className="btn primary" onClick={() => goTo(0)}>{t('steps.upload')}</button>
      </div>
    );
  }

  const size = chartSizeCm(chart);
  const curl = effectiveCurl(chart, o);
  const curlMode = o.curl < 0 ? 'auto' : o.curl === 0 ? 'off' : 'on';


  const download = async () => {
    if (view === 'mockup' && current.current) return downloadCanvas(current.current, `bead-scarf-${scene}.png`);
    // Full-detail render for the download, not the screen-sized preview.
    setBusy(true);
    try {
      downloadCanvas(toPageCanvas(await render({ kind: 'scarf', chart, opts: o }, 'download')), 'bead-scarf.png');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="step-layout right">
      <div className="panel" style={{ minWidth: 0 }}>
        <div className="toolbar">
          <Seg<View>
            value={view}
            onChange={setView}
            options={[
              { value: 'machine', label: `🧶 ${t('scarf.machineView')}` },
              { value: 'final', label: `🖼 ${t('scarf.finalView')}` },
              { value: 'mockup', label: `📸 ${t('scarf.mockupView')}` },
            ]}
          />
          {view === 'final' && (
            <>
              <Seg
                value={finalMode}
                onChange={setFinalMode}
                options={[
                  { value: 'fit', label: t('scarf.fit') },
                  { value: 'zoom', label: t('scarf.closeUp') },
                  { value: 'play', label: `🖐 ${t('scarf.play')}` },
                ]}
              />
              {finalMode !== 'play' && <Seg value={o.orientation} onChange={(v) => setScarfOptions({ orientation: v })} options={[{ value: 'horizontal', label: t('scarf.horizontal') }, { value: 'vertical', label: t('scarf.vertical') }]} />}
            </>
          )}
          {view !== 'machine' && <span className="hint">{busy ? `🧶 ${t('scarf.knitting')}` : `${size.widthCm.toFixed(0)} × ${size.lengthCm.toFixed(0)} cm`}</span>}
        </div>
        {view === 'mockup' && (
          <div className="scene-cards">
            {MOCKUP_SCENES.map((s) => (
              <button key={s} className={`layout-card ${scene === s ? 'on' : ''}`} onClick={() => setScene(s)}>
                <span style={{ fontSize: '1.6rem' }}>{SCENE_ICONS[s]}</span>
                {t(`mockup.${s}`)}
              </button>
            ))}
          </div>
        )}
        {view === 'machine' ? (
          <KnittingMachine chart={chart} options={o} onJump={() => setView('final')} />
        ) : view === 'final' && finalMode === 'play' ? (
          <ScarfPlayground chart={chart} options={o} />
        ) : (
          <div className={`stage center ${busy ? 'busy' : ''}`} ref={holder} style={{ background: 'transparent', maxHeight: fit || view === 'mockup' ? undefined : '75vh', minHeight: 360 }} />
        )}
      </div>

      <div className="panel sidebar">
        <h3>{t('scarf.yarnType')}</h3>
        <Seg<ScarfRenderOptions['yarnType']>
          value={o.yarnType}
          onChange={(v) => setScarfOptions({ yarnType: v })}
          options={[{ value: 'wool', label: `🐑 ${t('scarf.wool')}` }, { value: 'mohair', label: `☁️ ${t('scarf.mohair')}` }]}
        />
        <h3>{t('scarf.colorChange')}</h3>
        <Seg<ScarfRenderOptions['colorChange']>
          value={o.colorChange}
          onChange={(v) => setScarfOptions({ colorChange: v })}
          options={[
            { value: 'none', label: t('scarf.solid') },
            { value: 'gradient', label: `🌈 ${t('scarf.gradient')}` },
            { value: 'stripes', label: `🍬 ${t('scarf.stripes')}` },
          ]}
        />
        {o.colorChange !== 'none' && (
          <div className="field">
            {t('scarf.changeColors')}
            <div className="row">
              <span className="swatch" style={{ background: chart.yarns[0].hex, cursor: 'default' }} title={t('chart.mainYarn')} />
              {changeColors.map((hex, i) => (
                <label key={i} className="swatch" style={{ background: hex }}>
                  <input
                    type="color"
                    value={hex}
                    onChange={(e) => {
                      const next = changeColors.slice();
                      next[i] = e.target.value;
                      setScarfOptions({ changeColors: next });
                    }}
                  />
                </label>
              ))}
              {o.changeColors.length > 0 && (
                <button className="btn small ghost" onClick={() => setScarfOptions({ changeColors: [] })}>{t('common.auto')}</button>
              )}
            </div>
          </div>
        )}
        <h3>{t('scarf.curl')}</h3>
        <Seg
          value={curlMode}
          onChange={(v) => setScarfOptions({ curl: v === 'auto' ? -1 : v === 'off' ? 0 : Math.max(0.85, curl) })}
          options={[
            { value: 'auto', label: t('scarf.curlAuto') },
            { value: 'off', label: t('scarf.curlOff') },
            { value: 'on', label: `🌭 ${t('scarf.curlOn')}` },
          ]}
        />
        {curlMode === 'on' && (
          <Slider label={t('scarf.curlAmount')} value={o.curl} min={0.1} max={1} step={0.05} onChange={(v) => setScarfOptions({ curl: v })} format={(v) => `${Math.round(v * 100)}%`} />
        )}
        <p className="hint">
          {curlMode === 'on' ? `🌭 ${t('scarf.curlForced')}` : curlMode === 'off' ? t('scarf.curlFlat') : curl > 0.5 ? `🌭 ${t('scarf.curlWarn')}` : curl > 0.2 ? t('scarf.curlSome') : t('scarf.curlFine')}
          {curlMode === 'auto' && curl > 0.2 && (
            <> <button className="link" onClick={() => goTo(3)}>{t('scarf.addBorder')}</button></>
          )}
        </p>
        {view === 'mockup' && (
          <>
            <div className="divider" />
            {hasAvatar(scene) && (
              <>
                <h3>{t('mockup.person')}</h3>
                <div className="hair-styles">
                  {HAIR_STYLES.map((h) => (
                    <button key={h} className={`btn small ${m.hairStyle === h ? 'active' : ''}`} onClick={() => setMockupOptions({ hairStyle: h })}>
                      {t(`mockup.hair.${h}`)}
                    </button>
                  ))}
                </div>
                <div className="field">
                  {t('mockup.skin')}
                  <div className="swatches">
                    {SKIN_TONES.map((c) => (
                      <button key={c} className={`swatch ${m.skin === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setMockupOptions({ skin: c })} />
                    ))}
                  </div>
                </div>
                <div className="field">
                  {t('mockup.hairColor')}
                  <div className="swatches">
                    {HAIR_COLORS.map((c) => (
                      <button key={c} className={`swatch ${m.hairColor === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setMockupOptions({ hairColor: c })} />
                    ))}
                    <label className="swatch custom" title={t('edit.customColor')}>
                      <input type="color" value={m.hairColor} onChange={(e) => setMockupOptions({ hairColor: e.target.value })} />
                      ＋
                    </label>
                  </div>
                </div>
              </>
            )}
            <Check label={`💌 ${t('mockup.showMessage')}`} checked={m.showMessage} onChange={(v) => setMockupOptions({ showMessage: v })} />
            {m.showMessage && (
              <input
                type="text"
                className="text-input"
                value={m.message}
                placeholder={t('mockup.defaultTag')}
                maxLength={40}
                onChange={(e) => setMockupOptions({ message: e.target.value })}
              />
            )}
            <Check label={`🟥 ${t('mockup.showBeads')}`} checked={m.showBeads} onChange={(v) => setMockupOptions({ showBeads: v })} />
          </>
        )}
        <More title={t('scarf.texture')}>
          <Slider label={t('scarf.detail')} value={o.stitchPx} min={3} max={24} onChange={(v) => setScarfOptions({ stitchPx: v })} format={(v) => `${v}px`} />
          <Slider label={t('scarf.thickness')} value={o.thickness} min={0.7} max={1.3} step={0.05} onChange={(v) => setScarfOptions({ thickness: v })} format={(v) => v.toFixed(2)} />
          <Slider label={t('scarf.fuzz')} value={o.fuzz} min={0} max={1} step={0.05} onChange={(v) => setScarfOptions({ fuzz: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Check label={t('scarf.fringe')} checked={o.fringe} onChange={(v) => setScarfOptions({ fringe: v })} />
          <Check label={t('scarf.drape')} checked={o.drape} onChange={(v) => setScarfOptions({ drape: v })} />
          <Check label={t('scarf.shadow')} checked={o.shadow} onChange={(v) => setScarfOptions({ shadow: v })} />
          <button className="btn small ghost" onClick={() => setScarfOptions({ seed: Math.floor(Math.random() * 1e6) })}>🎲 {t('scarf.reroll')}</button>
        </More>
        <div className="divider" />
        <button className="btn primary" onClick={download}>⬇ {view === 'mockup' ? t('mockup.download') : t('scarf.download')}</button>
        <div className="footer-nav">
          <button className="btn" onClick={() => goTo(3)}>← {t('common.back')}</button>
          <button
            className="btn ghost"
            onClick={() => { if (window.confirm(t('scarf.newConfirm'))) useProject.getState().resetProject(); }}
          >
            ✨ {t('scarf.new')}
          </button>
        </div>
      </div>
    </div>
  );
}
