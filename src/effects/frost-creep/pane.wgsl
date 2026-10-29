#include "fullscreen.wgsl"
#include "hash.wgsl"
#include "noise.wgsl"
#include "fbm.wgsl"
#include "frost.wgsl"
#include "params.wgsl"

// Story 4.2: a window pane frosting over, drawn from the grower's arrival times. Behind it a
// winter dusk (or the page itself); the frost is lit by the room and scatters the view through it.
// The dusk does not change, so it is drawn once per size (`view`), sharp as clear glass shows it
// and blurred as ice does, at a quarter of the size, and the pane reads it back.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var arrival: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;
@group(0) @binding(3) var view_sharp: texture_2d<f32>;
@group(0) @binding(4) var view_diffuse: texture_2d<f32>;

// A light seen through glass, blurred by `blur` (0 sharp, 1 through ice): its light spread over a
// wider disc, the same in total.
fn glow(p: vec2f, centre: vec2f, radius: f32, blur: f32) -> f32 {
  let r = radius + blur * 0.05;
  let d = length(p - centre);
  return exp(-d * d / (r * r)) * (radius * radius) / (r * r);
}

// The view out: a dusk sky, a line of dark trees, snow on the ground, a few lit windows far off.
// Positions in the pane's own units (height 1), so the view does not stretch with the canvas.
fn dusk(uv: vec2f, aspect: f32, blur: f32) -> vec3f {
  let p = vec2f(uv.x * aspect, uv.y);
  let horizon = 0.64;
  let edge = 0.002 + blur * 0.05;
  // Sky: deep blue overhead, paler and rose at the horizon, where the sun went down.
  var c = mix(vec3f(0.1, 0.15, 0.3), vec3f(0.01, 0.018, 0.06), smoothstep(horizon, 0.0, uv.y));
  c += vec3f(0.16, 0.07, 0.08) * exp(-max(horizon - uv.y, 0.0) * 10.0);
  // A line of dark trees along the horizon, uneven, softened by the blur.
  let trees = horizon - 0.03 - 0.05 * fbm_2d(vec2f(p.x * 6.0, 0.5), 4, 2.0, 0.55) - 0.015 * fbm_2d(vec2f(p.x * 40.0, 3.0), 2, 2.0, 0.5);
  c = mix(c, vec3f(0.008, 0.012, 0.025), smoothstep(trees - edge, trees + edge, uv.y));
  // A snowfield, lit by the sky: pale near the trees, darker towards the window.
  let snow = mix(vec3f(0.17, 0.21, 0.36), vec3f(0.06, 0.08, 0.15), smoothstep(horizon, 1.0, uv.y));
  c = mix(c, snow, smoothstep(horizon - edge, horizon + edge, uv.y));
  // Lit windows among the trees, warm.
  var lights = 0.0;
  for (var k = 0u; k < 7u; k++) {
    let h = hash_2to2(vec2f(f32(k), 3.0));
    let at = vec2f(h.x * aspect, horizon - 0.006 - 0.012 * h.y);
    lights += glow(p, at, 0.003 + 0.002 * h.y, blur) * (0.8 + 0.8 * h.y);
  }
  return c + vec3f(1.0, 0.62, 0.3) * lights;
}

// The view out, `blur` 0.06 through clear glass and 1 through ice; drawn into its own target.
@fragment fn view(in: FullscreenVarying) -> @location(0) vec4f {
  let size = vec2f(params.width, params.height) / params.css;
  return vec4f(dusk(in.uv, size.x / size.y, params.view_blur), 1.0);
}

@fragment fn pane(in: FullscreenVarying) -> @location(0) vec4f {
  let px = in.position.xy / params.css;
  let size = vec2f(params.width, params.height) / params.css;
  let uv = px / size;
  let cell = px / params.grain;
  let f = frost_read(arrival, smp, cell, vec2f(params.cols, params.rows), params.reveal, params.soft, params.age_scale, params.relief);
  var sharp = vec4f(0.0);
  var diffuse = vec3f(0.0);
  if (params.scene == 0u) {
    sharp = vec4f(textureSampleLevel(view_sharp, smp, uv, 0.0).rgb, 1.0);
    diffuse = textureSampleLevel(view_diffuse, smp, uv, 0.0).rgb;
  }
  var out = frost_over(f, px, sharp, diffuse, params.opacity, params.room.rgb);
  if (params.scene == 1u) {
    // Over the page: a cool rim along the frost's edges, so it reads over a white page too.
    let rim = clamp(1.0 - f.normal.z * f.normal.z * 1.2, 0.0, 1.0) * f.cover;
    let a = out.a;
    out = vec4f(mix(out.rgb, vec3f(0.22, 0.3, 0.45) * a, params.edge * rim), a);
  }
  return out;
}
