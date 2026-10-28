## How it works

The canvas is a snow surface seen from above: an `r32float` height field, one cell per 2 CSS pixels, depth in CSS pixels, ping-ponged between two textures (`surface.wgsl`).

- **Steps.** The pointer, read from the window, walks: a step every stride along its path, alternating either side of it, each turned along the walk (`Walker` in index.ts). With no pointer for three seconds, someone crosses on their own.
- **A print** packs the snow under the boot (a sole and a heel) down to 30% of its depth, and pushes about as much again up into a rim around it.
- **Refilling.** Falling snow fills prints back towards the surface's resting depth, which drifts gently across the surface; a raised rim settles slowly.
- **Slumping.** Where a rim stands steeper than 38°, a share of the excess slides to its four neighbours, mass-conserving as `pile.wgsl`'s edges do.
- **Light.** A low sun from the upper left: faces towards it near white, the rest in the sky's blue, and the prints deeper blue, where less sky reaches.

After the deformable snow of _Batman: Arkham Origins_ (Barré-Brisebois, GDC 2014), on the GPU and without its trail mesh.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-3.md](../../../docs/studies/epic-3.md)): 0.5 to 0.8 ms per frame at 1080p: one settling pass and two slumping passes over a 960 × 540 field, the surface's draw and 2000 flakes. In Chrome, one 1920 × 1080 frame reads 1.44 ms. Tier A by budget, provisional; it needs compute. 2.3 kB gzipped of its own, 36.2 kB in all. Two `r32float` fields of a cell per 2 CSS px: about 4 MB at 1080p.

Flash `low` (a flake crossing a cell), pattern `none`, motion inside the caps, at the default and at 0.7.

## Pitfalls

- A trail of prints is a row of regular shapes: at a short stride, high contrast and a large size it could read as a pattern. The default trail is a narrow band, well under the pattern rule's area.
- Seen from straight above, depth reads only through the light; there is no parallax.
- Resizing the canvas starts a fresh surface.

## When to use it

A winter section background, or a ground strip along a hero's foot, on a light page, Tier A by budget (it needs compute). There is no CSS version worth the name.

## References

- Colin Barré-Brisebois, "Deformable Snow Rendering in Batman: Arkham Origins", GDC 2014.
- [plan.md](../../../plan.md), story 3.4.
