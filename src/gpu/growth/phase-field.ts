import { toHalf } from '../colour/palette-texture.ts';
import { createShader, withChunks } from '../shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../uniforms.ts';
import shader from './phase-field.wgsl';

/*
 * Story 4.1: ice growing by Kobayashi's phase-field model, on the GPU (phase-field.wgsl).
 *
 *   const grower = createGrower(device, { width, height });
 *   // draw the warm start into grower.seeds (phase, temperature, orientation, mobility), then
 *   grower.plant(encoder);
 *   // each frame, as many steps as the reveal needs, then
 *   grower.step(encoder, n);
 *   grower.publish(encoder);   // grower.arrival: the step each cell froze at, filterable
 *
 * Grow once, record when each cell froze, reveal by threshold (Storm Temple 4.1): frost can be
 * scrubbed back and forth by scroll, and thawed, without growing again. The state is `r32float`
 * in effect (f32 in a storage buffer), so the small changes near the front are never lost to a
 * half float's rounding; only the published arrival, a step count, is half float.
 *
 * `stepCpu` is the same step in TypeScript, for tests.
 */

export interface GrowthSettings {
  /** Grid spacing and time step, in the model's own units. */
  dx: number;
  dt: number;
  /** Relaxation time of the phase field. */
  tau: number;
  /** Interface thickness, e_bar. */
  epsilon: number;
  /** Strength of the anisotropy, and its order j: 6 for ice's hexagonal arms, 4 for a cubic one. */
  delta: number;
  order: number;
  /** How hard undercooling drives freezing (alpha), and its steepness (gamma). */
  alpha: number;
  gamma: number;
  /** Latent heat, K: how much freezing warms its surroundings. */
  latent: number;
  /** The melting temperature, T_eq. */
  equilibrium: number;
  /** Interface noise, a: side branches come from it. */
  noise: number;
  /**
   * Heat lost through the glass, c: each cell relaxes at this rate towards its starting
   * temperature. 0 is Kobayashi's closed cell.
   */
  cooling: number;
  /** Seeds the noise, so the same seed grows the same crystal. */
  seed: number;
}

/** Kobayashi's own values (1993, fig. 3), with six-fold anisotropy. */
export const KOBAYASHI: GrowthSettings = {
  dx: 0.03,
  dt: 1e-4,
  tau: 3e-4,
  epsilon: 0.01,
  delta: 0.04,
  order: 6,
  alpha: 0.9,
  gamma: 10,
  latent: 1.8,
  equilibrium: 1,
  noise: 0.01,
  cooling: 0,
  seed: 1,
};

export const GrowParams = defineUniformStruct('GrowParams', {
  width: 'u32',
  height: 'u32',
  seed: 'u32',
  dx: 'f32',
  dt: 'f32',
  tau: 'f32',
  epsilon: 'f32',
  delta: 'f32',
  order: 'f32',
  alpha: 'f32',
  gamma: 'f32',
  latent: 'f32',
  equilibrium: 'f32',
  noise: 'f32',
  cooling: 'f32',
});

/** Bytes per cell: phase, temperature, arrival, steps. */
const CELL_BYTES = 16;

export interface Grower {
  readonly width: number;
  readonly height: number;
  /** The warm start, drawn by the caller: r phase, g temperature, b orientation, a mobility. */
  readonly seeds: GPUTexture;
  /** r the step each cell froze at (unfrozen: its frozen neighbours'), g phase, b body (phase over 5 x 5). */
  readonly arrival: GPUTexture;
  /** The live state, for tests. */
  readonly state: GPUBuffer;
  /** Steps run since `plant`. */
  readonly steps: number;
  settings: GrowthSettings;
  /** Fills `seeds` from the CPU: four floats a cell, as `seeds` holds them. */
  writeSeeds(data: Float32Array): void;
  /** Starts again from `seeds`. */
  plant(encoder: GPUCommandEncoder): void;
  step(
    encoder: GPUCommandEncoder,
    count: number,
    timestampWrites?: GPUComputePassTimestampWrites,
  ): void;
  publish(encoder: GPUCommandEncoder): void;
  destroy(): void;
}

export function createGrower(
  device: GPUDevice,
  options: { width: number; height: number; settings?: GrowthSettings; label?: string },
): Grower {
  const { width, height } = options;
  const label = options.label ?? 'growth';
  let settings = { ...(options.settings ?? KOBAYASHI) };
  const uniforms = createUniformBuffer(device, GrowParams, `${label} params`);
  const module = createShader(device, withChunks(shader, { 'grow-params.wgsl': GrowParams.wgsl }));
  const pipeline = (entryPoint: string) =>
    device.createComputePipeline({
      label: `${label} ${entryPoint}`,
      layout: 'auto',
      compute: { module, entryPoint },
    });
  const grow = pipeline('grow');
  const plant = pipeline('plant');
  const publish = pipeline('publish');
  const seeds = device.createTexture({
    label: `${label} seeds`,
    size: [width, height],
    format: 'rgba16float',
    usage:
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST,
  });
  const arrival = device.createTexture({
    label: `${label} arrival`,
    size: [width, height],
    format: 'rgba16float',
    usage:
      GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  const buffers = [0, 1].map((i) =>
    device.createBuffer({
      label: `${label} state ${i}`,
      size: width * height * CELL_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    }),
  );
  const seedView = seeds.createView();
  const growGroups = [0, 1].map((i) =>
    device.createBindGroup({
      layout: grow.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 1, resource: seedView },
        { binding: 2, resource: { buffer: buffers[i]! } },
        { binding: 3, resource: { buffer: buffers[1 - i]! } },
      ],
    }),
  );
  const plantGroup = device.createBindGroup({
    layout: plant.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniforms.buffer } },
      { binding: 1, resource: seedView },
      { binding: 3, resource: { buffer: buffers[0]! } },
    ],
  });
  const arrivalView = arrival.createView();
  const publishGroups = [0, 1].map((i) =>
    device.createBindGroup({
      layout: publish.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 2, resource: { buffer: buffers[i]! } },
        { binding: 4, resource: arrivalView },
      ],
    }),
  );
  let current = 0;
  let steps = 0;
  const upload = () => {
    uniforms.set({ width, height, ...settings, seed: settings.seed >>> 0 });
    uniforms.upload();
  };
  upload();
  const groups = [Math.ceil(width / 16), Math.ceil(height / 16)] as const;

  return {
    width,
    height,
    seeds,
    arrival,
    get state() {
      return buffers[current]!;
    },
    get steps() {
      return steps;
    },
    get settings() {
      return settings;
    },
    set settings(value) {
      settings = { ...value };
      upload();
    },
    writeSeeds(data) {
      const half = new Uint16Array(data.length);
      for (let i = 0; i < data.length; i++) half[i] = toHalf(data[i]!);
      device.queue.writeTexture({ texture: seeds }, half, { bytesPerRow: width * 8 }, [
        width,
        height,
      ]);
    },
    plant(encoder) {
      upload();
      const pass = encoder.beginComputePass({ label: `${label} plant` });
      pass.setPipeline(plant);
      pass.setBindGroup(0, plantGroup);
      pass.dispatchWorkgroups(...groups);
      pass.end();
      current = 0;
      steps = 0;
    },
    step(encoder, count, timestampWrites) {
      if (count <= 0) return;
      const pass = encoder.beginComputePass({ label: `${label} grow`, timestampWrites });
      pass.setPipeline(grow);
      for (let k = 0; k < count; k++) {
        pass.setBindGroup(0, growGroups[current]!);
        pass.dispatchWorkgroups(...groups);
        current = 1 - current;
      }
      pass.end();
      steps += count;
    },
    publish(encoder) {
      const pass = encoder.beginComputePass({ label: `${label} publish` });
      pass.setPipeline(publish);
      pass.setBindGroup(0, publishGroups[current]!);
      pass.dispatchWorkgroups(...groups);
      pass.end();
    },
    destroy() {
      for (const b of buffers) b.destroy();
      seeds.destroy();
      arrival.destroy();
      uniforms.destroy();
    },
  };
}

/** A grid's state on the CPU, as the GPU lays it out: phase, temperature, arrival, steps. */
export interface CpuGrid {
  width: number;
  height: number;
  cells: Float32Array;
  /** r phase, g temperature, b orientation, a mobility, per cell. */
  seeds: Float32Array;
}

/** hash.wgsl's `pcg_3d(v).x`. */
function pcg3x(x: number, y: number, z: number): number {
  let a = (Math.imul(x, 1664525) + 1013904223) >>> 0;
  let b = (Math.imul(y, 1664525) + 1013904223) >>> 0;
  let c = (Math.imul(z, 1664525) + 1013904223) >>> 0;
  a = (a + Math.imul(b, c)) >>> 0;
  b = (b + Math.imul(c, a)) >>> 0;
  c = (c + Math.imul(a, b)) >>> 0;
  a = (a ^ (a >>> 16)) >>> 0;
  b = (b ^ (b >>> 16)) >>> 0;
  c = (c ^ (c >>> 16)) >>> 0;
  a = (a + Math.imul(b, c)) >>> 0;
  return a;
}

/** The warm start on the CPU (phase-field.wgsl `plant`). */
export function plantCpu(width: number, height: number, seeds: Float32Array): CpuGrid {
  const cells = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    cells[i * 4] = seeds[i * 4]!;
    cells[i * 4 + 1] = seeds[i * 4 + 1]!;
    cells[i * 4 + 2] = seeds[i * 4]! >= 0.5 ? 0 : -1;
    cells[i * 4 + 3] = 0;
  }
  return { width, height, cells, seeds };
}

/** One step on the CPU (phase-field.wgsl `grow`), in f32 where it matters. */
export function stepCpu(grid: CpuGrid, s: GrowthSettings): CpuGrid {
  const { width, height, cells, seeds } = grid;
  const out = new Float32Array(cells.length);
  const idx = (x: number, y: number) =>
    Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x));
  const p = (x: number, y: number) => cells[idx(x, y) * 4]!;
  const t = (x: number, y: number) => cells[idx(x, y) * 4 + 1]!;
  const lap = (f: (x: number, y: number) => number, x: number, y: number) =>
    (4 * (f(x + 1, y) + f(x - 1, y) + f(x, y + 1) + f(x, y - 1)) +
      (f(x + 1, y + 1) + f(x - 1, y + 1) + f(x + 1, y - 1) + f(x - 1, y - 1)) -
      20 * f(x, y)) /
    (6 * s.dx * s.dx);
  const grad = (x: number, y: number): [number, number] => [
    (p(x + 1, y) - p(x - 1, y)) / (2 * s.dx),
    (p(x, y + 1) - p(x, y - 1)) / (2 * s.dx),
  ];
  const theta0 = (x: number, y: number) => seeds[idx(x, y) * 4 + 2]!;
  const direction = (px: number, py: number) =>
    px * px + py * py < 1e-12 ? 0 : Math.atan2(py, px);
  const flux = (x: number, y: number): [number, number] => {
    const [px, py] = grad(x, y);
    const angle = s.order * (direction(px, py) - theta0(x, y));
    const e = s.epsilon * (1 + s.delta * Math.cos(angle));
    const de = -s.epsilon * s.order * s.delta * Math.sin(angle);
    return [e * de * px, e * de * py];
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p0 = cells[i * 4]!;
      const t0 = cells[i * 4 + 1]!;
      const step = cells[i * 4 + 3]!;
      const [px, py] = grad(x, y);
      const e = s.epsilon * (1 + s.delta * Math.cos(s.order * (direction(px, py) - theta0(x, y))));
      const term1 = (flux(x, y + 1)[0] - flux(x, y - 1)[0]) / (2 * s.dx);
      const term2 = -(flux(x + 1, y)[1] - flux(x - 1, y)[1]) / (2 * s.dx);
      const m = (s.alpha / Math.PI) * Math.atan(s.gamma * (s.equilibrium - t0));
      const chi = (pcg3x(x, y, (step ^ (s.seed >>> 0)) >>> 0) >>> 8) / 16777216 - 0.5;
      const reaction = p0 * (1 - p0) * (p0 - 0.5 + m + s.noise * chi);
      const rate = (term1 + term2 + e * e * lap(p, x, y) + reaction) / s.tau;
      const pNew = Math.min(1, Math.max(0, p0 + s.dt * rate * seeds[i * 4 + 3]!));
      out[i * 4] = pNew;
      out[i * 4 + 1] =
        t0 + s.dt * (lap(t, x, y) - s.cooling * (t0 - seeds[i * 4 + 1]!)) + s.latent * (pNew - p0);
      const arrival = cells[i * 4 + 2]!;
      out[i * 4 + 2] = arrival < 0 && pNew >= 0.5 ? step + 1 : arrival;
      out[i * 4 + 3] = step + 1;
    }
  }
  return { width, height, cells: out, seeds };
}
