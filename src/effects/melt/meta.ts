import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'melt',
  title: 'Melt',
  epic: '3',
  tier: 'A',
  tags: ['accumulation', 'melting', 'page elements', 'compute', 'scroll'],
  summary:
    "Snow on the page's elements melting: each pile slumps as it wets, thins fastest where it is thinnest, so it pulls back from the ends, and drips off them. It melts to nothing, then snows again; or it melts as the page scrolls.",
  scorecard: {
    compute: true,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'yes',
    features: { required: [] },
    fallback:
      'A still of the snow, or the CSS ridge (src/css/snow-ridge.css) shrinking on a transition.',
    useCases: ['A spring or end-of-season page', 'A scroll-driven seasonal transition'],
  },
};
