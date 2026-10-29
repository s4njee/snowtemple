#include "hash.wgsl"
#include "reiter-params.wgsl"

// Story 4.4: Reiter's cellular automaton for snow crystals ("A local cellular model for snow
// crystal growth", Chaos, Solitons & Fractals 23, 2005), on a hexagonal grid. Twin of reiter.ts
// `stepReiter`. Each cell holds an amount of water s; it is ice when s >= 1. A cell is receptive
// when it is ice or touches ice. Each step:
//
//   receptive cells keep their water and gain gamma (vapour added from the air): v = s + gamma
//   other cells' water diffuses:  u' = u + (alpha / 2) (mean of the six neighbours' u - u),
//                                 where u is s for a non-receptive cell and 0 for a receptive one
//   s = u' + v
//
// beta is the water everywhere at the start, and at the grid's edge always. Plates, sectored
// plates, stars and fern-like dendrites come from alpha, beta and gamma alone.
//
// The grid is axial: cell (q, r) is at q (1, 0) + r (1/2, sqrt 3 / 2), stored at (q + R, r + R).
// Its six neighbours are (+-1, 0), (0, +-1), (1, -1) and (-1, 1). Cells beyond radius R are the
// edge.

struct Cell {
  s: f32,
  /** The step it froze at, or -1. */
  arrival: f32,
  step: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> R: ReiterParams;
@group(0) @binding(1) var<storage, read> cells_in: array<Cell>;
@group(0) @binding(2) var<storage, read_write> cells_out: array<Cell>;
@group(0) @binding(3) var<storage, read_write> split: array<vec2f>;
@group(0) @binding(4) var arrival_out: texture_storage_2d<rgba16float, write>;

const NEIGHBOURS = array<vec2i, 6>(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1), vec2i(1, -1), vec2i(-1, 1));

fn side() -> i32 {
  return 2 * i32(R.radius) + 1;
}

// Inside the hexagon of radius R about the centre.
fn inside(c: vec2i) -> bool {
  let q = c.x - i32(R.radius);
  let r = c.y - i32(R.radius);
  let n = i32(R.radius);
  return c.x >= 0 && c.y >= 0 && c.x < side() && c.y < side() && abs(q) <= n && abs(r) <= n && abs(q + r) <= n;
}

fn index_of(c: vec2i) -> u32 {
  return u32(c.y * side() + c.x);
}

fn water(c: vec2i) -> f32 {
  if (!inside(c)) { return R.beta; }
  return cells_in[index_of(c)].s;
}

// Pass 1: split each cell's water into the part that diffuses (u) and the part that stays (v).
@compute @workgroup_size(16, 16) fn divide(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  if (c.x >= side() || c.y >= side()) { return; }
  if (!inside(c)) {
    split[index_of(c)] = vec2f(R.beta, 0.0);
    return;
  }
  let s = water(c);
  var receptive = s >= 1.0;
  for (var k = 0; k < 6; k++) {
    if (water(c + NEIGHBOURS[k]) >= 1.0) { receptive = true; }
  }
  split[index_of(c)] = select(vec2f(s, 0.0), vec2f(0.0, s + R.gamma), receptive);
}

// Pass 2: diffuse u and add v back.
@compute @workgroup_size(16, 16) fn diffuse(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  if (c.x >= side() || c.y >= side()) { return; }
  let i = index_of(c);
  let old = cells_in[i];
  if (!inside(c)) {
    cells_out[i] = Cell(R.beta, -1.0, old.step + 1.0, 0.0);
    return;
  }
  let own = split[i];
  var around = 0.0;
  for (var k = 0; k < 6; k++) {
    let n = c + NEIGHBOURS[k];
    around += select(R.beta, split[index_of(n)].x, inside(n));
  }
  let s = own.x + R.alpha * 0.5 * (around / 6.0 - own.x) + own.y;
  var arrival = old.arrival;
  if (arrival < 0.0 && s >= 1.0) { arrival = old.step + 1.0; }
  cells_out[i] = Cell(s, arrival, old.step + 1.0, 0.0);
}

// The start: beta everywhere, a little uneven by `roughness` (so each seed's side branches are
// its own), and ice at the centre.
@compute @workgroup_size(16, 16) fn start(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  if (c.x >= side() || c.y >= side()) { return; }
  let centre = all(c == vec2i(i32(R.radius)));
  let wobble = (ihash_3to1(vec3i(c, i32(R.seed))) - 0.5) * 2.0 * R.roughness;
  cells_out[index_of(c)] = Cell(select(R.beta * (1.0 + wobble), 1.0, centre), select(-1.0, 0.0, centre), 0.0, 0.0);
}

// For drawing: arrival (not yet frozen: the next step), water, whether it is ice (1 or 0) and the
// water above 1, filterable. A crystal's side branches are a cell wide, so the water itself,
// filtered, would average them away below 1; the flag filters into a coverage instead.
@compute @workgroup_size(16, 16) fn publish(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  if (c.x >= side() || c.y >= side()) { return; }
  let cell = cells_in[index_of(c)];
  let arrival = select(cell.step + 1.0, cell.arrival, cell.arrival >= 0.0);
  let ice = select(0.0, 1.0, cell.s >= 1.0);
  textureStore(arrival_out, c, vec4f(arrival, cell.s, ice, ice * (cell.s - 1.0)));
}
