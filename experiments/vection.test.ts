import { it, vi } from 'vitest';
import { measureMotion } from '../tests/motion.ts';

vi.setConfig({ testTimeout: 1_200_000 });

// Story 2.4: snowfall driven towards the viewer, by speed, dose and wind, through the motion
// check. Prints a table for docs/studies/vection.md.
it('vection', async () => {
  console.log('| dose | wind | into the snow (m/s) | turn (°/s) | zoom (doublings/s) | drift (widths/s) | peak zoom | blocks tracked |');
  for (const dose of [0.35, 0.7]) {
    for (const wind of [0, 1]) {
      for (const drive of [0, 0.5, 1, 2, 4, 6]) {
        const r = await measureMotion('snowfall', { params: { dose, wind, drive }, seconds: 3, samples: 6 });
        const blocks = r.readings.map((x) => x.blocks).join(' ');
        console.log(`| ${dose} | ${wind} | ${drive} | ${r.rotation.toFixed(2)} | ${r.zoom.toFixed(3)} | ${r.drift.toFixed(3)} | ${r.peak.zoom.toFixed(3)} | ${blocks} |`);
      }
    }
  }
});
