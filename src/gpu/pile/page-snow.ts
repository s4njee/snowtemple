import { trackDomRects } from '../dom-rects.ts';
import { createFlakeLayer, type FlakeSettings } from '../snow/flakes.ts';
import type { PileSettings } from './pile.ts';
import { createPiles, type Edge, type PileFrame } from './piles.ts';

/*
 * Stories 3.2 and 3.5: snow falling onto the page's own elements, shared by `settling-snow` and
 * `melt`. The elements marked `data-sn-obstacle` (dom-rects.ts) give their top edges; the pointer
 * is read from the window, so it brushes snow even where page content sits above the canvas, and
 * a press on an element shakes its pile loose.
 */

export interface PageSnowFrame {
  width: number;
  height: number;
  dpr: number;
  dt: number;
  time: number;
  flakes: Omit<FlakeSettings, 'width' | 'height' | 'aspect'>;
  settings: PileFrame['settings'];
  /** Brush radius (CSS px) and strength at full pointer speed (px a second); 0 for none. */
  brush: { radius: number; strength: number };
  /** Share of a pile a press shakes loose. */
  shake: number;
  rim: number;
}

export interface PageSnow {
  frame(
    encoder: GPUCommandEncoder,
    view: GPUTextureView,
    frame: PageSnowFrame,
    timestampWrites?: GPURenderPassTimestampWrites,
  ): void;
  destroy(): void;
}

export type { PileSettings };

export function createPageSnow(
  device: GPUDevice,
  canvas: HTMLCanvasElement,
  options: { format: GPUTextureFormat; capacity: number; label: string },
): PageSnow {
  const flakes = createFlakeLayer(device, {
    format: options.format,
    capacity: options.capacity,
    label: options.label,
  });
  const piles = createPiles(device, { format: options.format, label: options.label });
  const dom = trackDomRects(canvas);
  // The pointer, from the window, in CSS px of the canvas; presses queue a shake.
  let pointer: { x: number; y: number; t: number; vx: number; vy: number } | undefined;
  const presses: Element[] = [];
  const hasWindow =
    typeof window !== 'undefined' && typeof canvas.getBoundingClientRect === 'function';
  const onMove = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    const t = event.timeStamp / 1000;
    if (pointer && t > pointer.t) {
      const k = Math.min(1, (t - pointer.t) / 0.05);
      pointer.vx += ((x - pointer.x) / (t - pointer.t) - pointer.vx) * k;
      pointer.vy += ((y - pointer.y) / (t - pointer.t) - pointer.vy) * k;
    }
    pointer = { x, y, t, vx: pointer?.vx ?? 0, vy: pointer?.vy ?? 0 };
  };
  const onDown = (event: PointerEvent) => {
    if (event.target instanceof Element) presses.push(event.target);
  };
  if (hasWindow) {
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
  }

  return {
    frame(encoder, view, f, timestampWrites) {
      const { obstacles } = dom.update(f.dt);
      const edges: Edge[] = [];
      const shaken = new Map<unknown, number>();
      obstacles.forEach((o, index) => {
        const key = o.element ?? index;
        const left = Math.max(0, o.box.left) * f.width;
        const right = Math.min(1, o.box.right) * f.width;
        if (right - left < 2) return;
        edges.push({
          key,
          x: left,
          top: o.box.top * f.height,
          width: right - left,
          bottom: o.box.bottom * f.height,
        });
        if (o.element && presses.some((p) => o.element!.contains(p))) shaken.set(key, f.shake);
      });
      presses.length = 0;
      // Pointer speed decays when it stops moving.
      let brush: PileFrame['brush'];
      if (pointer && f.brush.radius > 0) {
        const age = performance.now() / 1000 - pointer.t;
        const fade = age < 0.1 ? 1 : 0;
        const speed = Math.hypot(pointer.vx, pointer.vy) * fade;
        brush = {
          x: pointer.x,
          y: pointer.y,
          vx: pointer.vx * fade,
          vy: pointer.vy * fade,
          radius: f.brush.radius,
          strength: f.brush.strength * Math.min(1, speed / 400),
        };
      }
      piles.update(encoder, {
        width: f.width,
        height: f.height,
        dpr: f.dpr,
        dt: f.dt,
        time: f.time,
        edges,
        settings: f.settings,
        brush,
        shaken,
        light: {
          sun: [1, 0.98, 0.95],
          sky: [0.6, 0.7, 0.9],
          rim: [0.32, 0.42, 0.58],
          rimAlpha: f.rim,
        },
      });
      flakes.set({
        ...f.flakes,
        width: f.width * f.dpr,
        height: f.height * f.dpr,
        aspect: f.width / f.height,
      });
      const pass = encoder.beginRenderPass({
        label: options.label,
        colorAttachments: [
          { view, loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store' },
        ],
        timestampWrites,
      });
      flakes.encode(pass);
      piles.draw(pass);
      pass.end();
    },
    destroy() {
      if (hasWindow) {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerdown', onDown);
      }
      dom.destroy();
      flakes.destroy();
      piles.destroy();
    },
  };
}
