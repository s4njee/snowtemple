// Story 2.5: page snow four ways, chosen by the query string, for experiments/snow-compare.mjs.
//
//   ?method=css&n=400       CSS keyframes, one element per flake, reading custom properties
//   ?method=fixed&n=400     CSS keyframes of plain values, which the compositor can run alone
//   ?method=shadow&n=1600   box-shadow snow: one element with a shadow per flake, slid down
//   ?method=dom&n=400       Snowstorm.js-style elements moved from script every frame
//   ?method=webgpu&dose=0.35   the snowfall effect on a canvas over the page
//
// Every method draws white flakes of 2 to 6 px falling over the page. `window.__ready` turns
// true when the snow is running.

import { mount } from '../src/lib/index.ts';
import { effect } from '../src/effects/snowfall/index.ts';

declare global {
  interface Window {
    __ready?: boolean;
  }
}

const query = new URLSearchParams(location.search);
const method = query.get('method') ?? 'css';
const n = Number(query.get('n') ?? 400);
const random = (() => {
  let s = 12345;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
})();

function css() {
  const layer = document.createElement('div');
  layer.className = 'snow css';
  for (let i = 0; i < n; i++) {
    const flake = document.createElement('i');
    const size = 2 + 4 * random();
    const duration = 6 + 10 * random();
    flake.style.cssText = `--s:${size}px;--o:${0.5 + 0.5 * random()};--x:${100 * random()}vw;--sway:${-4 + 8 * random()}vw;--d:${duration}s;--delay:${-duration * random()}s`;
    layer.append(flake);
  }
  document.body.append(layer);
}

function fixed() {
  const layer = document.createElement('div');
  layer.className = 'snow fixed';
  for (let i = 0; i < n; i++) {
    const outer = document.createElement('s');
    const inner = document.createElement('span');
    const size = 2 + 4 * random();
    const duration = 6 + 10 * random();
    outer.style.left = `${100 * random()}vw`;
    outer.style.animationDuration = `${duration}s`;
    outer.style.animationDelay = `${-duration * random()}s`;
    inner.style.width = inner.style.height = `${size}px`;
    inner.style.opacity = String(0.5 + 0.5 * random());
    inner.style.animationDuration = `${1.5 + 2 * random()}s`;
    outer.append(inner);
    layer.append(outer);
  }
  document.body.append(layer);
}

function shadow() {
  const layer = document.createElement('div');
  layer.className = 'snow shadow';
  const shadows = Array.from({ length: n }, () => {
    const size = Math.round(random() * 2);
    return `${(100 * random()).toFixed(2)}vw ${(100 * random()).toFixed(2)}vh 0 ${size}px rgba(255,255,255,${(0.5 + 0.5 * random()).toFixed(2)})`;
  }).join(',');
  // Two copies, one a screen above the other, so the slide loops without a gap.
  for (const top of ['0', '100vh']) {
    const element = document.createElement('b');
    element.style.top = top;
    element.style.boxShadow = shadows;
    layer.append(element);
  }
  document.body.append(layer);
}

function dom() {
  const layer = document.createElement('div');
  layer.className = 'snow dom';
  const flakes = Array.from({ length: n }, () => {
    const element = document.createElement('i');
    const size = 2 + 4 * random();
    element.style.width = element.style.height = `${size}px`;
    element.style.opacity = String(0.5 + 0.5 * random());
    layer.append(element);
    return {
      element,
      x: random() * innerWidth,
      y: random() * innerHeight,
      speed: 40 + 80 * random(),
      phase: random() * 6.28,
    };
  });
  document.body.append(layer);
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const flake of flakes) {
      flake.y += flake.speed * dt;
      if (flake.y > innerHeight) flake.y -= innerHeight + 10;
      const x = flake.x + 12 * Math.sin(now / 900 + flake.phase);
      flake.element.style.transform = `translate3d(${x}px, ${flake.y}px, 0)`;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function webgpu() {
  const canvas = document.createElement('canvas');
  canvas.className = 'snow';
  document.body.append(canvas);
  await mount(canvas, effect, { initialParams: { dose: Number(query.get('dose') ?? 0.35) } });
}

if (method === 'css') css();
else if (method === 'fixed') fixed();
else if (method === 'shadow') shadow();
else if (method === 'dom') dom();
else if (method === 'webgpu') await webgpu();
window.__ready = true;
