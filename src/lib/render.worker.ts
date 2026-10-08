/// <reference lib="webworker" />
import { runCompute, runJob, type ComputeJob, type RenderJob } from './renderJobs';

type Msg = { id: number; channel: string; job: RenderJob } | { id: number; channel: string; compute: ComputeJob };

/**
 * Renders scarves and mockups off the main thread so the page never freezes.
 * Jobs arrive per "channel" (e.g. the preview, the machine); if newer jobs for a
 * channel are already queued, older ones are skipped instead of rendered.
 */
const queue: Msg[] = [];
let scheduled = false;

self.onmessage = (e: MessageEvent<Msg>) => {
  queue.push(e.data);
  if (!scheduled) {
    scheduled = true;
    // Let any messages already in flight arrive before choosing what to render.
    setTimeout(processQueue, 0);
  }
};

async function processQueue() {
  while (queue.length) {
    const msg = queue.shift()!;
    if (queue.some((m) => m.channel === msg.channel)) {
      post({ id: msg.id, skipped: true });
      continue;
    }
    try {
      if ('compute' in msg) {
        post({ id: msg.id, result: runCompute(msg.compute) });
        continue;
      }
      const canvas = runJob(msg.job);
      // Copy (not transfer) so the cached canvas stays intact for next time.
      const bitmap = await createImageBitmap(canvas);
      post({ id: msg.id, bitmap }, [bitmap]);
    } catch (err) {
      post({ id: msg.id, error: String(err) });
    }
    // Yield so newly posted jobs can land in the queue before the next pick.
    await new Promise((r) => setTimeout(r, 0));
  }
  scheduled = false;
}

function post(data: unknown, transfer: Transferable[] = []) {
  (self as unknown as Worker).postMessage(data, transfer);
}
