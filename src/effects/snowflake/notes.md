## How it works

Reiter's local cellular model for snow crystals (`src/gpu/growth/reiter.wgsl`), in compute on a hexagonal grid of radius 160 cells. Each cell holds an amount of water, and it is ice once that reaches 1. A cell is receptive when it is ice or touches ice. Each step has two passes:

- **Receptive cells** keep their water and gain a little vapour from the air (γ).
- **Every other cell's water** diffuses among its six neighbours (α).
- **The air** starts at humidity β, and the grid's edge holds it there.

Three numbers grow every form: stellar dendrites, fern dendrites, sectored plates and stellar plates, from Reiter's map of the parameter space. A seed jitters β by 2% and γ by 15% within its kind, and roughens the starting air by 0.4%, so every seed's side branches are its own.

The crystal is grown once and drawn as a texture read. The screen point is turned, then folded into one twelfth of the plane by the dihedral group D6 (`src/wgsl/fold.wgsl`, from The Hero's Journey). The crystal is then exactly six-fold and mirror-symmetric however the automaton's arithmetic rounded, and only that twelfth of the grid is ever read.

Drawing:

- **Coverage.** The side branches are a cell wide, so filtering the water itself would average them below 1 and lose them. The ice is drawn from a filtered 1-or-0 flag instead, as coverage.
- **Thickness.** Frozen cells keep gathering vapour, so the water above 1 is the ice's thickness: ribs, ridges and the plates' sectors show in it.
- **Clear ice.** The ice is seen by its body, light on its ridges and its edges, over a cold, very dark sky. It adds light and never darkens what is behind it.

Each round fades in a new crystal a third grown, grows it, holds it turning slowly, and fades it out.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-4.md](../../../docs/studies/epic-4.md)): 0.17 ms per frame at 1080p. In Chrome, one 1920 × 1080 frame reads 0.59 ms. Growing is about 0.03 ms a step and two or three steps a frame. The grid is 103,000 cells: 3.3 MB of state and 0.8 MB of texture. 4.3 kB gzipped of its own, 30.4 kB in all. Tier A by budget, provisional. It needs compute.

Flash `none` and pattern `none` in every preset but `bright ice`, at the default and at 0.7. Motion is inside the caps: 0.02 to 0.05 zoom doublings a second as it grows, and the 2° a second it turns. The zoom is also checked from the effect's own transform (`tests/growth.test.ts`), because the motion check cannot track a crystal that is small or faint. `bright ice` (intensity 1) is declared over the pattern rule and the motion caps, and starts behind the gate.

## Pitfalls

- **Growth reads as a zoom.** A growing crystal's edge moves outwards. Grown evenly over 8 seconds, a stellar plate read 0.24 zoom doublings a second, against a cap of 0.1. It now grows at a steady rate of doublings of its radius, a dendrite's radius going with its steps: 0.072 a second at the default, 0.09 at 0.7. That is why it takes 24 seconds.
- **A rosette is a regular pattern.** A six-armed crystal is six light-dark pairs about its centre, one more than the guidance allows at a discernible step. At hero size it is what the pattern rule counts (The Hero's Journey M1): the stellar plate read `high` once it was half grown. So the ice adds no more luminance than the pattern step at the intensity, 0.045 at the default and 0.09 at 0.7, and it is drawn on a very dark sky, where so small a step still reads. Only past the strong intensity is it bright.
- **No light page.** Pale ice on a white page does not read, and the effect needs its own dark sky.
- **Too fine to resolve.** At the default size a cell is about 1.35 CSS pixels, so a fern dendrite's finest branches blur into its arms.

## When to use it

A loading indicator, a badge or avatar grown from a user id (the `badge` preset), or a seasonal mark: grown once, it costs a texture read to keep on screen. An SVG snowflake is the fallback, and every one is the same.

## References

- Clifford Reiter, "A local cellular model for snow crystal growth", Chaos, Solitons & Fractals 23, 1111–1119 (2005).
- Janko Gravner and David Griffeath, "Modeling snow crystal growth", Experimental Mathematics 17 (2008), the fuller model.
- [plan.md](../../../plan.md), story 4.4.
