/*
 * Story 3.1: snow piled on the page's edges, as a height per column. TypeScript twin of the
 * passes in pile.wgsl, for tests and for the notes' numbers. Heights and positions are in CSS
 * pixels; a column is one CSS pixel of an edge (wider edges than `MAX_COLUMNS` stretch theirs).
 *
 * One step, as the GPU runs it:
 *   1. Supply: snow arrives at `rate` px a second where the column is open to the sky, tapering
 *      to nothing as the pile nears `depth` (the storm runs out), and melts at `melt` px a
 *      second, faster where the pile is thin, so it pulls back from the ends first.
 *   2. Wind: a share of each column's surface snow moves one column downwind (saltation).
 *   3. Relaxation, a few times: wherever a column stands more than `talus` above a neighbour (the
 *      angle of repose, as a rise per column), a quarter of the excess moves to it. Both sides of
 *      every exchange are worked out from the same old heights, so no snow is made or lost,
 *      except past the ends of the edge, where it falls off.
 *
 * Fearing, "Computer Modelling of Fallen Snow" (SIGGRAPH 2000), piles by the same angle of repose.
 */

/** Columns per edge at most. */
export const MAX_COLUMNS = 2048;

export interface PileSettings {
  /** Snow supply, px a second. */
  rate: number;
  /** Depth at which the supply has stopped, px. */
  depth: number;
  /** Rise per column that starts snow moving: tan of the angle of repose. */
  talus: number;
  /** Share of surface snow moved one column downwind per step; its sign is the wind's direction. */
  wind: number;
  /** Melt, px a second. */
  melt: number;
  /** At the downwind end, the share of the outflow off the end held back as a cornice. */
  cornice: number;
}

/** The supply at a column of height h, px per second. */
export function supply(h: number, s: PileSettings, open = true): number {
  if (!open || s.depth <= 0) return 0;
  const t = Math.min(1, Math.max(0, h / s.depth));
  return s.rate * (1 - t * t * (3 - 2 * t));
}

/** Melt at a column of height h: faster where it is thin, never below zero. */
export function melted(h: number, s: PileSettings, dt: number): number {
  if (s.melt <= 0) return h;
  const thin = 1 + 2 * Math.exp(-h / 2);
  const left = h - s.melt * thin * dt;
  // Snow thinner than a fiftieth of a pixel is gone: a pile melts to exactly zero.
  return left < 0.02 ? 0 : left;
}

/** Wind transport: `wind` of each column's snow (at most a pixel) moves one column downwind. */
export function blow(h: Float64Array, s: PileSettings): Float64Array<ArrayBuffer> {
  const n = h.length;
  const out = new Float64Array(n);
  const w = Math.abs(s.wind);
  const dir = Math.sign(s.wind);
  const moved = (i: number) => (i >= 0 && i < n ? w * Math.min(h[i]!, 1) : 0);
  for (let i = 0; i < n; i++) {
    let v = h[i]! - moved(i) + moved(i - dir);
    // The upwind end gets nothing from beyond it; the downwind end's share falls off, less the cornice.
    if ((dir > 0 && i === n - 1) || (dir < 0 && i === 0)) v += moved(i) * s.cornice;
    out[i] = v;
  }
  return out;
}

/** The flow from a column of height a to a neighbour of height b in one relaxation. */
export function slide(a: number, b: number, talus: number): number {
  return 0.25 * Math.max(0, a - b - talus);
}

/**
 * One relaxation. Beyond each end is a drop, treated as a neighbour of height 0, except that at
 * the downwind end `cornice` of the flow is held back.
 */
export function relax(h: Float64Array, s: PileSettings): Float64Array<ArrayBuffer> {
  const n = h.length;
  const out = new Float64Array(n);
  const keep = (end: 'left' | 'right') =>
    (end === 'right' && s.wind > 0) || (end === 'left' && s.wind < 0) ? s.cornice : 0;
  for (let i = 0; i < n; i++) {
    const self = h[i]!;
    const left = i > 0 ? h[i - 1]! : 0;
    const right = i < n - 1 ? h[i + 1]! : 0;
    let v = self - slide(self, left, s.talus) - slide(self, right, s.talus);
    if (i > 0) v += slide(left, self, s.talus);
    if (i < n - 1) v += slide(right, self, s.talus);
    if (i === 0) v += slide(self, 0, s.talus) * keep('left');
    if (i === n - 1) v += slide(self, 0, s.talus) * keep('right');
    out[i] = v;
  }
  return out;
}

/** An edge's heights resampled to a new number of columns, keeping the total. */
export function resample(h: Float64Array, columns: number): Float64Array<ArrayBuffer> {
  const n = h.length;
  const out = new Float64Array(columns);
  if (n === 0 || columns === 0) return out;
  // Each new column takes the old heights over its span of the old edge, by overlap.
  const scale = n / columns;
  for (let i = 0; i < columns; i++) {
    const a = i * scale;
    const b = (i + 1) * scale;
    let sum = 0;
    for (let j = Math.floor(a); j < Math.min(n, Math.ceil(b)); j++) {
      sum += h[j]! * (Math.min(b, j + 1) - Math.max(a, j));
    }
    out[i] = sum;
  }
  return out;
}

/** One full step: supply and melt, wind, then `iterations` relaxations. */
export function step(
  h: Float64Array,
  s: PileSettings,
  dt: number,
  iterations = 4,
  open?: (i: number) => boolean,
): Float64Array<ArrayBuffer> {
  let next: Float64Array<ArrayBuffer> = Float64Array.from(h, (v, i) =>
    melted(v + supply(v, s, open?.(i) ?? true) * dt, s, dt),
  );
  if (s.wind !== 0) next = blow(next, s);
  for (let k = 0; k < iterations; k++) next = relax(next, s);
  return next;
}

export const total = (h: Float64Array) => h.reduce((a, b) => a + b, 0);
