import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'snowflake',
  title: 'Snowflake',
  epic: '4',
  tier: 'A',
  tags: ['snowflake', 'cellular automaton', 'growth', 'symmetry', 'compute'],
  summary:
    "A snow crystal growing, a new one for every seed: Reiter's cellular automaton on a hexagonal grid, where a little vapour diffusing and freezing makes stellar dendrites, ferns, sectored plates or stellar plates from three numbers. Grown once, then drawn through the six-fold mirror fold as clear ice, so keeping it on screen costs a texture read.",
  scorecard: {
    compute: true,
    mobile: 'untested',
    flash: 'none',
    pattern: 'none',
    patternPresets: ['bright ice'],
    motionPresets: ['bright ice'],
    lightPage: 'no',
    features: { required: [] },
    fallback: 'A still of the grown crystal.',
    useCases: ['A loading indicator', 'A badge or avatar grown from a user id', 'A seasonal mark'],
  },
};
