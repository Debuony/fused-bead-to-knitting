import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, NumberField, Seg, Slider } from '../components/Field';
import { autoMainYarn } from '../lib/auto';
import { renderChart } from '../lib/chartRender';
import { contrastText } from '../lib/color';
import { downloadCanvas, exportChartPdf } from '../lib/export';
import {
  MAIN_YARNS, autoScarfWidth, buildChart, chartSizeCm, motifSection, motifSize, yarnKey, yarnUsage,
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

  const { mw, mh } = motifSize(grid, o);
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
    <div className="step-layout">
      <div className="panel sidebar">
        <button
          className="btn primary"
          onClick={() => setChartOptions({
            gaugeSts: settings.gaugeSts, gaugeRows: settings.gaugeRows, lengthCm: settings.scarfLengthCm,
            scarfWidthSts: settings.scarfWidthSts, motifWidthSts: 0, placement: 'ends', spacingRows: 8,
            borderStyle: 'seed', borderSts: 4, bgHex: autoMainYarn(grid),
          })}
        >
          ✨ {t('chart.auto')}
        </button>
        <p className="hint">{t('chart.autoHint')}</p>
        <div className="divider" />
        <h3>{t('chart.gauge')}</h3>
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
        <div className="divider" />
        <h3>{t('chart.layout')}</h3>
        <Slider label={t('chart.motifWidth')} value={mw} min={4} max={Math.max(120, grid.w * 3)} onChange={(v) => setChartOptions({ motifWidthSts: v === grid.w ? 0 : v })} format={(v) => `${v} ${t('chart.sts')}`} />
        <p className="hint">{t('chart.motifRows', { rows: mh })}</p>
        <NumberField
          label={t('chart.scarfWidth')}
          value={chart.w}
          min={mw + 2 * o.borderSts}
          max={400}
          onChange={(v) => setChartOptions({ scarfWidthSts: v === autoScarfWidth(mw, o.borderSts) ? 0 : v })}
          suffix={`${t('chart.sts')} · ${size.widthCm.toFixed(0)} cm`}
        />
        <NumberField label={t('chart.length')} value={o.lengthCm} min={20} max={400} onChange={(v) => setChartOptions({ lengthCm: v })} suffix="cm" />
        <label className="field">
          {t('chart.placement')}
          <Seg<Placement>
            value={o.placement}
            onChange={(v) => setChartOptions({ placement: v })}
            options={[
              { value: 'ends', label: t('chart.ends') },
              { value: 'center', label: t('chart.center') },
              { value: 'repeat', label: t('chart.repeat') },
            ]}
          />
        </label>
        <Slider label={t('chart.spacing')} value={o.spacingRows} min={0} max={60} onChange={(v) => setChartOptions({ spacingRows: v })} />
        <label className="field">
          {t('chart.border')}
          <Seg<BorderStyle>
            value={o.borderStyle}
            onChange={(v) => setChartOptions({ borderStyle: v })}
            options={[
              { value: 'seed', label: t('chart.seed') },
              { value: 'garter', label: t('chart.garter') },
              { value: 'none', label: t('chart.none') },
            ]}
          />
        </label>
        <Slider label={t('chart.borderWidth')} value={o.borderSts} min={0} max={10} onChange={(v) => setChartOptions({ borderSts: v })} />
        <div className="field">
          {t('chart.mainYarn')}
          <div className="swatches">
            {MAIN_YARNS.map((h) => (
              <button key={h} className={`swatch ${o.bgHex === h ? 'on' : ''}`} style={{ background: h }} onClick={() => setChartOptions({ bgHex: h })} />
            ))}
            <input type="color" value={o.bgHex} onChange={(e) => setChartOptions({ bgHex: e.target.value })} />
          </div>
        </div>
        <button
          className="btn small ghost"
          onClick={() => setChartOptions({ gaugeSts: settings.gaugeSts, gaugeRows: settings.gaugeRows, lengthCm: settings.scarfLengthCm, scarfWidthSts: settings.scarfWidthSts, motifWidthSts: 0 })}
        >
          ↺ {t('chart.useDefaults')}
        </button>
        <div className="footer-nav">
          <button className="btn" onClick={() => goTo(2)}>← {t('common.back')}</button>
          <button className="btn primary" onClick={() => goTo(4)}>{t('chart.toScarf')} →</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <div className="panel">
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

        <div className="panel">
          <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', marginBottom: 12 }}>
            <div className="stat"><b>{chart.w} × {chart.h}</b><span>{t('chart.stsRows')}</span></div>
            <div className="stat"><b>{size.widthCm.toFixed(0)} × {size.lengthCm.toFixed(0)} cm</b><span>{t('chart.finished')}</span></div>
            <div className="stat"><b>{colorCount}</b><span>{t('pixelize.colors')}</span></div>
            <div className="stat"><b>≈ {Math.ceil(totalM)} m</b><span>{t('chart.totalYarn')}</span></div>
          </div>
          <h3>{t('chart.legend')}</h3>
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
    </div>
  );
}
