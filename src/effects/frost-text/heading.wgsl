#include "fullscreen.wgsl"
#include "hash.wgsl"
#include "noise.wgsl"
#include "frost.wgsl"
#include "params.wgsl"

// Story 4.3: a heading frosting over. The letters from the text's distance field (in cells), the
// frost from the grower's arrival times (src/wgsl/frost.wgsl), over a night-blue glass or the page.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var arrival: texture_2d<f32>;
@group(0) @binding(2) var text: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

@fragment fn heading(in: FullscreenVarying) -> @location(0) vec4f {
  let px = in.position.xy / params.css;
  let size = vec2f(params.width, params.height) / params.css;
  let cell = px / params.grain;
  let grid = vec2f(params.cols, params.rows);
  // The letters, edge-smoothed over a device pixel.
  let d = textureSampleLevel(text, smp, cell / grid, 0.0).r * params.grain * params.css;
  let ink = clamp(0.5 - d, 0.0, 1.0);
  var back = vec4f(0.0);
  var diffuse = vec3f(0.0);
  if (params.scene == 0u) {
    let uv = px / size;
    let glass = mix(vec3f(0.03, 0.06, 0.13), vec3f(0.008, 0.015, 0.04), uv.y);
    back = vec4f(mix(glass, params.ink.rgb, ink), 1.0);
    diffuse = mix(glass, params.ink.rgb, ink * 0.7);
  } else {
    back = vec4f(params.ink.rgb * ink, ink);
    diffuse = params.ink.rgb * ink * 0.7;
  }
  let f = frost_read(arrival, smp, cell, grid, params.reveal, params.soft, params.age_scale, params.relief);
  var out = frost_over(f, px, back, diffuse, params.opacity, params.room.rgb);
  if (params.scene == 1u) {
    let rim = clamp(1.0 - f.normal.z * f.normal.z * 1.2, 0.0, 1.0) * f.cover;
    out = vec4f(mix(out.rgb, vec3f(0.22, 0.3, 0.45) * out.a, params.edge * rim), out.a);
  }
  return out;
}
