import { createShader, withChunks, type ShaderSource } from '../shader.ts';
import { createUniformBuffer, defineUniformStruct, type UniformValues } from '../uniforms.ts';
import shader from './flakes.wgsl';

/*
 * Story 2.1: a layer of snowflakes, drawn as instanced quads into a premultiplied target.
 *
 *   const layer = createFlakeLayer(device, { format: tail.scene.format, capacity: 9000 });
 *   layer.set({ ...flake settings });
 *   layer.encode(pass);   // in a pass on the scene, blended "over"
 *
 * The motion and shading are in flakes.wgsl. Flakes have no state: `set` takes the settings for
 * this frame and the shader works out every flake's position from its index and the time.
 */

export const FlakeParams = defineUniformStruct('FlakeParams', {
  width: 'f32',
  height: 'f32',
  aspect: 'f32',
  time: 'f32',
  /** Instances in the layer, and how many of them to draw (the rest are skipped at random). */
  capacity: 'f32',
  count: 'f32',
  /** Depth range, metres. */
  near: 'f32',
  far: 'f32',
  /** Mean flake diameter, millimetres. */
  diameter: 'f32',
  /** Drawn size relative to the true projection. */
  size: 'f32',
  /** Mean wind, m/s (positive to the right); gust displacement, m; gust knots a second. */
  wind: 'f32',
  gust: 'f32',
  gust_rate: 'f32',
  /** Swirl displacement, m. */
  swirl: 'f32',
  /** Speed into the snow, m/s: flakes stream outwards from the centre. */
  drive: 'f32',
  /** Shutter time for the streaks, seconds; 0 for none. */
  shutter: 'f32',
  /** Distance in focus, m, and the aperture's diameter, mm: 0 keeps every flake sharp. */
  focus: 'f32',
  aperture: 'f32',
  /** Depth at which a flake's light has fallen to 1/e, m. */
  visibility: 'f32',
  brightness: 'f32',
  /** Strength of the dark ring that carries flakes over a white page. */
  edge: 'f32',
});

export type FlakeSettings = Omit<UniformValues<typeof FlakeParams.fields>, 'capacity'>;

export interface FlakeLayerOptions {
  /** Format of the target the layer draws into. */
  format: GPUTextureFormat;
  /** Instances drawn each frame; `count` chooses how many of them show. */
  capacity: number;
  label?: string;
}

export interface FlakeLayer {
  readonly capacity: number;
  set(settings: FlakeSettings): void;
  /** Draws the flakes in a pass on a premultiplied target. */
  encode(pass: GPURenderPassEncoder): void;
  destroy(): void;
}

/** The WGSL the layer compiles, for tests that want the flake functions on their own. */
export const flakeShader: ShaderSource = shader;

export function createFlakeLayer(device: GPUDevice, options: FlakeLayerOptions): FlakeLayer {
  const label = options.label ?? 'flakes';
  const uniforms = createUniformBuffer(device, FlakeParams, `${label} params`);
  const module = createShader(
    device,
    withChunks(shader, { 'flake-params.wgsl': FlakeParams.wgsl }),
  );
  const over: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' };
  const pipeline = device.createRenderPipeline({
    label: `${label} pipeline`,
    layout: 'auto',
    vertex: { module, entryPoint: 'flake_vs' },
    fragment: {
      module,
      entryPoint: 'flake_fs',
      targets: [{ format: options.format, blend: { color: over, alpha: over } }],
    },
    primitive: { topology: 'triangle-strip' },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniforms.buffer } }],
  });
  const capacity = options.capacity;

  return {
    capacity,
    set(settings) {
      uniforms.set({ ...settings, capacity });
      uniforms.upload();
    },
    encode(pass) {
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(4, capacity);
    },
    destroy() {
      uniforms.destroy();
    },
  };
}

/**
 * Story 2.4: how fast flakes at `depth` metres appear to expand when the view moves into the snow
 * at `drive` m/s, in zoom doublings a second. A flake's distance from the centre of the view goes
 * as 1/z, so it grows at drive / z per second, which is drive / (z ln 2) doublings. The motion
 * check cannot measure driven snow (a sparse field of faint flakes leaves too few blocks to
 * track), so this, from the effect's own transform, is what is held to the zoom cap.
 */
export function driveZoom(drive: number, depth: number): number {
  return drive / (depth * Math.LN2);
}
