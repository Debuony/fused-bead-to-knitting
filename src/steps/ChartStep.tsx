import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionRail, More } from '../components/ActionRail';
import { Check, NumberField, Seg, Slider } from '../components/Field';
import { autoMainYarn, suggestMainYarns } from '../lib/auto';
import { MiniScarf } from '../components/MiniScarf';
import { renderChart } from '../lib/chartRender';
import { contrastText } from '../lib/color';
import { downloadCanvas, exportChartPdf } from '../lib/export';
import {
  MAIN_YARNS, arrangeMotif, autoScarfWidth, buildChart, chartSizeCm, motifSection, motifSize, yarnKey, yarnUsage,
  type BorderStyle, type Placement,
} from '../lib/knitChart';
import { useProject } from '../store/projectStore';
import { YARN_WEIGHTS, useSettings } from '../store/settingsStore';

export function ChartStep() {
  const { t } = useTranslation();
  const { grid, chartOptions: o, setChartOptions, goTo } = useProject();
  const settings = useSettings();
  const [view, setView] = useState<'motif' | 'full'>('motif');
  const [colored, setColored] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [cell, setCell] = useState(14);
  const [tab, setTab] = useState<'chart' | 'legend'>('chart');
  const holder = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const chart = useMemo(() => (grid ? buildChart(grid, o) : null), [grid, o]);
  const region = useMemo(() => (chart ? (view === 'motif' ? motifSection(chart) : { x: 0, y: 0, w: chart.w, h: chart.h }) : null), [chart, view]);

  useEffect(() => {
    if (!chart || !region || !holder.current) return;
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      holder.current.appendChild(canvasRef.current);
    }
    const c = view === 'full' ? Math.min(cell, 8) : cell;
    renderChart(chart, region, { cell: c, colored, showSymbols: symbols, showNumbers: true, showTexture: true }, canvasRef.current);
  }, [chart, region, colored, symbols, cell, view]);

  if (!grid || !chart || !region) {
    return (
      <div className="panel empty">
        <p>{t('edit.noGrid')}</p>
        <button className="btn primary" onClick={() => goTo(0)}>{t('steps.upload')}</button>
      </div>
    );
  }

  const arranged = arrangeMotif(grid, o.motifLayout);
  const { mw, mh } = motifSize(arranged, o);
  const isWide = grid.w > grid.h * 1.6;
  const suggested = suggestMainYarns(grid);
  const widthCmNow = (chart.w * 10) / o.gaugeSts;
  const activePreset = SIZE_PRESETS.find((p) => Math.abs(p.w - widthCmNow) < 1.5 && p.l === o.lengthCm)?.id ?? null;
  const applyPreset = (p: (typeof SIZE_PRESETS)[number]) => {
    const widthSts = Math.round((p.w * o.gaugeSts) / 10);
    const inner = Math.max(4, widthSts - 2 * o.borderSts);
    setChartOptions({ scarfWidthSts: widthSts, lengthCm: p.l, motifWidthSts: Math.max(4, Math.round(inner * 0.72)) });
  };
  const size = chartSizeCm(chart);
  const usage = yarnUsage(chart);
  const totalM = usage.reduce((a, u) => a + u.meters, 0);
  const colorCount = chart.yarns.length;

  const setOverride = (i: number, patch: { name?: string; hex?: string }) => {
    const key = yarnKey(grid, i);
    setChartOptions({ yarnOverrides: { ...o.yarnOverrides, [key]: { ...o.yarnOverrides?.[key], ...patch } } });
  };

  const pdf = () =>
    exportChartPdf(chart, region, colored, {
      title: t('chart.pdfTitle'),
      size: t('chart.size'),
      legend: t('chart.legend'),
      stitches: t('chart.sts'),
      meters: 'm',
      readNote: t('chart.readNote'),
    }, 'knitting-chart.pdf');

  return (
    <div className="step-layout three">
      <div className="panel sidebar">
        <h3>{t('chart.placement')}</h3>
        <div className="layout-cards">
          {PLACEMENTS.map((p) => (
            <button key={p} className={`layout-card ${o.placement === p ? 'on' : ''}`} onClick={() => setChartOptions({ placement: p })}>
              <PlacementIcon placement={p} />
              {t(`chart.${p}`)}
            </button>
          ))}
        </div>
        {isWide && (
          <Check
            label={t('chart.stackWide')}
            checked={o.motifLayout !== 'asis'}
            onChange={(v) => setChartOptions({ motifLayout: v ? 'auto' : 'asis', motifWidthSts: 0 })}
          />
        )}
        <MiniScarf chart={chart} />
        {o.placement !== 'center' && (
          <Slider label={t('chart.spacing')} value={o.spacingRows} min={0} max={60} onChange={(v) => setChartOptions({ spacingRows: v })} />
        )}
        <div className="divider" />
        <h3>{t('chart.sizeTitle')}</h3>
        <div className="size-presets">
          {SIZE_PRESETS.map((p) => (
            <button key={p.id} className={`layout-card ${activePreset === p.id ? 'on' : ''}`} onClick={() => applyPreset(p)}>
              <b style={{ fontSize: '1.1rem' }}>{p.id}</b>
              <span className="hint">{p.w}×{p.l}</span>
            </button>
          ))}
        </div>
        <p className="hint">≈ {size.widthCm.toFixed(0)} × {size.lengthCm.toFixed(0)} cm · {t('chart.motifRows', { rows: mh })}</p>
        <Slider label={t('chart.motifWidth')} value={mw} min={4} max={Math.max(120, arranged.w * 3)} onChange={(v) => setChartOptions({ motifWidthSts: v === arranged.w ? 0 : v })} format={(v) => `${v} ${t('chart.sts')}`} />
        <More title={t('chart.customSize')} open={activePreset === null}>
          <div style={{ display: 'flex', gap: 10 }}>
            <NumberField
              label={t('chart.scarfWidth')}
              value={chart.w}
              min={mw + 2 * o.borderSts}
              max={400}
              onChange={(v) => setChartOptions({ scarfWidthSts: v === autoScarfWidth(mw, o.borderSts) ? 0 : v })}
            />
            <NumberField label={`${t('chart.length')} (cm)`} value={o.lengthCm} min={20} max={400} onChange={(v) => setChartOptions({ lengthCm: v })} />
          </div>
        </More>
        <div className="divider" />
        <div className="field">
          {t('chart.mainYarn')}
          <span className="hint">✨ {t('chart.suggested')}</span>
          <div className="swatches">
            {suggested.map((h) => (
              <button key={h} className={`swatch suggested ${o.bgHex === h ? 'on' : ''}`} style={{ background: h }} title={h} onClick={() => setChartOptions({ bgHex: h })} />
            ))}
          </div>
          <div className="swatches">
            {MAIN_YARNS.filter((h) => !suggested.includes(h)).map((h) => (
              <button key={h} className={`swatch ${o.bgHex === h ? 'on' : ''}`} style={{ background: h }} onClick={() => setChartOptions({ bgHex: h })} />
            ))}
            <label className="swatch custom" title={t('edit.customColor')}>
              <input type="color" value={o.bgHex} onChange={(e) => setChartOptions({ bgHex: e.target.value })} />
              ＋
            </label>
          </div>
        </div>
        <More title={t('chart.gauge')}>
          <label className="field">
            {t('chart.yarnWeight')}
            <select
              value={Object.keys(YARN_WEIGHTS).find((k) => YARN_WEIGHTS[k].sts === o.gaugeSts && YARN_WEIGHTS[k].rows === o.gaugeRows) ?? 'custom'}
              onChange={(e) => {
                const g = YARN_WEIGHTS[e.target.value];
                if (g) setChartOptions({ gaugeSts: g.sts, gaugeRows: g.rows });
              }}
            >
              {Object.keys(YARN_WEIGHTS).map((k) => <option key={k} value={k}>{t(`yarn.${k}`)}</option>)}
              <option value="custom">{t('yarn.custom')}</option>
            </select>
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <NumberField label={t('chart.gaugeSts')} value={o.gaugeSts} min={5} max={50} onChange={(v) => setChartOptions({ gaugeSts: v })} />
            <NumberField label={t('chart.gaugeRows')} value={o.gaugeRows} min={5} max={60} onChange={(v) => setChartOptions({ gaugeRows: v })} />
          </div>
          <p className="hint">{t('chart.gaugeHint')}</p>
        </More>
        <More title={t('chart.border')}>
          <Seg<BorderStyle>
            value={o.borderStyle}
            onChange={(v) => setChartOptions({ borderStyle: v })}
            options={[
              { value: 'seed', label: t('chart.seed') },
              { value: 'garter', label: t('chart.garter') },
              { value: 'none', label: t('chart.none') },
            ]}
          />
          <Slider label={t('chart.borderWidth')} value={o.borderSts} min={0} max={10} onChange={(v) => setChartOptions({ borderSts: v })} />
        </More>
      </div>

      <div className="panel" style={{ minWidth: 0 }}>
        <div className="toolbar">
          <Seg
            value={tab}
            onChange={setTab}
            options={[{ value: 'chart', label: `📋 ${t('chart.tabChart')}` }, { value: 'legend', label: `🎨 ${t('chart.legend')} (${chart.yarns.length})` }]}
          />
        </div>
        <div style={{ display: tab === 'chart' ? 'block' : 'none' }}>
          <div className="toolbar">
            <Seg value={view} onChange={setView} options={[{ value: 'motif', label: t('chart.viewMotif') }, { value: 'full', label: t('chart.viewFull') }]} />
            <Check label={t('chart.colored')} checked={colored} onChange={setColored} />
            <Check label={t('chart.symbols')} checked={symbols} onChange={setSymbols} />
            <div style={{ width: 190 }}>
              <Slider label={t('edit.zoom')} value={cell} min={6} max={30} onChange={setCell} format={(v) => `${v}px`} />
            </div>
            <span className="sep" />
            <button className="btn small" onClick={() => canvasRef.current && downloadCanvas(canvasRef.current, 'knitting-chart.png')}>⬇ PNG</button>
            <button className="btn small primary" onClick={pdf}>⬇ PDF</button>
          </div>
          <p className="hint" style={{ marginBottom: 8 }}>{t('chart.readNote')}</p>
          <div className="stage" ref={holder} style={{ maxHeight: '65vh' }} />
        </div>

        <div style={{ display: tab === 'legend' ? 'block' : 'none' }}>
          <p className="hint" style={{ marginBottom: 8 }}>{chart.w} × {chart.h} {t('chart.stsRowsShort')} · {t('chart.legendHint')}</p>
          <table className="legend">
            <thead>
              <tr><th></th><th>{t('chart.symbol')}</th><th>{t('chart.yarnName')}</th><th>{t('chart.sts')}</th><th>{t('chart.yarnLen')}</th></tr>
            </thead>
            <tbody>
              {chart.yarns.map((y, i) => (
                <tr key={i}>
                  <td>
                    <input type="color" value={y.hex} onChange={(e) => (i === 0 ? setChartOptions({ bgHex: e.target.value }) : setOverride(i, { hex: e.target.value }))} />
                  </td>
                  <td><span className="sw" style={{ background: y.hex, color: contrastText(y.hex) }}>{y.symbol || '□'}</span></td>
                  <td>
                    <input type="text" value={i === 0 && y.name === 'Main' ? t('chart.mainYarn') : y.name} onChange={(e) => setOverride(i, { name: e.target.value })} />
                  </td>
                  <td>{usage[i].stitches}</td>
                  <td>≈ {usage[i].meters.toFixed(1)} m</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ marginTop: 10 }}>{colorCount > 4 ? t('chart.tipIntarsia') : t('chart.tipStranded')}</p>
        </div>
      </div>
      <ActionRail
        autoLabel={t('chart.auto')}
        autoHint={t('chart.autoHint')}
        onAuto={() => setChartOptions({
          gaugeSts: settings.gaugeSts, gaugeRows: settings.gaugeRows, lengthCm: settings.scarfLengthCm,
          scarfWidthSts: settings.scarfWidthSts, motifWidthSts: 0, placement: 'ends', spacingRows: 8,
          borderStyle: 'seed', borderSts: 4, bgHex: autoMainYarn(grid),
        })}
        back={() => goTo(2)}
        next={{ label: t('chart.toScarf'), onClick: () => goTo(4) }}
      >
        <div className="stats">
          <div className="stat"><b>{size.widthCm.toFixed(0)}×{size.lengthCm.toFixed(0)}</b><span>cm</span></div>
          <div className="stat"><b>≈ {Math.ceil(totalM)} m</b><span>{t('chart.totalYarn')}</span></div>
        </div>
      </ActionRail>
    </div>
  );
}

const PLACEMENTS: Placement[] = ['ends', 'center', 'repeat'];

/** Common scarf sizes in cm (width × length). */
const SIZE_PRESETS = [
  { id: 'S', w: 15, l: 120 },
  { id: 'M', w: 20, l: 160 },
  { id: 'L', w: 28, l: 190 },
] as const;

/** Tiny scarf diagram showing where motifs go. */
function PlacementIcon({ placement }: { placement: Placement }) {
  const ys = placement === 'ends' ? [6, 46] : placement === 'center' ? [26] : [8, 26, 44];
  return (
    <svg width="26" height="64" viewBox="0 0 26 64" aria-hidden>
      <rect x="1" y="1" width="24" height="62" rx="4" fill="var(--chip)" stroke="var(--line)" />
      {ys.map((y) => <rect key={y} x="6" y={y} width="14" height="12" rx="2" fill="var(--accent)" />)}
    </svg>
  );
}
