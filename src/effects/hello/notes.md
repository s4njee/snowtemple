## How it works

One instanced draw of 600 quads (`flakes.wgsl`) into the HDR scene, then the shared tail with its tonemap off, over the page. Every flake's position is a pure function of its index and the time: a fixed column, a fall that wraps from the bottom of the view to the top, and a small sway. There is no state, so a held frame and a poster are the same snow. Bigger flakes fall and sway faster, a crude depth. Colour is premultiplied white with coverage, blended "over", so the page shows between the flakes.

`dose` ("intensity") sets how many flakes show (0 to 600, 300 at the default), how fast they fall and how far they sway.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-1.md](../../../docs/studies/epic-1.md)): 0.2 to 0.4 ms per frame at 1080p, the output pass included. In Chrome, one frame on a 1920 × 1080 canvas reads 0.50 ms (`npm run browser-check`): Tier A on this machine. 1.0 kB gzipped of its own, 24 kB with the shared chunks.

## Pitfalls

- **Flat snow is a whole-field drift.** Every flake here is at one depth, so the whole field falls together, and the motion check read 0.059 screen widths a second at first, over the 0.05 cap. The fall speeds were slowed to keep it under: 0.036 at the default, 0.042 at the strong dose. `snowfall`'s depth breaks the fall into many speeds and reads about 0.01.
- **White on white.** The flakes have no edge, so over a white page they vanish. `snowfall` has the edge ring.

## Safety

Flash `low` (single transitions in single cells), pattern `none`, motion inside the caps up to the strong dose.

## When to use it

As the template for a new effect. For real snow, `snowfall`.

## References

- Snow Temple [plan.md](../../../plan.md), story 1.2.
