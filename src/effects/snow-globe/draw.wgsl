#include "fullscreen.wgsl"
#include "hash.wgsl"
#include "sdf.wgsl"
#include "params.wgsl"

// The snow globe's picture (story 2.3): the scene inside, seen through water and glass; then its
// flakes; then the glass's own light. A water-filled sphere is a strong lens: what is inside
// looks larger towards the middle. Here a point of the scene at s (globe units) shows at
// q = s / lens(|s|), lens rising from 0.72 at the centre to 1 at the rim, and the scene is drawn
// by inverting that with one fixed-point step. Premultiplied out, opaque inside the globe and
// its base.

struct Flake {
  pos: vec3f,
  settled: f32,
  vel: vec3f,
  size: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> flakes: array<Flake>;

fn lens(r: f32) -> f32 {
  return mix(0.72, 1.0, r * r);
}

// From the screen into the globe: q (globe units on screen) to the scene's s, q = s / lens(|s|).
fn into_globe(q: vec2f) -> vec2f {
  var s = q * lens(length(q));
  s = q * lens(length(s));
  return s;
}

fn to_globe(px: vec2f) -> vec2f {
  return (px - params.centre.xy) / params.radius * vec2f(1.0, -1.0);
}

fn floor_at(x: f32) -> f32 {
  return -0.48 + 0.12 * exp(-x * x * 2.5);
}

// The scene inside, in globe units: a night sky, a snowy mound, a cabin and a pine.
fn scene(s: vec2f) -> vec3f {
  var c = mix(vec3f(0.06, 0.1, 0.24), vec3f(0.2, 0.28, 0.5), smoothstep(0.9, -0.3, s.y));
  // A few fixed stars, each somewhere in its cell: at the cells' centres they would be a
  // lattice, which the pattern rule counts.
  let cell = floor(s * 14.0);
  let at = 0.2 + 0.6 * hash_2to2(cell + 5.0);
  let star = step(0.93, hash_2to1(cell)) * smoothstep(0.08, 0.0, length(fract(s * 14.0) - at));
  c += vec3f(0.6) * star * smoothstep(-0.1, 0.4, s.y);
  // The pine: three stacked triangles, snow on their tops.
  let tree = vec2f(0.34, -0.42);
  for (var k = 0; k < 3; k++) {
    let base = tree.y + 0.1 * f32(k) + 0.04;
    let half_w = 0.17 - 0.04 * f32(k);
    let tip = base + 0.2;
    let t = (s.y - base) / (tip - base);
    if (t > 0.0 && t < 1.0 && abs(s.x - tree.x) < half_w * (1.0 - t)) {
      // Snow along each tier's lower edge, where it lies on the branches.
      let snowy = smoothstep(0.06, 0.0, t) * 0.8 + smoothstep(0.85, 0.97, t) * 0.6;
      c = mix(vec3f(0.05, 0.22, 0.12), vec3f(0.9, 0.93, 1.0), clamp(snowy, 0.0, 1.0));
    }
  }
  // The cabin: walls, a lit window, a snow-laden roof.
  let wall = sd_box_2d(s - vec2f(-0.22, -0.3), vec2f(0.16, 0.1));
  if (wall < 0.0) {
    c = vec3f(0.42, 0.12, 0.08);
    let window = sd_box_2d(s - vec2f(-0.2, -0.29), vec2f(0.04, 0.035));
    if (window < 0.0) { c = vec3f(1.0, 0.78, 0.4); }
  }
  let roof_y = s.y - (-0.2);
  if (roof_y > 0.0 && roof_y < 0.12 && abs(s.x + 0.22) < 0.2 * (1.0 - roof_y / 0.12)) {
    c = mix(vec3f(0.25, 0.08, 0.06), vec3f(0.92, 0.95, 1.0), smoothstep(0.02, 0.05, roof_y));
  }
  // The mound of snow, lit from the upper left.
  let ground = floor_at(s.x);
  if (s.y < ground) {
    let slope = -0.12 * 5.0 * s.x * exp(-s.x * s.x * 2.5);
    let lit = clamp(0.7 + 0.5 * (-slope * 0.6 + 0.3), 0.4, 1.0);
    c = mix(vec3f(0.42, 0.5, 0.7), vec3f(0.92, 0.95, 1.0), lit) * mix(0.8, 1.0, smoothstep(-1.0, ground, s.y));
  }
  return c;
}

@fragment fn interior(in: FullscreenVarying) -> @location(0) vec4f {
  let q = to_globe(in.position.xy / params.css);
  let r = length(q);
  let aa = 1.5 / params.radius;
  // The base under the globe: a dark wooden plinth with a brass band.
  let plinth = sd_box_2d(q - vec2f(0.0, -1.08), vec2f(0.82 - 0.1 * (q.y + 1.08), 0.22));
  var out = vec4f(0.0);
  if (plinth < 0.0) {
    // Grain from noise, not a sine: regular stripes on a hero-sized plinth are a pattern.
    let grain = hash_2to1(vec2f(floor(q.x * 60.0 + 7.0 * sin(q.y * 6.0)), 3.0));
    var wood = vec3f(0.16, 0.08, 0.04) * (0.9 + 0.1 * grain);
    let band = smoothstep(0.03, 0.0, abs(q.y + 0.92));
    wood = mix(wood, vec3f(0.75, 0.58, 0.25), band);
    out = vec4f(wood, 1.0) * smoothstep(0.0, -aa, plinth);
  }
  if (r < 1.0) {
    let s = into_globe(q);
    // The water absorbs a little towards the rim.
    let inside = scene(s) * mix(1.0, 0.82, r * r);
    let cover = smoothstep(1.0, 1.0 - aa, r);
    out = vec4f(inside, 1.0) * cover + out * (1.0 - cover);
  }
  return out;
}

struct Drawn {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) light: f32,
}

@vertex fn flake_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Drawn {
  let f = flakes[i];
  var out: Drawn;
  let corner = vec2f(f32(v & 1u), f32(v >> 1u)) * 2.0 - 1.0;
  out.local = corner;
  // Nearer flakes are larger and brighter; the lens moves them as it moves the scene.
  let depth = 0.5 + 0.5 * f.pos.z;
  let q = f.pos.xy / lens(length(f.pos.xy));
  out.light = 0.6 + 0.4 * depth;
  let size = (1.2 + 2.2 * f.size * (0.6 + 0.6 * depth)) / params.radius;
  let at = params.centre.xy / params.radius + vec2f(q.x, -q.y) + corner * size;
  let px = at * params.radius;
  if (f.size == 0.0 || length(q) > 0.97) {
    out.position = vec4f(2.0, 2.0, 0.0, 1.0);
    return out;
  }
  out.position = vec4f(px / params.view.xy * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
  return out;
}

@fragment fn flake_fs(in: Drawn) -> @location(0) vec4f {
  let a = smoothstep(1.0, 0.25, length(in.local)) * 0.95;
  return vec4f(vec3f(in.light) * a, a);
}

// The glass's own light, over everything: a bright rim where the sphere turns away (Fresnel), a
// window's soft highlight at the upper left, and a faint outline that carries it on white.
@fragment fn glass(in: FullscreenVarying) -> @location(0) vec4f {
  let q = to_globe(in.position.xy / params.css);
  let r = length(q);
  if (r > 1.0 + 2.0 / params.radius) { return vec4f(0.0); }
  let rim = pow(clamp(r, 0.0, 1.0), 8.0) * 0.55;
  let window = smoothstep(0.32, 0.0, length((q - vec2f(-0.45, 0.48)) / vec2f(0.9, 0.55)));
  let streak = smoothstep(0.06, 0.0, abs(r - 0.86)) * smoothstep(0.2, 0.9, -q.x + q.y) * 0.3;
  let light = rim + window * 0.35 + streak;
  let edge = smoothstep(1.5 / params.radius, 0.0, abs(r - 1.0)) * params.outline;
  let a = clamp(edge, 0.0, 1.0);
  return vec4f(vec3f(light) + vec3f(0.3, 0.38, 0.5) * a, a);
}
