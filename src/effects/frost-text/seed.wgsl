#include "fullscreen.wgsl"
#include "hash.wgsl"
#include "seed-params.wgsl"

// Story 4.3: the warm start for frost on a heading, drawn into the grower's seeds (src/gpu/growth/)
// from the text's distance field, in cells (negative inside a letter; the field only reaches a
// sixth of an em past the outline, beyond which it holds a large constant).
//
// Ice nucleates on the glyphs' outlines, in places: a stroke's edge is a ledge where frost
// catches. One nucleus at most per `BLOCK`-cell block, near the block's centre. Every cell takes
// the orientation of the nearest nucleus, whose crystal it will be part of, turned so one arm
// points straight out of the letter; an orientation that varied within one crystal would average
// its anisotropy away and leave a blob. Outside the letters the glass is cold near the nuclei and
// warms to above freezing `reach` cells away, so the frost clings to the heading; inside a letter
// it is barely below freezing (the ink keeps it warmer), so frost creeps over the letters slowly.

@group(0) @binding(0) var<uniform> S: SeedParams;
@group(0) @binding(1) var text: texture_2d<f32>;

const BLOCK: i32 = 6;

fn distance_at(c: vec2i) -> f32 {
  let size = vec2i(textureDimensions(text));
  return textureLoad(text, clamp(c, vec2i(0), size - 1), 0).r;
}

struct Nucleus {
  centre: vec2f,
  angle: f32,
  real: bool,
}

fn nucleus_in(b: vec2i) -> Nucleus {
  var n: Nucleus;
  n.real = false;
  if (ihash_3to1(vec3i(b, i32(S.seed))) >= f32(BLOCK) / S.every) { return n; }
  let jitter = ihash_3to3(vec3i(b, i32(S.seed) + 17)).xy - 0.5;
  n.centre = (vec2f(b) + 0.5 + jitter * 0.5) * f32(BLOCK);
  let c = vec2i(n.centre);
  if (abs(distance_at(c)) > 2.5) { return n; }
  let g = vec2f(distance_at(c + vec2i(1, 0)) - distance_at(c - vec2i(1, 0)), distance_at(c + vec2i(0, 1)) - distance_at(c - vec2i(0, 1)));
  n.angle = select(0.0, atan2(g.y, g.x), dot(g, g) > 1e-6);
  n.real = true;
  return n;
}

@fragment fn seed(in: FullscreenVarying) -> @location(0) vec4f {
  let cell = in.position.xy;
  let d = distance_at(vec2i(floor(cell)));
  let home = vec2i(floor(cell)) / BLOCK;
  let reach = i32(ceil(S.reach / f32(BLOCK))) + 1;
  var nearest = 1e9;
  var angle = 0.0;
  for (var j = -reach; j <= reach; j++) {
    for (var i = -reach; i <= reach; i++) {
      let n = nucleus_in(home + vec2i(i, j));
      if (!n.real) { continue; }
      let r = length(cell - n.centre);
      if (r < nearest) {
        nearest = r;
        angle = n.angle;
      }
    }
  }
  let p = select(0.0, 1.0, nearest < 2.5);
  // Outside: cold near a nucleus, through the melting point at `reach` cells. Inside: just cold.
  let away = smoothstep(S.reach * 0.55, S.reach, nearest);
  let t = select(S.cold + (S.equilibrium * 1.15 - S.cold) * away, S.inside, d < 0.0);
  return vec4f(p, t, angle, 1.0);
}
