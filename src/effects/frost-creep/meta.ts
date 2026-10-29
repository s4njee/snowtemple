import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'frost-creep',
  title: 'Frost creep',
  epic: '4',
  tier: 'A',
  tags: ['frost', 'phase field', 'growth', 'compute', 'scroll'],
  summary:
    "A window pane frosting over in a cold snap: ice grows in from the frame and from specks near it by Kobayashi's phase-field model, branching into ferns, and stops where the room keeps the glass above freezing. Grown once and revealed by when each cell froze, so it can follow time or the scroll, and thaw back the way it came.",
  scorecard: {
    compute: true,
    mobile: 'untested',
    flash: 'none',
    pattern: 'none',
    lightPage: 'yes',
    features: { required: [] },
    fallback: 'A still of the frosted pane.',
    useCases: ['A winter landing page, frosting as you scroll', 'A cold-snap weather alert'],
  },
};
