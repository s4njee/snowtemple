import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { mountHeadless } from '../tests/headless.ts';

// How many growth steps the frost effects run, frame by frame.
it('frost steps', async () => {
  const lines: string[] = [];
  for (const [id, preset] of [
    ['frost-creep', 'frost as you scroll'],
    ['frost-text', 'frost as you scroll'],
    ['frost-creep', undefined],
  ] as const) {
    const m = await mountHeadless(id, { width: 960, height: 540, preset });
    for (let f = 0; f < 6; f++) {
      m.step();
      lines.push(`${id} ${preset ?? '-'} frame ${f}: ${JSON.stringify(m.instance.stats?.())}`);
    }
    m.destroy();
  }
  writeFileSync('output/frost-steps.txt', lines.join('\n'));
}, 600000);
