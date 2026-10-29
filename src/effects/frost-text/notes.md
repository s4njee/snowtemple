## How it works

`frost-creep`'s phase-field grower (`src/gpu/growth/`), seeded from a heading. The text is the family's copy of Temple of Time's font distance field (`src/gpu/text/`, Anton), drawn once per layout into a texture a cell per two CSS pixels. A seed pass (`seed.wgsl`) turns it into the warm start:

- **Nuclei on the outlines.** About one every 70 cells of outline: a stroke's edge is a ledge where frost catches. Each is a patch about five cells across. Smaller seeds melt back, because a tiny crystal's curvature lowers its melting point by more than the undercooling.
- **One orientation per crystal.** Each cell takes the orientation of its nearest nucleus, turned so one arm points straight out of the letter. The font's distance field only reaches a sixth of an em past the outline, so neither the orientation nor the cold can come from it further out.
- **Cold near the heading.** Outside the letters, the glass is cold near a nucleus and warms through freezing at the reach, so the frost clings to the heading. Inside a letter it is barely below freezing, so frost creeps over the letters slowly, as far as `frost over the letters` says.

The grown frost is drawn as in `frost-creep` (`src/wgsl/frost.wgsl`), over letters drawn from the same distance field, on night-blue glass or over the page. It is revealed by arrival time: by time (freeze, hold, thaw, a new frost) or by scroll.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-4.md](../../../docs/studies/epic-4.md)): 0.6 ms per frame at 1080p. In Chrome, one 1920 × 1080 frame reads 1.96 ms (1.90 to 2.04 over five loads), at the 2 ms Tier A budget. Growing adds about 0.06 ms a step at 1080p, and the default's 40-second freeze needs up to six steps a frame near its end. Shorter freezes cost more: 26 seconds read 2.13 ms in Chrome. The arrival texture is republished every fourth frame that grows. Scrolling grows at most 24 a frame, about 1.4 ms. A new layout grows up to 2,000 steps at once, its starting frost (about 90 ms at 1080p), and its seed pass searches about 700 blocks a cell for the nearest nucleus, both once.

State as `frost-creep`: about 25 MB at 1080p. 18.6 kB gzipped of its own, most of it the font's outlines, and 53.0 kB in all. Tier A by budget, provisional. It needs compute.

Flash `none`, pattern `none`, motion `none` in every preset, at the default and at 0.7. A six-letter heading in Anton is not a grating to the pattern analyser.

## Pitfalls

- **The heading is drawn, not the page's own.** Over a real page, the canvas has to sit exactly over the page's heading, in the same font. The family's font is Anton, and there is no way to read a page's own font outlines from the DOM.
- **Discs around nuclei.** The frost's reach is measured from the nearest nucleus, so the frost around the heading is a union of discs, not an even band.
- **Uppercase only.** The text is set in capitals, and kerning is not read.

## When to use it

A winter campaign headline, a "cold" product name, or a sale banner that frosts as it scrolls into view. Keep the real heading in the page's HTML for screen readers and search: this is decoration over it. The CSS fallback is a frosted texture masked to the text (`background-clip: text`), which cannot grow.

## References

- Ryo Kobayashi, "Modeling and numerical simulations of dendritic crystal growth", Physica D 63 (1993).
- Temple of Time's story 1.6, the font distance field.
- [plan.md](../../../plan.md), story 4.3.
