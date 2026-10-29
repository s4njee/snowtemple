#include "fullscreen.wgsl"
#include "hash.wgsl"
#include "fold.wgsl"
#include "params.wgsl"

// Story 4.4: a grown snow crystal (src/gpu/growth/reiter.wgsl) drawn as clear ice. The screen
// point is turned, then folded into one twelfth of the plane by the dihedral group D6 (src/wgsl/
// fold.wgsl), so the crystal is exactly six-fold and mirror-symmetric however the automaton's
// arithmetic rounded; only that twelfth of the grid is ever read.
//
// Ice is where the water has reached 1. Frozen cells keep gathering vapour, so the water above 1
// is the ice's thickness: ribs, ridges and the plates' sectors show in it. Clear ice is mostly
// seen by its edges and by light on its ridges, over a cold dark sky.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var grid: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

const SQRT3_2 = 0.8660254;

// The grid at a point in cells (x right, y up), bilinear in axial coordinates.
fn grid_at(p: vec2f) -> vec4f {
  let r = p.y / SQRT3_2;
  let q = p.x - r * 0.5;
  let side = 2.0 * params.radius + 1.0;
  let uv = (vec2f(q, r) + params.radius + 0.5) / side;
  return textureSampleLevel(grid, smp, uv, 0.0);
}

struct Ice {
  cover: f32,
  thick: f32,
}

fn ice_at(p: vec2f) -> Ice {
  let f = fold_point(18u, p, 6.0).p;
  let g = grid_at(f);
  var ice: Ice;
  let shown = smoothstep(0.0, params.soft, params.reveal - g.r);
  ice.cover = g.b * shown;
  // The water above 1, per unit of ice, so a branch's thickness does not thin with its coverage.
  ice.thick = clamp(g.a / max(g.b, 1e-3) * params.thickness, 0.0, 1.0) * ice.cover;
  return ice;
}

@fragment fn flake(in: FullscreenVarying) -> @location(0) vec4f {
  let px = in.position.xy / params.css;
  let size = vec2f(params.width, params.height) / params.css;
  // Cells per CSS pixel, and the point in cells, y up, turned by the spin.
  let scale = params.radius / params.flake_px;
  let d = (px - params.centre) * vec2f(1.0, -1.0) * scale;
  let c = cos(params.angle);
  let s = sin(params.angle);
  let p = vec2f(c * d.x - s * d.y, s * d.x + c * d.y);
  // The sky: a deep cold blue, barely lighter low down. Dark, so the ice reads at the small
  // luminance step the pattern rule leaves a rosette (index.ts).
  let uv = px / size;
  let sky = mix(vec3f(0.003, 0.005, 0.014), vec3f(0.006, 0.011, 0.026), uv.y);
  var back = vec4f(sky, 1.0);
  if (params.scene == 1u) { back = vec4f(0.0); }
  if (length(p) > params.radius * 1.02) { return back; }
  let here = ice_at(p);
  // Gradients over one CSS pixel, for the edges and the ridges' light.
  let e = scale;
  let ix = ice_at(p + vec2f(e, 0.0));
  let iy = ice_at(p + vec2f(0.0, e));
  let edge = clamp(length(vec2f(ix.cover - here.cover, iy.cover - here.cover)) * 1.4, 0.0, 1.0);
  let slope = vec2f(ix.thick - here.thick, iy.thick - here.thick) * params.relief;
  let normal = normalize(vec3f(-slope, 1.0));
  let light = normalize(vec3f(-0.4, 0.55, 0.75));
  let lit = max(dot(normal, light), 0.0);
  let glint = pow(max(dot(reflect(-light, normal), vec3f(0.0, 0.0, 1.0)), 0.0), 20.0);
  let ice = vec3f(0.72, 0.84, 1.0);
  // Clear ice: its body, brighter where thick and where its ridges face the light, and its edges,
  // all within the step `brightness` allows.
  let body = here.cover * (0.55 + 0.3 * here.thick * (0.5 + 0.5 * lit) + 0.15 * glint * here.thick) + edge * 0.35;
  let a = clamp(body, 0.0, 1.0) * params.brightness * params.fade;
  let colour = ice * a;
  return vec4f(back.rgb * (1.0 - a * params.cover_back) + colour, max(back.a, a));
}
