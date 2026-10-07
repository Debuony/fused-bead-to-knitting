import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Grid } from '../lib/grid';
import { FULL_CROP, type CropRect } from '../lib/imageUtils';
import { DEFAULT_CHART_OPTIONS, type ChartOptions } from '../lib/knitChart';
import { DEFAULT_SCARF_OPTIONS, type ScarfRenderOptions } from '../lib/scarfRender';
import { useSettings } from './settingsStore';

export interface PixelOptions {
  gridW: number;
  gridH: number;
  lock: boolean;
  paletteId: string;
  maxColors: number;
  removeBg: boolean;
  /** 0 = automatic */
  bgTol: number;
  removeEnclosed: boolean;
  sample: number;
}

function defaultPixelOptions(): PixelOptions {
  const s = useSettings.getState();
  return {
    gridW: s.gridW, gridH: s.gridH, lock: false, paletteId: s.paletteId, maxColors: s.maxColors,
    removeBg: true, bgTol: 0, removeEnclosed: false, sample: 0.6,
  };
}

export type Step = 0 | 1 | 2 | 3 | 4;

const HISTORY_LIMIT = 100;

interface ProjectState {
  step: Step;
  /** Highest step the user has unlocked. */
  maxStep: Step;
  image: string | null;
  rotation: number;
  crop: CropRect;
  pixelOptions: PixelOptions;
  grid: Grid | null;
  past: Grid[];
  future: Grid[];
  chartOptions: ChartOptions;
  scarfOptions: ScarfRenderOptions;

  goTo: (s: Step) => void;
  setImage: (dataUrl: string | null) => void;
  setTransform: (patch: { rotation?: number; crop?: CropRect }) => void;
  setPixelOptions: (patch: Partial<PixelOptions>) => void;
  /** Replace the grid without recording history (e.g. live pixelize preview). */
  setGrid: (g: Grid | null) => void;
  /** Record the current grid in history, then replace it. */
  commitGrid: (g: Grid) => void;
  /** Snapshot for a multi-step stroke (call once on pointer down). */
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  setChartOptions: (patch: Partial<ChartOptions>) => void;
  setScarfOptions: (patch: Partial<ScarfRenderOptions>) => void;
  resetProject: () => void;
}

export const useProject = create<ProjectState>()(
  persist(
    (set, get) => ({
      step: 0,
      maxStep: 0,
      image: null,
      rotation: 0,
      crop: FULL_CROP,
      pixelOptions: defaultPixelOptions(),
      grid: null,
      past: [],
      future: [],
      chartOptions: DEFAULT_CHART_OPTIONS,
      scarfOptions: DEFAULT_SCARF_OPTIONS,

      goTo: (s) => set((st) => ({ step: s, maxStep: (Math.max(st.maxStep, s) as Step) })),
      setImage: (image) => set({ image, rotation: 0, crop: FULL_CROP, pixelOptions: defaultPixelOptions() }),
      setTransform: (patch) => set(patch),
      setPixelOptions: (patch) => set((st) => ({ pixelOptions: { ...st.pixelOptions, ...patch } })),
      setGrid: (grid) => set({ grid }),
      commitGrid: (g) =>
        set((st) => ({
          past: st.grid ? [...st.past, st.grid].slice(-HISTORY_LIMIT) : st.past,
          future: [],
          grid: g,
        })),
      checkpoint: () => {
        const { grid, past } = get();
        if (grid) set({ past: [...past, grid].slice(-HISTORY_LIMIT), future: [] });
      },
      undo: () =>
        set((st) => {
          if (!st.past.length || !st.grid) return st;
          return { past: st.past.slice(0, -1), future: [st.grid, ...st.future], grid: st.past[st.past.length - 1] };
        }),
      redo: () =>
        set((st) => {
          if (!st.future.length || !st.grid) return st;
          return { future: st.future.slice(1), past: [...st.past, st.grid], grid: st.future[0] };
        }),
      setChartOptions: (patch) => set((st) => ({ chartOptions: { ...st.chartOptions, ...patch } })),
      setScarfOptions: (patch) => set((st) => ({ scarfOptions: { ...st.scarfOptions, ...patch } })),
      resetProject: () =>
        set({ step: 0, maxStep: 0, image: null, rotation: 0, crop: FULL_CROP, grid: null, past: [], future: [] }),
    }),
    {
      name: 'bead2scarf-project',
      version: 1,
      // History and the (possibly large) photo aren't persisted; the pattern is.
      partialize: (s) => ({
        step: s.step,
        maxStep: s.maxStep,
        grid: s.grid,
        chartOptions: s.chartOptions,
        scarfOptions: s.scarfOptions,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<ProjectState>;
        const merged = { ...current, ...p };
        // Without a photo or grid, earlier steps can't be resumed.
        if (!merged.grid) return { ...merged, step: 0, maxStep: 0 };
        if (merged.step < 2) merged.step = 2;
        return merged;
      },
    },
  ),
);
