import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AUTO_PALETTE_ID, type Palette } from '../lib/palettes';

export type Lang = 'zh' | 'en';
export type Mode = 'light' | 'dark' | 'auto';

export interface BackgroundPreset {
  id: string;
  /** i18n key under `bg.` */
  label: string;
  /** Any CSS `background` value. */
  css: string;
  /** Size for repeating patterns. */
  size?: string;
}

/** Add new backgrounds here — they appear in the settings panel automatically. */
export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  { id: 'cream', label: 'cream', css: '#f6efe6' },
  { id: 'linen', label: 'linen', css: 'linear-gradient(135deg,#f7f1e8 0%,#efe4d4 100%)' },
  { id: 'peach', label: 'peach', css: 'linear-gradient(160deg,#ffe9e0 0%,#ffd6cc 50%,#fbe7d3 100%)' },
  { id: 'mint', label: 'mint', css: 'linear-gradient(160deg,#e7f6ef 0%,#d3eee3 100%)' },
  { id: 'sky', label: 'sky', css: 'linear-gradient(180deg,#e4f0fb 0%,#f3f7fd 100%)' },
  { id: 'lilac', label: 'lilac', css: 'linear-gradient(160deg,#efe7fb 0%,#f9eef6 100%)' },
  {
    id: 'beads',
    label: 'beads',
    css: 'radial-gradient(circle at 50% 50%, #f6efe6 18%, transparent 19%), radial-gradient(circle at 50% 50%, #f2b8b5 40%, #f6efe6 42%)',
    size: '28px 28px',
  },
  {
    id: 'knit',
    label: 'knit',
    css: 'linear-gradient(60deg, transparent 47%, rgba(0,0,0,0.05) 50%, transparent 53%), linear-gradient(-60deg, transparent 47%, rgba(0,0,0,0.05) 50%, transparent 53%), #f3e6d8',
    size: '16px 14px',
  },
  {
    id: 'gingham',
    label: 'gingham',
    css: 'linear-gradient(90deg, rgba(232,130,130,0.25) 50%, transparent 50%), linear-gradient(rgba(232,130,130,0.25) 50%, transparent 50%), #fff8f3',
    size: '32px 32px',
  },
  {
    id: 'dots',
    label: 'dots',
    css: 'radial-gradient(#d9c6ff 18%, transparent 20%), #fbf8ff',
    size: '22px 22px',
  },
  { id: 'night', label: 'night', css: 'linear-gradient(160deg,#1f2230 0%,#2b2240 100%)' },
];

export const ACCENTS = ['#e26d5c', '#e0a43a', '#4f9d69', '#3f7fc4', '#8a63d2', '#d4578f', '#2f2f2f'];

export interface Settings {
  lang: Lang;
  mode: Mode;
  backgroundId: string; // preset id, 'custom-color' or 'custom-image'
  customColor: string;
  customImage: string; // data URL
  accent: string;
  fontScale: number;
  panelOpacity: number;
  // Workflow defaults
  paletteId: string;
  gridW: number;
  gridH: number;
  maxColors: number;
  yarnWeight: string;
  gaugeSts: number;
  gaugeRows: number;
  scarfLengthCm: number;
  scarfWidthSts: number;
  /** Palettes the user made themselves. */
  customPalettes: Palette[];
}

export const YARN_WEIGHTS: Record<string, { sts: number; rows: number }> = {
  fingering: { sts: 28, rows: 36 },
  dk: { sts: 22, rows: 30 },
  worsted: { sts: 20, rows: 28 },
  bulky: { sts: 14, rows: 20 },
};

const defaultLang: Lang =
  typeof navigator !== 'undefined' && !navigator.language.toLowerCase().startsWith('zh') ? 'en' : 'zh';

export const DEFAULT_SETTINGS: Settings = {
  lang: defaultLang,
  mode: 'light',
  backgroundId: 'cream',
  customColor: '#f6efe6',
  customImage: '',
  accent: ACCENTS[0],
  fontScale: 1,
  panelOpacity: 0.88,
  paletteId: AUTO_PALETTE_ID,
  gridW: 29,
  gridH: 29,
  maxColors: 10,
  yarnWeight: 'worsted',
  gaugeSts: 20,
  gaugeRows: 28,
  scarfLengthCm: 160,
  scarfWidthSts: 0,
  customPalettes: [],
};

interface SettingsState extends Settings {
  set: (patch: Partial<Settings>) => void;
  savePalette: (p: Palette) => void;
  deletePalette: (id: string) => void;
  /** Resets appearance and defaults but keeps the user's own palettes. */
  reset: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      savePalette: (p) =>
        set((s) => ({
          customPalettes: s.customPalettes.some((x) => x.id === p.id)
            ? s.customPalettes.map((x) => (x.id === p.id ? p : x))
            : [...s.customPalettes, p],
        })),
      deletePalette: (id) =>
        set((s) => ({
          customPalettes: s.customPalettes.filter((x) => x.id !== id),
          paletteId: s.paletteId === id ? AUTO_PALETTE_ID : s.paletteId,
        })),
      reset: () => set((s) => ({ ...DEFAULT_SETTINGS, customPalettes: s.customPalettes })),
    }),
    {
      name: 'bead2scarf-settings',
      version: 2,
      // v2: palette defaults to "auto" (colours from the photo); custom palettes added.
      migrate: (old, version) => {
        const s = old as Partial<Settings>;
        if (version < 2) return { ...s, paletteId: AUTO_PALETTE_ID, customPalettes: [] } as Settings;
        return s as Settings;
      },
    },
  ),
);
