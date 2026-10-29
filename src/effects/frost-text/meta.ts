import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'frost-text',
  title: 'Frost text',
  epic: '4',
  tier: 'A',
  tags: ['frost', 'phase field', 'growth', 'text', 'compute', 'scroll'],
  summary:
    "Frost growing out from a heading's letters: ice nucleates on the glyphs' outlines and branches outwards by Kobayashi's phase-field model, one arm of each crystal pointing straight out of its letter, while a slower frost creeps over the letters themselves. Grown once and revealed by arrival time, by time or scroll.",
  scorecard: {
    compute: true,
    mobile: 'untested',
    flash: 'none',
    pattern: 'none',
    lightPage: 'yes',
    features: { required: [] },
    fallback: 'A still of the frosted heading, or the heading itself.',
    useCases: ['A winter campaign headline', 'A "cold" product name or sale banner'],
  },
};
