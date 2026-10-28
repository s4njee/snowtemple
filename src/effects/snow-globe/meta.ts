import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'snow-globe',
  title: 'Snow globe',
  epic: '2',
  tier: 'A',
  tags: ['particles', 'compute', 'glass', 'pointer'],
  summary:
    'A snow globe over a small winter scene: drag or click to shake it, and its flakes swirl in the water, then sink slowly and settle on the scene until the next shake. The water-filled glass magnifies the scene inside like a lens, with a bright rim and a window highlight.',
  scorecard: {
    compute: true,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'yes',
    features: { required: [] },
    fallback: 'A still of the globe with its snow settled.',
    useCases: ['A product hero for a gift or seasonal page', 'A playful holiday greeting'],
  },
};
