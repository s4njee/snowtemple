import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { createGrower, KOBAYASHI } from '../src/gpu/growth/phase-field.ts';
import { getTestDevice } from '../tests/gpu.ts';

// A look at the phase field: one seed in the middle, STEPS steps, arrival as brightness.
it('growth shot', async () => {
  const device = await getTestDevice();
  const N = Number(process.env.SIZE ?? 300);
  const steps = Number(process.env.STEPS ?? 3000);
  const settings = {
    ...KOBAYASHI,
    order: Number(process.env.ORDER ?? 6),
    delta: Number(process.env.DELTA ?? KOBAYASHI.delta),
    latent: Number(process.env.K ?? KOBAYASHI.latent),
    epsilon: Number(process.env.EPS ?? KOBAYASHI.epsilon),
    noise: Number(process.env.NOISE ?? KOBAYASHI.noise),
  };
  const grower = createGrower(device, { width: N, height: N, settings });
  const seeds = new Float32Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      seeds[i] = Math.hypot(x - N / 2, y - N / 2) < 4 ? 1 : 0;
      seeds[i + 1] = 0;
      seeds[i + 2] = Number(process.env.THETA ?? 0);
      seeds[i + 3] = 1;
    }
  grower.writeSeeds(seeds);
  let encoder = device.createCommandEncoder();
  grower.plant(encoder);
  device.queue.submit([encoder.finish()]);
  const t0 = performance.now();
  for (let done = 0; done < steps; done += 500) {
    encoder = device.createCommandEncoder();
    grower.step(encoder, Math.min(500, steps - done));
    device.queue.submit([encoder.finish()]);
  }
  const read = device.createBuffer({
    size: N * N * 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  encoder = device.createCommandEncoder();
  encoder.copyBufferToBuffer(grower.state, 0, read, 0, N * N * 16);
  device.queue.submit([encoder.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  writeFileSync('output/growth.txt', 'ms ' + (performance.now() - t0).toFixed(0) + '\n');
  const cells = new Float32Array(read.getMappedRange().slice(0));
  const rgb = Buffer.alloc(N * N * 3);
  let frozen = 0;
  for (let i = 0; i < N * N; i++) {
    const a = cells[i * 4 + 2]!;
    const p = cells[i * 4]!;
    if (a >= 0) frozen++;
    const v = a >= 0 ? 255 - Math.round((a / steps) * 180) : 0;
    rgb[i * 3] = v;
    rgb[i * 3 + 1] = v;
    rgb[i * 3 + 2] = a >= 0 ? v : Math.round(p * 120 + Math.max(0, cells[i * 4 + 1]!) * 100);
  }
  writeFileSync(
    'output/growth.txt',
    'frozen ' +
      frozen +
      ' T ' +
      [
        Math.min(...cells.filter((_, i) => i % 4 === 1)),
        Math.max(...cells.filter((_, i) => i % 4 === 1)),
      ].join(' ') +
      '\n',
    { flag: 'a' },
  );
  writeFileSync(`output/growth.ppm`, Buffer.concat([Buffer.from(`P6 ${N} ${N} 255\n`), rgb]));
}, 600000);
