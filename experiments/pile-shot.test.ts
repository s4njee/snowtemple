import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { createPiles } from '../src/gpu/pile/piles.ts';
import { getTestDevice, readTexture } from '../tests/gpu.ts';

// A look at settled snow: three edges, two minutes of snow with wind, over a dark and a light page.
it('pile shot', async () => {
  const device = await getTestDevice();
  const W = 400;
  const H = 200;
  const dpr = 2;
  const piles = createPiles(device, { format: 'rgba8unorm' });
  const edges = [
    { key: 'a', x: 30, top: 70, width: 160, bottom: 120 },
    { key: 'b', x: 230, top: 110, width: 140, bottom: 160 },
    { key: 'c', x: 60, top: 150, width: 90, bottom: 190 },
  ];
  const settings = { rate: 0.5, depth: 12, start: 5, talus: 0.7, wind: Number(process.env.WIND ?? 0.02), melt: 0, cornice: 0.6, drip: 0, fall: 70, windSpeed: 10, variation: 0.5 };
  for (let f = 0; f < 60 * 20; f++) {
    const encoder = device.createCommandEncoder();
    piles.update(encoder, { width: W, height: H, dpr, dt: 1 / 60, time: f / 60, edges, settings });
    device.queue.submit([encoder.finish()]);
  }
  // MELT=seconds: then melt, wet and slumping, dripping off the ends.
  const melting = { ...settings, rate: 0, melt: 0.6, talus: Math.tan((20 * Math.PI) / 180), drip: 4 };
  for (let f = 0; f < 60 * Number(process.env.MELT ?? 0); f++) {
    const encoder = device.createCommandEncoder();
    piles.update(encoder, { width: W, height: H, dpr, dt: 1 / 60, time: 20 + f / 60, edges, settings: melting });
    device.queue.submit([encoder.finish()]);
  }
  for (const [name, bg] of [['dark', [0.06, 0.07, 0.09]], ['light', [0.97, 0.97, 0.98]]] as const) {
    const texture = device.createTexture({ size: [W * dpr, H * dpr], format: 'rgba8unorm', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: texture.createView(), loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store' }] });
    piles.draw(pass);
    pass.end();
    device.queue.submit([encoder.finish()]);
    const px = await readTexture(device, texture);
    const w = W * dpr;
    const h = H * dpr;
    const rgb = Buffer.alloc(w * h * 3);
    const enc = (v: number) => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
    const dec = (b: number) => ((b / 255 + 0.055) / 1.055) ** 2.4;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Edges drawn as element boxes for context.
      let base: readonly number[] = bg;
      for (const e of edges) if (x / dpr >= e.x && x / dpr <= e.x + e.width && y / dpr >= e.top && y / dpr <= e.bottom) base = name === 'dark' ? [0.12, 0.13, 0.16] : [0.85, 0.87, 0.9];
      const a = px[i * 4 + 3]! / 255;
      for (let k = 0; k < 3; k++) {
        // The target is linear premultiplied (rgba8unorm), so composite in linear light.
        const c = px[i * 4 + k]! / 255 + base[k]! * (1 - a);
        rgb[i * 3 + k] = enc(Math.min(1, c));
      }
      void dec;
    }
    writeFileSync(`output/pile-${name}.ppm`, Buffer.concat([Buffer.from(`P6 ${w} ${h} 255\n`), rgb]));
    texture.destroy();
  }
}, 300000);
