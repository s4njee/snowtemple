import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { paneSeeds } from '../src/gpu/growth/pane.ts';
import { createGrower, KOBAYASHI } from '../src/gpu/growth/phase-field.ts';
import { getTestDevice } from '../tests/gpu.ts';

// Frost on a pane: how far it gets, and how fast. Logs the frozen share every 500 steps.
it('pane shot', async () => {
  const device = await getTestDevice();
  const W = Number(process.env.W ?? 320);
  const H = Number(process.env.H ?? 180);
  const total = Number(process.env.STEPS ?? 12000);
  const settings = {
    ...KOBAYASHI,
    order: Number(process.env.ORDER ?? 6),
    delta: Number(process.env.DELTA ?? 0.04),
    cooling: Number(process.env.COOL ?? 0),
    latent: Number(process.env.K ?? 2.2),
    noise: Number(process.env.NOISE ?? 0.01),
  };
  const grower = createGrower(device, { width: W, height: H, settings });
  grower.writeSeeds(
    paneSeeds(W, H, {
      from: (process.env.FROM ?? 'edges') as 'edges',
      reach: Number(process.env.REACH ?? 0.7),
      order: settings.order,
      seed: 3,
      equilibrium: 1,
      cold: Number(process.env.COLD ?? 0),
    }),
  );
  let encoder = device.createCommandEncoder();
  grower.plant(encoder);
  device.queue.submit([encoder.finish()]);
  const read = device.createBuffer({
    size: W * H * 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const lines: string[] = [];
  let cells = new Float32Array(0);
  for (let done = 0; done < total; done += 500) {
    encoder = device.createCommandEncoder();
    grower.step(encoder, 500);
    encoder.copyBufferToBuffer(grower.state, 0, read, 0, W * H * 16);
    device.queue.submit([encoder.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    cells = new Float32Array(read.getMappedRange().slice(0));
    read.unmap();
    let frozen = 0;
    for (let i = 0; i < W * H; i++) if (cells[i * 4 + 2]! >= 0) frozen++;
    lines.push(`${done + 500} ${(frozen / (W * H)).toFixed(3)}`);
  }
  writeFileSync('output/pane.txt', lines.join('\n'));
  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const a = cells[i * 4 + 2]!;
    const v = Math.round(cells[i * 4]! * 230);
    rgb[i * 3] = v;
    rgb[i * 3 + 1] = v;
    rgb[i * 3 + 2] = a >= 0 ? v : Math.round(Math.min(1, cells[i * 4 + 1]!) * 90);
  }
  writeFileSync('output/pane.ppm', Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), rgb]));
}, 600000);
