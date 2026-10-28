#include "fullscreen.wgsl"
#include "hash.wgsl"
#include "sdf.wgsl"
#include "params.wgsl"

// A snow globe (story 2.3). The water inside is a slow flow: after a shake, a divergence-free
// swirl (the curl of a few travelling waves, so it neither gathers nor spreads the flakes) whose
// energy decays over a few seconds, plus a turn about the vertical axis in the direction of the
// shake. Flakes relax towards the flow, sink at a slow terminal speed (water is dense, flakes are
// light), bounce off the glass and settle on the scene when the water is still. The globe is
// drawn in its own units: radius 1, y up, z towards the viewer.

struct Flake {
  pos: vec3f,
  settled: f32,
  vel: vec3f,
  size: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> flakes: array<Flake>;

// The scene's ground inside the globe: a mound.
fn floor_at(x: f32, z: f32) -> f32 {
  return -0.48 + 0.12 * exp(-(x * x + z * z) * 2.5);
}

fn waves(p: vec3f, t: f32, a: f32, b: f32, c: f32) -> vec3f {
  // A = (sin(b y + t) cos(c z), sin(c z + t) cos(a x), sin(a x + t) cos(b y)); u = curl A.
  let ax = vec2f(sin(b * p.y + t), cos(c * p.z));
  let ay = vec2f(sin(c * p.z + t * 1.3), cos(a * p.x));
  let az = vec2f(sin(a * p.x + t * 0.7), cos(b * p.y));
  // d/dy of A.z, d/dz of A.y, and so on.
  let dazdy = -az.x * b * sin(b * p.y);
  let daydz = c * cos(c * p.z + t * 1.3) * ay.y;
  let daxdz = -ax.x * c * sin(c * p.z);
  let dazdx = a * cos(a * p.x + t * 0.7) * az.y;
  let daydx = -ay.x * a * sin(a * p.x);
  let daxdy = b * cos(b * p.y + t) * ax.y;
  return vec3f(dazdy - daydz, daxdz - dazdx, daydx - daxdy);
}

// Two sets of waves at unrelated wavelengths, the second turned: one set alone is periodic in
// space, and flakes tracing it line up in rows, which the pattern rule counts.
fn flow(p: vec3f, t: f32) -> vec3f {
  let turned = vec3f(0.8 * p.x + 0.6 * p.z, p.y, -0.6 * p.x + 0.8 * p.z);
  let curl = waves(p, t, 2.3, 2.9, 2.6) + 0.7 * waves(turned.zyx, t * 1.37 + 2.0, 3.7, 1.9, 4.3);
  // The turn the shake gave the whole body of water.
  let turn = vec3f(-p.z, 0.0, p.x) * params.spin;
  return (curl * 0.09 + turn) * params.energy;
}

@compute @workgroup_size(64) fn swirl(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= params.count) { return; }
  var f = flakes[id.x];
  let dt = params.dt;
  let seed = vec2f(f32(id.x), params.time);
  if (f.size == 0.0) {
    // First frame: scattered through the water.
    let r = hash_2to3(vec2f(f32(id.x), 1.0)) * 2.0 - 1.0;
    f.pos = r * 0.85;
    f.vel = vec3f(0.0);
    f.size = 0.6 + 0.8 * hash_2to1(vec2f(f32(id.x), 2.0));
    f.settled = 0.0;
  }
  let u = flow(f.pos, params.time * 0.6);
  // A settled flake lifts again when the water moves past it.
  if (f.settled > 0.5) {
    if (length(u) > 0.18 && hash_2to1(seed) < 4.0 * dt) { f.settled = 0.0; }
    flakes[id.x] = f;
    return;
  }
  let sink = vec3f(0.0, -params.sink * (0.7 + 0.6 * f.size), 0.0);
  // Each flake tumbles a little on its own way.
  let own = (hash_2to3(seed * 0.37) - 0.5) * 0.25 * params.energy;
  f.vel = mix(f.vel, u + sink + own, 1.0 - exp(-dt / 0.25));
  f.pos += f.vel * dt;
  // The glass: kept inside, the outward part of the velocity reflected.
  let r = length(f.pos);
  if (r > 0.94) {
    let n = f.pos / r;
    f.pos = n * 0.94;
    f.vel -= n * max(dot(f.vel, n), 0.0) * 1.6;
  }
  // The scene: settle on it when the water is calm there.
  let ground = floor_at(f.pos.x, f.pos.z);
  if (f.pos.y < ground) {
    f.pos.y = ground;
    if (length(u) < 0.12) {
      f.settled = 1.0;
      f.vel = vec3f(0.0);
    } else {
      f.vel.y = abs(f.vel.y) * 0.3;
    }
  }
  flakes[id.x] = f;
}
