import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { createHdrTail, OVERLAY_PARAMS, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed, heldDose } from '../../gpu/safety/dose.ts';
import { withChunks } from '../../gpu/shader.ts';
import { createFlakeLayer } from '../../gpu/snow/flakes.ts';
import { createRenderTarget } from '../../gpu/targets.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './storm.wgsl';

// Instances drawn every frame: as many as the strong dose shows, since each costs a vertex pass.
const FLAKES = 5000;

const Params = defineUniformStruct('Params', {
  aspect: 'f32',
  time: 'f32',
  tan_half_fov: 'f32',
  near: 'f32',
  far: 'f32',
  /** Extinction per metre at the densest, and the haze beyond the last step. */
  density: 'f32',
  haze: 'f32',
  /** Wind, m/s, along x. */
  wind: 'f32',
  gust_period: 'f32',
  gust_strength: 'f32',
  colour: 'vec4f',
});

const NO_TONEMAP = { output: { tonemap: 'none' } } as const;

export const effect = defineEffect({
  meta,
  params: {
    ...DOSE_PARAMS,
    wind: { type: 'number', default: 1, min: 0, max: 2, step: 0.05 },
    whiteout: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.05 },
    gusts: { type: 'number', default: 0.8, min: 0, max: 1.5, step: 0.05 },
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
    blizzard: {},
    'blowing snow': { whiteout: 0.2, gusts: 0.4 },
    // Its whiteness from the medium, not the wind: at dose 0.6 its drift read over the cap.
    whiteout: { whiteout: 1, dose: 0.4 },
    'steady, no gusts': { gusts: 0 },
  },

  async create({ device, format, hdr, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'blizzard' });
    const uniforms = createUniformBuffer(device, Params, 'blizzard params');
    const fragment = withChunks(shader, { 'params.wgsl': Params.wgsl });
    const half = createRenderTarget(device, {
      label: 'blizzard storm',
      format: 'rgba16float',
      width: 1,
      height: 1,
    });
    const marchLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {} }],
    });
    const showLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    const march = createFullscreenPipeline(device, {
      fragment,
      entryPoint: 'march',
      format: half.format,
      layout: [marchLayout],
    });
    const over: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' };
    const show = createFullscreenPipeline(device, {
      fragment,
      entryPoint: 'show',
      format: tail.scene.format,
      layout: [marchLayout, showLayout],
      blend: { color: over, alpha: over },
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const marchGroup = device.createBindGroup({
      layout: marchLayout,
      entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
    });
    let showGroup: GPUBindGroup | undefined;
    const flakes = createFlakeLayer(device, {
      format: tail.scene.format,
      capacity: FLAKES,
      label: 'blizzard',
    });
    let width = 1;
    let height = 1;
    let clock = 0;

    return {
      resize(w, h) {
        width = w;
        height = h;
        // A third of the resolution: the storm is soft, and at half it cost 8.5 ms in Chrome.
        if (half.resize(Math.ceil(w / 3), Math.ceil(h / 3))) showGroup = undefined;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        clock += time.still ? 0 : time.delta;
        const look = time.still ? heldDose(params.dose) : params.dose;
        // Held to the drift cap: 2.5 m/s read 0.054 widths a second at the default (cap 0.05).
        const wind = params.wind * dosed(params.dose, 0.4, 1.6, 2.4);
        uniforms.set({
          aspect: width / height,
          time: clock,
          tan_half_fov: Math.tan((50 * Math.PI) / 360),
          near: 0.6,
          far: 40,
          density: dosed(look, 0.004, 0.02, 0.07) * (0.4 + 1.2 * params.whiteout),
          haze: 0.4 + 1.6 * params.whiteout,
          wind,
          gust_period: 9,
          gust_strength: params.gusts,
          colour: [0.86, 0.9, 0.97, 1],
        });
        uniforms.upload();
        renderFullscreen(encoder, half.view, march, [marchGroup], {
          timestampWrites: profiler.pass('march'),
        });
        showGroup ??= device.createBindGroup({
          layout: showLayout,
          entries: [
            { binding: 0, resource: half.view },
            { binding: 1, resource: sampler },
          ],
        });
        flakes.set({
          width,
          height,
          aspect: width / height,
          time: clock,
          count: dosed(look, 0.18, 0.8, 1) * FLAKES,
          near: 0.25,
          far: 15,
          diameter: 2.5,
          size: 1.4,
          wind,
          gust: params.gusts * dosed(params.dose, 0, 0.8, 2),
          gust_rate: 0.5,
          swirl: dosed(params.dose, 0.05, 0.2, 0.4),
          drive: 0,
          shutter: 0.008,
          focus: 3,
          aperture: 15,
          visibility: dosed(params.dose, 18, 9, 4),
          brightness: 1,
          edge: params.edge,
        });
        const pass = encoder.beginRenderPass({
          label: 'blizzard',
          colorAttachments: [
            {
              view: tail.scene.view,
              loadOp: 'clear',
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              storeOp: 'store',
            },
          ],
          timestampWrites: profiler.pass('composite'),
        });
        pass.setPipeline(show);
        pass.setBindGroup(0, marchGroup);
        pass.setBindGroup(1, showGroup);
        pass.draw(3);
        flakes.encode(pass);
        pass.end();
        tail.encode(encoder, target, time, params, profiler, NO_TONEMAP);
      },
      destroy() {
        half.destroy();
        flakes.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
