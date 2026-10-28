import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'snowfall',
  title: 'Snowfall',
  epic: '2',
  tier: 'A',
  tags: ['snowfall', 'particles', 'wind'],
  summary:
    'Snow falling through depth over the page: flakes sized from an exponential distribution, falling at their terminal speed, drifting with gusts that sweep across and swirling with their neighbours. Far flakes keep their light as they shrink to points; near ones streak over a shutter time.',
  scorecard: {
    compute: false,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    motionPresets: ['into the snow'],
    lightPage: 'yes',
    features: { required: [] },
    fallback: 'A still of the snow, or CSS snow for a few dozen flakes.',
    useCases: ['A seasonal hero', 'Weather on a landing page', 'A winter section background'],
  },
};
