import { describe, expect, it } from 'vitest';
import {
  createGrower,
  KOBAYASHI,
  plantCpu,
  stepCpu,
  type Grower,
  type GrowthSettings,
} from '../src/gpu/growth/phase-field.ts';
import { effect as snowflake, growthZoom } from '../src/effects/snowflake/index.ts';
import { createReiter, CRYSTALS, startReiter, stepReiter } from '../src/gpu/growth/reiter.ts';
import { MOTION_CAPS } from '../src/gpu/safety/motion.ts';
import { DEFAULT_DOSE, STRONG_DOSE } from '../src/gpu/safety/dose.ts';
import { getTestDevice } from './gpu.ts';

// Story 4.1: the phase-field grower. The shader against its CPU twin; a six-fold crystal grows
// six arms; arrival only increases away from the seed; the same seed grows the same crystal.

/** A disc of ice `radius` cells across at (cx, cy), in undercooled liquid. */
function disc(width: number, height: number, cx: number, cy: number, radius: number, theta = 0) {
  const seeds = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      seeds[i] = Math.hypot(x - cx, y - cy) < radius ? 1 : 0;
      seeds[i + 2] = theta;
      seeds[i + 3] = 1;
    }
  }
  return seeds;
}

async function readState(device: GPUDevice, grower: Grower): Promise<Float32Array> {
  const size = grower.width * grower.height * 16;
  const read = device.createBuffer({
    size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(grower.state, 0, read, 0, size);
  device.queue.submit([encoder.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const cells = new Float32Array(read.getMappedRange().slice(0));
  read.destroy();
  return cells;
}

async function growGpu(
  device: GPUDevice,
  width: number,
  height: number,
  seeds: Float32Array,
  steps: number,
  settings: GrowthSettings = KOBAYASHI,
) {
  const grower = createGrower(device, { width, height, settings });
  grower.writeSeeds(seeds);
  let encoder = device.createCommandEncoder();
  grower.plant(encoder);
  device.queue.submit([encoder.finish()]);
  for (let done = 0; done < steps; done += 500) {
    encoder = device.createCommandEncoder();
    grower.step(encoder, Math.min(500, steps - done));
    device.queue.submit([encoder.finish()]);
  }
  const cells = await readState(device, grower);
  grower.destroy();
  return cells;
}

describe('phase-field grower', () => {
  it('matches its CPU twin, across workgroup tiles', async () => {
    const device = await getTestDevice();
    const W = 40;
    const H = 36;
    const seeds = disc(W, H, 17, 15, 5, 0.3);
    const steps = 60;
    const gpu = await growGpu(device, W, H, seeds, steps);
    let cpu = plantCpu(W, H, seeds);
    for (let s = 0; s < steps; s++) cpu = stepCpu(cpu, KOBAYASHI);
    let worst = 0;
    for (let i = 0; i < W * H; i++) {
      worst = Math.max(worst, Math.abs(gpu[i * 4]! - cpu.cells[i * 4]!));
      worst = Math.max(worst, Math.abs(gpu[i * 4 + 1]! - cpu.cells[i * 4 + 1]!));
    }
    expect(worst).toBeLessThan(1e-3);
    expect(gpu[3]).toBe(steps);
  });

  it('grows six arms with six-fold anisotropy, and four with four-fold', async () => {
    const device = await getTestDevice();
    const N = 240;
    for (const order of [6, 4]) {
      const cells = await growGpu(device, N, N, disc(N, N, N / 2, N / 2, 4), 3000, {
        ...KOBAYASHI,
        order,
        delta: order === 6 ? 0.04 : 0.02,
      });
      // The ice's reach in each direction: arms reach far, the gaps between them do not. The
      // arms are the runs of directions reaching past 70% of the farthest tip (a circle at a
      // fixed radius would also cut the side branches).
      const bins = 360;
      const reach = new Array<number>(bins).fill(0);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          if (cells[(y * N + x) * 4]! < 0.5) continue;
          const bin = Math.floor(
            ((Math.atan2(y - N / 2, x - N / 2) / (2 * Math.PI) + 1) % 1) * bins,
          );
          reach[bin] = Math.max(reach[bin]!, Math.hypot(x - N / 2, y - N / 2));
        }
      }
      // Each direction takes the farthest reach within 3 degrees, so a thin arm's ragged tip is
      // one run.
      const near = reach.map((_, k) =>
        Math.max(...[-3, -2, -1, 0, 1, 2, 3].map((d) => reach[(k + d + bins) % bins]!)),
      );
      const far = Math.max(...near) * 0.7;
      let runs = 0;
      for (let k = 0; k < bins; k++)
        if (near[k]! > far && near[(k + bins - 1) % bins]! <= far) runs++;
      expect(runs, `order ${order}`).toBe(order);
    }
  });

  it('only freezes outward: every frozen cell has a neighbour that froze before it', async () => {
    const device = await getTestDevice();
    const N = 160;
    const cells = await growGpu(device, N, N, disc(N, N, 60, 90, 4, 0.4), 2500);
    let checked = 0;
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const arrival = cells[(y * N + x) * 4 + 2]!;
        if (arrival <= 0) continue;
        let earlier = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const other = cells[((y + dy) * N + x + dx) * 4 + 2]!;
            if ((dx || dy) && other >= 0 && other < arrival) earlier = true;
          }
        }
        expect(earlier, `cell ${x}, ${y} froze at ${arrival} with no earlier neighbour`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(2000);
  });

  it('grows the same crystal from the same seed, and another from another', async () => {
    const device = await getTestDevice();
    const N = 128;
    const seeds = disc(N, N, 64, 64, 4);
    const a = await growGpu(device, N, N, seeds, 1500);
    const b = await growGpu(device, N, N, seeds, 1500);
    const c = await growGpu(device, N, N, seeds, 1500, { ...KOBAYASHI, seed: 2 });
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
    expect(Buffer.from(a.buffer).equals(Buffer.from(c.buffer))).toBe(false);
  });
});

// Story 4.4: Reiter's automaton, against its CPU twin, and the snowflake's growth under the
// zoom cap.
describe('snow crystal automaton', () => {
  it('matches its CPU twin', async () => {
    const device = await getTestDevice();
    const radius = 24;
    const side = 2 * radius + 1;
    const c = CRYSTALS['sectored plate'];
    const settings = { alpha: c.alpha, beta: c.beta, gamma: c.gamma, roughness: 0, seed: 1 };
    const flake = createReiter(device, { radius });
    let encoder = device.createCommandEncoder();
    flake.start(encoder, settings);
    flake.step(encoder, 120);
    device.queue.submit([encoder.finish()]);
    const read = device.createBuffer({
      size: side * side * 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(flake.state, 0, read, 0, side * side * 16);
    device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const gpu = new Float32Array(read.getMappedRange().slice(0));
    let cpu = startReiter(radius, c.beta);
    for (let k = 0; k < 120; k++) cpu = stepReiter(cpu, settings);
    let worst = 0;
    let ice = 0;
    for (let i = 0; i < side * side; i++) {
      worst = Math.max(worst, Math.abs(gpu[i * 4]! - cpu.water[i]!));
      if (cpu.water[i]! >= 1) ice++;
    }
    expect(worst).toBeLessThan(1e-4);
    expect(ice).toBeGreaterThan(30);
    flake.destroy();
  });

  it('grows six-fold: the CPU grid is the same turned by 60 degrees', () => {
    const radius = 30;
    const side = 2 * radius + 1;
    const c = CRYSTALS['stellar dendrite'];
    let grid = startReiter(radius, c.beta);
    for (let k = 0; k < 400; k++) grid = stepReiter(grid, c);
    // A turn by 60 degrees in axial coordinates: (q, r) -> (-r, q + r).
    let worst = 0;
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const q = x - radius;
        const r = y - radius;
        if (Math.abs(q) > radius || Math.abs(r) > radius || Math.abs(q + r) > radius) continue;
        const tq = -r + radius;
        const tr = q + r + radius;
        worst = Math.max(worst, Math.abs(grid.water[y * side + x]! - grid.water[tr * side + tq]!));
      }
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it('grows the snowflake under the zoom cap, at the default and the strong dose', () => {
    const grow = snowflake.params.grow.default;
    expect(growthZoom(grow, DEFAULT_DOSE)).toBeLessThanOrEqual(MOTION_CAPS.zoom);
    expect(growthZoom(grow, STRONG_DOSE)).toBeLessThanOrEqual(MOTION_CAPS.zoom);
  });
});
