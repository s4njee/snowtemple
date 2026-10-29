import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { hash2 } from '../../gpu/growth/pane.ts';
import { createReiter, CRYSTALS, type CrystalKind } from '../../gpu/growth/reiter.ts';
import { linearSampler } from '../../gpu/passes/common.ts';
import { createHdrTail, OVERLAY_PARAMS, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed, heldDose } from '../../gpu/safety/dose.ts';
import { patternStepAt } from '../../gpu/safety/pattern.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import shader from './flake.wgsl';
import { meta } from './meta.ts';

const Params = defineUniformStruct('Params', {
  width: 'f32',
  height: 'f32',
  css: 'f32',
  radius: 'f32',
  flake_px: 'f32',
  angle: 'f32',
  reveal: 'f32',
  soft: 'f32',
  thickness: 'f32',
  relief: 'f32',
  brightness: 'f32',
  fade: 'f32',
  /** How much the ice hides what is behind it. */
  cover_back: 'f32',
  /** 0 a night sky behind, 1 the page. */
  scene: 'u32',
  centre: 'vec2f',
});

const NO_TONEMAP = { output: { tonemap: 'none' } } as const;
/** The grid's radius in cells. */
const RADIUS = 160;
const KINDS = Object.keys(CRYSTALS) as CrystalKind[];
/** Seconds a grown crystal is held, then fades; and a new one fades in. */
const HOLD = 6;
const FADE = 1.5;
/** How far grown a crystal is when it appears: its radius, as a share of the full one. */
const FIRST = 0.3;
/** Relative luminance of the ice's colour at full strength (flake.wgsl's `ice`). */
const ICE_LUMINANCE = 0.2126 * 0.72 + 0.7152 * 0.84 + 0.0722 * 1;

/** Seconds a crystal takes to grow from `FIRST` to full, at `dose`. */
export function growthSeconds(grow: number, dose: number): number {
  return grow * dosed(dose, 1.6, 1, 0.8);
}

/**
 * How fast the crystal seems to zoom while it grows, in doublings of its radius a second: the
 * figure the motion caps set. Tracked by the effect's own transform, since the motion check
 * cannot see a crystal this sparse.
 */
export function growthZoom(grow: number, dose: number): number {
  return Math.log2(1 / FIRST) / growthSeconds(grow, dose);
}

/** The crystal a seed grows: its kind, and its air a little drier or damper than the kind's. */
export function crystalFor(kind: string, seed: number) {
  const name: CrystalKind = KINDS.includes(kind as CrystalKind)
    ? (kind as CrystalKind)
    : KINDS[Math.abs(Math.floor(seed)) % KINDS.length]!;
  const c = CRYSTALS[name];
  return {
    name,
    steps: c.steps,
    settings: {
      alpha: c.alpha,
      beta: c.beta * (1 + 0.04 * (hash2(seed, 1, 5) - 0.5)),
      gamma: c.gamma * (1 + 0.3 * (hash2(seed, 2, 5) - 0.5)),
      roughness: 0.004,
      seed,
    },
  };
}

export const effect = defineEffect({
  meta,
  params: {
    ...DOSE_PARAMS,
    kind: { type: 'select', default: 'any', options: ['any', ...KINDS], label: 'crystal' },
    seed: { type: 'number', default: 1, min: 1, max: 9999, step: 1 },
    size: {
      type: 'number',
      default: 0.8,
      min: 0.2,
      max: 1,
      step: 0.01,
      label: 'size (of the view)',
    },
    grow: { type: 'number', default: 24, min: 12, max: 60, step: 1, label: 'grows over (s)' },
    spin: {
      type: 'number',
      default: 2,
      min: 0,
      max: 5,
      step: 0.1,
      label: 'turns (degrees a second)',
    },
    behind: { type: 'select', default: 'sky', options: ['sky', 'page'], label: 'behind' },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
    ...OVERLAY_PARAMS,
    alpha: { ...OVERLAY_PARAMS.alpha, default: 'coverage' },
  },
  presets: {
    'a new one each time': {},
    'stellar dendrite': { kind: 'stellar dendrite' },
    'fern dendrite': { kind: 'fern dendrite' },
    'sectored plate': { kind: 'sectored plate' },
    'stellar plate': { kind: 'stellar plate' },
    badge: { size: 0.35, spin: 0 },
    'bright ice': { dose: 1, kind: 'stellar plate' },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'snowflake' });
    const uniforms = createUniformBuffer(device, Params, 'snowflake params');
    const draw = createFullscreenPipeline(device, {
      fragment: withChunks(shader, { 'params.wgsl': Params.wgsl }),
      entryPoint: 'flake',
      format: tail.scene.format,
    });
    const flake = createReiter(device, { radius: RADIUS });
    const group = device.createBindGroup({
      layout: draw.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 1, resource: flake.arrival.createView() },
        { binding: 2, resource: linearSampler(device) },
      ],
    });
    let width = 1;
    let height = 1;
    let dpr = 1;
    let clock = 0;
    let grown = '';
    let crystal = crystalFor(params.kind, params.seed);

    return {
      resize(w, h, ratio) {
        width = w;
        height = h;
        dpr = ratio;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        const dt = time.still ? 0 : Math.min(time.delta, 0.1);
        clock += dt;
        const look = time.still ? heldDose(params.dose) : params.dose;
        // Each round: fade in a third grown, grow, hold, fade out; the next round grows the next
        // seed. A growing crystal's edge moves outwards, which the motion check reads as a zoom,
        // so it grows at a steady rate in doublings of its radius (a dendrite's tip moves at a
        // constant speed, so its radius goes with the steps), under the zoom cap.
        const grow = growthSeconds(params.grow, params.dose);
        const length = FADE + grow + HOLD + FADE;
        // The first round starts halfway through growing, so the first frame shows a crystal.
        const shifted = clock + FADE + grow * 0.5;
        const round = Math.floor(shifted / length);
        const into = shifted - round * length;
        const key = `${params.kind}|${params.seed}|${round}`;
        let cap = 64;
        if (key !== grown) {
          crystal = crystalFor(params.kind, params.seed + round);
          flake.start(encoder, crystal.settings);
          grown = key;
          cap = 2000;
        }
        const growing = Math.min(1, Math.max(0, (into - FADE) / grow));
        const wanted = FIRST * Math.pow(1 / FIRST, growing) * crystal.steps;
        const run = Math.min(
          Math.max(0, Math.ceil(wanted + 20) - flake.steps),
          crystal.steps + 20 - flake.steps,
          time.still ? Infinity : cap,
        );
        if (run > 0) {
          flake.step(encoder, run, profiler.pass('growth'));
          flake.publish(encoder);
        } else if (cap === 2000) {
          flake.publish(encoder);
        }
        const fade =
          into < FADE
            ? into / FADE
            : into < FADE + grow + HOLD
              ? 1
              : Math.max(0, 1 - (into - FADE - grow - HOLD) / FADE);
        const cssW = width / dpr;
        const cssH = height / dpr;
        const c = CRYSTALS[crystal.name];
        uniforms.set({
          width,
          height,
          css: dpr,
          radius: RADIUS,
          flake_px: (params.size * Math.min(cssW, cssH)) / 2,
          angle: ((clock * params.spin * Math.PI) / 180) % (Math.PI * 2),
          reveal: Math.min(wanted, flake.steps),
          soft: 24,
          thickness: 1 / (c.gamma * c.steps * 0.6),
          relief: 6,
          // A six-armed crystal is a rosette: six light-dark pairs about its centre, one more
          // than the pattern guidance allows at a discernible step. So the ice adds no more
          // luminance than the pattern step at this dose (The Hero's Journey's rule for
          // patterns by construction), and only past the strong dose is it bright.
          brightness: patternStepAt(look) / ICE_LUMINANCE,
          fade,
          // Clear ice lets the sky through: it adds light, never darkens, so its step is its own.
          cover_back: 0,
          scene: params.behind === 'page' ? 1 : 0,
          centre: [cssW / 2, cssH / 2],
        });
        uniforms.upload();
        renderFullscreen(encoder, tail.scene.view, draw, [group], {
          timestampWrites: profiler.pass('draw'),
        });
        tail.encode(encoder, target, time, params, profiler, NO_TONEMAP);
      },
      destroy() {
        flake.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
