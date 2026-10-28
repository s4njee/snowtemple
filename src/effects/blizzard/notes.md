## How it works

Two layers over the page.

- **The storm**, ray-marched at half resolution (`storm.wgsl`) and upsampled. Rays step out from the eye to 40 m in 18 steps spaced geometrically. At each step, a 3D gradient-noise density stretched along the wind and carried by it scatters the storm's light towards the eye and dims what lies behind. A uniform haze beyond the last step takes the far page to white, so the canvas's alpha is what the storm hides of the page.
- **Gusts** are fronts of denser snow that sweep across every nine seconds, closing the view and clearing it.
- **Dense driven flakes** in front: `snowfall`'s layer, many more, in a stronger wind, streaked over an 8 ms shutter.

Nearer streamers cross the view faster than far ones: the wind's speed over their distance. That parallax keeps the whole field's apparent drift under the motion cap, as it does for `snowfall` (story 2.4).

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-2.md](../../../docs/studies/epic-2.md)): 2.3 ms per frame at 1080p. In Chrome, one 1920 × 1080 frame reads 5.69 ms (5.54 to 6.03 over three loads), inside Tier B's 6 ms, narrowly. Getting there took three cuts: 18 steps and four octaves to 12 and three (9.7 ms to 8.5), the march from half to a third of the resolution (6.2), and drawing 5000 flake instances instead of 9000 (5.7). **Tier B**, provisional, and the first to fall to C on a slower GPU. 1.6 kB gzipped of its own, 40.4 kB in all.

Flash `low`, pattern `none`, motion inside the caps at the default and at 0.7. Two findings shaped it. The wind at 2.5 m/s drifted the field 0.054 widths a second, over the 0.05 cap, so the default is 1.6. And streamers stretched three to one along the wind lined up into a grating 40 px apart at the strong dose; warped, less stretched and softer, they read as none.

## Pitfalls

- It is a veil over the page: text under it loses contrast by design, so it belongs behind a hero's art, not its copy.
- The streamers are noise, not snow particles: up close they read as fog, which blowing snow is.
- At half resolution, the storm's edges are soft; that suits it.

## When to use it

A dramatic winter hero, or a weather or outdoor brand page, Tier B. A CSS white gradient with a slow animated noise image gets a veil, without depth or gusts.

## References

- [plan.md](../../../plan.md), story 2.2; story 2.4 for the motion caps.
