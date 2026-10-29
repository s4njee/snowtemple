import { createShader, withChunks } from '../shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../uniforms.ts';
import shader from './reiter.wgsl';

/*
 * Story 4.4: a snow crystal grown by Reiter's hexagonal cellular automaton (reiter.wgsl), on the
 * GPU, with the same step in TypeScript (`stepReiter`) for tests.
 *
 *   const flake = createReiter(device, { radius: 160 });
 *   flake.start(encoder, settings);
 *   flake.step(encoder, n);      // a few hundred steps a second while it grows
 *   flake.publish(encoder);      // flake.arrival: when each cell froze, its water, ice or not
 *
 * Grown once, then drawn as a texture read through the D6 fold, so it costs nothing to keep on
 * screen. The grid is axial: cell (q, r) sits at q (1, 0) + r (1/2, sqrt 3 / 2) and is stored at
 * (q + radius, r + radius).
 */

export interface ReiterSettings {
  /** Diffusion of vapour. */
  alpha: number;
  /** Water everywhere at the start, and at the edge: the air's humidity. */
  beta: number;
  /** Vapour added to receptive cells each step. */
  gamma: number;
  /** How uneven the starting water is, as a share of beta: each seed's side branches its own. */
  roughness: number;
  seed: number;
}

/**
 * Regions of Reiter's parameter space (his fig. 4, alpha = 1) and what grows there, with the
 * steps each takes for its ice to reach 85% of the way across a grid of radius 160 (measured:
 * experiments/reiter-shot.test.ts). Drier air (lower beta) grows slower, finer crystals.
 */
export const CRYSTALS = {
  'stellar dendrite': { alpha: 1, beta: 0.4, gamma: 0.0001, steps: 3000 },
  'fern dendrite': { alpha: 1, beta: 0.35, gamma: 0.001, steps: 4100 },
  'sectored plate': { alpha: 1, beta: 0.55, gamma: 0.002, steps: 1100 },
  'stellar plate': { alpha: 1, beta: 0.8, gamma: 0.002, steps: 300 },
} as const;

export type CrystalKind = keyof typeof CRYSTALS;

export const ReiterParams = defineUniformStruct('ReiterParams', {
  radius: 'u32',
  seed: 'u32',
  alpha: 'f32',
  beta: 'f32',
  gamma: 'f32',
  roughness: 'f32',
});

export interface Reiter {
  readonly radius: number;
  /** r the step each cell froze at (not yet: the next step), g its water, b ice (1 or 0), a the water above 1. Axial. */
  readonly arrival: GPUTexture;
  readonly state: GPUBuffer;
  readonly steps: number;
  start(encoder: GPUCommandEncoder, settings: ReiterSettings): void;
  step(
    encoder: GPUCommandEncoder,
    count: number,
    timestampWrites?: GPUComputePassTimestampWrites,
  ): void;
  publish(encoder: GPUCommandEncoder): void;
  destroy(): void;
}

export function createReiter(
  device: GPUDevice,
  options: { radius: number; label?: string },
): Reiter {
  const { radius } = options;
  const label = options.label ?? 'snowflake';
  const side = 2 * radius + 1;
  const uniforms = createUniformBuffer(device, ReiterParams, `${label} params`);
  const module = createShader(
    device,
    withChunks(shader, { 'reiter-params.wgsl': ReiterParams.wgsl }),
  );
  const pipeline = (entryPoint: string) =>
    device.createComputePipeline({
      label: `${label} ${entryPoint}`,
      layout: 'auto',
      compute: { module, entryPoint },
    });
  const divide = pipeline('divide');
  const diffuse = pipeline('diffuse');
  const startPipeline = pipeline('start');
  const publishPipeline = pipeline('publish');
  const buffers = [0, 1].map((i) =>
    device.createBuffer({
      label: `${label} state ${i}`,
      size: side * side * 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    }),
  );
  const split = device.createBuffer({
    label: `${label} split`,
    size: side * side * 8,
    usage: GPUBufferUsage.STORAGE,
  });
  const arrival = device.createTexture({
    label: `${label} arrival`,
    size: [side, side],
    format: 'rgba16float',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  const u = { buffer: uniforms.buffer };
  const divideGroups = [0, 1].map((i) =>
    device.createBindGroup({
      layout: divide.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: u },
        { binding: 1, resource: { buffer: buffers[i]! } },
        { binding: 3, resource: { buffer: split } },
      ],
    }),
  );
  const diffuseGroups = [0, 1].map((i) =>
    device.createBindGroup({
      layout: diffuse.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: u },
        { binding: 1, resource: { buffer: buffers[i]! } },
        { binding: 2, resource: { buffer: buffers[1 - i]! } },
        { binding: 3, resource: { buffer: split } },
      ],
    }),
  );
  const startGroup = device.createBindGroup({
    layout: startPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: u },
      { binding: 2, resource: { buffer: buffers[0]! } },
    ],
  });
  const arrivalView = arrival.createView();
  const publishGroups = [0, 1].map((i) =>
    device.createBindGroup({
      layout: publishPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: u },
        { binding: 1, resource: { buffer: buffers[i]! } },
        { binding: 4, resource: arrivalView },
      ],
    }),
  );
  const groups = Math.ceil(side / 16);
  let current = 0;
  let steps = 0;
  return {
    radius,
    arrival,
    get state() {
      return buffers[current]!;
    },
    get steps() {
      return steps;
    },
    start(encoder, settings) {
      uniforms.set({ radius, ...settings, seed: settings.seed >>> 0 });
      uniforms.upload();
      const pass = encoder.beginComputePass({ label: `${label} start` });
      pass.setPipeline(startPipeline);
      pass.setBindGroup(0, startGroup);
      pass.dispatchWorkgroups(groups, groups);
      pass.end();
      current = 0;
      steps = 0;
    },
    step(encoder, count, timestampWrites) {
      if (count <= 0) return;
      const pass = encoder.beginComputePass({ label: `${label} grow`, timestampWrites });
      for (let k = 0; k < count; k++) {
        pass.setPipeline(divide);
        pass.setBindGroup(0, divideGroups[current]!);
        pass.dispatchWorkgroups(groups, groups);
        pass.setPipeline(diffuse);
        pass.setBindGroup(0, diffuseGroups[current]!);
        pass.dispatchWorkgroups(groups, groups);
        current = 1 - current;
      }
      pass.end();
      steps += count;
    },
    publish(encoder) {
      const pass = encoder.beginComputePass({ label: `${label} publish` });
      pass.setPipeline(publishPipeline);
      pass.setBindGroup(0, publishGroups[current]!);
      pass.dispatchWorkgroups(groups, groups);
      pass.end();
    },
    destroy() {
      for (const b of buffers) b.destroy();
      split.destroy();
      arrival.destroy();
      uniforms.destroy();
    },
  };
}

/** Reiter's grid on the CPU: water per cell, axial layout, `radius` about the centre. */
export interface ReiterGrid {
  radius: number;
  water: Float64Array;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
];

function inside(radius: number, x: number, y: number): boolean {
  const q = x - radius;
  const r = y - radius;
  const side = 2 * radius + 1;
  return (
    x >= 0 &&
    y >= 0 &&
    x < side &&
    y < side &&
    Math.abs(q) <= radius &&
    Math.abs(r) <= radius &&
    Math.abs(q + r) <= radius
  );
}

/** The start, without roughness: beta everywhere, ice at the centre. */
export function startReiter(radius: number, beta: number): ReiterGrid {
  const side = 2 * radius + 1;
  const water = new Float64Array(side * side).fill(beta);
  water[radius * side + radius] = 1;
  return { radius, water };
}

/** One step on the CPU (reiter.wgsl `divide` then `diffuse`). */
export function stepReiter(
  grid: ReiterGrid,
  s: Pick<ReiterSettings, 'alpha' | 'beta' | 'gamma'>,
): ReiterGrid {
  const { radius, water } = grid;
  const side = 2 * radius + 1;
  const at = (x: number, y: number) => (inside(radius, x, y) ? water[y * side + x]! : s.beta);
  const u = new Float64Array(side * side);
  const v = new Float64Array(side * side);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = y * side + x;
      if (!inside(radius, x, y)) {
        u[i] = s.beta;
        continue;
      }
      const w = water[i]!;
      const receptive = w >= 1 || NEIGHBOURS.some(([dx, dy]) => at(x + dx, y + dy) >= 1);
      if (receptive) v[i] = w + s.gamma;
      else u[i] = w;
    }
  }
  const out = new Float64Array(side * side);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = y * side + x;
      if (!inside(radius, x, y)) {
        out[i] = s.beta;
        continue;
      }
      let around = 0;
      for (const [dx, dy] of NEIGHBOURS) {
        around += inside(radius, x + dx, y + dy) ? u[(y + dy) * side + x + dx]! : s.beta;
      }
      out[i] = u[i]! + s.alpha * 0.5 * (around / 6 - u[i]!) + v[i]!;
    }
  }
  return { radius, water: out };
}
