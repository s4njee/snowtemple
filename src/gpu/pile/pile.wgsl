#include "hash.wgsl"
#include "pile-params.wgsl"

// Story 3.1: snow piled on the page's edges, on the GPU. Twin of pile.ts. Each tracked edge is a
// row of `MAX_COLUMNS` texels in an r32float texture, one column per CSS pixel of the edge; row 0
// is the ground along the canvas's bottom. Heights are CSS pixels.
//
//   supply    snow from the sky (where nothing above shades the column) and melt, then wind,
//             then what landed this frame, what the pointer brushed off and what a press shook
//             loose. Snow taken off a pile becomes a loose particle carrying its mass.
//   relax     the angle of repose, mass-conserving: run a few times a frame, ping-ponging.
//   loose     the loose particles fall, and land on whatever pile they meet, through atomics.

const MAX_COLUMNS: u32 = 2048u;
const LANDING_SCALE: f32 = 256.0;

struct Particle {
  pos: vec2f,
  vel: vec2f,
  mass: f32,
  /** 0 snow, 1 a water drop. */
  kind: f32,
  life: f32,
  /** The row it came from, so it does not land straight back. */
  row: f32,
}

@group(0) @binding(0) var<uniform> P: PileParams;
@group(0) @binding(1) var heights_in: texture_2d<f32>;
@group(0) @binding(2) var heights_out: texture_storage_2d<r32float, write>;
@group(0) @binding(3) var<storage, read_write> landing: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(5) var<storage, read_write> counter: array<atomic<u32>, 1>;

fn columns_of(r: u32) -> i32 {
  return i32(P.geometry[r].w);
}

fn alive(r: u32) -> bool {
  return P.extent[r].y > 0.5;
}

fn h_at(r: u32, i: i32) -> f32 {
  if (i < 0 || i >= columns_of(r)) { return 0.0; }
  return textureLoad(heights_in, vec2i(i, i32(r)), 0).r;
}

fn column_x(r: u32, i: i32) -> f32 {
  let g = P.geometry[r];
  return g.x + (f32(i) + 0.5) * g.z / g.w;
}

// Nothing higher up the page covers this point of the edge.
fn open_to_sky(r: u32, x: f32) -> bool {
  let top = P.geometry[r].y;
  for (var k = 0u; k < P.rows; k++) {
    if (k == r || !alive(k)) { continue; }
    let g = P.geometry[k];
    if (g.y < top && x >= g.x && x <= g.x + g.z) { return false; }
  }
  return true;
}

fn smooth01(t: f32) -> f32 {
  let x = clamp(t, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

// The height a column starts from this frame: carried over, resampled when the edge changed
// width (keeping the total, by overlap), or a fresh edge's starting blanket.
fn carried(r: u32, i: i32) -> f32 {
  let old = P.extent[r].z;
  let n = f32(columns_of(r));
  if (old < 0.0) {
    // A fresh edge: `start` deep, sloping at the angle of repose to each end.
    let from_end = min(f32(i), n - 1.0 - f32(i)) + 0.5;
    return min(P.start, from_end * P.talus);
  }
  if (old == 0.0 || old == n) { return h_at(r, i); }
  let scale = old / n;
  let a = f32(i) * scale;
  let b = (f32(i) + 1.0) * scale;
  var sum = 0.0;
  for (var j = i32(floor(a)); j < min(i32(old), i32(ceil(b))); j++) {
    sum += textureLoad(heights_in, vec2i(j, i32(r)), 0).r * (min(b, f32(j + 1)) - max(a, f32(j)));
  }
  return sum;
}

// Smooth value noise along an edge, -1..1: snow does not arrive evenly.
fn drift_noise(x: f32, seed: f32) -> f32 {
  let i = floor(x);
  let f = fract(x);
  let a = hash_2to1(vec2f(i, seed));
  let b = hash_2to1(vec2f(i + 1.0, seed));
  return mix(a, b, f * f * (3.0 - 2.0 * f)) * 2.0 - 1.0;
}

// Supply and melt (pile.ts `supply`, `melted`; `variation` is the shader's own, 0 in the twin).
fn supplied(r: u32, i: i32) -> f32 {
  if (i < 0 || i >= columns_of(r)) { return 0.0; }
  var h = carried(r, i);
  if (P.depth > 0.0 && open_to_sky(r, column_x(r, i))) {
    let uneven = 1.0 + P.variation * drift_noise(column_x(r, i) * 0.02, f32(r) * 7.3);
    h += P.rate * uneven * (1.0 - smooth01(h / (P.depth * (1.0 + 0.3 * P.variation * drift_noise(column_x(r, i) * 0.013, f32(r) + 40.0))))) * P.dt;
  }
  if (P.melt > 0.0) {
    h -= P.melt * (1.0 + 2.0 * exp(-h / 2.0)) * P.dt;
    if (h < 0.02) { h = 0.0; }
  }
  return h;
}

fn moved(h: f32) -> f32 {
  return abs(P.wind) * min(h, 1.0);
}

fn spawn(pos: vec2f, vel: vec2f, mass: f32, kind: f32, row: u32) {
  let at = atomicAdd(&counter[0], 1u) % P.capacity;
  particles[at] = Particle(pos, vel, mass, kind, 6.0, f32(row));
}

@compute @workgroup_size(64, 1) fn supply(@builtin(global_invocation_id) id: vec3u) {
  let r = id.y;
  let i = i32(id.x);
  if (r >= 32u || id.x >= MAX_COLUMNS) { return; }
  let n = columns_of(r);
  if (r >= P.rows || !alive(r) || i >= n) {
    textureStore(heights_out, vec2i(i, i32(r)), vec4f(0.0));
    return;
  }
  var h = supplied(r, i);
  // Wind (pile.ts `blow`): a share moves one column downwind; past the lee end it falls off,
  // less the cornice.
  if (P.wind != 0.0) {
    let dir = select(-1, 1, P.wind > 0.0);
    let own = moved(h);
    h = h - own + moved(supplied(r, i - dir));
    if ((dir > 0 && i == n - 1) || (dir < 0 && i == 0)) { h += own * P.cornice; }
  }
  let index = r * MAX_COLUMNS + u32(i);
  h += f32(atomicExchange(&landing[index], 0u)) / LANDING_SCALE;
  let g = P.geometry[r];
  let x = column_x(r, i);
  let surface = vec2f(x, g.y - h);
  let seed = vec3f(f32(i), f32(r), P.time * 61.0);
  // The pointer brushes snow off where it passes over the surface.
  let brush = P.brush;
  if (brush.z > 0.0 && h > 0.0) {
    let d = length((surface - brush.xy) / vec2f(1.0, 1.6));
    if (d < brush.z) {
      let take = min(h, brush.w * P.dt * (1.0 - d / brush.z));
      if (take > 0.01) {
        h -= take;
        let kick = vec2f((hash_3to1(seed + 1.0) - 0.5) * 120.0, -60.0 - 80.0 * hash_3to1(seed + 2.0));
        spawn(surface, kick + P.brush_velocity.xy * 0.4, take, 0.0, r);
      }
    }
  }
  // A press on the element shakes `shake` of its snow loose.
  let shake = P.extent[r].w;
  if (shake > 0.0 && h > 0.0) {
    let take = h * shake;
    h -= take;
    let kick = vec2f((hash_3to1(seed + 3.0) - 0.5) * 60.0, -40.0 * hash_3to1(seed + 4.0));
    spawn(surface, kick, take, 0.0, r);
  }
  // Melting snow drips off the ends.
  if (P.melt > 0.0 && (i == 0 || i == n - 1) && h > 0.2 && hash_3to1(seed + 5.0) < P.drip * P.dt) {
    let drop = min(h, 0.6);
    h -= drop;
    spawn(vec2f(x, g.y + 1.0), vec2f(0.0, 20.0), drop, 1.0, r);
  }
  textureStore(heights_out, vec2i(i, i32(r)), vec4f(max(h, 0.0)));
}

// The flow from a column of height a to one of height b (pile.ts `slide`).
fn slide(a: f32, b: f32) -> f32 {
  return 0.25 * max(0.0, a - b - P.talus);
}

@compute @workgroup_size(64, 1) fn relax(@builtin(global_invocation_id) id: vec3u) {
  let r = id.y;
  let i = i32(id.x);
  if (r >= 32u || id.x >= MAX_COLUMNS) { return; }
  let n = columns_of(r);
  if (r >= P.rows || !alive(r) || i >= n) {
    textureStore(heights_out, vec2i(i, i32(r)), vec4f(0.0));
    return;
  }
  let own = h_at(r, i);
  let left = h_at(r, i - 1);
  let right = h_at(r, i + 1);
  var v = own - slide(own, left) - slide(own, right);
  if (i > 0) { v += slide(left, own); }
  if (i < n - 1) { v += slide(right, own); }
  // Off the ends is a drop; at the lee end the cornice holds some back.
  if (i == 0 && P.wind < 0.0) { v += slide(own, 0.0) * P.cornice; }
  if (i == n - 1 && P.wind > 0.0) { v += slide(own, 0.0) * P.cornice; }
  textureStore(heights_out, vec2i(i, i32(r)), vec4f(max(v, 0.0)));
}

// The surface of row r at x, or a large number where x is off the edge.
fn surface_at(r: u32, x: f32) -> f32 {
  let g = P.geometry[r];
  if (x < g.x || x > g.x + g.z) { return 1e9; }
  let i = clamp(i32((x - g.x) / g.z * g.w), 0, columns_of(r) - 1);
  return g.y - h_at(r, i);
}

@compute @workgroup_size(64) fn loose(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= P.capacity) { return; }
  var p = particles[id.x];
  if (p.life <= 0.0) { return; }
  let dt = P.dt;
  if (p.kind < 0.5) {
    // Loose snow: drag towards its fall speed and the wind.
    let drift = vec2f(P.wind_speed, P.fall);
    p.vel = mix(p.vel, drift, 1.0 - exp(-dt / 0.3));
  } else {
    p.vel.y += 1600.0 * dt;
  }
  let before = p.pos;
  p.pos += p.vel * dt;
  p.life -= dt;
  // It lands on the first pile it falls through (not the one it left, for a moment).
  for (var r = 0u; r < P.rows; r++) {
    if (!alive(r)) { continue; }
    if (f32(r) == p.row && p.life > 5.7) { continue; }
    let s = surface_at(r, p.pos.x);
    if (before.y <= s && p.pos.y >= s) {
      if (p.kind < 0.5) {
        let g = P.geometry[r];
        let i = clamp(u32((p.pos.x - g.x) / g.z * g.w), 0u, u32(columns_of(r)) - 1u);
        atomicAdd(&landing[r * MAX_COLUMNS + i], u32(p.mass * LANDING_SCALE));
      }
      p.life = 0.0;
      break;
    }
  }
  if (p.pos.y > P.height + 40.0 || p.pos.x < -40.0 || p.pos.x > P.width + 40.0) { p.life = 0.0; }
  particles[id.x] = p;
}
