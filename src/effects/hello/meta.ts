import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'hello',
  title: 'Hello',
  epic: '1',
  tier: 'A',
  tags: ['scaffold', 'snowfall'],
  summary:
    'The smallest effect: a few hundred soft flakes falling straight down, one instanced draw through the HDR tail, over the page. Every later effect starts from this shape.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the flakes, or a few CSS-animated dots.',
    useCases: ['The template for new effects'],
  },
};
