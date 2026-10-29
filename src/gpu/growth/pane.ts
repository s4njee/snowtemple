/*
 * Story 4.2: the warm start for frost on a window pane, for the phase-field grower
 * (phase-field.ts). A pane frosts from where it is coldest: its frame, where the cold comes
 * through, and specks of dust or scratches near it, where ice nucleates. The middle of a pane in
 * a heated room stays above freezing, so the undercooling falls away from the cold edge and the
 * frost stops of its own accord, at a ragged line. Each crystal has its own orientation, so the
 * arms point every way across the pane.
 *
 * Built on the CPU once per pane: four floats a cell, as `Grower.writeSeeds` takes them.
 */

export type FrostFrom = 'edges' | 'bottom' | 'corners';

export interface PaneOptions {
  /** Where the cold comes in. */
  from: FrostFrom;
  /** How far in it reaches, as a share of the way to the middle (or the top, from the bottom). */
  reach: number;
  /** The crystals' symmetry, so grains can be oriented within one turn of it. */
  order: number;
  seed: number;
  /** The melting temperature the grower uses, `GrowthSettings.equilibrium`. */
  equilibrium: number;
  /** The glass's temperature at the cold side, below the melting point; 0 by default. */
  cold?: number;
}

/** A hash of two integers and a seed to 0..1, the same on every run. */
export function hash2(x: number, y: number, seed: number): number {
  let h =
    Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise, 0..1, with features `scale` cells across. */
export function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = fx - ix;
  const ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Distance in cells from the cold side, and the distance the cold reaches. */
function coldness(x: number, y: number, cols: number, rows: number, from: FrostFrom) {
  if (from === 'bottom') return { d: rows - 1 - y, span: rows };
  if (from === 'corners') {
    const d = Math.min(
      Math.hypot(x, y),
      Math.hypot(cols - 1 - x, y),
      Math.hypot(x, rows - 1 - y),
      Math.hypot(cols - 1 - x, rows - 1 - y),
    );
    return { d, span: Math.hypot(cols, rows) / 2 };
  }
  return { d: Math.min(x, y, cols - 1 - x, rows - 1 - y), span: Math.min(cols, rows) / 2 };
}

export function paneSeeds(cols: number, rows: number, options: PaneOptions): Float32Array {
  const { from, reach, order, seed, equilibrium } = options;
  const cold = options.cold ?? 0;
  const seeds = new Float32Array(cols * rows * 4);
  // Nuclei: places along the cold side, and a few specks of dust or scratches in from it, each a
  // small disc of ice. Each is one crystal, with its own orientation, and few enough that each has
  // the room and the undercooling to grow big and branch: crowded, they share out the cold and
  // stay small, compact blobs.
  const nuclei: { x: number; y: number; angle: number }[] = [];
  const spacing = 110;
  const add = (x: number, y: number, k: number) =>
    nuclei.push({ x, y, angle: (hash2(k, 7, seed + 13) * 2 * Math.PI) / order });
  if (from === 'corners') {
    [
      [0, 0],
      [cols - 1, 0],
      [0, rows - 1],
      [cols - 1, rows - 1],
    ].forEach(([x, y], k) => add(x!, y!, k));
  } else {
    // Along the frame, `spacing` cells apart give or take a third.
    const sides: [number, number, number, number][] =
      from === 'bottom'
        ? [[0, rows - 1, 1, 0]]
        : [
            [0, 0, 1, 0],
            [cols - 1, 0, 0, 1],
            [cols - 1, rows - 1, -1, 0],
            [0, rows - 1, 0, -1],
          ];
    let k = 0;
    for (const [x0, y0, dx, dy] of sides) {
      const length = dx !== 0 ? cols : rows;
      for (
        let t = spacing * hash2(k, 3, seed);
        t < length;
        t += spacing * (0.67 + 0.66 * hash2(k, 4, seed))
      ) {
        add(x0 + dx * t, y0 + dy * t, k++);
      }
    }
  }
  const specks = Math.max(2, Math.round((cols * rows) / 40000));
  for (let k = 0, placed = 0; placed < specks && k < specks * 40; k++) {
    const x = hash2(k, 1, seed + 21) * cols;
    const y = hash2(k, 2, seed + 21) * rows;
    const { d, span } = coldness(x, y, cols, rows, from);
    if (d > 8 && d < span * reach * 0.5) {
      add(x, y, 100 + k);
      placed++;
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4;
      const { d, span } = coldness(x, y, cols, rows, from);
      // The cold's reach wanders along the pane, by a quarter either way.
      const along = from === 'bottom' ? x : x + y;
      const limit = span * reach * (0.75 + 0.5 * valueNoise(along, 0, 40, seed + 31));
      // Ice at the nuclei; everywhere, the orientation of the nearest one, whose crystal it is.
      let ice = 0;
      let nearest = Infinity;
      let angle = 0;
      for (const n of nuclei) {
        const r2 = (x - n.x) ** 2 + (y - n.y) ** 2;
        if (r2 < 6.25) ice = 1;
        if (r2 < nearest) {
          nearest = r2;
          angle = n.angle;
        }
      }
      seeds[i] = ice;
      // Undercooled at the cold side, warming through the melting point at the reach.
      const t = Math.min(1, Math.max(0, (d - limit * 0.7) / (limit * 0.4)));
      seeds[i + 1] = cold + (equilibrium * 1.15 - cold) * t * t * (3 - 2 * t);
      seeds[i + 2] = angle;
      seeds[i + 3] = 1;
    }
  }
  return seeds;
}
