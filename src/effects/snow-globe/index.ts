import { createFullscreenPipeline } from '../../gpu/fullscreen.ts';
import { createHdrTail, OVERLAY_PARAMS, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { createShader, withChunks } from '../../gpu/shader.ts';
import { createUniformBuffer, defineUniformStruct } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import drawShader from './draw.wgsl';
import shader from './globe.wgsl';
import { meta } from './meta.ts';

const CAPACITY = 2400;

const Params = defineUniformStruct('Params', {
  dt: 'f32',
  time: 'f32',
  energy: 'f32',
  spin: 'f32',
  sink: 'f32',
  css: 'f32',
  radius: 'f32',
  outline: 'f32',
  count: 'u32',
  /** The globe's centre and the view's size, CSS px. */
  centre: 'vec4f',
  view: 'vec4f',
});

const NO_TONEMAP = { output: { tonemap: 'none' } } as const;
/** Seconds without a shake before the globe gives itself a gentle one. */
const IDLE = 14;

export const effect = defineEffect({
  meta,
  params: {
    ...DOSE_PARAMS,
    flakes: { type: 'number', default: 1600, min: 200, max: CAPACITY, step: 50 },
    size: { type: 'number', default: 0.36, min: 0.2, max: 0.48, step: 0.01, label: 'globe size' },
    idle: { type: 'boolean', default: true, label: 'shakes itself when idle' },
    outline: {
      type: 'number',
      default: 0.4,
      min: 0,
      max: 1,
      step: 0.05,
      label: 'edge for light pages',
    },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
    ...OVERLAY_PARAMS,
    alpha: { ...OVERLAY_PARAMS.alpha, default: 'coverage' },
  },
  presets: {
    'snow globe': {},
    'thick with snow': { flakes: 2400 },
    'still until shaken': { idle: false },
    small: { size: 0.24 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'snow-globe' });
    const uniforms = createUniformBuffer(device, Params, 'snow-globe params');
    const flakes = device.createBuffer({
      label: 'snow-globe flakes',
      size: CAPACITY * 8 * 4,
      usage: GPUBufferUsage.STORAGE,
    });
    const module = createShader(device, withChunks(shader, { 'params.wgsl': Params.wgsl }));
    const swirl = device.createComputePipeline({
      label: 'snow-globe swirl',
      layout: 'auto',
      compute: { module, entryPoint: 'swirl' },
    });
    const swirlGroup = device.createBindGroup({
      layout: swirl.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 1, resource: { buffer: flakes } },
      ],
    });
    const draw = withChunks(drawShader, { 'params.wgsl': Params.wgsl });
    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: {} },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    const over: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' };
    const blend = { color: over, alpha: over };
    const interior = createFullscreenPipeline(device, {
      fragment: draw,
      entryPoint: 'interior',
      format: tail.scene.format,
      layout: [layout],
    });
    const glass = createFullscreenPipeline(device, {
      fragment: draw,
      entryPoint: 'glass',
      format: tail.scene.format,
      layout: [layout],
      blend,
    });
    const drawModule = createShader(device, draw);
    const flakePipeline = device.createRenderPipeline({
      label: 'snow-globe flakes',
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: { module: drawModule, entryPoint: 'flake_vs' },
      fragment: {
        module: drawModule,
        entryPoint: 'flake_fs',
        targets: [{ format: tail.scene.format, blend }],
      },
      primitive: { topology: 'triangle-strip' },
    });
    const drawGroup = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 1, resource: { buffer: flakes } },
      ],
    });

    let width = 1;
    let height = 1;
    let dpr = 1;
    let clock = 0;
    // A shake when it appears, so the globe opens with snow in the water.
    let energy = 1;
    let spin = 0.6;
    let quiet = 0;
    let drag: { x: number; y: number; t: number } | undefined;
    const hasWindow =
      typeof window !== 'undefined' && typeof canvas.getBoundingClientRect === 'function';
    const globeAt = () => {
      const r = (params.size * Math.min(width, height)) / dpr;
      return { cx: width / dpr / 2, cy: (height / dpr) * 0.44, r };
    };
    const shake = (amount: number, direction: number) => {
      energy = Math.min(1.6, energy + amount);
      spin = Math.max(-1.2, Math.min(1.2, spin + direction * amount * 0.6));
      quiet = 0;
    };
    const onMove = (event: PointerEvent) => {
      if (!(event.buttons & 1)) {
        drag = undefined;
        return;
      }
      const box = canvas.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      const t = event.timeStamp / 1000;
      const { cx, cy, r } = globeAt();
      if (drag && t > drag.t && Math.hypot(x - cx, y - cy) < r * 1.4) {
        const vx = (x - drag.x) / (t - drag.t);
        const vy = (y - drag.y) / (t - drag.t);
        shake(Math.min(0.15, Math.hypot(vx, vy) / r / 40), Math.sign(vx));
      }
      drag = { x, y, t };
    };
    const onDown = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      const { cx, cy, r } = globeAt();
      if (Math.hypot(event.clientX - box.left - cx, event.clientY - box.top - cy) < r * 1.4)
        shake(0.7, Math.random() < 0.5 ? -1 : 1);
    };
    const onMotion = (event: DeviceMotionEvent) => {
      const a = event.acceleration;
      const m = a ? Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) : 0;
      if (m > 4) shake(Math.min(0.2, (m - 4) / 40), Math.sign(a?.x ?? 1));
    };
    if (hasWindow) {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerdown', onDown, { passive: true });
      window.addEventListener('devicemotion', onMotion, { passive: true });
    }

    return {
      resize(w, h, ratio) {
        width = w;
        height = h;
        dpr = ratio;
        tail.resize(w, h);
      },
      frame(time, encoder, target) {
        const dt = time.still ? 0 : Math.min(time.delta, 0.05);
        clock += dt;
        quiet += dt;
        if (params.idle && quiet > IDLE) shake(0.45, 1);
        // The water calms over a few seconds.
        energy *= Math.exp(-dt / 2.8);
        spin *= Math.exp(-dt / 3.5);
        const { cx, cy, r } = globeAt();
        uniforms.set({
          dt,
          time: clock,
          energy: energy * dosed(params.dose, 0.4, 1, 1.6),
          spin,
          sink: 0.09,
          css: dpr,
          radius: r,
          outline: params.outline,
          count: Math.min(CAPACITY, Math.round(params.flakes)),
          centre: [cx, cy, 0, 0],
          view: [width / dpr, height / dpr, 0, 0],
        });
        uniforms.upload();
        const compute = encoder.beginComputePass({
          label: 'snow-globe',
          timestampWrites: profiler.pass('swirl'),
        });
        compute.setPipeline(swirl);
        compute.setBindGroup(0, swirlGroup);
        compute.dispatchWorkgroups(Math.ceil(CAPACITY / 64));
        compute.end();
        const pass = encoder.beginRenderPass({
          label: 'snow-globe',
          colorAttachments: [
            {
              view: tail.scene.view,
              loadOp: 'clear',
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              storeOp: 'store',
            },
          ],
          timestampWrites: profiler.pass('globe'),
        });
        pass.setBindGroup(0, drawGroup);
        pass.setPipeline(interior);
        pass.draw(3);
        pass.setPipeline(flakePipeline);
        pass.draw(4, Math.min(CAPACITY, Math.round(params.flakes)));
        pass.setPipeline(glass);
        pass.draw(3);
        pass.end();
        tail.encode(encoder, target, time, params, profiler, NO_TONEMAP);
      },
      destroy() {
        if (hasWindow) {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerdown', onDown);
          window.removeEventListener('devicemotion', onMotion);
        }
        flakes.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
