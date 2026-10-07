import { useTranslation } from 'react-i18next';
import { AUTO_PALETTE_ID, PALETTES } from '../lib/palettes';
import { useSettings } from '../store/settingsStore';

interface Props {
  value: string;
  onChange: (id: string) => void;
  /** Show the "colours from photo" option. */
  allowAuto?: boolean;
  /** Extra first option (e.g. "colours in this pattern"). */
  extra?: { value: string; label: string };
}

/** Built-in, user-made and automatic palettes in one dropdown. */
export function PaletteSelect({ value, onChange, allowAuto = true, extra }: Props) {
  const { t } = useTranslation();
  const custom = useSettings((s) => s.customPalettes);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {extra && <option value={extra.value}>{extra.label}</option>}
      {allowAuto && <option value={AUTO_PALETTE_ID}>✨ {t('pixelize.autoPalette')}</option>}
      <optgroup label={t('palette.brands')}>
        {PALETTES.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.colors.length})</option>)}
      </optgroup>
      {custom.length > 0 && (
        <optgroup label={t('palette.mine')}>
          {custom.map((p) => <option key={p.id} value={p.id}>🎨 {p.label} ({p.colors.length})</option>)}
        </optgroup>
      )}
    </select>
  );
}
