// Frost drawn from a grower's arrival times (src/gpu/growth/): what is revealed, how thick it
// is, and how it takes the light. Shared by frost-creep and frost-text. Needs hash.wgsl and
// noise.wgsl.
//
// A cell shows once the reveal has passed the step it froze at. An arm is thickest along its
// spine and thin at its edges (the grower's `body`, the phase averaged around the cell), and frost
// that froze earlier has had longer to thicken. Its fine texture runs along the way it grew.

struct Frost {
  /** How much of the pixel is frost, 0..1, soft over a cell at the growing edge. */
  cover: f32,
  /** 0 a fresh thin film, 1 an arm's old, thick spine. */
  thick: f32,
  /** Surface normal, z towards the viewer. */
  normal: vec3f,
  /** The direction it grew, in the pane. */
  growth: vec2f,
}

fn frost_height(s: vec4f, reveal: f32, age_scale: f32) -> f32 {
  let age = 1.0 - exp(-max(reveal - s.r, 0.0) / age_scale);
  return smoothstep(0.45, 0.95, s.b) * (0.4 + 0.6 * age);
}

// `cell` is the position in cells, `size` the grid's size in cells, `soft` the width of the
// growing edge in steps, `age_scale` the steps over which frost thickens, `relief` how steep its
// ridges look.
fn frost_read(arrival: texture_2d<f32>, smp: sampler, cell: vec2f, size: vec2f, reveal: f32, soft: f32, age_scale: f32, relief: f32) -> Frost {
  let uv = cell / size;
  let du = vec2f(1.0 / size.x, 0.0);
  let dv = vec2f(0.0, 1.0 / size.y);
  let here = textureSampleLevel(arrival, smp, uv, 0.0);
  let x0 = textureSampleLevel(arrival, smp, uv - du, 0.0);
  let x1 = textureSampleLevel(arrival, smp, uv + du, 0.0);
  let y0 = textureSampleLevel(arrival, smp, uv - dv, 0.0);
  let y1 = textureSampleLevel(arrival, smp, uv + dv, 0.0);
  let gx = frost_height(x1, reveal, age_scale) - frost_height(x0, reveal, age_scale);
  let gy = frost_height(y1, reveal, age_scale) - frost_height(y0, reveal, age_scale);
  var f: Frost;
  // The growing edge from arrival, the ice's sides from the phase.
  f.cover = smoothstep(0.0, soft, reveal - here.r) * smoothstep(0.3, 0.7, here.g);
  f.thick = frost_height(here, reveal, age_scale);
  f.normal = normalize(vec3f(-gx * relief, -gy * relief, 1.0));
  let along = vec2f(min(x1.r, reveal) - min(x0.r, reveal), min(y1.r, reveal) - min(y0.r, reveal));
  f.growth = select(vec2f(1.0, 0.0), normalize(along), dot(along, along) > 1e-6);
  return f;
}

// Frost's look over what is behind it, `behind_sharp` through clear glass and `behind_diffuse`
// through ice, which scatters it: premultiplied colour and alpha. `px` is the CSS pixel, for the
// crystals' fine texture; `opacity` how much a thick spine hides; `room` the light from inside.
fn frost_over(f: Frost, px: vec2f, behind_sharp: vec4f, behind_diffuse: vec3f, opacity: f32, room: vec3f) -> vec4f {
  // Fine needles along the growth, and a grain across them: fixed in place, so nothing in them
  // moves or flickers.
  let along = dot(px, f.growth);
  let across = dot(px, vec2f(-f.growth.y, f.growth.x));
  let needles = 0.8 + 0.4 * gnoise_2d(vec2f(along * 0.1, across * 0.7)) + 0.15 * gnoise_2d(vec2f(along * 0.4, across * 2.0));
  let grain = 0.95 + 0.1 * ihash_2to1(vec2i(floor(px)));
  let light = normalize(vec3f(-0.45, -0.55, 0.7));
  let lambert = max(dot(f.normal, light), 0.0);
  let glance = pow(max(dot(reflect(-light, f.normal), vec3f(0.0, 0.0, 1.0)), 0.0), 16.0);
  let ice = vec3f(0.82, 0.89, 0.98);
  let body = 0.3 + 0.7 * f.thick;
  let lit = room * ice * (0.2 + 0.8 * lambert) * needles * grain * body + room * glance * 0.4 * f.thick;
  let a = f.cover * opacity * (0.25 + 0.75 * f.thick);
  // Ice lets through much of what is behind it, scattered.
  let colour = lit + behind_diffuse * 0.6;
  return vec4f(behind_sharp.rgb * (1.0 - a) + colour * a, behind_sharp.a * (1.0 - a) + a);
}
