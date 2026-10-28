import { createFullscreenPipeline } from '../fullscreen.ts';
import { createShader, withChunks } from '../shader.ts';
import { createUniformBuffer, defineUniformStruct, uniformArray } from '../uniforms.ts';
import drawShader from './draw.wgsl';
import { MAX_COLUMNS, type PileSettings } from './pile.ts';
import shader from './pile.wgsl';

/*
 * Story 3.1: the GPU side of snow piles (pile.wgsl, draw.wgsl; the model is in pile.ts).
 *
 *   const piles = createPiles(device, { format: tail.scene.format });
 *   // each frame:
 *   piles.update(encoder, { width, height, dpr, dt, time, edges, settings, ... });
 *   piles.draw(pass);   // in a pass on the scene, blended "over"
 *
 * Edges are the page's elements' top edges (from `trackDomRects`), each keyed by its element so
 * its row, and its snow, stay with it as it moves. A new edge starts with a blanket `start` deep;
 * an edge that changes width is resampled, keeping its snow; an edge that goes away is dropped.
 * Row 0 is the ground along the canvas's bottom, always there.
 */

export const MAX_ROWS = 32;
/** Loose particles (snow knocked off, drips) alive at once. */
export const LOOSE_CAPACITY = 4096;

export const PileParams = defineUniformStruct('PileParams', {
  width: 'f32',
  height: 'f32',
  css: 'f32',
  dt: 'f32',
  time: 'f32',
  rate: 'f32',
  depth: 'f32',
  start: 'f32',
  talus: 'f32',
  wind: 'f32',
  melt: 'f32',
  cornice: 'f32',
  drip: 'f32',
  /** How unevenly snow arrives along an edge, 0 even. */
  variation: 'f32',
  /** Loose snow's fall speed and the wind's drift on it, CSS px a second. */
  fall: 'f32',
  wind_speed: 'f32',
  rows: 'u32',
  capacity: 'u32',
  /** Pointer brushing snow: x, y (CSS px), radius, strength (px a second). */
  brush: 'vec4f',
  brush_velocity: 'vec4f',
  /** Light colours for the shading, linear: the sun, the sky's blue, the rim (alpha its strength). */
  sun: 'vec4f',
  sky: 'vec4f',
  rim: 'vec4f',
  /** Per row: left x, top y, width (CSS px), columns. */
  geometry: uniformArray('vec4f', MAX_ROWS),
  /** Per row: bottom y, alive, old columns (-1 fresh, 0 unchanged), shake share. */
  extent: uniformArray('vec4f', MAX_ROWS),
});

/** A top edge to hold snow, in CSS pixels of the canvas, keyed by what owns it. */
export interface Edge {
  key: unknown;
  x: number;
  top: number;
  width: number;
  bottom: number;
}

export interface PileFrame {
  width: number;
  height: number;
  dpr: number;
  dt: number;
  time: number;
  edges: readonly Edge[];
  settings: PileSettings & {
    start: number;
    drip: number;
    fall: number;
    windSpeed: number;
    variation?: number;
  };
  /** Pointer brushing: CSS px, or undefined when it is not over the canvas. */
  brush?: { x: number; y: number; vx: number; vy: number; radius: number; strength: number };
  /** Keys of edges whose snow a press shook loose this frame, with the share shaken off. */
  shaken?: ReadonlyMap<unknown, number>;
  /** Relaxations a frame. Default 4. */
  iterations?: number;
  /** Light colours, linear RGB, and the rim's strength. */
  light?: {
    sun: readonly number[];
    sky: readonly number[];
    rim: readonly number[];
    rimAlpha: number;
  };
}

export interface Piles {
  update(encoder: GPUCommandEncoder, frame: PileFrame): void;
  /** Draws the piles and the loose snow in a pass on a premultiplied target. */
  draw(pass: GPURenderPassEncoder): void;
  /** The texture the latest heights are in (rows by columns, r32float), for tests. */
  readonly heights: GPUTexture;
  /** Which row an edge's key has, for tests. */
  rowOf(key: unknown): number | undefined;
  destroy(): void;
}

const GROUND = Symbol('ground');

export function createPiles(
  device: GPUDevice,
  options: { format: GPUTextureFormat; label?: string },
): Piles {
  const label = options.label ?? 'piles';
  const uniforms = createUniformBuffer(device, PileParams, `${label} params`);
  const textures = [0, 1].map((i) =>
    device.createTexture({
      label: `${label} heights ${i}`,
      size: [MAX_COLUMNS, MAX_ROWS],
      format: 'r32float',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    }),
  );
  const landing = device.createBuffer({
    label: `${label} landing`,
    size: MAX_COLUMNS * MAX_ROWS * 4,
    usage: GPUBufferUsage.STORAGE,
  });
  const particles = device.createBuffer({
    label: `${label} loose`,
    size: LOOSE_CAPACITY * 8 * 4,
    usage: GPUBufferUsage.STORAGE,
  });
  const counter = device.createBuffer({
    label: `${label} counter`,
    size: 4,
    usage: GPUBufferUsage.STORAGE,
  });
  const module = createShader(device, withChunks(shader, { 'pile-params.wgsl': PileParams.wgsl }));
  const layout = device.createBindGroupLayout({
    label: `${label} layout`,
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: {} },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        texture: { sampleType: 'unfilterable-float' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: 'write-only', format: 'r32float' },
      },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
  const compute = (entryPoint: string) =>
    device.createComputePipeline({
      label: `${label} ${entryPoint}`,
      layout: pipelineLayout,
      compute: { module, entryPoint },
    });
  const supply = compute('supply');
  const relax = compute('relax');
  const loose = compute('loose');
  // groups[i] reads texture i and writes the other.
  const groups = [0, 1].map((i) =>
    device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 1, resource: textures[i]!.createView() },
        { binding: 2, resource: textures[1 - i]!.createView() },
        { binding: 3, resource: { buffer: landing } },
        { binding: 4, resource: { buffer: particles } },
        { binding: 5, resource: { buffer: counter } },
      ],
    }),
  );

  const drawModule = withChunks(drawShader, { 'pile-params.wgsl': PileParams.wgsl });
  const over: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' };
  const blend = { color: over, alpha: over };
  const drawLayout = device.createBindGroupLayout({
    label: `${label} draw layout`,
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX, buffer: {} },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'unfilterable-float' },
      },
      { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ],
  });
  const pilePipeline = createFullscreenPipeline(device, {
    fragment: drawModule,
    entryPoint: 'piles',
    format: options.format,
    blend,
    layout: [drawLayout],
  });
  const looseModule = createShader(device, drawModule);
  const loosePipeline = device.createRenderPipeline({
    label: `${label} loose`,
    layout: device.createPipelineLayout({ bindGroupLayouts: [drawLayout] }),
    vertex: { module: looseModule, entryPoint: 'loose_vs' },
    fragment: {
      module: looseModule,
      entryPoint: 'loose_fs',
      targets: [{ format: options.format, blend }],
    },
    primitive: { topology: 'triangle-strip' },
  });
  const drawGroups = [0, 1].map((i) =>
    device.createBindGroup({
      layout: drawLayout,
      entries: [
        { binding: 0, resource: { buffer: uniforms.buffer } },
        { binding: 1, resource: textures[i]!.createView() },
        { binding: 2, resource: { buffer: particles } },
      ],
    }),
  );

  /** Which texture holds the latest heights. */
  let current = 0;
  const rows = new Map<unknown, number>();
  const columns = new Array<number>(MAX_ROWS).fill(0);

  return {
    get heights() {
      return textures[current]!;
    },
    rowOf(key) {
      return rows.get(key);
    },
    update(encoder, frame) {
      const { width, height, settings: s } = frame;
      // Rows: the ground first, then each edge keeps the row it had.
      const edges: Edge[] = [
        { key: GROUND, x: 0, top: height, width, bottom: height + 1e5 },
        ...frame.edges,
      ];
      const seen = new Set(edges.map((e) => e.key));
      for (const [key, row] of rows) {
        if (!seen.has(key)) {
          rows.delete(key);
          columns[row] = 0;
        }
      }
      const used = new Set(rows.values());
      const geometry = new Array<number>(MAX_ROWS * 4).fill(0);
      const extent = new Array<number>(MAX_ROWS * 4).fill(0);
      let top = 0;
      for (const edge of edges) {
        let row = rows.get(edge.key);
        if (row === undefined) {
          row =
            edge.key === GROUND
              ? 0
              : [...Array(MAX_ROWS).keys()].find((r) => r > 0 && !used.has(r));
          if (row === undefined) continue;
          rows.set(edge.key, row);
          used.add(row);
          columns[row] = -1;
        }
        const n = Math.max(1, Math.min(MAX_COLUMNS, Math.round(edge.width)));
        const old = columns[row]! < 0 ? -1 : columns[row] === n ? 0 : columns[row]!;
        columns[row] = n;
        geometry.splice(row * 4, 4, edge.x, edge.top, edge.width, n);
        extent.splice(row * 4, 4, edge.bottom, 1, old, frame.shaken?.get(edge.key) ?? 0);
        top = Math.max(top, row + 1);
      }
      const light = frame.light ?? {
        sun: [1, 0.98, 0.95],
        sky: [0.6, 0.7, 0.9],
        rim: [0.35, 0.45, 0.6],
        rimAlpha: 0.35,
      };
      const b = frame.brush;
      uniforms.set({
        width,
        height,
        css: frame.dpr,
        dt: Math.min(frame.dt, 0.1),
        time: frame.time,
        rate: s.rate,
        depth: s.depth,
        start: s.start,
        talus: s.talus,
        wind: s.wind,
        melt: s.melt,
        cornice: s.cornice,
        drip: s.drip,
        variation: s.variation ?? 0,
        fall: s.fall,
        wind_speed: s.windSpeed,
        rows: top,
        capacity: LOOSE_CAPACITY,
        brush: b ? [b.x, b.y, b.radius, b.strength] : [0, 0, 0, 0],
        brush_velocity: b ? [b.vx, b.vy, 0, 0] : [0, 0, 0, 0],
        sun: [light.sun[0]!, light.sun[1]!, light.sun[2]!, 1],
        sky: [light.sky[0]!, light.sky[1]!, light.sky[2]!, 1],
        rim: [light.rim[0]!, light.rim[1]!, light.rim[2]!, light.rimAlpha],
        geometry,
        extent,
      });
      uniforms.upload();
      const pass = encoder.beginComputePass({ label });
      const groupsX = Math.ceil(MAX_COLUMNS / 64);
      pass.setPipeline(supply);
      pass.setBindGroup(0, groups[current]!);
      pass.dispatchWorkgroups(groupsX, MAX_ROWS);
      current = 1 - current;
      // The supply pass has applied any resample or fresh start; relaxations must not redo it,
      // and they read only heights, so the flags in `extent` do not matter to them.
      pass.setPipeline(relax);
      for (let k = 0; k < (frame.iterations ?? 4); k++) {
        pass.setBindGroup(0, groups[current]!);
        pass.dispatchWorkgroups(groupsX, MAX_ROWS);
        current = 1 - current;
      }
      pass.setPipeline(loose);
      pass.setBindGroup(0, groups[current]!);
      pass.dispatchWorkgroups(Math.ceil(LOOSE_CAPACITY / 64));
      pass.end();
    },
    draw(pass) {
      pass.setPipeline(pilePipeline);
      pass.setBindGroup(0, drawGroups[current]!);
      pass.draw(3);
      pass.setPipeline(loosePipeline);
      pass.setBindGroup(0, drawGroups[current]!);
      pass.draw(4, LOOSE_CAPACITY);
    },
    destroy() {
      uniforms.destroy();
      for (const t of textures) t.destroy();
      landing.destroy();
      particles.destroy();
      counter.destroy();
    },
  };
}
