import { createHdrTail, OVERLAY_PARAMS, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed, heldDose } from '../../gpu/safety/dose.ts';
import { createFlakeLayer } from '../../gpu/snow/flakes.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';

/** Instances drawn every frame; `dose` decides how many of them show. */
const CAPACITY = 9000;
const NEAR = 0.25;
const FAR = 15;

const NO_TONEMAP = { output: { tonemap: 'none' } } as const;

export const effect = defineEffect({
  meta,
  params: {
    ...DOSE_PARAMS,
    wind: { type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
    drive: { type: 'number', default: 0, min: 0, max: 6, step: 0.1, label: 'into the snow' },
    shutter: { type: 'number', default: 0.004, min: 0, max: 0.02, step: 0.001 },
    focus: { type: 'number', default: 3, min: 0.3, max: 15, step: 0.1, label: 'focus distance' },
    aperture: { type: 'number', default: 15, min: 0, max: 30, step: 0.5, label: 'aperture (mm)' },
    size: { type: 'number', default: 1.5, min: 0.5, max: 6, step: 0.05, label: 'flake size' },
    edge: {
      type: 'number',
      default: 0.35,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'edge for light pages',
    },
    speed: { type: 'number', default: 1, min: 0, max: 3, step: 0.05 },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
    ...OVERLAY_PARAMS,
    alpha: { ...OVERLAY_PARAMS.alpha, default: 'coverage' },
  },
  presets: {
    steady: {},
    flurry: { dose: 0.15 },
    heavy: { dose: 0.6 },
    still: { wind: 0 },
    'big, slow flakes': { size: 3, speed: 0.6, dose: 0.25 },
    // Into the snow at walking pace: over the zoom cap, so declared and gated (story 2.4).
    'into the snow': { drive: 1.4, wind: 0.3 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'snowfall' });
    const layer = createFlakeLayer(device, {
      format: tail.scene.format,
      capacity: CAPACITY,
      label: 'snowfall',
    });
    let width = 1;
    let height = 1;
    let clock = 0;

    return {
      resize(w, h) {
        width = w;
        height = h;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.delta * params.speed;
        // A held frame shows no more snow than the default (story 2.6's held-frame rule).
        const look = time.still ? heldDose(params.dose) : params.dose;
        layer.set({
          width,
          height,
          aspect: width / height,
          time: clock,
          // Flakes shown. The top of the curve is set so the strong dose (0.7) stays under the flash
          // check: dense snow's local twinkle reads as flashes in its cells (notes, Safety).
          count: dosed(look, 0.08, 0.35, 0.8) * CAPACITY,
          near: NEAR,
          far: FAR,
          // Mean diameter, mm: heavier snow falls as bigger aggregates.
          diameter: dosed(params.dose, 1.5, 3, 5),
          size: params.size,
          wind: params.wind * dosed(params.dose, 0, 0.6, 2.5),
          gust: params.wind * dosed(params.dose, 0, 0.4, 1.5),
          gust_rate: 0.6,
          swirl: dosed(params.dose, 0, 0.12, 0.3),
          drive: params.drive,
          shutter: params.shutter,
          focus: params.focus,
          aperture: params.aperture,
          // Heavy snow hides the distance.
          visibility: dosed(params.dose, 30, 18, 7),
          brightness: 1,
          edge: params.edge,
        });
        const pass = encoder.beginRenderPass({
          label: 'snowfall',
          colorAttachments: [
            {
              view: tail.scene.view,
              loadOp: 'clear',
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              storeOp: 'store',
            },
          ],
          timestampWrites: profiler.pass('flakes'),
        });
        layer.encode(pass);
        pass.end();
        // Flakes are paper white at most, drawn over the page: no tonemap curve to grey them.
        tail.encode(encoder, target, time, params, profiler, NO_TONEMAP);
      },
      destroy() {
        layer.destroy();
        tail.destroy();
      },
    };
  },
});
