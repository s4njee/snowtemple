## How it works

One instanced draw of 9000 quads (`src/gpu/snow/flakes.wgsl`), with no compute and no state. Every flake's position is a pure function of its index and the time, worked out in the vertex shader, so a held frame is exactly reproducible. The camera looks into a volume of snow with a 50° vertical field of view, from 0.25 m to 15 m.

- **Depth.** Each flake has a fixed depth from its index, far first, so drawing in instance order is drawing back to front. It wraps within the view's own width and height at that depth, so every instance is on screen. Depths are evenly spaced: physically uniform snow would put almost all of a few thousand flakes far away, as specks.
- **Size and fall.** Diameters come from an exponential distribution, as Gunn and Marshall found for aggregate snowflakes, with a mean of 3 mm at the default. Each flake falls at its terminal speed, 0.8 D^0.16 m/s (D in mm, the form Locatelli and Hobbs give for aggregates): about 1 m/s whatever the size. That is why snow drifts while rain streaks.
- **Wind.** The mean wind drifts every flake. Gusts are a band-limited signal (Fire Temple's flicker construction) that arrives later the further downwind a flake is, so a gust sweeps across the view. The curl of a slowly evolving noise field displaces flakes in swirls, and since it is sampled where each flake is, neighbours move together. Each flake also flutters a little on its own, and tumbles: its sprite turns and foreshortens.
- **Optics.** The view is focused at 3 m through a 15 mm aperture, like a 50 mm lens at about f/3.3. A flake nearer or further is blurred over its circle of confusion, and its light is spread over that circle, so the flake just in front of the viewer is a large, faint disc, as near snow is in photographs. Far flakes smaller than a pixel keep their light as they shrink: the footprint stays a pixel and the brightness falls with area, so they do not shimmer (Moon Temple's point sources). Moving flakes streak over a 4 ms shutter, with their light spread along the streak.
- **Over the page.** Flakes are premultiplied white with coverage, blended "over", so the page shows between them. A faint near-black ring outside each flake (`edge`) is invisible over a dark page and is what lets white flakes read over a white one.

`dose` ("intensity") sets how many of the 9000 flakes show (8% to 80%, 35% at the default), their mean size (1.5 to 5 mm), the wind, gusts and swirl, and how far one can see (30 m to 7 m). `into the snow` moves the view forwards: flakes keep their place in the world and stream out from the centre.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-2.md](../../../docs/studies/epic-2.md)), 0.26 to 0.44 ms per frame at 1080p at every preset, intensity and shutter time. It draws all 9000 instances every frame and skips the hidden ones in the vertex shader, so its cost does not follow the number shown. In Chrome, one frame on a 1920 × 1080 canvas reads 0.90 ms (`npm run browser-check`): Tier A on this machine. 5.3 kB gzipped of its own, 33 kB with the shared chunks.

## Against CSS and the DOM

Story 2.5 drew page snow four ways in headless Chrome ([docs/studies/snow-compare.md](../../../docs/studies/snow-compare.md)):

- CSS keyframes, one element per flake;
- Snowstorm.js-style DOM elements moved from script;
- box-shadow snow;
- this effect.

CSS and DOM snow cost main-thread time in proportion to the flakes: about 35 ms a second at 25, most of a core at 1600, and dropped frames past that. This effect costs about 30 ms a second of main thread at any count. The crossover is a few dozen flakes. A light flurry of twenty flakes is a CSS job; a snowfall is this.

Box-shadow snow costs 20 ms a second at any count, because it is one element. Its price is that every flake moves together, with no depth, sway or wind.

## Pitfalls

- **A light page.** The flakes read over white by their dark edge rings. The large out-of-focus ones can look like bubbles rather than snow. Stories 3.3 and 9.2 work on better ways.
- **The flash check counts dense snow.** At high density the number of flakes in each of the analyser's cells fluctuates enough to swing its brightness by a tenth, and that counts as flashing. The analyser does not check whether flashes in different cells happen together, so it errs towards counting. The density curve therefore stops where the strong dose passes (docs/safety.md).
- **The first version flashed.** Near flakes drawn sharp were big and bright, and crossed a cell in a fraction of a second: `high` at the default. Drawing them out of focus, which is how near snow looks anyway, fixed it.
- **Driving into the snow is vection.** At walking pace, flakes at the focus distance expand at 0.67 zoom doublings a second, nearly seven times the cap. The motion check cannot see it (too few trackable blocks), so it is held to the cap by the effect's own transform, and the `into the snow` preset is gated ([docs/studies/vection.md](../../../docs/studies/vection.md)).
- **Depth order breaks while driving.** Flakes wrap in depth, so instance order is no longer back to front. Unnoticeable at these sizes and opacities.

## Safety

Flash `low` at the default, every preset and the strong dose: single cells, never the frame, whose mean luminance moves by under 1%. Pattern `none`. Motion inside the caps up to the strong dose: the largest reading was a 3.5° a second turn, and drift 0.02 widths a second. `into the snow` goes over the zoom cap and starts behind the gate.

## When to use it

A seasonal hero, a winter section behind text, or weather on a landing page. It is the base the family's later page effects build on: settling snow (3.2), the blizzard (2.2) and the seasonal hero (8.1).

## References

- Snow Temple [plan.md](../../../plan.md), stories 2.1, 2.4 and 2.5.
- K. L. S. Gunn and J. S. Marshall, "The distribution with size of aggregate snowflakes", _Journal of Meteorology_ (1958).
- C. A. Locatelli and P. V. Hobbs, "Fall speeds and masses of solid precipitation particles", _Journal of Geophysical Research_ (1974).
- Scott Schiller, Snowstorm.js (2003 onwards).
