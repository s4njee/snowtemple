import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'footprints',
  title: 'Footprints',
  epic: '3',
  tier: 'A',
  tags: ['snow surface', 'deformation', 'pointer', 'compute'],
  summary:
    'A snow surface the pointer walks across: each step packs the snow down into a print and pushes it aside into a raised rim, rims slump to the angle of repose, and falling snow slowly fills the prints again. Lit by a low sun, so hollows read as blue shadow. With no pointer, someone walks across on their own.',
  scorecard: {
    compute: true,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'yes',
    features: { required: [] },
    fallback: 'A still of a trail of prints.',
    useCases: ['A winter section background', 'A ground strip along the foot of a hero'],
  },
};
