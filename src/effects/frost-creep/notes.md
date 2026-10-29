## How it works

Frost grown by its mechanism, then revealed. `src/gpu/growth/` runs Kobayashi's phase-field model of dendritic solidification in compute. Each cell of a grid two CSS pixels across holds a phase (0 liquid, 1 ice) and a temperature. Ice spreads where the glass is below freezing. Freezing gives off latent heat, which warms the glass just ahead of the front, so a flat front is unstable. A six-fold anisotropy in the interface's stiffness then makes the bumps that win grow as arms, and a little noise at the interface makes their side branches. With more latent heat than Kobayashi's figure (K = 2.4), the arms are thinner and branch like fern frost.

The pane's warm start is `src/gpu/growth/pane.ts`:

- **Nuclei.** Ice nucleates at places along the frame, where the cold comes in, about 110 cells apart, and at a few specks of dust or scratches near it. Each nucleus is one crystal with its own orientation.
- **Temperature.** The glass is undercooled at the frame and warms through the melting point at the reach. The middle of a pane in a heated room stays above freezing, so the frost stops of its own accord, at a ragged line.

Each cell records the step at which it froze. The effect grows only a little ahead of the reveal, at most 24 steps a frame. It draws whatever has frozen by the reveal's step: by time (freeze, hold, thaw back the way it came, then a new pane) or by scroll. Scrubbing back costs nothing, since what is drawn is a threshold on arrival.

Drawing (`src/wgsl/frost.wgsl`):

- **Shape.** The growing edge comes from arrival, and the ice's side edges from the phase, which is smooth across the interface.
- **Thickness.** An arm is thickest along its spine, from the phase averaged over the 5 × 5 cells around each cell, and older frost is thicker. The spine stands up as a ridge the room's light finds.
- **Texture.** A fine needle texture runs along the direction each arm grew. It is fixed in place, so nothing flickers.

Behind the glass is a winter dusk, blurred much more through the frost than through clear glass, or the page itself.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-4.md](../../../docs/studies/epic-4.md)): 0.6 ms per frame at 1080p. In Chrome, one 1920 × 1080 frame reads 1.59 ms. The dusk behind the glass is drawn once per size into two textures (sharp, and blurred at a quarter size) and read back. Drawn twice per pixel per frame instead, it read 4.2 ms in Chrome. Bloom is off by default: the far windows' glow is in the cached view.

Growing adds about 0.06 ms a step at 1080p, where the grid is 960 × 540 cells, plus 0.17 ms to publish the arrival texture, which is done every fourth frame that grows. The default freeze needs four or five steps a frame, so about 0.3 ms. Fast scrolling grows at most 24 steps a frame, about 1.4 ms, and the frost catches up over a few frames. A new pane grows up to 2,000 steps in its first frame, its starting frost: about 60 ms at load, once.

State: two f32 grids of 16 bytes a cell (16.6 MB at 1080p), plus 8.3 MB of seeds and arrival in half floats. The cell is two CSS pixels at the smallest, because at one the state would be 100 MB.

2.2 kB gzipped of its own, 38.8 kB in all. Tier A by budget, provisional, since only one GPU has been measured. It needs compute.

Flash `none`, pattern `none`, motion `none` in every preset, at the default and at 0.7: frost grows too slowly to read as motion.

## Pitfalls

- **Resolution.** Kobayashi's arms are about six cells wide, which sets how fine the frost can be: twelve CSS pixels at the default cell. Shrinking the interface thickness only turns the arms into petals, because the thermal diffusion length is in grid cells too.
- **Crowding.** Too many nuclei share the cold out between them. Every crystal then stays a small compact blob, too small to branch. A crystal needs about a hundred cells of room.
- **One orientation per crystal.** A crystal's orientation must not vary across it, or its anisotropy averages away and it grows round.
- **Not frost on real glass.** Frost on a window grows from vapour, not from the melt. The model is the melt's, and the look is close at this scale.
- **Resize.** A resize grows the pane again from its seeds, so the frost changes.

## When to use it

A winter landing page that frosts as the visitor scrolls, a cold-snap alert, or a seasonal section, behind text that has its own contrast. Over the page it is a frame of frost around the content. A CSS frost overlay (a frosted PNG, mask-revealed) is the honest fallback for a fixed look. It cannot grow, branch or thaw back.

## References

- Ryo Kobayashi, "Modeling and numerical simulations of dendritic crystal growth", Physica D 63, 410–423 (1993).
- Kenneth Libbrecht, [snowcrystals.com](http://www.snowcrystals.com/), on frost and dendrite morphology.
- [plan.md](../../../plan.md), stories 4.1 and 4.2.
