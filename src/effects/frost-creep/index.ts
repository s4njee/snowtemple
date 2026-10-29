import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { paneSeeds, type FrostFrom } from '../../gpu/growth/pane.ts';
import { createGrower, KOBAYASHI, type Grower } from '../../gpu/growth/phase-field.ts';
import {
  frostPhase,
  growTowards,
  MAX_STEPS_PER_FRAME,
  revealStep,
} from '../../gpu/growth/reveal.ts';
import { linearSampler } from '../../gpu/passes/common.ts';
import { createHdrTail, OVERLAY_PARAMS, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { trackScroll } from '../../gpu/scroll.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './pane.wgsl';

const Params = defineUniformStruct('Params', {
  width: 'f32',
  height: 'f32',
  css: 'f32',
  grain: 'f32',
  cols: 'f32',
  rows: 'f32',
  reveal: 'f32',
  soft: 'f32',
  age_scale: 'f32',
  relief: 'f32',
  opacity: 'f32',
  edge: 'f32',
  /** 0 a winter dusk behind the glass, 1 the page itself. */
  scene: 'u32',
  /** The blur the `view` pass draws the dusk with. */
  view_blur: 'f32',
  room: 'vec4f',
});

const NO_TONEMAP = { output: { tonemap: 'none' } } as const;
/** Grid cells a frost front crosses per step, roughly: it sets how many steps a pane needs. */
const FRONT_SPEED = 0.018;
/**
 * Steps a new grid may grow in its first frame (2,000 is about 120 ms at 1080p on an M1 Max, once;
 * the starting frost needs about 1,000). The rest arrives at `MAX_STEPS_PER_FRAME` a frame.
 */
const CATCH_UP = 2000;

export const effect = defineEffect({
  meta,
  params: {
    ...DOSE_PARAMS,
    by: { type: 'select', default: 'time', options: ['time', 'scroll'], label: 'frosts with' },
    from: {
      type: 'select',
      default: 'edges',
      options: ['edges', 'bottom', 'corners'],
      label: 'cold comes in from',
    },
    reach: { type: 'number', default: 0.7, min: 0.3, max: 1, step: 0.01, label: 'reach' },
    crystal: { type: 'select', default: 'six-fold', options: ['six-fold', 'four-fold'] },
    grain: { type: 'number', default: 2, min: 2, max: 5, step: 1, label: 'cell (CSS px)' },
    behind: {
      type: 'select',
      default: 'dusk',
      options: ['dusk', 'page'],
      label: 'behind the glass',
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
    'cold snap': {},
    'from the sill': { from: 'bottom', reach: 0.85 },
    'in the corners': { from: 'corners', reach: 0.6 },
    'frost as you scroll': { by: 'scroll' },
    'over the page': { behind: 'page' },
    'coarse frost': { grain: 4 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'frost-creep' });
    const uniforms = createUniformBuffer(device, Params, 'frost-creep params');
    const draw = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'pane',
      format: tail.scene.format,
    });
    const viewPipeline = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'view',
      format: 'rgba16float',
    });
    const viewUniforms = [0.06, 1].map((blur) => {
      const u = createUniformBuffer(device, Params, 'frost-creep view params');
      return { u, blur };
    });
    const scroll = trackScroll(canvas);
    let grower: Grower | undefined;
    let group: GPUBindGroup | undefined;
    // The dusk, sharp and through ice; drawn again only when the size changes.
    let views: GPUTexture[] = [];
    let viewsDrawn = false;
    let sincePublish = 0;
    let publishTick = 0;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let clock = 0;
    let total = 1;
    // What the current grid was grown from; a change replants it.
    let planted = '';
    let round = -1;
    let plants = 0;

    const plant = (encoder: GPUCommandEncoder, seed: number) => {
      const cols = Math.max(16, Math.ceil(width / dpr / params.grain));
      const rows = Math.max(16, Math.ceil(height / dpr / params.grain));
      const order = params.crystal === 'four-fold' ? 4 : 6;
      if (!grower || grower.width !== cols || grower.height !== rows) {
        grower?.destroy();
        grower = createGrower(device, { width: cols, height: rows, label: 'frost-creep' });
      }
      group = device.createBindGroup({
        layout: draw.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniforms.buffer } },
          { binding: 1, resource: grower.arrival.createView() },
          { binding: 2, resource: linearSampler(device) },
          { binding: 3, resource: views[0]!.createView() },
          { binding: 4, resource: views[1]!.createView() },
        ],
      });
      grower.settings = {
        ...KOBAYASHI,
        order,
        delta: order === 6 ? 0.04 : 0.02,
        // More latent heat and noise than Kobayashi's figure: thinner arms, and more side
        // branches, as fern frost has.
        latent: 2.4,
        noise: 0.02,
        seed,
      };
      const from = params.from as FrostFrom;
      grower.writeSeeds(
        paneSeeds(cols, rows, { from, reach: params.reach, order, seed, equilibrium: 1 }),
      );
      grower.plant(encoder);
      const span =
        from === 'bottom'
          ? rows
          : from === 'corners'
            ? Math.hypot(cols, rows) / 2
            : Math.min(cols, rows) / 2;
      total = Math.round(Math.min(12000, Math.max(600, (span * params.reach) / FRONT_SPEED)));
    };

    return {
      resize(w, h, ratio) {
        width = w;
        height = h;
        dpr = ratio;
        tail.resize(w, h);
        for (const v of views) v.destroy();
        views = [
          [w, h],
          [Math.max(1, Math.ceil(w / 4)), Math.max(1, Math.ceil(h / 4))],
        ].map(([vw, vh], i) =>
          device.createTexture({
            label: `frost-creep view ${i}`,
            size: [vw!, vh!],
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
          }),
        );
        viewsDrawn = false;
        planted = '';
      },
      frame(time, encoder, target) {
        const dt = time.still ? 0 : Math.min(time.delta, 0.1);
        clock += dt;
        const scrolled = scroll.update(dt);
        const cycle = {
          freeze: dosed(params.dose, 90, 40, 18),
          hold: 10,
          thaw: 14,
          start: 0.45,
        };
        let progress: number;
        let seed = 1;
        if (params.by === 'scroll') {
          const s = Math.min(1, Math.max(0, (scrolled.progress - 0.15) / 0.7));
          progress = cycle.start + (1 - cycle.start) * s * s * (3 - 2 * s);
        } else {
          const phase = frostPhase(clock, cycle);
          progress = phase.progress;
          seed = 1 + phase.round;
          if (phase.round !== round && round >= 0) planted = '';
          round = phase.round;
        }
        const key = [
          width,
          height,
          params.grain,
          params.from,
          params.reach,
          params.crystal,
          seed,
        ].join();
        let catchUp = MAX_STEPS_PER_FRAME;
        if (key !== planted) {
          plant(encoder, seed);
          plants++;
          planted = key;
          catchUp = CATCH_UP;
        }
        const g = grower!;
        if (!viewsDrawn) {
          viewUniforms.forEach(({ u, blur }, i) => {
            u.set({ width, height, css: dpr, view_blur: blur });
            u.upload();
            const viewGroup = device.createBindGroup({
              layout: viewPipeline.getBindGroupLayout(0),
              entries: [{ binding: 0, resource: { buffer: u.buffer } }],
            });
            renderFullscreen(encoder, views[i]!.createView(), viewPipeline, [viewGroup]);
          });
          viewsDrawn = true;
        }
        const wanted = revealStep(progress, total);
        // A held frame shows the frost where it is, grown in full.
        const ran = growTowards(
          g,
          encoder,
          wanted + 30,
          total,
          time.still ? Infinity : catchUp,
          profiler.pass('growth'),
        );
        // The frost moves a fraction of a cell a frame, so its arrival is republished every
        // fourth frame it grows, and at once after planting or a jump.
        sincePublish += ran;
        if (
          catchUp === CATCH_UP ||
          time.still ||
          ran >= MAX_STEPS_PER_FRAME ||
          (sincePublish > 0 && ++publishTick % 4 === 0)
        ) {
          g.publish(encoder);
          sincePublish = 0;
        }
        uniforms.set({
          width,
          height,
          css: dpr,
          grain: params.grain,
          cols: g.width,
          rows: g.height,
          reveal: Math.min(wanted, g.steps),
          soft: 40,
          age_scale: total * 0.25,
          relief: 10,
          opacity: dosed(params.dose, 0.5, 0.85, 1),
          edge: params.edge,
          scene: params.behind === 'page' ? 1 : 0,
          room: [1, 0.93, 0.84, 1],
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, draw, [group!], {
          timestampWrites: profiler.pass('draw'),
        });
        tail.encode(encoder, target, time, params, profiler, NO_TONEMAP);
      },
      stats() {
        return { steps: grower?.steps ?? 0, of: total, plants: plants };
      },
      destroy() {
        scroll.destroy();
        grower?.destroy();
        for (const v of views) v.destroy();
        for (const { u } of viewUniforms) u.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
