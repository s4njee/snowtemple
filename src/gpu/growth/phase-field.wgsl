#include "hash.wgsl"
#include "grow-params.wgsl"

// Story 4.1: Kobayashi's phase-field model of dendritic solidification (Physica D 63, 1993).
// Twin of phase-field.ts `stepCpu`. A cell holds its phase p (0 liquid or vapour, 1 ice), its
// temperature T (0 the undercooled start, `equilibrium` the melting point), the step at which it
// froze, and the step count itself, so nothing about the step has to come in a uniform.
//
//   tau dp/dt = d/dy(e e' dp/dx) - d/dx(e e' dp/dy) + div(e^2 grad p)
//               + p (1 - p) (p - 1/2 + m + a chi)
//   dT/dt     = lap T + K dp/dt - c (T - T_env)
//   e = e_bar (1 + delta cos(j (theta - theta0))),  theta the direction of grad p,
//   m = (alpha / pi) atan(gamma (T_eq - T))
//
// The last term is this family's: glass on a cold night loses heat through itself, so each cell
// relaxes at rate c towards the temperature the pane would have there without any ice (the seed's
// starting temperature). Kobayashi's model is c = 0, a crystal growing in a closed cell.
//
// The divergence is taken as e^2 lap p, as Kobayashi's own code does. Freezing gives off latent
// heat (K), which warms the liquid ahead of the front and slows it; the front's instability, and
// the anisotropy e, make arms in j directions, and the noise chi makes their side branches.
//
// The seed texture is the warm start: r the starting phase, g the starting temperature, b the
// crystal's orientation theta0 (radians; it varies across a pane of grains), a the mobility,
// 1 where ice grows freely and 0 where it cannot grow at all.

struct Cell {
  p: f32,
  t: f32,
  /** The step it froze at, or -1 while it has not. */
  arrival: f32,
  /** Steps run, the same in every cell. */
  step: f32,
}

@group(0) @binding(0) var<uniform> G: GrowParams;
@group(0) @binding(1) var seeds: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> cells_in: array<Cell>;
@group(0) @binding(3) var<storage, read_write> cells_out: array<Cell>;

const TILE: i32 = 16;
const HALO: i32 = 2;
const SPAN: i32 = TILE + 2 * HALO;

// The seed texture is read only before the first barrier: Mesa's llvmpipe (25.2, which CI's
// lavapipe runs) crashes on a texture read after a workgroupBarrier. So the orientation is tiled
// with p and T.
var<workgroup> tile_p: array<f32, 400>;
var<workgroup> tile_t: array<f32, 400>;
var<workgroup> tile_theta: array<f32, 400>;
// e e' dp/dx and e e' dp/dy, over the tile less one ring of its halo.
var<workgroup> flux_a: array<f32, 400>;
var<workgroup> flux_b: array<f32, 400>;

fn index_of(c: vec2i) -> u32 {
  let q = clamp(c, vec2i(0), vec2i(i32(G.width) - 1, i32(G.height) - 1));
  return u32(q.y) * G.width + u32(q.x);
}

fn texel_of(c: vec2i) -> vec2i {
  return clamp(c, vec2i(0), vec2i(i32(G.width) - 1, i32(G.height) - 1));
}

// The direction of grad p. atan2(0, 0) is undefined in WGSL (NaN on Metal), and inside the ice
// or the liquid the gradient is exactly zero, so it is taken as 0 there: every term it feeds is
// multiplied by the gradient anyway.
fn direction(px: f32, py: f32) -> f32 {
  if (px * px + py * py < 1e-12) { return 0.0; }
  return atan2(py, px);
}

fn at(x: i32, y: i32) -> i32 {
  return (y + HALO) * SPAN + (x + HALO);
}

// The nine-point Laplacian, which is far closer to isotropic than the five-point one: a square
// grid's own four-fold bias would otherwise compete with a six-fold crystal's.
fn laplacian(f: ptr<workgroup, array<f32, 400>>, x: i32, y: i32) -> f32 {
  let edges = (*f)[at(x + 1, y)] + (*f)[at(x - 1, y)] + (*f)[at(x, y + 1)] + (*f)[at(x, y - 1)];
  let corners = (*f)[at(x + 1, y + 1)] + (*f)[at(x - 1, y + 1)] + (*f)[at(x + 1, y - 1)] + (*f)[at(x - 1, y - 1)];
  return (4.0 * edges + corners - 20.0 * (*f)[at(x, y)]) / (6.0 * G.dx * G.dx);
}

@compute @workgroup_size(16, 16) fn grow(
  @builtin(workgroup_id) group: vec3u,
  @builtin(local_invocation_id) local: vec3u,
) {
  let origin = vec2i(group.xy) * TILE;
  let lane = i32(local.y) * TILE + i32(local.x);
  let cell = origin + vec2i(local.xy);
  let seed = textureLoad(seeds, texel_of(cell), 0);
  for (var k = lane; k < SPAN * SPAN; k += TILE * TILE) {
    let at_k = origin + vec2i(k % SPAN, k / SPAN) - HALO;
    let c = cells_in[index_of(at_k)];
    tile_p[k] = c.p;
    tile_t[k] = c.t;
    tile_theta[k] = textureLoad(seeds, texel_of(at_k), 0).b;
  }
  workgroupBarrier();
  // The anisotropic fluxes, one ring into the halo so their derivatives can be taken.
  for (var k = lane; k < (TILE + 2) * (TILE + 2); k += TILE * TILE) {
    let x = k % (TILE + 2) - 1;
    let y = k / (TILE + 2) - 1;
    let px = (tile_p[at(x + 1, y)] - tile_p[at(x - 1, y)]) / (2.0 * G.dx);
    let py = (tile_p[at(x, y + 1)] - tile_p[at(x, y - 1)]) / (2.0 * G.dx);
    let angle = G.order * (direction(px, py) - tile_theta[at(x, y)]);
    let e = G.epsilon * (1.0 + G.delta * cos(angle));
    let de = -G.epsilon * G.order * G.delta * sin(angle);
    flux_a[at(x, y)] = e * de * px;
    flux_b[at(x, y)] = e * de * py;
  }
  workgroupBarrier();
  if (cell.x >= i32(G.width) || cell.y >= i32(G.height)) { return; }
  let x = i32(local.x);
  let y = i32(local.y);
  let i = index_of(cell);
  let old = cells_in[i];
  let p = old.p;
  let t = old.t;
  // Its own e, for the e^2 lap p term.
  let px = (tile_p[at(x + 1, y)] - tile_p[at(x - 1, y)]) / (2.0 * G.dx);
  let py = (tile_p[at(x, y + 1)] - tile_p[at(x, y - 1)]) / (2.0 * G.dx);
  let e = G.epsilon * (1.0 + G.delta * cos(G.order * (direction(px, py) - seed.b)));
  let term1 = (flux_a[at(x, y + 1)] - flux_a[at(x, y - 1)]) / (2.0 * G.dx);
  let term2 = -(flux_b[at(x + 1, y)] - flux_b[at(x - 1, y)]) / (2.0 * G.dx);
  let m = G.alpha / 3.14159265 * atan(G.gamma * (G.equilibrium - t));
  let chi = to_unorm_1d(pcg_3d(vec3u(u32(cell.x), u32(cell.y), u32(old.step) ^ G.seed)).x) - 0.5;
  let reaction = p * (1.0 - p) * (p - 0.5 + m + G.noise * chi);
  let rate = (term1 + term2 + e * e * laplacian(&tile_p, x, y) + reaction) / G.tau;
  let p_new = clamp(p + G.dt * rate * seed.a, 0.0, 1.0);
  let t_new = t + G.dt * (laplacian(&tile_t, x, y) - G.cooling * (t - seed.g)) + G.latent * (p_new - p);
  var arrival = old.arrival;
  if (arrival < 0.0 && p_new >= 0.5) { arrival = old.step + 1.0; }
  cells_out[i] = Cell(p_new, t_new, arrival, old.step + 1.0);
}

// The warm start, from the seed texture.
@compute @workgroup_size(16, 16) fn plant(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= G.width || id.y >= G.height) { return; }
  let seed = textureLoad(seeds, vec2i(id.xy), 0);
  let i = id.y * G.width + id.x;
  cells_out[i] = Cell(seed.r, seed.g, select(-1.0, 0.0, seed.r >= 0.5), 0.0);
}

// For drawing: the arrival step, the phase, and the phase averaged over the 5 x 5 cells around
// (the ice's body: 1 deep inside an arm, a half at its edge), into a filterable half-float
// texture. A cell not yet frozen takes the earliest arrival among its frozen neighbours (or the
// next step), so a filtered threshold on arrival does not stop short of the ice's side edges: those
// are drawn from the phase, which is smooth across the interface.
@group(0) @binding(4) var arrival_out: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(16, 16) fn publish(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= G.width || id.y >= G.height) { return; }
  let c = cells_in[id.y * G.width + id.x];
  var arrival = c.arrival;
  if (arrival < 0.0) {
    arrival = c.step + 1.0;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let n = cells_in[index_of(vec2i(id.xy) + vec2i(dx, dy))].arrival;
        if (n >= 0.0) { arrival = min(arrival, n); }
      }
    }
  }
  var body = 0.0;
  for (var dy = -2; dy <= 2; dy++) {
    for (var dx = -2; dx <= 2; dx++) {
      body += cells_in[index_of(vec2i(id.xy) + vec2i(dx, dy))].p;
    }
  }
  textureStore(arrival_out, vec2i(id.xy), vec4f(arrival, c.p, body / 25.0, 1.0));
}
