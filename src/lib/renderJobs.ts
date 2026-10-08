import { autoCrop, autoPixelize } from './auto';
import type { Canvas } from './canvas';
import type { Grid } from './grid';
import type { KnitChart } from './knitChart';
import type { PaletteColor } from './palettes';
import { renderMockup, type MockupOptions, type MockupScene } from './mockup';
import { renderScarf, type ScarfRenderOptions } from './scarfRender';

export type RenderJob =
  | { kind: 'scarf'; chart: KnitChart; opts: ScarfRenderOptions }
  | { kind: 'mockup'; scene: MockupScene; chart: KnitChart; opts: ScarfRenderOptions; grid: Grid; m: MockupOptions; message: string };

/** Run a render job right here (used by the worker, and as a fallback on the page). */
export function runJob(job: RenderJob): Canvas {
  return job.kind === 'scarf'
    ? renderScarf(job.chart, job.opts)
    : renderMockup(job.scene, job.chart, job.opts, job.grid, job.m, job.message);
}

/** Heavy analysis that returns data (not an image). */
export type ComputeJob =
  | { kind: 'autoCrop'; img: ImageData }
  | { kind: 'autoPixelize'; img: ImageData; palette?: PaletteColor[] };

export type ComputeResult<J extends ComputeJob> = J extends { kind: 'autoCrop' } ? ReturnType<typeof autoCrop> : ReturnType<typeof autoPixelize>;

export function runCompute(job: ComputeJob): unknown {
  return job.kind === 'autoCrop' ? autoCrop(job.img) : autoPixelize(job.img, job.palette);
}
