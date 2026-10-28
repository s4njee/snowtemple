#include "fullscreen.wgsl"
#include "pile-params.wgsl"

// Story 3.3: settled snow, drawn from the pile heights (pile.wgsl), and its loose particles.
// What makes it read, over a dark page and over a light one:
//   - its faces turned up to the sun are near white, and the rest are lit by the blue sky;
//   - the top surface is soft: light scatters under it, so its edge glows a little and fades;
//   - it darkens where it meets the element (ambient occlusion);
//   - a faint blue-grey rim carries it over a white page.
// The pile is a ridge seen from the front: just under its top surface it faces the sky, and
// lower down it faces the viewer. Premultiplied out, blended over the scene.

const MAX_COLUMNS: u32 = 2048u;

struct Particle {
  pos: vec2f,
  vel: vec2f,
  mass: f32,
  kind: f32,
  life: f32,
  row: f32,
}

@group(0) @binding(0) var<uniform> P: PileParams;
@group(0) @binding(1) var heights: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> particles: array<Particle>;

fn h_at(r: u32, i: i32) -> f32 {
  let n = i32(P.geometry[r].w);
  if (i < 0 || i >= n) { return 0.0; }
  return textureLoad(heights, vec2i(i, i32(r)), 0).r;
}

// Height of row r at a fractional column u, linearly between columns.
fn h_column(r: u32, u: f32) -> f32 {
  let i = i32(floor(u));
  return mix(h_at(r, i), h_at(r, i + 1), fract(u));
}

// The drawn surface: the heights softened over a few columns, so a pile's shoulders round over
// as settled snow's do, instead of meeting its slopes at a corner.
fn h_lerp(r: u32, u: f32) -> f32 {
  let s = 0.12 * P.depth + 1.0;
  return (h_column(r, u - 2.0 * s) + 2.0 * h_column(r, u - s) + 3.0 * h_column(r, u) + 2.0 * h_column(r, u + s) + h_column(r, u + 2.0 * s)) / 9.0;
}

const SUN: vec3f = vec3f(-0.42, 0.78, 0.46);

fn shade(n: vec3f, below: f32, base: f32) -> vec3f {
  let sun = max(dot(n, normalize(SUN)), 0.0);
  let sky = 0.5 + 0.5 * n.y;
  var c = P.sky.rgb * (0.55 + 0.25 * sky) + P.sun.rgb * sun * 0.55;
  // Light scattered under the surface: the top skin glows a little.
  c += vec3f(0.08, 0.1, 0.12) * exp(-below / 1.5);
  // Ambient occlusion where the pile meets the element.
  c *= mix(0.7, 1.0, smoothstep(0.0, 4.0, base));
  return c;
}

@fragment fn piles(in: FullscreenVarying) -> @location(0) vec4f {
  let p = in.position.xy / P.css;
  var out = vec4f(0.0);
  for (var r = 0u; r < P.rows; r++) {
    if (P.extent[r].y < 0.5) { continue; }
    let g = P.geometry[r];
    let n = g.w;
    if (p.y > g.y + 0.5 || p.y < g.y - P.depth * 3.0 - 4.0) { continue; }
    var h = 0.0;
    var slope = 0.0;
    let u = (p.x - g.x) / g.z * n - 0.5;
    if (u >= -0.5 && u <= n - 0.5) {
      h = h_lerp(r, u);
      slope = (h_lerp(r, u + 1.0) - h_lerp(r, u - 1.0)) * 0.5;
    } else {
      // The cornice: a lip past the lee end, as deep as the end's snow and curling under.
      let lee = select(-1.0, 1.0, P.wind > 0.0);
      let past = select(-0.5 - u, u - (n - 0.5), lee > 0.0);
      let end = select(h_at(r, 0), h_at(r, i32(n) - 1), lee > 0.0);
      let reach = end * P.cornice * abs(P.wind) * 8.0;
      let on_lee = (lee > 0.0 && u > n - 0.5) || (lee < 0.0 && u < -0.5);
      if (!on_lee || P.wind == 0.0 || past > reach) { continue; }
      let t = past / max(reach, 1e-3);
      h = end * (1.0 - t * t);
      // Its underside curls up: nothing below the lip's bottom.
      let underside = g.y - end * 0.45 * t;
      if (p.y > underside) { continue; }
      slope = -lee * end * 2.0 * t / max(reach, 1e-3);
    }
    if (h <= 0.01) { continue; }
    let top = g.y - h;
    let below = p.y - top;
    let aa = 0.75 / P.css;
    if (below < -1.5) {
      // Just above the surface: the rim that carries it over a white page.
      out = max(out, vec4f(P.rim.rgb, 1.0) * P.rim.a * smoothstep(-1.5, -0.3, below));
      continue;
    }
    let cover = smoothstep(-aa, aa, below) * smoothstep(0.0, 0.6, h);
    let up = exp(-below / (0.35 * h + 1.0));
    let normal = normalize(vec3f(-slope * 0.8, up, 1.0 - up * 0.6));
    let colour = shade(normal, max(below, 0.0), g.y - p.y);
    let rim = vec4f(P.rim.rgb, 1.0) * P.rim.a * (1.0 - smoothstep(-0.5, 0.8, below));
    let snow = vec4f(colour, 1.0) * cover;
    out = snow + rim * (1.0 - snow.a);
    break;
  }
  return out;
}

struct Loose {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) kind: f32,
}

@vertex fn loose_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Loose {
  let p = particles[i];
  var out: Loose;
  let corner = vec2f(f32(v & 1u), f32(v >> 1u)) * 2.0 - 1.0;
  out.local = corner;
  out.kind = p.kind;
  if (p.life <= 0.0) {
    out.position = vec4f(2.0, 2.0, 0.0, 1.0);
    return out;
  }
  let size = select(1.2 + 1.4 * sqrt(min(p.mass, 4.0)), 1.6, p.kind > 0.5);
  let at = p.pos + corner * size;
  let ndc = at / vec2f(P.width, P.height) * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0);
  out.position = vec4f(ndc, 0.0, 1.0);
  return out;
}

@fragment fn loose_fs(in: Loose) -> @location(0) vec4f {
  let d = length(in.local);
  if (in.kind > 0.5) {
    // A water drop: clear, with a dark edge and a bright point.
    let edge = smoothstep(1.0, 0.6, d) * (0.25 + 0.5 * smoothstep(0.4, 0.9, d));
    let glint = smoothstep(0.35, 0.0, length(in.local - vec2f(-0.3, -0.3)));
    let c = mix(vec3f(0.35, 0.45, 0.6), vec3f(1.0), glint);
    let a = max(edge, glint) * 0.9;
    return vec4f(c * a, a);
  }
  let a = smoothstep(1.0, 0.3, d) * 0.9;
  let c = mix(P.sky.rgb, vec3f(1.0), 0.75);
  return vec4f(c * a, a);
}
