#include "fullscreen.wgsl"
#include "fbm.wgsl"
#include "params.wgsl"

// A blizzard (story 2.2): blowing snow as a participating medium, ray-marched at a third of the
// resolution. Rays leave the eye through the view and step out to `far` metres, closer together
// near the eye. The medium's density is a 3D noise stretched along the wind, carried by it, so
// streamers of snow stream across; nearer streamers cross the view faster, at the wind's speed
// over their distance, which is what keeps the whole field's drift down (parallax, as in story
// 2.1). Each step scatters the storm's light towards the eye and dims what lies behind, so the
// far page goes to white (alpha is what the storm hides). Twelve steps and three octaves: 18 and 4 cost 9.7 ms in Chrome, over Tier B. A gust is a front of denser snow that
// sweeps across, closing the view and clearing it.

@group(0) @binding(0) var<uniform> params: Params;
@group(1) @binding(0) var storm: texture_2d<f32>;
@group(1) @binding(1) var storm_sampler: sampler;

const STEPS: i32 = 12;

// How much the gust front adds at screen position x and time t: one front every `gust_period`
// seconds, sweeping across with the wind.
fn gust(x: f32, t: f32) -> f32 {
  let phase = t / params.gust_period - x * 0.35;
  let s = 0.5 + 0.5 * sin(6.2831853 * phase);
  return s * s;
}

@fragment fn march(in: FullscreenVarying) -> @location(0) vec4f {
  let ndc = vec2f((in.uv.x - 0.5) * params.aspect, 0.5 - in.uv.y) * 2.0 * params.tan_half_fov;
  let dir = normalize(vec3f(ndc, 1.0));
  var transmittance = 1.0;
  var light = vec3f(0.0);
  let density = params.density * (1.0 + params.gust_strength * gust(in.uv.x, params.time));
  var z0 = params.near;
  for (var i = 0; i < STEPS; i++) {
    // Steps spaced geometrically from near to far.
    let z1 = params.near * pow(params.far / params.near, f32(i + 1) / f32(STEPS));
    let p = dir * ((z0 + z1) * 0.5 / dir.z);
    let dz = z1 - z0;
    // Carried by the wind, stretched along it, and churned slowly.
    // Warped and only mildly stretched: strongly stretched noise lines up into stripes, which
    // the pattern rule counts (at the strong dose it read as a grating 40 px apart).
    var q = (p - vec3f(params.wind * params.time, -0.3 * params.time, 0.0)) * vec3f(0.24, 0.42, 0.4);
    q += 0.6 * vec3f(fbm_3d(q * 0.7 + 11.0, 2, 2.0, 0.5), fbm_3d(q * 0.7 + 23.0, 2, 2.0, 0.5), 0.0);
    let n = fbm_3d(q + vec3f(0.0, 0.0, params.time * 0.05), 3, 2.1, 0.55);
    let rho = density * smoothstep(-0.7, 0.8, n) * (0.35 + 0.65 * smoothstep(0.0, 6.0, z0));
    let absorbed = 1.0 - exp(-rho * dz);
    light += params.colour.rgb * absorbed * transmittance;
    transmittance *= 1.0 - absorbed;
    z0 = z1;
  }
  // A uniform haze beyond the last step: the far page goes to white.
  let beyond = 1.0 - exp(-density * params.haze * 10.0);
  light += params.colour.rgb * beyond * transmittance;
  transmittance *= 1.0 - beyond;
  return vec4f(light, 1.0 - transmittance);
}

// The half-resolution storm, upsampled over the scene.
@fragment fn show(in: FullscreenVarying) -> @location(0) vec4f {
  return textureSampleLevel(storm, storm_sampler, in.uv, 0.0);
}
