#include "fullscreen.wgsl"
#include "hash.wgsl"
#include "simplex.wgsl"
#include "params.wgsl"

// Footprints (story 3.4): a snow surface as a height field, one cell per `cell` CSS pixels, depth
// in CSS pixels. Each step packs the snow under the boot down to a share of its depth and pushes
// the rest aside into a rim around the print. Falling snow fills the surface back towards its
// depth, and where a rim stands steeper than the angle of repose it slides (mass-conserving, as
// pile.wgsl's edges do, here over four neighbours). After the deformable snow of Batman: Arkham
// Origins (Barré-Brisebois, GDC 2014), on the GPU and without the trail mesh.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var depth_in: texture_2d<f32>;
@group(0) @binding(2) var depth_out: texture_storage_2d<r32float, write>;

fn d_at(c: vec2i) -> f32 {
  let size = vec2i(textureDimensions(depth_in));
  return textureLoad(depth_in, clamp(c, vec2i(0), size - 1), 0).r;
}

// The surface's resting depth at a cell: the base with a gentle drift.
fn resting(c: vec2i) -> f32 {
  let p = vec2f(c) * params.cell;
  return params.base * (1.0 + 0.12 * snoise_2d(p * 0.004) + 0.02 * snoise_2d(p * 0.015));
}

// A boot print's signed distance, CSS px, in the step's own frame (x along the walk): a sole and
// a heel, longer than wide.
fn boot(q: vec2f) -> f32 {
  let sole = length((q - vec2f(4.0, 0.0)) / vec2f(9.0, 4.6)) - 1.0;
  let heel = length((q - vec2f(-7.0, 0.0)) / vec2f(4.4, 3.9)) - 1.0;
  return min(sole * 4.6, heel * 3.9);
}

@compute @workgroup_size(8, 8) fn settle(@builtin(global_invocation_id) id: vec3u) {
  let size = vec2u(textureDimensions(depth_in));
  if (any(id.xy >= size)) { return; }
  let c = vec2i(id.xy);
  let rest = resting(c);
  var d = select(d_at(c), rest, params.fresh == 1u);
  // Steps: packed under the boot, pushed up around it.
  let p = (vec2f(c) + 0.5) * params.cell;
  for (var k = 0u; k < params.steps; k++) {
    let s = params.step_at[k];
    let co = cos(s.z);
    let si = sin(s.z);
    let q = vec2f(co * (p.x - s.x) + si * (p.y - s.y), -si * (p.x - s.x) + co * (p.y - s.y));
    let sd = boot(q);
    if (sd < 0.0) {
      d = min(d, rest * params.packed);
    } else if (sd < params.rim) {
      // What the boot pushed aside, about as much as it packed away, spread over the rim.
      d += rest * (1.0 - params.packed) * 0.55 * (1.0 - sd / params.rim) * (1.0 - sd / params.rim);
    }
  }
  // Falling snow fills hollows back towards the resting depth; a raised rim settles a little.
  if (d < rest) {
    d = min(rest, d + params.fill * params.dt);
  } else {
    d -= (d - rest) * min(1.0, params.settle * params.dt);
  }
  textureStore(depth_out, c, vec4f(d));
}

fn slide(a: f32, b: f32) -> f32 {
  return 0.125 * max(0.0, a - b - params.talus * params.cell);
}

@compute @workgroup_size(8, 8) fn slump(@builtin(global_invocation_id) id: vec3u) {
  let size = vec2u(textureDimensions(depth_in));
  if (any(id.xy >= size)) { return; }
  let c = vec2i(id.xy);
  let own = d_at(c);
  var d = own;
  for (var k = 0u; k < 4u; k++) {
    let o = array(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1))[k];
    let n = d_at(c + o);
    d += slide(n, own) - slide(own, n);
  }
  textureStore(depth_out, c, vec4f(d));
}

// The surface lit by a low sun from the upper left: faces towards it near white, the rest in the
// sky's blue, and deeper blue in the prints, where less sky reaches.
@fragment fn surface(in: FullscreenVarying) -> @location(0) vec4f {
  let p = in.position.xy / params.css;
  let u = p / params.cell - 0.5;
  let c = vec2i(floor(u));
  let f = fract(u);
  let h = mix(mix(d_at(c), d_at(c + vec2i(1, 0)), f.x), mix(d_at(c + vec2i(0, 1)), d_at(c + vec2i(1, 1)), f.x), f.y);
  let gx = (d_at(c + vec2i(1, 0)) - d_at(c - vec2i(1, 0))) / (2.0 * params.cell);
  let gy = (d_at(c + vec2i(0, 1)) - d_at(c - vec2i(0, 1))) / (2.0 * params.cell);
  let normal = normalize(vec3f(-gx, -gy, 1.0));
  let sun_dir = normalize(vec3f(-0.62, -0.5, 0.6));
  let sun = max(dot(normal, sun_dir), 0.0);
  let rest = resting(c);
  let hollow = clamp((rest - h) / max(rest, 1.0), 0.0, 1.0);
  var colour = params.sky.rgb * (0.62 - 0.3 * hollow) + params.sun.rgb * sun * 0.62;
  // The surface's fine grain, faint.
  colour *= 1.0 + 0.025 * snoise_2d(p * 0.35);
  return vec4f(colour, 1.0);
}
