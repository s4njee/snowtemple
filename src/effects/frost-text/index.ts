import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
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
import { ANTON } from '../../gpu/text/anton.generated.ts';
import { layoutLine } from '../../gpu/text/font.ts';
import { createTextField, type TextLine } from '../../gpu/text/text-field.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './heading.wgsl';
import { meta } from './meta.ts';
import seedShader from './seed.wgsl';

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
  /** 0 night glass behind the letters, 1 the page. */
  scene: 'u32',
  ink: 'vec4f',
  room: 'vec4f',
});

const SeedParams = defineUniformStruct('SeedParams', {
  seed: 'f32',
  every: 'f32',
  reach: 'f32',
  cold: 'f32',
  inside: 'f32',
  equilibrium: 'f32',
});

const NO_TONEMAP = { output: { tonemap: 'none' } } as const;
/** Steps a new grid may grow in its first frame; the rest arrives at `MAX_STEPS_PER_FRAME`. */
const CATCH_UP = 2000;
/** Steps for the frost to reach its furthest, per cell of reach. */
const STEPS_PER_CELL = 110;

export const effect = defineEffect({
  meta,
  params: {
    ...DOSE_PARAMS,
    text: { type: 'text', default: 'WINTER', maxLength: 24 },
    by: { type: 'select', default: 'time', options: ['time', 'scroll'], label: 'frosts with' },
    reach: {
      type: 'number',
      default: 0.6,
      min: 0.1,
      max: 1.2,
      step: 0.01,
      label: 'reach (of the letters’ height)',
    },
    over: {
      type: 'number',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'frost over the letters',
    },
    size: { type: 'number', default: 0.42, min: 0.15, max: 0.8, step: 0.01, label: 'size' },
    ink: { type: 'color', default: [0.2, 0.3, 0.5], label: 'letters' },
    grain: { type: 'number', default: 2, min: 2, max: 4, step: 1, label: 'cell (CSS px)' },
    behind: { type: 'select', default: 'night', options: ['night', 'page'], label: 'behind' },
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
    'hard frost': {},
    'rimed letters': { over: 0.9, reach: 0.3 },
    'frost reaching out': { reach: 1.1, over: 0.2 },
    'frost as you scroll': { by: 'scroll' },
    'over the page': { behind: 'page', ink: [0.04, 0.06, 0.1] },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'frost-text' });
    const uniforms = createUniformBuffer(device, Params, 'frost-text params');
    const seedUniforms = createUniformBuffer(device, SeedParams, 'frost-text seed params');
    const draw = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'heading',
      format: tail.scene.format,
    });
    const seedPipeline = createFullscreenPipeline(device, {
      fragment: withChunks(seedShader, { 'seed-params.wgsl': SeedParams.wgsl }),
      entryPoint: 'seed',
      format: 'rgba16float',
    });
    const field = createTextField(device, ANTON);
    const scroll = trackScroll(canvas);
    const capEm = (ANTON.glyphs.H!.bounds[3] - ANTON.glyphs.H!.bounds[1]) / ANTON.unitsPerEm;
    let grower: Grower | undefined;
    let distance: GPUTexture | undefined;
    let group: GPUBindGroup | undefined;
    let seedGroup: GPUBindGroup | undefined;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let clock = 0;
    let total = 1;
    let planted = '';
    let round = -1;
    let plants = 0;
    let sincePublish = 0;
    let publishTick = 0;

    // The heading in cells, centred: cap height `size` of the view, fitted to nine tenths of it.
    const layout = (cols: number, rows: number): TextLine => {
      const text = params.text.trim().toUpperCase() || 'WINTER';
      let size = (params.size * rows) / capEm;
      const em = layoutLine(ANTON, text, 0.02).width;
      if (em * size > 0.88 * cols) size = (0.88 * cols) / Math.max(em, 1e-3);
      return {
        text,
        x: cols / 2,
        y: rows / 2 + (capEm * size) / 2,
        size,
        tracking: 0.02,
        align: 'centre',
      };
    };

    const plant = (encoder: GPUCommandEncoder, seed: number) => {
      const cols = Math.max(16, Math.ceil(width / dpr / params.grain));
      const rows = Math.max(16, Math.ceil(height / dpr / params.grain));
      if (!grower || grower.width !== cols || grower.height !== rows) {
        grower?.destroy();
        distance?.destroy();
        grower = createGrower(device, { width: cols, height: rows, label: 'frost-text' });
        distance = device.createTexture({
          label: 'frost-text distance',
          size: [cols, rows],
          format: 'r16float',
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        group = device.createBindGroup({
          layout: draw.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniforms.buffer } },
            { binding: 1, resource: grower.arrival.createView() },
            { binding: 2, resource: distance.createView() },
            { binding: 3, resource: linearSampler(device) },
          ],
        });
        seedGroup = device.createBindGroup({
          layout: seedPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: seedUniforms.buffer } },
            { binding: 1, resource: distance.createView() },
          ],
        });
      }
      const line = layout(cols, rows);
      field.draw(encoder, distance!.createView(), cols, rows, line);
      const capCells = capEm * line.size;
      const reach = Math.max(4, params.reach * capCells);
      grower.settings = { ...KOBAYASHI, latent: 2.4, noise: 0.02, seed };
      seedUniforms.set({
        seed,
        every: 70,
        reach,
        cold: 0,
        // Inside the letters: from barely below freezing (no frost over them) to nearly as cold.
        inside: 1 - 0.75 * params.over,
        equilibrium: 1,
      });
      seedUniforms.upload();
      renderFullscreen(encoder, grower.seeds.createView(), seedPipeline, [seedGroup!]);
      grower.plant(encoder);
      total = Math.round(Math.min(12000, Math.max(800, reach * STEPS_PER_CELL)));
    };

    return {
      resize(w, h, ratio) {
        width = w;
        height = h;
        dpr = ratio;
        tail.resize(w, h);
        planted = '';
      },
      frame(time, encoder, target) {
        const dt = time.still ? 0 : Math.min(time.delta, 0.1);
        clock += dt;
        const scrolled = scroll.update(dt);
        const cycle = { freeze: dosed(params.dose, 80, 40, 18), hold: 10, thaw: 12, start: 0.45 };
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
          params.text,
          params.size,
          params.reach,
          params.over,
          seed,
        ].join();
        let cap = MAX_STEPS_PER_FRAME;
        if (key !== planted) {
          plant(encoder, seed);
          plants++;
          planted = key;
          cap = CATCH_UP;
        }
        const g = grower!;
        const wanted = revealStep(progress, total);
        const ran = growTowards(
          g,
          encoder,
          wanted + 30,
          total,
          time.still ? Infinity : cap,
          profiler.pass('growth'),
        );
        // The frost moves a fraction of a cell a frame, so its arrival is republished every
        // fourth frame it grows, and at once after planting or a jump.
        sincePublish += ran;
        if (
          cap === CATCH_UP ||
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
          ink: [...params.ink, 1],
          room: [1, 0.95, 0.9, 1],
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
        distance?.destroy();
        field.destroy();
        uniforms.destroy();
        seedUniforms.destroy();
        tail.destroy();
      },
    };
  },
});
