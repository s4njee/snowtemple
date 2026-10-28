import type { EffectMeta } from '../types.ts';

export const meta: EffectMeta = {
  id: 'settling-snow',
  title: 'Settling snow',
  epic: '3',
  tier: 'A',
  tags: ['snowfall', 'accumulation', 'page elements', 'compute'],
  summary:
    "Snow that settles on the page's own elements: a pile along the top of every heading, card and button, built column by column as it falls, sliding to its angle of repose, blown into a cornice at the lee end, and lit with blue shadows so it reads on a white page. The pointer brushes it off; a press shakes an element's snow loose.",
  scorecard: {
    compute: true,
    mobile: 'untested',
    flash: 'low',
    pattern: 'none',
    lightPage: 'yes',
    features: { required: [] },
    fallback: 'CSS: a ridge of snow on each element (src/css/snow-ridge.css), with no settling.',
    useCases: ['A seasonal landing page', 'A winter promotion over a real layout'],
  },
};
