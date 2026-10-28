## How it works

The same piles as `settling-snow` (`src/gpu/pile/`), started full and melting. Melt takes height off each column at the melt rate, faster where the pile is thin (one plus twice e^(−h / 2 px)), so a pile thins first at its ends and pulls back from them. Wet snow slumps: the angle of repose falls from 35° to 20° while it melts, so the pile spreads lower. Melting ends drip: a drop carries off a little of an end column now and then, and falls as a clear bead with a bright point. Snow thinner than a fiftieth of a pixel is gone, so a pile reaches exactly zero (`tests/pile.test.ts`), and nothing is left after a pause.

It melts in time, 24 seconds melting and then 14 snowing again, or as the page scrolls, in proportion to how fast it scrolls down, snowing lightly back while the page is still.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-3.md](../../../docs/studies/epic-3.md)): 0.6 to 0.7 ms per frame at 1080p, the same passes as `settling-snow`. In Chrome, one 1920 × 1080 frame reads 0.90 ms. Tier A by budget, provisional; it needs compute. 1.8 kB gzipped of its own, 43.3 kB in all.

Flash `low`, pattern `none`, motion inside the caps, at the default and at 0.7.

## Pitfalls

- Melt is uniform along an edge but for the thin-snow term: there is no sun angle or warm element underneath.
- Drops fall straight and vanish where they land; they do not wet the element.

## When to use it

A spring, end-of-season or "the sale is ending" page, or a scroll-driven seasonal transition, Tier A by budget (it needs compute). A CSS ridge (`src/css/snow-ridge.css`) with its `--sn-snow-depth` transitioned to 0 is the free version: it shrinks, without slumping, pulling back or dripping.

## References

- [plan.md](../../../plan.md), story 3.5.
