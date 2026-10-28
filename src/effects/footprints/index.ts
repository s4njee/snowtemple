import { createFullscreenPipeline, renderFullscreen } from '../../gpu/fullscreen.ts';
import { createHdrTail, TAIL_PARAMS } from '../../gpu/post/index.ts';
import { DOSE_PARAMS, dosed } from '../../gpu/safety/dose.ts';
import { createShader, withChunks } from '../../gpu/shader.ts';
import { createFlakeLayer } from '../../gpu/snow/flakes.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from '../../gpu/uniforms.ts';
import { defineEffect } from '../types.ts';
import { meta } from './meta.ts';
import shader from './surface.wgsl';

/** Steps stamped in one frame at most. */
const MAX_STEPS = 4;
const CELL = 2;
const FLAKES = 2000;

const Params = defineUniformStruct('Params', {
  css: 'f32',
  cell: 'f32',
  dt: 'f32',
  base: 'f32',
  packed: 'f32',
  rim: 'f32',
  fill: 'f32',
  settle: 'f32',
  talus: 'f32',
  fresh: 'u32',
  steps: 'u32',
  sun: 'vec4f',
  sky: 'vec4f',
  /** Per step: x, y (CSS px), heading (radians). */
  step_at: uniformArray('vec4f', MAX_STEPS),
});

const NO_TONEMAP = { output: { tonemap: 'none' } } as const;

/** A walker's steps: one every `stride` px along the path, alternating left and right of it. */
export class Walker {
  private travelled = 0;
  private side = 1;
  private last: [number, number] | undefined;
  constructor(
    readonly stride: number,
    readonly gait: number,
  ) {}
  /** Moves the walker to (x, y); returns the steps it took on the way. */
  walk(x: number, y: number): { x: number; y: number; heading: number }[] {
    const steps: { x: number; y: number; heading: number }[] = [];
    if (!this.last) {
      this.last = [x, y];
      return steps;
    }
    const [px, py] = this.last;
    const dx = x - px;
    const dy = y - py;
    const distance = Math.hypot(dx, dy);
    // A jump (the pointer came back elsewhere) starts a new trail.
    if (distance > this.stride * 6) {
      this.last = [x, y];
      return steps;
    }
    if (distance < 1e-3) return steps;
    const heading = Math.atan2(dy, dx);
    let along = this.stride - this.travelled;
    while (along <= distance && steps.length < MAX_STEPS) {
      const t = along / distance;
      this.side = -this.side;
      steps.push({
        x: px + dx * t - Math.sin(heading) * this.gait * this.side,
        y: py + dy * t + Math.cos(heading) * this.gait * this.side,
        heading,
      });
      along += this.stride;
    }
    this.travelled = (this.travelled + distance) % this.stride;
    this.last = [x, y];
    return steps;
  }
}

export const effect = defineEffect({
  meta,
  params: {
    ...DOSE_PARAMS,
    depth: { type: 'number', default: 22, min: 6, max: 50, step: 1, label: 'depth (CSS px)' },
    stride: { type: 'number', default: 34, min: 16, max: 80, step: 1, label: 'stride (CSS px)' },
    fill: {
      type: 'number',
      default: 0.6,
      min: 0,
      max: 5,
      step: 0.05,
      label: 'snow fills prints (px a second)',
    },
    flakes: { type: 'boolean', default: true, label: 'falling snow' },
    ...TAIL_PARAMS,
    bloom: { ...TAIL_PARAMS.bloom, default: 0 },
  },
  presets: {
    'fresh snow': {},
    'deep snow': { depth: 40, stride: 40 },
    'filling fast': { fill: 2.5, dose: 0.6 },
    'no snow falling': { flakes: false, fill: 0 },
  },

  async create({ device, format, hdr, canvas, params, profiler }) {
    const tail = createHdrTail(device, { format, hdr, label: 'footprints' });
    const uniforms = createUniformBuffer(device, Params, 'footprints params');
    const fragment = withChunks(shader, { 'params.wgsl': Params.wgsl });
    const module = createShader(device, fragment);
    const fields: GPUTexture[] = [];
    let groups: GPUBindGroup[] = [];
    let drawGroups: GPUBindGroup[] = [];
    const settle = device.createComputePipeline({
      label: 'footprints settle',
      layout: 'auto',
      compute: { module, entryPoint: 'settle' },
    });
    const slump = device.createComputePipeline({
      label: 'footprints slump',
      layout: 'auto',
      compute: { module, entryPoint: 'slump' },
    });
    const draw = createFullscreenPipeline(device, {
      fragment,
      entryPoint: 'surface',
      format: tail.scene.format,
    });
    const flakes = createFlakeLayer(device, {
      format: tail.scene.format,
      capacity: FLAKES,
      label: 'footprints',
    });
    let current = 0;
    let fresh = true;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let clock = 0;
    const walker = new Walker(params.stride, 9);
    let pointer: { x: number; y: number; t: number } | undefined;
    const hasWindow =
      typeof window !== 'undefined' && typeof canvas.getBoundingClientRect === 'function';
    const onMove = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      pointer = {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
        t: performance.now() / 1000,
      };
    };
    if (hasWindow) window.addEventListener('pointermove', onMove, { passive: true });

    const allocate = () => {
      for (const f of fields) f.destroy();
      fields.length = 0;
      const cols = Math.max(1, Math.ceil(width / dpr / CELL));
      const rows = Math.max(1, Math.ceil(height / dpr / CELL));
      for (let i = 0; i < 2; i++) {
        fields.push(
          device.createTexture({
            label: `footprints depth ${i}`,
            size: [cols, rows],
            format: 'r32float',
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
          }),
        );
      }
      const group = (pipeline: GPUComputePipeline, i: number) =>
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniforms.buffer } },
            { binding: 1, resource: fields[i]!.createView() },
            { binding: 2, resource: fields[1 - i]!.createView() },
          ],
        });
      groups = [group(settle, 0), group(settle, 1), group(slump, 0), group(slump, 1)];
      drawGroups = [0, 1].map((i) =>
        device.createBindGroup({
          layout: draw.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniforms.buffer } },
            { binding: 1, resource: fields[i]!.createView() },
          ],
        }),
      );
      current = 0;
      fresh = true;
    };

    return {
      resize(w, h, ratio) {
        width = w;
        height = h;
        dpr = ratio;
        tail.resize(w, h);
        allocate();
      },
      frame(time, encoder, target) {
        const dt = time.still ? 0 : Math.min(time.delta, 0.1);
        clock += dt;
        const cssW = width / dpr;
        const cssH = height / dpr;
        // The pointer walks while it is moving; otherwise someone crosses on their own, slowly.
        const now = performance.now() / 1000;
        let at: [number, number];
        if (pointer && now - pointer.t < 3) {
          at = [pointer.x, pointer.y];
        } else {
          const lap = cssW + 200;
          const s = (clock * 55) % lap;
          at = [s - 100, cssH * (0.55 + 0.18 * Math.sin(clock * 0.21))];
        }
        const steps = dt > 0 ? walker.walk(...at).filter((s) => s.x > -20 && s.x < cssW + 20) : [];
        const stepAt = Array.from({ length: MAX_STEPS }, (_, k) => {
          const s = steps[k];
          return s ? [s.x, s.y, s.heading, 0] : [0, 0, 0, 0];
        }).flat();
        uniforms.set({
          css: dpr,
          cell: CELL,
          dt,
          base: params.depth,
          packed: 0.3,
          rim: 7,
          fill: params.fill * dosed(params.dose, 0.3, 1, 2),
          settle: 0.04,
          talus: Math.tan((38 * Math.PI) / 180),
          fresh: fresh ? 1 : 0,
          steps: steps.length,
          sun: [1, 0.97, 0.92, 1],
          sky: [0.6, 0.7, 0.92, 1],
          step_at: stepAt,
        });
        uniforms.upload();
        fresh = false;
        const cols = fields[0]!.width;
        const rows = fields[0]!.height;
        const pass = encoder.beginComputePass({
          label: 'footprints',
          timestampWrites: profiler.pass('surface'),
        });
        pass.setPipeline(settle);
        pass.setBindGroup(0, groups[current]!);
        pass.dispatchWorkgroups(Math.ceil(cols / 8), Math.ceil(rows / 8));
        current = 1 - current;
        pass.setPipeline(slump);
        for (let k = 0; k < 2; k++) {
          pass.setBindGroup(0, groups[2 + current]!);
          pass.dispatchWorkgroups(Math.ceil(cols / 8), Math.ceil(rows / 8));
          current = 1 - current;
        }
        pass.end();
        renderFullscreen(encoder, tail.scene.view, draw, [drawGroups[current]!], {
          timestampWrites: profiler.pass('draw'),
        });
        if (params.flakes) {
          flakes.set({
            width,
            height,
            aspect: width / height,
            time: clock,
            count: dosed(params.dose, 0.1, 0.4, 0.8) * FLAKES,
            near: 0.5,
            far: 15,
            diameter: 3,
            size: 1.5,
            wind: 0.4,
            gust: 0.2,
            gust_rate: 0.6,
            swirl: 0.1,
            drive: 0,
            shutter: 0.004,
            focus: 3,
            aperture: 15,
            visibility: 18,
            brightness: 1,
            edge: 0.35,
          });
          const over = encoder.beginRenderPass({
            label: 'footprints flakes',
            colorAttachments: [{ view: tail.scene.view, loadOp: 'load', storeOp: 'store' }],
          });
          flakes.encode(over);
          over.end();
        }
        tail.encode(encoder, target, time, params, profiler, NO_TONEMAP);
      },
      destroy() {
        if (hasWindow) window.removeEventListener('pointermove', onMove);
        for (const f of fields) f.destroy();
        flakes.destroy();
        uniforms.destroy();
        tail.destroy();
      },
    };
  },
});
