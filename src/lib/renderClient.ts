import { runCompute, runJob, type ComputeJob, type ComputeResult, type RenderJob } from './renderJobs';
import RenderWorker from './render.worker?worker&inline';

export type Rendered = CanvasImageSource & { width: number; height: number };

let worker: Worker | null | undefined;
let nextId = 1;
type Pending = { resolve: (r: any) => void; reject: (e: unknown) => void; run: () => unknown };
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof OffscreenCanvas === 'undefined') throw new Error('no OffscreenCanvas');
    worker = new RenderWorker();
    worker.onmessage = (e: MessageEvent<{ id: number; bitmap?: ImageBitmap; result?: unknown; error?: string; skipped?: boolean }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.bitmap) p.resolve(e.data.bitmap);
      else if ('result' in e.data) p.resolve(e.data.result);
      else p.reject(e.data.skipped ? new Superseded() : new Error(e.data.error));
    };
    worker.onerror = () => {
      // Worker can't run here (e.g. some file:// setups): finish the queue on the page.
      worker?.terminate();
      worker = null;
      for (const [id, p] of pending) {
        pending.delete(id);
        onPage(p.run).then(p.resolve, p.reject);
      }
    };
  } catch {
    worker = null;
  }
  return worker;
}

function onPage<T>(run: () => T): Promise<T> {
  // Yield first so a spinner can paint.
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(run());
      } catch (e) {
        reject(e);
      }
    }, 16),
  );
}

/** Thrown when a newer job on the same channel replaced this one. */
export class Superseded extends Error {}

/**
 * Render a scarf or mockup in a background worker (falls back to the page).
 * Jobs on the same `channel` replace older queued ones.
 */
export function render(job: RenderJob, channel = 'default'): Promise<Rendered> {
  const run = () => runJob(job) as Rendered;
  const w = getWorker();
  if (!w) return onPage(run);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, run });
    w.postMessage({ id, channel, job });
  });
}

/** Run heavy analysis (auto-crop, auto-pixelize) in the worker so the page stays responsive. */
export function compute<J extends ComputeJob>(job: J, channel?: string): Promise<ComputeResult<J>> {
  const run = () => runCompute(job) as ComputeResult<J>;
  const w = getWorker();
  if (!w) return onPage(run);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, run });
    w.postMessage({ id, channel: channel ?? `compute-${id}`, compute: job });
  });
}
