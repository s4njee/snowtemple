// flakes.wgsl -- snowflakes at depth (story 2.1). The `FlakeParams` struct comes from flakes.ts as
// the "flake-params.wgsl" chunk, bound as `flakes` at group 0, binding 0.
//
// Every flake is a pure function of its index and the time: no state, so a held frame is
// exactly reproducible and the cost is the vertex shader alone. The camera looks along +z with a
// vertical field of view of 50°. Each flake is given a fixed depth by its index, far first, so
// drawing in instance order is drawing back to front, and wraps within the view's own width and
// height at that depth, so every instance is on screen. Depths are spaced evenly, so there are as
// many flakes at each depth: uniform snow would have them rise as the square of depth, and leave
// almost all of a few thousand flakes as far-off specks. Its motion, in metres and seconds:
//
// - it falls at its terminal speed, which rises slowly with size (0.8 D^0.16 m/s, D in mm, the
//   form Locatelli and Hobbs give for aggregates);
// - it drifts with the mean wind, and with gusts: a band-limited wind (Fire Temple's flicker
//   signal) that arrives later the further downwind a flake is, so a gust sweeps across;
// - it swirls with its neighbours: a displacement from the curl of a slowly evolving noise
//   field, sampled where the flake is, so flakes near each other move together;
// - it flutters on its own, a little, and tumbles: its sprite turns and foreshortens.
//
// The eye (or camera) is focused at `focus` metres. A flake nearer or further is blurred over a
// circle of confusion proportional to |1/z - 1/focus|, and its light is spread over that circle,
// so a flake just in front of the viewer is a large, faint disc, as near snow is in photographs.
// Far flakes smaller than a pixel keep their light as they shrink (the footprint stays a pixel
// and the brightness falls with area), so they do not shimmer. Moving flakes are drawn as a
// streak over the shutter time, between where the flake was and where it is, with their light
// spread along it. A faint dark ring (`edge`) lets white flakes read over a white page.

#include "hash.wgsl"
#include "simplex.wgsl"
#include "flicker.wgsl"
#include "flake-params.wgsl"

@group(0) @binding(0) var<uniform> flakes: FlakeParams;

const FLAKE_TAN_HALF: f32 = 0.46630765; // tan(25°)
const FLAKE_CORNERS = array(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, 1.0));
// How far past a flake's radius its quad reaches, for the soft edge and the dark ring.
const FLAKE_REACH: f32 = 1.7;

struct Flake {
  /** Screen position now and a shutter time ago, in pixels (y down). */
  now: vec2f,
  then: vec2f,
  /** Radius in pixels before the footprint floor, the blur radius, and light 0..1. */
  radius: f32,
  blur: f32,
  light: f32,
  /** Tumble: foreshortening 0.4..1 and the sprite's angle. */
  squash: f32,
  angle: f32,
  visible: bool,
}

fn flake_wrap(v: f32, half: f32) -> f32 {
  return (fract((v + half) / (2.0 * half)) * 2.0 - 1.0) * half;
}

// The swirl: the curl of a noise field in x and y, at p (metres) and time t.
fn flake_swirl(p: vec3f, t: f32) -> vec2f {
  let q = vec3f(p.xy * 0.55, p.z * 0.2 + t * 0.12);
  let e = 0.08;
  let dx = snoise_3d(q + vec3f(e, 0.0, 0.0)) - snoise_3d(q - vec3f(e, 0.0, 0.0));
  let dy = snoise_3d(q + vec3f(0.0, e, 0.0)) - snoise_3d(q - vec3f(0.0, e, 0.0));
  return vec2f(dy, -dx) / (2.0 * e);
}

// World position (metres, y up) of flake `i` at time `t`, and its depth.
fn flake_world(i: u32, t: f32, h: vec4f, diameter: f32) -> vec3f {
  let f = flakes;
  // Depth by index, far first, jittered within its slot, evenly spaced.
  var z = f.far - (f32(i) + h.z) / f.capacity * (f.far - f.near);
  // The box a flake wraps in: the view at its own depth. Driving into the snow, flakes keep their
  // place in the world as they come nearer, so they stream out of the view. They then wrap in a
  // tube the width of the view at 3 m, as headlights light the snow near the line of travel: a
  // box as wide as the far view leaves almost none of them near enough to see.
  var span = z * FLAKE_TAN_HALF * 1.08;
  if (f.drive > 0.0) {
    span = min(f.far, 3.0) * FLAKE_TAN_HALF * 1.08;
    z = f.near + fract((z - f.near - f.drive * t) / (f.far - f.near)) * (f.far - f.near);
  }
  let half = vec2f(span * f.aspect, span);

  let fall = 0.8 * pow(diameter, 0.16);
  let x0 = (h.x * 2.0 - 1.0) * half.x;
  let y0 = (h.y * 2.0 - 1.0) * half.y;
  // Gusts arrive later downwind: the signal is read at the time the front reached x0.
  let gust = flicker_offset(t - x0 / 6.0, 11u, flicker_settings(f.gust_rate, 0.0, 0.0, 0.0)).x;
  var x = x0 + f.wind * t + f.gust * gust;
  var y = y0 - fall * t;
  let swirl = flake_swirl(vec3f(x, y, z), t) * f.swirl;
  let flutter = 0.03 * vec2f(sin(t * (2.0 + 3.0 * h.w) + h.x * 40.0), cos(t * (1.3 + 2.0 * h.w) + h.y * 40.0));
  x = flake_wrap(x + swirl.x + flutter.x, half.x);
  y = flake_wrap(y + swirl.y + flutter.y, half.y);
  return vec3f(x, y, z);
}

fn flake_screen(p: vec3f) -> vec2f {
  let f = flakes;
  let focal = f.height / (2.0 * FLAKE_TAN_HALF);
  return vec2f(p.x / p.z * focal + 0.5 * f.width, 0.5 * f.height - p.y / p.z * focal);
}

fn flake(i: u32, t: f32) -> Flake {
  let f = flakes;
  let h = hash_2to3(vec2f(f32(i), 3.0));
  let h4 = vec4f(h, hash_2to1(vec2f(f32(i), 9.0)));
  // Diameter from an exponential distribution with mean `diameter` mm, clipped at four means.
  let diameter = min(-log(1.0 - 0.98 * h4.w) * f.diameter, 4.0 * f.diameter);
  let now = flake_world(i, t, h4, diameter);
  let then = flake_world(i, t - f.shutter, h4, diameter);
  var out: Flake;
  out.now = flake_screen(now);
  out.then = flake_screen(then);
  // A wrap between the two times would draw a streak across the view.
  if (distance(out.now, out.then) > 0.25 * f.height || abs(now.z - then.z) > 1.0) {
    out.then = out.now;
  }
  let focal = f.height / (2.0 * FLAKE_TAN_HALF);
  out.radius = 0.5 * diameter * 1e-3 / now.z * focal * f.size;
  // Circle of confusion of a thin lens focused at `focus`: aperture (m) x focal length (px) x
  // |1/z - 1/focus|.
  out.blur = f.aperture * 1e-3 * focal * abs(1.0 / now.z - 1.0 / f.focus);
  // Fades with depth (the far flakes are seen through the near snow), and decimated by `count`.
  let kept = select(0.0, 1.0, hash_2to1(vec2f(f32(i), 21.0)) < f.count / f.capacity);
  out.light = exp(-now.z / f.visibility) * kept;
  let spin = t * (0.6 + 1.4 * h.y) + h.z * 6.28;
  out.squash = mix(0.4, 1.0, abs(cos(spin)));
  out.angle = h.x * 6.28 + t * (h.z - 0.5);
  let margin = 40.0;
  out.visible = kept > 0.0 && now.z > f.near &&
    all(out.now > vec2f(-margin)) && all(out.now < vec2f(f.width, f.height) + margin);
  return out;
}

struct FlakeVarying {
  @builtin(position) position: vec4f,
  /** Quad coordinates in pixels: along the streak, across it. */
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) shape: vec4f, // half length, footprint radius, squash, light
  /** Share of the footprint that is blur: a defocused disc has a soft edge, a sharp flake not. */
  @location(2) @interpolate(flat) defocus: f32,
}

@vertex fn flake_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> FlakeVarying {
  let f = flakes;
  let s = flake(i, f.time);
  var out: FlakeVarying;
  if (!s.visible) {
    out.position = vec4f(2.0, 2.0, 0.0, 1.0);
    return out;
  }
  // The footprint is the flake blurred by its circle of confusion, never under a pixel; its light
  // is spread over it, so a blurred or sub-pixel flake is fainter, not brighter.
  let footprint = max(sqrt(s.radius * s.radius + s.blur * s.blur), 1.0);
  let point_light = min(1.0, (s.radius * s.radius) / (footprint * footprint));
  let streak = s.now - s.then;
  let length_px = length(streak);
  let along = select(vec2f(cos(s.angle), sin(s.angle)), streak / max(length_px, 1e-4), length_px > 0.5);
  let across = vec2f(-along.y, along.x);
  let half_length = 0.5 * length_px;
  // A streak spreads the same light over its length.
  let streak_light = (2.0 * footprint) / (2.0 * footprint + length_px);
  let corner = FLAKE_CORNERS[v];
  let reach = footprint * FLAKE_REACH;
  let local = vec2f(corner.x * (half_length + reach), corner.y * reach);
  let centre = 0.5 * (s.now + s.then);
  let p = centre + along * local.x + across * local.y;
  out.position = vec4f(p.x / f.width * 2.0 - 1.0, 1.0 - p.y / f.height * 2.0, 0.0, 1.0);
  out.local = local;
  // Foreshortening only once the flake is big enough to have a shape.
  let squash = select(1.0, s.squash, footprint > 2.0 && length_px < footprint);
  out.shape = vec4f(half_length, footprint, squash, s.light * point_light * streak_light);
  out.defocus = s.blur / footprint;
  return out;
}

@fragment fn flake_fs(in: FlakeVarying) -> @location(0) vec4f {
  let f = flakes;
  let half_length = in.shape.x;
  let footprint = in.shape.y;
  // Distance to the streak's core segment, in footprint radii, foreshortened across.
  let along = max(abs(in.local.x) - half_length, 0.0);
  let d = length(vec2f(along, in.local.y / in.shape.z)) / footprint;
  // A defocused flake is a soft disc; a sharp one has a firmer edge.
  let inner = mix(0.45, 0.05, in.defocus);
  let a = (1.0 - smoothstep(inner, 1.0, d)) * in.shape.w * f.brightness;
  // The faint dark ring, outside the flake, for white pages.
  let ring = f.edge * 0.7 * in.shape.w * smoothstep(0.6, 1.0, d) * (1.0 - smoothstep(1.25, FLAKE_REACH, d));
  let colour = vec3f(0.93, 0.96, 1.0) * a;
  // Near black, so the ring vanishes over a dark page and only darkens a light one.
  let shade = vec3f(0.004, 0.006, 0.01) * ring * (1.0 - a);
  return vec4f(colour + shade, a + ring * (1.0 - a));
}
