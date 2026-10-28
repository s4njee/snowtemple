#include "hash.wgsl"
#include "params.wgsl"

// Hello: a few hundred soft flakes falling straight down, one instanced draw of quads into the
// HDR scene. Every flake's position is a pure function of its index and the time, so there is no
// state and a held frame is exactly reproducible. Each falls at its own speed, sways a little,
// and wraps from the bottom of the view back to the top. Premultiplied colour, blended "over".

@group(0) @binding(0) var<uniform> params: Params;

struct Varying {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) light: f32,
}

const CORNERS = array(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, 1.0));

@vertex fn flake_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Varying {
  let h = hash_2to3(vec2f(f32(i), 7.0));
  // Near flakes (larger) fall and sway faster: a crude depth.
  let near = h.z;
  // Screen heights a second. Every flake here is at one depth, so the whole field falls together
  // and the motion check reads it as one drift: the speeds keep that under 0.05 widths a second.
  let speed = mix(0.03, 0.09, near) * params.speed;
  let x = fract(h.x + 0.02 * sin(params.time * (0.6 + near) + h.y * 6.28) * params.sway);
  let y = fract(h.y + params.time * speed);
  let radius = mix(1.2, 4.0, near * near) * params.size;
  let corner = CORNERS[v];
  // Screen position: x across, y down, with a margin so flakes enter and leave off-screen.
  let px = vec2f(x * (params.width + 16.0) - 8.0, y * (params.height + 16.0) - 8.0);
  let p = px + corner * radius * 1.6;
  var out: Varying;
  out.position = vec4f(p.x / params.width * 2.0 - 1.0, 1.0 - p.y / params.height * 2.0, 0.0, 1.0);
  out.local = corner * 1.6;
  out.light = mix(0.45, 1.0, near) * f32(i < u32(params.count));
  return out;
}

@fragment fn flake_fs(in: Varying) -> @location(0) vec4f {
  let d = length(in.local);
  let a = (1.0 - smoothstep(0.6, 1.0, d)) * in.light;
  return vec4f(vec3f(a), a);
}
