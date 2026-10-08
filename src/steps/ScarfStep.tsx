import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { More } from '../components/ActionRail';
import { Check, Seg, Slider } from '../components/Field';
import { KnittingMachine } from '../components/KnittingMachine';
import { downloadCanvas } from '../lib/export';
import { buildChart, chartSizeCm } from '../lib/knitChart';
import { MOCKUP_SCENES, renderMockup, type MockupScene } from '../lib/mockup';
import { changeColorsFor, effectiveCurl, renderScarf, type ScarfRenderOptions } from '../lib/scarfRender';
import { useProject } from '../store/projectStore';

type View = 'machine' | 'final' | 'mockup';
const SCENE_ICONS: Record<MockupScene, string> = { trench: '🧥', y2k: '🦋', giftbox: '🎁', flatlay: '☕' };

export function ScarfStep() {
  const { t } = useTranslation();
  const { grid, chartOptions, scarfOptions: o, setScarfOptions, goTo } = useProject();
  const [view, setView] = useState<View>('machine');
  const [fit, setFit] = useState(true);
  const [scene, setScene] = useState<MockupScene>('trench');
  const [tagText, setTagText] = useState(() => t('mockup.defaultTag'));
  const [busy, setBusy] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLCanvasElement | null>(null);

  const chart = useMemo(() => (grid ? buildChart(grid, chartOptions) : null), [grid, chartOptions]);

  // Finished scarf and mockups are rendered on demand into the holder.
  useEffect(() => {
    if (!chart || !grid || !holder.current || view === 'machine') return;
    setBusy(true);
    const id = window.setTimeout(() => {
      let c: HTMLCanvasElement;
      if (view === 'mockup') {
        c = renderMockup(scene, chart, o, grid, { tagText });
        c.style.maxWidth = '100%';
        c.style.maxHeight = '75vh';
        c.style.borderRadius = '12px';
      } else {
        // Close-up renders bigger stitches so the yarn texture is visible.
        c = renderScarf(chart, fit ? o : { ...o, stitchPx: Math.max(o.stitchPx, Math.min(24, o.stitchPx * 2.5)) });
        c.style.maxWidth = fit ? '100%' : 'none';
        c.style.maxHeight = fit ? '70vh' : 'none';
      }
      holder.current?.replaceChildren(c);
      current.current = c;
      setBusy(false);
    }, 30);
    return () => window.clearTimeout(id);
  }, [chart, grid, o, fit, view, scene, tagText]);

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
  const changeColors = changeColorsFor(chart, o).slice(1);

  const download = () => {
    const c = view !== 'machine' && current.current ? current.current : renderScarf(chart, o);
    downloadCanvas(c, view === 'mockup' ? `bead-scarf-${scene}.png` : 'bead-scarf.png');
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
              <Seg value={fit ? 'fit' : 'zoom'} onChange={(v) => setFit(v === 'fit')} options={[{ value: 'fit', label: t('scarf.fit') }, { value: 'zoom', label: t('scarf.closeUp') }]} />
              <Seg value={o.orientation} onChange={(v) => setScarfOptions({ orientation: v })} options={[{ value: 'horizontal', label: t('scarf.horizontal') }, { value: 'vertical', label: t('scarf.vertical') }]} />
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
        ) : (
          <div className="stage center" ref={holder} style={{ background: 'transparent', maxHeight: fit || view === 'mockup' ? undefined : '75vh', minHeight: 360 }} />
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
          <label className="field">
            {t('mockup.tag')}
            <input type="text" value={tagText} maxLength={40} onChange={(e) => setTagText(e.target.value)} />
          </label>
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
