import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Seg, Slider } from '../components/Field';
import { KnittingMachine } from '../components/KnittingMachine';
import { downloadCanvas } from '../lib/export';
import { buildChart, chartSizeCm } from '../lib/knitChart';
import { renderScarf } from '../lib/scarfRender';
import { useProject } from '../store/projectStore';

export function ScarfStep() {
  const { t } = useTranslation();
  const { grid, chartOptions, scarfOptions: o, setScarfOptions, goTo } = useProject();
  const [view, setView] = useState<'machine' | 'final'>('machine');
  const [fit, setFit] = useState(true);
  const [busy, setBusy] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLCanvasElement | null>(null);

  const chart = useMemo(() => (grid ? buildChart(grid, chartOptions) : null), [grid, chartOptions]);

  useEffect(() => {
    if (!chart || !holder.current || view !== 'final') return;
    setBusy(true);
    // Let the spinner paint before the (synchronous) render.
    const id = window.setTimeout(() => {
      // Close-up renders bigger stitches so the yarn texture is visible.
      const c = renderScarf(chart, fit ? o : { ...o, stitchPx: Math.max(o.stitchPx, Math.min(24, o.stitchPx * 2.5)) });
      c.style.maxWidth = fit ? '100%' : 'none';
      c.style.maxHeight = fit ? '70vh' : 'none';
      c.style.objectFit = 'contain';
      holder.current?.replaceChildren(c);
      current.current = c;
      setBusy(false);
    }, 30);
    return () => window.clearTimeout(id);
  }, [chart, o, fit, view]);

  if (!chart) {
    return (
      <div className="panel empty">
        <p>{t('edit.noGrid')}</p>
        <button className="btn primary" onClick={() => goTo(0)}>{t('steps.upload')}</button>
      </div>
    );
  }

  const size = chartSizeCm(chart);

  return (
    <div className="step-layout right">
      <div className="panel" style={{ minWidth: 0 }}>
        <div className="toolbar">
          <Seg
            value={view}
            onChange={setView}
            options={[{ value: 'machine', label: `🧶 ${t('scarf.machineView')}` }, { value: 'final', label: `🖼 ${t('scarf.finalView')}` }]}
          />
        </div>
        {view === 'machine' ? (
          <KnittingMachine chart={chart} options={o} />
        ) : (
        <>
        <div className="toolbar">
          <Seg value={fit ? 'fit' : 'zoom'} onChange={(v) => setFit(v === 'fit')} options={[{ value: 'fit', label: t('scarf.fit') }, { value: 'zoom', label: t('scarf.closeUp') }]} />
          <Seg value={o.orientation} onChange={(v) => setScarfOptions({ orientation: v })} options={[{ value: 'horizontal', label: t('scarf.horizontal') }, { value: 'vertical', label: t('scarf.vertical') }]} />
          <span className="hint">{busy ? `🧶 ${t('scarf.knitting')}` : `${size.widthCm.toFixed(0)} × ${size.lengthCm.toFixed(0)} cm`}</span>
        </div>
        <div className="stage center" ref={holder} style={{ background: 'transparent', maxHeight: fit ? undefined : '75vh', minHeight: 360 }} />
        </>
        )}
      </div>

      <div className="panel sidebar">
        <h3>{t('scarf.title')}</h3>
        <p className="hint">{t('scarf.hint')}</p>
        <Slider label={t('scarf.detail')} value={o.stitchPx} min={3} max={24} onChange={(v) => setScarfOptions({ stitchPx: v })} format={(v) => `${v}px`} />
        <Slider label={t('scarf.thickness')} value={o.thickness} min={0.7} max={1.3} step={0.05} onChange={(v) => setScarfOptions({ thickness: v })} format={(v) => v.toFixed(2)} />
        <Slider label={t('scarf.fuzz')} value={o.fuzz} min={0} max={1} step={0.05} onChange={(v) => setScarfOptions({ fuzz: v })} format={(v) => `${Math.round(v * 100)}%`} />
        <Check label={t('scarf.fringe')} checked={o.fringe} onChange={(v) => setScarfOptions({ fringe: v })} />
        <Check label={t('scarf.drape')} checked={o.drape} onChange={(v) => setScarfOptions({ drape: v })} />
        <Check label={t('scarf.shadow')} checked={o.shadow} onChange={(v) => setScarfOptions({ shadow: v })} />
        <button className="btn small ghost" onClick={() => setScarfOptions({ seed: Math.floor(Math.random() * 1e6) })}>🎲 {t('scarf.reroll')}</button>
        <div className="divider" />
        <button
          className="btn primary"
          onClick={() => {
            if (!chart) return;
            downloadCanvas(view === 'final' && current.current ? current.current : renderScarf(chart, o), 'bead-scarf.png');
          }}
        >⬇ {t('scarf.download')}</button>
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
