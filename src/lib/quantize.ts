import { deltaE, rgbToLab, type Lab, type RGB } from './color';

/** Small deterministic PRNG so results are repeatable. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * k-means in Lab space with k-means++ seeding. Returns cluster centres as RGB
 * (averaged in RGB so they are real displayable colours).
 */
export function kmeans(colors: RGB[], k: number, iterations = 12, seed = 7): RGB[] {
  if (colors.length === 0) return [];
  const labs = colors.map(rgbToLab);
  k = Math.min(k, colors.length);
  const rand = mulberry32(seed);
  const centres: Lab[] = [labs[Math.floor(rand() * labs.length)]];
  const dist = new Array(labs.length).fill(Infinity);
  while (centres.length < k) {
    let sum = 0;
    for (let i = 0; i < labs.length; i++) {
      dist[i] = Math.min(dist[i], deltaE(labs[i], centres[centres.length - 1]) ** 2);
      sum += dist[i];
    }
    if (sum === 0) break;
    let r = rand() * sum;
    let pick = 0;
    for (; pick < labs.length - 1; pick++) {
      r -= dist[pick];
      if (r <= 0) break;
    }
    centres.push(labs[pick]);
  }
  const assign = new Array(labs.length).fill(0);
  let rgbCentres: RGB[] = [];
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < labs.length; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centres.length; c++) {
        const d = deltaE(labs[i], centres[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      assign[i] = best;
    }
    const sums = centres.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < colors.length; i++) {
      const s = sums[assign[i]];
      s[0] += colors[i][0]; s[1] += colors[i][1]; s[2] += colors[i][2]; s[3]++;
    }
    rgbCentres = sums.map((s, c) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] as RGB : labToApproxRgb(centres[c], colors, labs)));
    for (let c = 0; c < centres.length; c++) centres[c] = rgbToLab(rgbCentres[c]);
  }
  return rgbCentres;
}

function labToApproxRgb(lab: Lab, colors: RGB[], labs: Lab[]): RGB {
  let best = 0;
  let bestD = Infinity;
  labs.forEach((l, i) => {
    const d = deltaE(l, lab);
    if (d < bestD) { bestD = d; best = i; }
  });
  return colors[best];
}

/**
 * Reduce the number of used colours to `max` by repeatedly merging the
 * least-used colour into its nearest remaining neighbour.
 * `assign[i]` is a colour index (or -1); returns the remapped assignment.
 */
export function reduceColors(assign: number[], labs: Lab[], max: number): number[] {
  const counts = new Map<number, number>();
  for (const a of assign) if (a >= 0) counts.set(a, (counts.get(a) ?? 0) + 1);
  const remap = new Map<number, number>();
  for (const k of counts.keys()) remap.set(k, k);
  while (counts.size > max && counts.size > 1) {
    let least = -1;
    let leastN = Infinity;
    for (const [k, n] of counts) if (n < leastN) { leastN = n; least = k; }
    let target = -1;
    let bestD = Infinity;
    for (const k of counts.keys()) {
      if (k === least) continue;
      const d = deltaE(labs[least], labs[k]);
      if (d < bestD) { bestD = d; target = k; }
    }
    counts.set(target, counts.get(target)! + leastN);
    counts.delete(least);
    for (const [k, v] of remap) if (v === least) remap.set(k, target);
  }
  return assign.map((a) => (a >= 0 ? remap.get(a)! : a));
}
