import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_PREFIX, PALETTES, type PaletteColor } from '../lib/palettes';
import { useSettings } from '../store/settingsStore';

interface Props {
  open: boolean;
  /** Existing custom palette to edit; null creates a new one. */
  paletteId: string | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
  /** Colours offered as one-click additions. */
  photoColors?: string[];
  patternColors?: PaletteColor[];
}

const relabel = (colors: PaletteColor[]) => colors.map((c, i) => ({ ...c, id: `U${String(i + 1).padStart(2, '0')}` }));

export function PaletteEditor({ open, paletteId, onClose, onSaved, photoColors, patternColors }: Props) {
  const { t } = useTranslation();
  const { customPalettes, savePalette, deletePalette } = useSettings();
  const existing = customPalettes.find((p) => p.id === paletteId);
  const [name, setName] = useState('');
  const [colors, setColors] = useState<PaletteColor[]>([]);
  const [newHex, setNewHex] = useState('#e26d5c');

  useEffect(() => {
    if (!open) return;
    setName(existing?.label ?? t('palette.defaultName', { n: customPalettes.length + 1 }));
    setColors(existing?.colors ?? []);
  }, [open, paletteId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const add = (list: PaletteColor[]) =>
    setColors((cur) => {
      const seen = new Set(cur.map((c) => c.hex.toLowerCase()));
      const extra = list.filter((c) => !seen.has(c.hex.toLowerCase()) && seen.add(c.hex.toLowerCase()));
      return relabel([...cur, ...extra]);
    });
  const update = (i: number, patch: Partial<PaletteColor>) => setColors((cur) => cur.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const save = () => {
    const id = existing?.id ?? `${CUSTOM_PREFIX}${Date.now()}`;
    savePalette({ id, label: name.trim() || t('palette.untitled'), colors: relabel(colors) });
    onSaved?.(id);
    onClose();
  };

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-label={t('palette.title')}>
        <header>
          <h2>🎨 {existing ? t('palette.edit') : t('palette.create')}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="close">✕</button>
        </header>
        <label className="field">
          {t('palette.name')}
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="field">
          {t('palette.colors', { n: colors.length })}
          {colors.length === 0 && <p className="hint">{t('palette.empty')}</p>}
          <div className="palette-rows">
            {colors.map((c, i) => (
              <div key={i} className="palette-row">
                <label className="swatch" style={{ background: c.hex }}>
                  <input type="color" value={c.hex} onChange={(e) => update(i, { hex: e.target.value })} />
                </label>
                <input type="text" value={c.name} onChange={(e) => update(i, { name: e.target.value })} />
                <code>{c.hex}</code>
                <button className="btn ghost small" onClick={() => setColors((cur) => relabel(cur.filter((_, j) => j !== i)))} aria-label="remove">✕</button>
              </div>
            ))}
          </div>
        </div>

        <div className="divider" />
        <h4>{t('palette.addFrom')}</h4>
        <div className="btn-row" style={{ alignItems: 'center' }}>
          <input type="color" value={newHex} onChange={(e) => setNewHex(e.target.value)} />
          <button className="btn small" onClick={() => add([{ id: '', name: newHex, hex: newHex }])}>＋ {t('palette.addColor')}</button>
          {photoColors && photoColors.length > 0 && (
            <button className="btn small" onClick={() => add(photoColors.map((h) => ({ id: '', name: h, hex: h })))}>📷 {t('palette.fromPhoto')}</button>
          )}
          {patternColors && patternColors.length > 0 && (
            <button className="btn small" onClick={() => add(patternColors)}>🟥 {t('palette.fromPattern')}</button>
          )}
          <select
            value=""
            onChange={(e) => {
              const p = PALETTES.find((x) => x.id === e.target.value);
              if (p) add(p.colors);
            }}
          >
            <option value="">{t('palette.fromBrand')}</option>
            {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>

        <div className="footer-nav">
          {existing ? (
            <button className="btn ghost" onClick={() => { if (window.confirm(t('palette.confirmDelete'))) { deletePalette(existing.id); onClose(); } }}>🗑 {t('palette.delete')}</button>
          ) : <span />}
          <div className="btn-row">
            <button className="btn" onClick={onClose}>{t('palette.cancel')}</button>
            <button className="btn primary" disabled={!colors.length} onClick={save}>{t('palette.save')}</button>
          </div>
        </div>
      </div>
    </>
  );
}
