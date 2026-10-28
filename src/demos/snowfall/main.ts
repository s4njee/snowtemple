// The "First snow" page (snowfall.html): snowfall fixed over a whole page, the way a site would use
// it. Ordinary page code: mount the effect, name the amount of snow, sweep its focus slowly near and
// far, switch the page between dark and light, and wire up the toolbar. The effect takes no pointer, so none is passed on.

import { createGpuSession } from '../../gpu/device.ts';
import { mountEffect } from '../../shell/host.ts';
import { reserveToolbar } from '../backdrop/page.ts';
// The shared page's layout and plates, in the snowfall page's colours (snowfall.css imports it).
import './snowfall.css';

const EFFECT = 'snowfall';

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`snowfall page: #${id} is missing`);
  return node as T;
}

if (import.meta.env.DEV) {
  const { installShaderOverlay } = await import('../../gpu/shader-overlay.ts');
  installShaderOverlay();
}

const stage = byId('stage');
const status = byId('status');
const amountName = byId('amount-name');
const pauseButton = byId<HTMLButtonElement>('pause');
const doseSlider = byId<HTMLInputElement>('dose');
const windSlider = byId<HTMLInputElement>('wind');
const sizeSlider = byId<HTMLInputElement>('size');
const focusSlider = byId<HTMLInputElement>('focus');
const focusValue = byId<HTMLOutputElement>('focus-value');
const sweepBox = byId<HTMLInputElement>('sweep');
const lightCheck = byId<HTMLInputElement>('light');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * What the page asks of the effect: the toolbar's controls, which start on a flurry of big flakes
 * blown hard across the window, focused close so most of them are soft.
 */
const settings: Record<string, unknown> = {
  dose: Number(doseSlider.value),
  wind: Number(windSlider.value),
  size: Number(sizeSlider.value),
  focus: Number(focusSlider.value),
};

const session = await createGpuSession();
let playing = !reducedMotion;

function set(key: string, value: unknown) {
  settings[key] = value;
  const params = host.loaded?.params;
  if (params) params[key] = value as (typeof params)[string];
}

function render() {
  const ok = session.state.ok;
  document.body.dataset.state = !ok ? 'fallback' : playing ? 'live' : 'paused';
  status.textContent = !ok
    ? 'WebGPU is unavailable'
    : `The snow is ${playing ? 'falling' : 'paused'}`;
  pauseButton.textContent = playing ? 'Pause' : 'Play';
  if (!ok) pauseButton.disabled = true;
}

/** The amount in words, at the effect's own presets: flurry 0.15, steady 0.35, heavy 0.6. */
function showAmount() {
  const dose = Number(doseSlider.value);
  amountName.textContent =
    dose < 0.25
      ? 'A flurry'
      : dose < 0.5
        ? 'Steady snow'
        : dose < 0.8
          ? 'Heavy snow'
          : 'A snowstorm';
}

const host = mountEffect(session, stage, EFFECT, {
  initialParams: settings,
  paused: !playing,
});
host.onLoad(() => {
  pauseButton.disabled = false;
  render();
});
session.onChange(render);
showAmount();
render();

// --- The toolbar -----------------------------------------------------------------------------------

reserveToolbar(document.querySelector<HTMLElement>('.toolbar')!);

pauseButton.addEventListener('click', () => {
  playing = !playing;
  if (playing) host.resume();
  else host.pause();
  render();
});

doseSlider.addEventListener('input', () => {
  set('dose', Number(doseSlider.value));
  showAmount();
});

windSlider.addEventListener('input', () => set('wind', Number(windSlider.value)));
sizeSlider.addEventListener('input', () => set('size', Number(sizeSlider.value)));

focusSlider.addEventListener('input', () => {
  // Taking the focus by hand stops the sweep.
  sweepBox.checked = false;
  set('focus', Number(focusSlider.value));
  showFocus(Number(focusSlider.value));
});

function showFocus(metres: number) {
  focusSlider.value = String(metres);
  focusValue.textContent = `${metres.toFixed(1)} m`;
}

// --- The focus sweep -------------------------------------------------------------------------------
// While the snow falls, the page walks the focus slowly out and back between the nearest flakes and
// the far ones, so the soft discs close to the lens sharpen into flakes and the distance softens,
// then the other way. Even steps in log distance, as a focus ring turns, eased at each end. The
// slider follows, and dragging it stops the sweep. The sweep's place is kept here: a frame moves it
// less than the slider's step.

/** Seconds for the focus to go out and come back. */
const SWEEP = 40;
const NEAR_FOCUS = 0.6;
const FAR_FOCUS = 8;
const SPAN = Math.log(FAR_FOCUS / NEAR_FOCUS);

/** The focus `turn` of the way through the sweep: near at 0, far at a half. */
function focusAt(turn: number): number {
  return NEAR_FOCUS * Math.exp(SPAN * (0.5 - 0.5 * Math.cos(2 * Math.PI * turn)));
}

/** How far through the sweep, in turns; it starts on its way out, at the slider's starting focus. */
let turn =
  Math.acos(
    1 - (2 * Math.log(Math.max(NEAR_FOCUS, Number(focusSlider.value)) / NEAR_FOCUS)) / SPAN,
  ) /
  (2 * Math.PI);
let last = performance.now();

function sweep(now: number) {
  const delta = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (sweepBox.checked && playing && !document.hidden) {
    turn = (turn + delta / SWEEP) % 1;
    const metres = focusAt(turn);
    set('focus', metres);
    showFocus(metres);
  }
  requestAnimationFrame(sweep);
}
requestAnimationFrame(sweep);

// The page turns pale; the flakes stay white, and their faint dark edge (the effect's `edge`, on by
// default) is what keeps them visible against it.
lightCheck.addEventListener('change', () => {
  document.documentElement.dataset.page = lightCheck.checked ? 'light' : 'dark';
});

addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  host.destroy();
  session.destroy();
});
