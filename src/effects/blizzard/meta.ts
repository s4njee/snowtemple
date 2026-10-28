import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'blizzard',
  title: 'Blizzard',
  epic: '2',
  tier: 'B',
  tags: ['snowfall', 'volume', 'fog', 'wind'],
  summary:
    'A whiteout: blowing snow as a volume of wind-stretched streamers, ray-marched through depth so the far page fades into white, with dense driven flakes in front. Gusts sweep across, closing the view and clearing it again.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'yes',
    features: { required: [] },
    fallback: 'A still of the whiteout, or a white gradient over the page.',
    useCases: ['A dramatic winter hero', 'A weather or outdoor brand page'],
  },
};
