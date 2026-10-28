import { createPageSnow } from '../../gpu/pile/page-snow.ts';
import { createHdrTail, OVERLAY_PARAMS, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { trackScroll } from '../../gpu/scroll.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

const CAPACITY = 3000;
const NO_TONEMAP = { output: { tonemap: 'none' } } as const;
/** The cycle in time: seconds melting, then seconds snowing again. */
const MELTING = 24;
const SNOWING = 14;

/** Where the cycle is: melting (and how far into it) or snowing. */
export function meltPhase(t: number): { melting: boolean; progress: number } {
  const c = t % (MELTING + SNOWING);
  return c < MELTING
    ? { melting: true, progress: c / MELTING }
    : { melting: false, progress: (c - MELTING) / SNOWING };
}

export const effect = defineEffect({
  meta,
  params: {
    ...DOSE_PARAMS,
    by: { type: 'select', default: 'time', options: ['time', 'scroll'], label: 'melts with' },
    depth: { type: 'number', default: 12, min: 2, max: 30, step: 0.5, label: 'depth (CSS px)' },
    rate: {
      type: 'number',
      default: 0.6,
      min: 0.1,
      max: 3,
      step: 0.05,
      label: 'melt (px a second)',
    },
    edge: {
      type: 'number',
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'edge for light pages',
    },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
    ...OVERLAY_PARAMS,
    alpha: { ...OVERLAY_PARAMS.alpha, default: 'coverage' },
  },
  presets: {
    'melt and snow again': {},
    'fast thaw': { rate: 1.6 },
    'melt as you scroll': { by: 'scroll' },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'melt' });
    const snow = createPageSnow(device, canvas, {
      format: tail.scene.format,
      capacity: CAPACITY,
      label: 'melt',
    });
    const scroll = trackScroll(canvas);
    let width = 1;
    let height = 1;
    let dpr = 1;
    let clock = 0;

    return {
      resize(w, h, ratio) {
        width = w;
        height = h;
        dpr = ratio;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        const dt = time.still ? 0 : time.delta;
        clock += dt;
        const scrolled = scroll.update(dt);
        // Melting: in time, the cycle's melting phase; by scroll, in proportion to scrolling down.
        // Wet snow slumps: its angle of repose falls from 35° to 20° as it melts.
        let melt: number;
        let snowing: number;
        if (params.by === 'scroll') {
          melt = params.rate * Math.min(3, Math.max(0, scrolled.velocity) / 300);
          snowing = melt > 0.05 ? 0 : 0.4;
        } else {
          const phase = meltPhase(clock);
          melt = phase.melting ? params.rate * Math.min(1, phase.progress * 6) : 0;
          snowing = phase.melting ? 0 : 1.4;
        }
        const wet = melt > 0 ? 1 : 0;
        const angle = 35 - 15 * wet;
        snow.frame(
          encoder,
          tail.scene.view,
          {
            width: width / dpr,
            height: height / dpr,
            dpr,
            dt,
            time: clock,
            flakes: {
              time: clock,
              // Only while it snows; a melting page shows a few last flakes.
              count: (snowing > 0 ? dosed(params.dose, 0.05, 0.25, 0.6) : 0.02) * CAPACITY,
              near: 0.25,
              far: 15,
              diameter: 3,
              size: 1.5,
              wind: 0.3,
              gust: 0.2,
              gust_rate: 0.6,
              swirl: 0.1,
              drive: 0,
              shutter: 0.004,
              focus: 3,
              aperture: 15,
              visibility: 18,
              brightness: 1,
              edge: params.edge,
            },
            settings: {
              rate: snowing,
              depth: params.depth,
              start: 0.9 * params.depth,
              talus: Math.tan((angle * Math.PI) / 180),
              wind: 0,
              melt,
              cornice: 0,
              drip: dosed(params.dose, 0.5, 2, 5),
              fall: 70,
              windSpeed: 4,
              variation: 0.5,
            },
            brush: { radius: 0, strength: 0 },
            shake: 0.85,
            rim: params.edge,
          },
          profiler.pass('snow'),
        );
        tail.encode(encoder, target, time, params, profiler, NO_TONEMAP);
      },
      destroy() {
        scroll.destroy();
        snow.destroy();
        tail.destroy();
      },
    };
  },
});
