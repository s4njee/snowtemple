import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { createGrower, KOBAYASHI } from '../src/gpu/growth/phase-field.ts';
import { createReiter, CRYSTALS } from '../src/gpu/growth/reiter.ts';
import { getTestDevice } from '../tests/gpu.ts';

// Wall time per growth step, by grid size: the phase field and Reiter's automaton.
it('growth cost', async () => {
  const device = await getTestDevice();
  const lines: string[] = [];
  for (const [w, h] of [
    [480, 270],
    [960, 540],
    [1920, 1080],
  ] as const) {
    const g = createGrower(device, { width: w, height: h, settings: KOBAYASHI });
    let e = device.createCommandEncoder();
    g.plant(e);
    g.step(e, 50);
    device.queue.submit([e.finish()]);
    await device.queue.onSubmittedWorkDone();
    const n = 1000;
    const t0 = performance.now();
    e = device.createCommandEncoder();
    g.step(e, n);
    device.queue.submit([e.finish()]);
    await device.queue.onSubmittedWorkDone();
    const ms = (performance.now() - t0) / n;
    const t1 = performance.now();
    for (let k = 0; k < 20; k++) {
      e = device.createCommandEncoder();
      g.publish(e);
      device.queue.submit([e.finish()]);
    }
    await device.queue.onSubmittedWorkDone();
    lines.push(
      `phase field ${w}x${h}: ${ms.toFixed(4)} ms a step, publish ${((performance.now() - t1) / 20).toFixed(3)} ms, state ${((w * h * 16 * 2) / 1e6).toFixed(1)} MB + seeds and arrival ${((w * h * 16) / 1e6).toFixed(1)} MB`,
    );
    g.destroy();
  }
  const r = createReiter(device, { radius: 160 });
  const c = CRYSTALS['stellar dendrite'];
  let e = device.createCommandEncoder();
  r.start(e, { alpha: c.alpha, beta: c.beta, gamma: c.gamma, roughness: 0, seed: 1 });
  device.queue.submit([e.finish()]);
  await device.queue.onSubmittedWorkDone();
  const t0 = performance.now();
  e = device.createCommandEncoder();
  r.step(e, 1000);
  device.queue.submit([e.finish()]);
  await device.queue.onSubmittedWorkDone();
  lines.push(`reiter radius 160: ${((performance.now() - t0) / 1000).toFixed(4)} ms a step`);
  writeFileSync('output/growth-cost.txt', lines.join('\n'));
}, 600000);
