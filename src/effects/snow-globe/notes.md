## How it works

A compute pass moves the flakes; one render pass draws the globe (`globe.wgsl`, `draw.wgsl`).

- **The water.** After a shake, the flow is the curl of three travelling waves, so it is divergence-free and neither gathers nor spreads the flakes, plus a turn about the vertical axis in the shake's direction. Its energy decays over about three seconds.
- **The flakes** relax towards the flow, sink at a slow terminal speed (water is dense, flakes are light), and reflect off the glass. They settle on the scene's mound when the water there is calm, and lift again when it moves.
- **Shaking.** A drag over the globe shakes it by its speed, and a click shakes it hard. Device motion shakes it where the browser gives acceleration without a permission prompt. With nothing for 14 seconds, it gives itself a gentle shake. It opens just shaken.
- **The picture.** A water-filled sphere is a strong lens, so the scene inside (a cabin, a pine, a snowy mound under a night sky) is magnified towards the middle. A point of the scene at s shows at s / lens(|s|), lens rising from 0.72 at the centre to 1 at the rim, inverted with one fixed-point step. Flakes are moved by the same lens, larger and brighter when nearer. The glass adds a Fresnel rim, a window's soft highlight and a faint outline for white pages, over a wooden plinth with a brass band.

The flake model is written for this effect; story 2.3's "shared glass chunks" are not in this family yet.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-2.md](../../../docs/studies/epic-2.md)): 0.15 to 0.17 ms per frame at 1080p: one compute pass over 2400 flakes and one render pass. In Chrome, one 1920 × 1080 frame reads 0.72 ms. Tier A by budget, provisional; it needs compute. 2.1 kB gzipped of its own, 30.4 kB in all.

Flash `low`, pattern `none`, motion inside the caps. Two patterns were found and removed: stars at the centres of a regular grid (a lattice), and flakes lining up along a flow of one set of sine waves (now two sets at unrelated wavelengths, with each flake's own tumble).

## Pitfalls

- The lens is a radial approximation, not a ray-traced refraction: the scene has no depth behind the glass.
- Settled flakes lie on the mound's profile at its middle, not across its width.
- On iOS, device motion needs a permission prompt, which this does not ask for.

## When to use it

A product hero for a gift or seasonal page, or a holiday greeting, Tier A by budget (it needs compute). A looping video of a snow globe is the honest alternative where it need not be shaken.

## References

- [plan.md](../../../plan.md), story 2.3.
