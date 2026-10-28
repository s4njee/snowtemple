# Snow Temple

A research gallery of WebGPU snow, ice and crystal: snowfall, snow that settles on the page, footprints, frost and snowflake growth, ice, cracks, icicles, gems and the halos ice crystals draw around the sun. Each effect is built from its mechanism, and comes with a live demo, readable source, a write-up and a practicality scorecard. It is judged the way the temples judge theirs: **would you actually ship this on a website?**

Snow is white, so a light page is this family's hard case, and every effect is judged over one as much as over a dark page.

Safety comes from The Hero's Journey's checks. Every effect has an intensity control from 0 to 1, calm by default. Every effect and preset runs in `npm test` through the WCAG 2.3.1 flash and red-flash analyser, a regular-pattern analyser after the broadcast guidance, and caps on whole-field rotation, zoom and drift, at the default and at the strong end (0.7). Presets past the limits start paused behind a click-to-start notice. See [docs/safety.md](docs/safety.md).

It is built on Fire Temple's page structure and the shared temple core (`@mk7s/hologpu-temple-core`), from The Hero's Journey's copy of the shell. The accent is glacier blue. See [plan.md](./plan.md) for the roadmap.

## Getting started

```sh
npm install
npm run dev        # http://localhost:5470
npm test           # unit tests, plus the flash, pattern and motion checks and the held-frame audit over every effect
npm run build      # registry, typecheck, static build to dist/ and the bundle check
npm run study -- --epic 2   # cost study on Dawn: docs/studies/epic-2.md and the Scorecard numbers
npm run shot -- snowfall --times 2 --bg dark,light   # render an effect headlessly to PNG (output/shots)
npm run browser-check -- --report docs/studies/browser-check.md   # every effect in headless Chrome (dev server running)
npm run posters -- --force   # fallback posters from held frames, as WebP
npm run deploy     # build and upload dist/ to Cloudflare Pages (project snowtemple)
node experiments/snow-compare.mjs   # page snow four ways: CSS, DOM, box-shadow, WebGPU (dev server running)
```

`?effect=<id>` opens an effect, `&hud=1` the performance HUD, and `&p.<param>=<value>` sets a parameter, `&p.dose=0.6` (intensity) included.

## Effects

| Id         | What                                                                                                           | Tier |
| ---------- | -------------------------------------------------------------------------------------------------------------- | ---- |
| `hello`    | The smallest effect: a few hundred soft flakes falling straight down, one instanced draw                       | A    |
| `snowfall` | Snow through depth over the page: sized flakes at their fall speed, gusts and swirls, out-of-focus near flakes | A    |

## Layout

```
src/gpu/snow/               flakes: depth, size, fall, wind, swirl, tumble, depth of field, streaks
src/gpu/safety/             dose, the pattern analyser, motion estimate, colour caps and the start gate's rules
src/gpu/colour/             OKLab and OKLCH, palettes, Display P3
src/gpu/symmetry/fold.ts    the 17 wallpaper groups and the rosettes as folds (D6 for snowflakes)
src/effects/<id>/           meta.ts, index.ts, shaders, notes.md, poster.webp
docs/studies/               cost studies, the vection study, page snow four ways
```

## License

MIT.
