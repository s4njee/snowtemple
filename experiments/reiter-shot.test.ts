import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { createReiter, CRYSTALS, type CrystalKind } from '../src/gpu/growth/reiter.ts';
import { getTestDevice } from '../tests/gpu.ts';

// Each kind of crystal: steps until the ice reaches 85% of the grid's radius, and a picture.
it('reiter shot', async () => {
  const device = await getTestDevice();
  const R = 160;
  const side = 2 * R + 1;
  const lines: string[] = [];
  for (const kind of Object.keys(CRYSTALS) as CrystalKind[]) {
    const c = CRYSTALS[kind];
    const flake = createReiter(device, { radius: R });
    let encoder = device.createCommandEncoder();
    flake.start(encoder, {
      alpha: c.alpha,
      beta: c.beta,
      gamma: c.gamma,
      roughness: Number(process.env.ROUGH ?? 0),
      seed: 1,
    });
    device.queue.submit([encoder.finish()]);
    const read = device.createBuffer({
      size: side * side * 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    let cells = new Float32Array(0);
    let reached = 0;
    let steps = 0;
    for (; steps < 20000 && reached < 0.85 * R; steps += 100) {
      encoder = device.createCommandEncoder();
      flake.step(encoder, 100);
      encoder.copyBufferToBuffer(flake.state, 0, read, 0, side * side * 16);
      device.queue.submit([encoder.finish()]);
      await read.mapAsync(GPUMapMode.READ);
      cells = new Float32Array(read.getMappedRange().slice(0));
      read.unmap();
      reached = 0;
      for (let y = 0; y < side; y++)
        for (let x = 0; x < side; x++) {
          if (cells[(y * side + x) * 4]! >= 1) {
            const q = x - R,
              r = y - R;
            reached = Math.max(reached, Math.hypot(q + r / 2, (r * Math.sqrt(3)) / 2));
          }
        }
    }
    lines.push(`${kind}: ${steps} steps, reach ${reached.toFixed(0)}`);
    // Picture: resample the axial grid to a square image.
    const N = 320;
    const rgb = Buffer.alloc(N * N * 3);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const px = ((i / N) * 2 - 1) * R,
          py = ((j / N) * 2 - 1) * R;
        const r = Math.round(py / (Math.sqrt(3) / 2));
        const q = Math.round(px - r / 2);
        const x = q + R,
          y = r + R;
        let v = 0;
        if (x >= 0 && y >= 0 && x < side && y < side) {
          const s = cells[(y * side + x) * 4]!;
          v = s >= 1 ? Math.min(255, 120 + (s - 1) * 400) : s * 60;
        }
        rgb[(j * N + i) * 3] = v;
        rgb[(j * N + i) * 3 + 1] = v;
        rgb[(j * N + i) * 3 + 2] = Math.min(255, v + 30);
      }
    writeFileSync(
      `output/reiter-${kind.replace(' ', '-')}.ppm`,
      Buffer.concat([Buffer.from(`P6 ${N} ${N} 255\n`), rgb]),
    );
    flake.destroy();
  }
  writeFileSync('output/reiter.txt', lines.join('\n'));
}, 900000);
