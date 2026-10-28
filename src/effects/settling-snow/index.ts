import { createPageSnow } from '../../gpu/pile/page-snow.ts';
import { createHdrTail, OVERLAY_PARAMS, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed, heldDose } from '../../gpu/safety/dose.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

const CAPACITY = 4000;
const NO_TONEMAP = { output: { tonemap: 'none' } } as const;

export const effect = defineEffect({
  meta,
  params: {
    ...DOSE_PARAMS,
    depth: { type: 'number', default: 10, min: 2, max: 30, step: 0.5, label: 'depth (CSS px)' },
    start: {
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.05,
      label: 'start with (of depth)',
    },
    angle: { type: 'number', default: 35, min: 15, max: 60, step: 1, label: 'angle of repose (°)' },
    wind: { type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
    brush: { type: 'boolean', default: true, label: 'pointer brushes snow off' },
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
    settling: {},
    'deep and calm': { depth: 22, wind: 0, start: 0.8 },
    windblown: { wind: 2.5, angle: 30 },
    'light dusting': { dose: 0.15, depth: 4, start: 0.3 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'settling-snow' });
    const snow = createPageSnow(device, canvas, {
      format: tail.scene.format,
      capacity: CAPACITY,
      label: 'settling-snow',
    });
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
        const look = time.still ? heldDose(params.dose) : params.dose;
        const wind = params.wind * dosed(params.dose, 0, 0.6, 2.5);
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
              count: dosed(look, 0.05, 0.25, 0.6) * CAPACITY,
              near: 0.25,
              far: 15,
              diameter: dosed(params.dose, 1.5, 3, 5),
              size: 1.5,
              wind,
              gust: params.wind * dosed(params.dose, 0, 0.4, 1.5),
              gust_rate: 0.6,
              swirl: dosed(params.dose, 0, 0.12, 0.3),
              drive: 0,
              shutter: 0.004,
              focus: 3,
              aperture: 15,
              visibility: dosed(params.dose, 30, 18, 7),
              brightness: 1,
              edge: params.edge,
            },
            settings: {
              // Snow builds at a CSS pixel every couple of seconds at the default.
              rate: dosed(params.dose, 0.1, 0.5, 1.5),
              depth: params.depth,
              start: params.start * params.depth,
              talus: Math.tan((params.angle * Math.PI) / 180),
              // A share of surface snow blown one column a step, in the wind's direction.
              wind: Math.min(0.2, 0.012 * wind),
              melt: 0,
              cornice: 0.6,
              drip: 0,
              variation: 0.5,
              fall: 70,
              windSpeed: wind * 12,
            },
            brush: params.brush ? { radius: 22, strength: 40 } : { radius: 0, strength: 0 },
            shake: 0.85,
            rim: params.edge,
          },
          profiler.pass('snow'),
        );
        tail.encode(encoder, target, time, params, profiler, NO_TONEMAP);
      },
      destroy() {
        snow.destroy();
        tail.destroy();
      },
    };
  },
});
