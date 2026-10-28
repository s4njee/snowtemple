import { describe, expect, it } from 'vitest';
import { blow, relax, resample, step, total, type PileSettings } from '../src/gpu/pile/pile.ts';

// Story 3.1: snow on an edge keeps its mass except where it falls off, never stands steeper than
// its angle of repose, keeps its total through a resize, and melts to exactly zero.

const calm: PileSettings = { rate: 0, depth: 12, talus: 0.6, wind: 0, melt: 0, cornice: 0.5 };

const spike = (n: number, at: number, height: number) => {
  const h = new Float64Array(n);
  h[at] = height;
  return h;
};

describe('snow on an edge', () => {
  it('conserves snow when it relaxes away from the ends', () => {
    let h = spike(200, 100, 40);
    for (let k = 0; k < 500; k++) h = relax(h, calm);
    expect(total(h)).toBeCloseTo(40, 9);
  });

  it('loses only what falls off the ends', () => {
    let h = Float64Array.from({ length: 50 }, () => 10);
    const before = total(h);
    for (let k = 0; k < 2000; k++) h = relax(h, calm);
    expect(total(h)).toBeLessThan(before);
    // What is left stands at the angle of repose from each end: a ridge, with no snow made.
    expect(total(h)).toBeGreaterThan(0.5 * before);
  });

  it('never stands steeper than the angle of repose once settled', () => {
    let h = spike(120, 60, 60);
    for (let k = 0; k < 3000; k++) h = relax(h, calm);
    for (let i = 1; i < h.length; i++) {
      expect(Math.abs(h[i]! - h[i - 1]!)).toBeLessThanOrEqual(calm.talus * 1.02 + 1e-9);
    }
  });

  it('keeps the total through a resize, wider or narrower', () => {
    const h = Float64Array.from({ length: 300 }, (_, i) => 5 + 3 * Math.sin(i / 17));
    for (const columns of [450, 300, 173, 97, 640]) {
      expect(total(resample(h, columns))).toBeCloseTo(total(h), 6);
    }
  });

  it('moves snow downwind and keeps a cornice at the lee end', () => {
    const windy = { ...calm, wind: 0.2 };
    let h = Float64Array.from({ length: 100 }, () => 4);
    for (let k = 0; k < 100; k++) h = blow(h, windy);
    // Stripped from the windward end, built up at the lee end.
    expect(h[0]!).toBeLessThan(1);
    expect(h[99]!).toBeGreaterThan(8);
    // Snow blown past the lee end falls off, less what the cornice holds.
    expect(total(h)).toBeLessThan(400);
  });

  it('builds to its depth and no further, and melts to exactly zero', () => {
    const snowing = { ...calm, rate: 6, depth: 12 };
    let h = new Float64Array(80);
    for (let k = 0; k < 60 * 30; k++) h = step(h, snowing, 1 / 60);
    const top = Math.max(...h);
    expect(top).toBeGreaterThan(10);
    expect(top).toBeLessThanOrEqual(12.01);
    const melting = { ...calm, melt: 1.5 };
    for (let k = 0; k < 60 * 20; k++) h = step(h, melting, 1 / 60);
    expect(total(h)).toBe(0);
  });

  it('lands nothing on a column shaded from the sky', () => {
    const snowing = { ...calm, rate: 6 };
    const h = step(new Float64Array(10), snowing, 1, 0, (i) => i !== 4);
    expect(h[4]).toBe(0);
    expect(h[3]).toBeGreaterThan(0);
  });
});

describe('pile.wgsl', () => {
  it('runs the same model as pile.ts: blanket, supply, wind, melt and relaxation', async () => {
    const { getTestDevice, readTexture } = await import('./gpu.ts');
    const { createPiles } = await import('../src/gpu/pile/piles.ts');
    const device = await getTestDevice();
    const piles = createPiles(device, { format: 'rgba16float' });
    const width = 300;
    const settings = { rate: 4, depth: 12, talus: 0.6, wind: 0.05, melt: 0.3, cornice: 0.5 };
    const extra = { start: 6, drip: 0, fall: 90, windSpeed: 0 };
    const dt = 1 / 60;
    // pile.ts, from the same fresh blanket the shader lays.
    let cpu = Float64Array.from({ length: width }, (_, i) =>
      Math.min(extra.start, (Math.min(i, width - 1 - i) + 0.5) * settings.talus),
    );
    for (let f = 0; f < 30; f++) {
      const encoder = device.createCommandEncoder();
      piles.update(encoder, {
        width,
        height: 200,
        dpr: 1,
        dt,
        time: f * dt,
        edges: [],
        settings: { ...settings, ...extra },
      });
      device.queue.submit([encoder.finish()]);
      cpu = step(cpu, settings, dt, 4);
    }
    const bytes = await readTexture(device, piles.heights, 4);
    const row = new Float32Array(bytes.buffer, 0, width);
    for (let i = 0; i < width; i += 7) expect(row[i]!, `column ${i}`).toBeCloseTo(cpu[i]!, 3);
    expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(total(cpu), 0);
    piles.destroy();
  });
});
