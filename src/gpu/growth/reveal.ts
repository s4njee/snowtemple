import type { Grower } from './phase-field.ts';

/*
 * Revealing grown ice by its arrival times (story 4.1): grow only as far ahead of the reveal as
 * it needs, and never show a step not yet grown. Shared by frost-creep and frost-text.
 */

/** Steps one frame may grow at most, so scrubbing fast costs a bounded amount a frame. */
export const MAX_STEPS_PER_FRAME = 24;

/**
 * The step a reveal of `progress` (0..1) shows. Frost spreads by diffusion, so the area it covers
 * goes roughly as the square root of the steps; squaring the progress makes the area grow evenly.
 */
export function revealStep(progress: number, total: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return total * p * p;
}

/** Grows `grower` towards `target` steps, at most `cap` this frame; returns the steps it ran. */
export function growTowards(
  grower: Grower,
  encoder: GPUCommandEncoder,
  target: number,
  total: number,
  cap: number,
  timestampWrites?: GPUComputePassTimestampWrites,
): number {
  const want = Math.max(0, Math.min(Math.ceil(target), total) - grower.steps);
  const run = Math.min(want, cap);
  grower.step(encoder, run, timestampWrites);
  return run;
}

export interface FrostCycle {
  /** Seconds freezing, holding fully frozen, then thawing to nothing. */
  freeze: number;
  hold: number;
  thaw: number;
  /** How far the first cycle starts, so the first frame is not bare glass. */
  start: number;
}

/** Which cycle `t` seconds is in, and how far the frost has got in it (0..1). */
export function frostPhase(t: number, cycle: FrostCycle): { round: number; progress: number } {
  const length = cycle.freeze + cycle.hold + cycle.thaw;
  // The first round starts `start` of the way in.
  const shifted = t + cycle.start * cycle.freeze;
  const round = Math.floor(shifted / length);
  const c = shifted - round * length;
  if (c < cycle.freeze) return { round, progress: c / cycle.freeze };
  if (c < cycle.freeze + cycle.hold) return { round, progress: 1 };
  return { round, progress: 1 - (c - cycle.freeze - cycle.hold) / cycle.thaw };
}
