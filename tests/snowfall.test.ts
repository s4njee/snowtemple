import { describe, expect, it } from 'vitest';
import { loadEffect } from '../src/effects/registry.ts';
import { defaultParams } from '../src/effects/types.ts';
import { MOTION_CAPS } from '../src/gpu/safety/motion.ts';
import { driveZoom } from '../src/gpu/snow/flakes.ts';

// Story 2.4. Driven snow is too sparse for the motion check's optical flow, so its expansion is
// computed from the effect's own transform at the focus distance, where flakes are drawn
// sharpest, and held to the zoom cap: every preset that drives faster is declared and gated.

describe('driving into the snow', () => {
  it('expands as drive / (z ln 2)', () => {
    expect(driveZoom(1, 1)).toBeCloseTo(1 / Math.LN2, 9);
    expect(driveZoom(2, 4)).toBeCloseTo(driveZoom(1, 2), 9);
  });

  it('declares every preset whose flakes at the focus distance expand faster than the cap', async () => {
    const effect = await loadEffect('snowfall');
    const declared = effect.meta.scorecard?.motionPresets ?? [];
    for (const [name, preset] of Object.entries(effect.presets ?? {})) {
      const values = { ...defaultParams(effect.params), ...preset } as {
        drive: number;
        focus: number;
      };
      const zoom = driveZoom(values.drive, values.focus);
      if (zoom > MOTION_CAPS.zoom)
        expect(declared, `"${name}": ${zoom.toFixed(3)} doublings a second`).toContain(name);
    }
    // At its defaults it does not drive at all.
    expect((defaultParams(effect.params) as { drive: number }).drive).toBe(0);
  });
});
