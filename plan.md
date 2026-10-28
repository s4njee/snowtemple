# Snow Temple — WebGPU snow, ice and crystal research site

A research site that implements, measures and documents the cold effects: snowfall, snow that settles on the page, footprints, frost and snowflake growth, ice, cracks, icicles, gems and the halos ice crystals draw around the sun. It asks one question of each: **would you actually ship this on a website?** Every effect gets a live demo, readable source, a write-up and a practicality scorecard. The cold counterpart to [Fire Temple](../firetemple/plan.md) and [Water Temple](../watertemple/plan.md), and a sibling of [Storm Temple](../stormtemple/plan.md), [Moon Temple](../moontemple/plan.md) and [The Hero's Journey](../herosjourney/plan.md), on the same page structure and the shared temple core. It is §4.5 of the holofx [research list](../research.md).

What separates this family from a 2003 snowstorm script is that most of its subjects are well understood physics, and cheap enough to model:

- **Snowflakes.** Their six-fold shapes come from a small set of growth rules. Reiter's cellular automaton and the Gravner–Griffeath model reproduce plates, stars and dendrites from a handful of parameters.
- **Frost and dendrites.** These are phase-field solidification.
- **Settled snow.** It has an angle of repose, piles into drifts on the lee side and overhangs as cornices.
- **Shadows on snow.** They are blue because the sky lights them.
- **Glitter.** Snow and gems sparkle because a few facets happen to point at the light.
- **Halos.** The 22° halo and sun dogs are what hexagonal ice prisms do to sunlight, and they can be computed.

Each effect starts from its mechanism, and the look follows.

## Goals

- Cover the main kinds of cold visual, each from its mechanism:
  - **snowfall:** flakes at depth, tumbling, gusting, and the blizzard's whiteout;
  - **snow on the page:** settling on the top edges of real page elements, drifting, sliding off, melting, and taking footprints;
  - **frost:** creeping over glass, text and the edges of the view, grown rather than painted;
  - **snowflakes:** a unique crystal per seed, grown by a published model;
  - **ice:** a clear slab with bubbles and cracks, cracking from a click, icicles that grow and drip, and an element that freezes over and thaws;
  - **crystal and gems:** a faceted gem with dispersion and sparkle, crystals growing from a surface, and diamond dust glittering in sunlight;
  - **atmospheric optics:** halos and sun dogs, from a computed table of ice-crystal optics.
- Make the light page a first-class test. Snow is the one family whose subject is white. Snow on a white page is invisible unless its shading, its shadows and its edges carry it, so every effect is judged over a light page as much as a dark one.
- Ship effects shaped like website parts: a seasonal hero, snow on the header and cards, a cursor trail pressed into snow, a frost reveal on scroll, a snowflake loader or avatar, a frozen-over disabled state, an ice-cube or gem product hero, a weather widget.
- Say plainly when CSS or a script of DOM elements does the job. A dozen flakes is a CSS job. Snowstorm.js has drawn page snow with DOM elements since 2003, and it is the baseline to beat.
- Keep motion safe. Falling snow is whole-field motion, and a blizzard driving towards the viewer can produce vection, the illusion of moving oneself. Glitter is many small flashes. Every effect runs through The Hero's Journey's flash, pattern and motion checks.
- Build the reusable parts once, shaped to move into `@mk7s/hologpu-temple-core`: the height-field accumulation on page shapes, the phase-field grower, the glint model, the spectral dispersion trace and the halo table.

## Non-goals

- **Material point method snow** (Stomakhin et al., the method behind _Frozen_). It is the reference for snow that packs, breaks and clumps, but it is a simulation of millions of particles. It is not a page effect. One story measures how small an MPM snowball can be (8.5); nothing depends on it.
- **Physically exact growth.** The growth models are used because they produce the right shapes cheaply, as Storm Temple used its breakdown model. The notes cite the papers and claim no accuracy.
- **Effects over live page pixels.** A canvas cannot read the page (Fire Temple's [backdrop strategy](../firetemple/docs/backdrop-strategy.md)). Ice over content works on content the effect draws, or an image the page hands over. Snow on the page works on element geometry (Fire Temple's `dom-rects.ts`), not on pixels.
- **Holiday decoration for its own sake.** No baubles or tinsel. The seasonal hero is in scope because sites do ship it.
- **Sound.** Snow is quiet.

## Decisions

These are defaults chosen so work can start. Each is cheap to revisit before Epic 1 is finished.

| Decision         | Default                                                                                                                                              | Why                                                                                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Foundation       | The Hero's Journey's shell (from Moon Temple, via Storm Temple, The Bazaar and Fire Temple) on `@mk7s/hologpu-temple-core`                          | It is the newest copy. It has the flash, pattern and motion checks, the start gate, held frames, OKLab colour, palettes, the wide-gamut path, the study harness, browser check and posters.                                     |
| Build tooling    | Vite + TypeScript (strict), with WGSL `#include` resolved per effect at build time                                                                   | Same as every temple, so shader text never reaches the first load.                                                                                                                                                                   |
| Rendering API    | Raw WebGPU + WGSL, thin helpers                                                                                                                      | The research subject is WebGPU itself.                                                                                                                                                                                               |
| Colour pipeline  | Linear HDR `rgba16float` scene → bloom → tonemap → sRGB, OKLab for colour operations                                                                 | Glints and sunlit snow are far brighter than paper white, and they need the HDR tail to read as light rather than as flat white.                                                                                                     |
| Intensity        | Hero's Journey's shared `dose` control, labelled "intensity" in the controls: snowfall rate, wind, sparkle and growth speed together. Default 0.35 | One control a page can turn down, and the analysers' contract already holds up to its strong end. The key stays `dose` so the contract matches across families until it moves into the core.                                         |
| Safety checks    | Flash, red-flash, pattern and motion checks over every effect and preset, at the default and at the strong dose, in `npm test`                     | Glitter is flicker. Snowfall is whole-field drift. A snowflake is a six-fold rosette: The Hero's Journey found that any rosette of six or more repeats at full contrast fails the pattern rule at hero size.                          |
| Accumulation     | Height fields in `r32float` storage textures, one column of cells per CSS pixel along each element's top edge                                        | Half-float writes truncate on Apple GPUs (Fire Temple 5.6), so a pile built from small deposits never grows. A height per column is what snow on an edge is.                                                                         |
| Accent           | Glacier blue (`#8ec5ff` dark, `#1f5fa8` light). The tier colours are checked against it in story 1.1                                                 | No colour was named. Blue is snow's shadow colour. It sits between Storm Temple's cyan and Moon Temple's violet, which is close to both; holly red (`#ff5a6e`) is the alternative if it does not read as its own. Revisit if the user names one. |
| Neutrals         | Cool greys, light and dark equally                                                                                                                   | Every other family is dark first. This one's hard case is the light page, so it gets no less care.                                                                                                                                   |
| CSS prefix, port | `sn-`, dev port 5470, launch config `snowtemple`                                                                                                     | `st-` is Storm Temple's. 5373, 5390, 5410 to 5460 and 5441 are taken by the other holofx projects.                                                                                                                                  |
| Hosting          | Cloudflare Pages (classic) project `snowtemple`, direct upload                                                                                       | No server needed. Create the project with `wrangler pages project create --force`, or wrangler converts the repo to Workers.                                                                                                         |
| No-WebGPU        | A poster per effect, and a CSS or DOM version where one is honest (story 9.4)                                                                        | CSS snow and Snowstorm.js-style DOM snow are real fallbacks for snowfall, and useless for the rest.                                                                                                                                  |

## Carried over from the other temples

These findings shape this plan, so they need not be rediscovered.

- **Element geometry, not pixels** (Water and Fire Temple). `src/gpu/dom-rects.ts` gives every element's rectangle each frame, which is all settling snow needs. It cannot see an element's rounded corners or its text, only its box.
- **Half-float writes truncate on Apple GPUs** (Fire Temple 5.6). Anything that accumulates small amounts (snow depth, frost growth, melt) is stored in `r32float`, or uses stochastic rounding.
- **A dozen elements is a CSS job; hundreds is the shader's** (Moon Temple 4.1, 7.4). CSS animation's main-thread cost grows with the number of animated elements. Story 2.5 measures where snowfall crosses over.
- **Energy-conserving point sources** (Moon Temple Epic 2). Far flakes, diamond dust and glints are points smaller than a pixel. Drawn naively they shimmer as they move. Moon Temple's point-source renderer keeps their light constant.
- **Snow is in Moon Temple already, through a lens.** `snow-at-night` is snow falling past a street lamp, seen out of focus. That effect's subject is the lens. Here the subject is the snow.
- **Branching growth and arrival-time textures** (Storm Temple 4.1). Grow once, record when each cell was reached, reveal by threshold. Frost, cracks and crystal growth become scroll-scrubbable for free.
- **The stroke renderer** (Storm Temple 6.3). Thick joined HDR lines, which ice cracks need.
- **The fold library** (The Hero's Journey 4.1). The dihedral group D6, with each fold's Jacobian, is exactly a snowflake's symmetry.
- **A rosette is a regular pattern** (The Hero's Journey M1). A six-fold rosette at a luminance step of 0.1 or more, filling a 10° field, fails the pattern rule. A large, high-contrast snowflake is that. A snowflake hero must stay dim or small, or be gated.
- **Apparent motion counts** (The Hero's Journey 2.4). The motion check reads optical flow, not the effect's own transform, so a dense layer of snow drifting one way registers as whole-field drift.
- **Glitter is flicker** (Fire Temple `flicker.wgsl`, Moon Temple 2.9). Twinkling built from a band-limited signal with capped rate and depth cannot exceed three flashes a second, however it is seeded.
- **Envelopes that dip are extra flashes** (Storm Temple). A glint that drops for one frame between two phases counts twice.
- **A frozen frame can be the hazard** (Storm Temple 6.2). The held frame is a calm moment, never a field of glints at their brightest.
- **A tonemap widens a luminance step** (The Hero's Journey M1). An effect that limits its step for the pattern rule draws without the tonemap.
- **Uniforms written between passes in one command buffer all arrive with the last value** (Moon Temple). Multi-step simulations encoded before one submit keep per-step values in a buffer.
- **Scratch work needs a home.** Long sweeps and probes go in `experiments/`, outside test, typecheck and lint.

## Findings so far

- **Near snow has to be out of focus.** Drawn sharp, the flakes nearest the viewer are big and bright and cross the flash analyser's cells in a fraction of a second: `snowfall` measured `high` with the frame's mean luminance moving by 0.5%. A thin-lens blur that spreads each flake's light over its circle of confusion fixed it, and is how near snow looks in photographs anyway.
- **Snow that falls as one sheet is whole-field motion; parallax breaks it up.** Flakes at one depth fall together, and the motion check reads a drift over the cap. Flakes at many depths fall at many screen speeds and read a fifth to a third of it.
- **Optical flow cannot see sparse, faint particles.** Block matching needs texture. Faint snow on black left a dozen trackable blocks, and a rigid fit to them invented zooms. Snow driven towards the viewer left almost none. For particle effects, the motion caps have to be checked from the effect's own transform as well.
- **Driving into snow is vection at walking pace.** Flakes 3 m away, approached at 1.4 m/s, expand at 0.67 zoom doublings a second, nearly seven times the cap. The cap is reached at 0.21 m/s.
- **A few dozen flakes is CSS's limit.** Past that, CSS and DOM snow cost main-thread time per flake, and WebGPU's cost is flat. Box-shadow snow is flat too, by moving every flake together.

## Overlaps and who owns what

| Nearby work                                     | Where                   | Snow Temple's part                                                                                                                              |
| ----------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `snow-at-night`: snow past a lamp, out of focus | Moon Temple             | Snowfall's physics, layers, wind and accumulation. Moon Temple keeps the lens; 2.1 can hand its flakes to Moon Temple's depth of field.          |
| `frost-melt`: dendritic ice over glass, thawing | Water Temple            | 4.1's phase-field grower and frost on the page and on text. `frost-melt` stays Water Temple's; 4.5 compares the two.                             |
| `fogged-glass`: condensation wiped by a pointer | Water Temple            | Not rebuilt. Breath on glass is water, not ice.                                                                                                  |
| `glass`, `refraction`, `glass-panels`           | hologpu, Water, Light   | 5.1's ice is a slab with bubbles, cracks and a frosted face, reusing the refraction chunks. Gems (Epic 6) trace facets, which none of them do.   |
| `particle-drift` (bokeh dust)                   | hologpu                 | Snowfall is denser, layered by depth and driven by a wind field.                                                                                 |
| Lichtenberg growth, stroke renderer             | Storm Temple            | Cracks (5.2) and frost reuse both. Moving them into the core is Storm Temple's 6.3 and this family's 9.6.                                        |
| `analog-signal` snow                            | The Bazaar              | Not this. That snow is television static.                                                                                                        |
| Fold library, pattern and motion checks         | The Hero's Journey      | Used as they are. Snowflakes (4.4) fold through D6.                                                                                              |
| Shatter and destruction                         | research.md §4.3        | This family owns ice cracking. Breaking page content into tumbling shards is Shatter's.                                                          |

## Practicality tiers

Every effect is tagged with a tier. Budgets are starting targets, to be validated in Epic 10.

| Tier            | Meaning                                             | Shape                                                       | GPU budget @1080p                   |
| --------------- | --------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------- |
| **A** Drop-in   | Safe as ambient decoration, including mobile        | One or two passes, no compute, or a few thousand instances  | ≤ 2 ms on integrated GPU            |
| **B** Feature   | Hero sections and interactive set pieces            | Compute, a height field or a small simulation               | ≤ 6 ms on integrated GPU            |
| **C** Showpiece | Dedicated page or landing experience, desktop-first | A traced gem, a full-screen phase field, a whiteout volume  | ≤ 12 ms on discrete / Apple Silicon |

Budgets include the HDR tail. Accumulation and growth keep state, so every study reports texture memory beside milliseconds.

## Architecture sketch

```
snowtemple/
  index.html
  vite.config.ts
  src/
    main.ts            bootstrap: one shared GPU session, mounts an effect
    gpu/               device, canvas, frame loop, shaders, uniforms, targets, passes, post/
                       (bloom, tonemap, colour stage), dom-rects, pointer, scroll, safety/
                       (dose, pattern, motion, colour caps, gate), plus
                       snow/ (flake instances, wind field, size distribution),
                       pile/ (height fields on page shapes, angle of repose, footprints),
                       growth/ (phase field, snowflake automaton, arrival time),
                       ice/ (slab, bubbles, cracks, icicles), gem/ (facets, spectral trace),
                       glint/ (stochastic microfacet glints) and halo/ (crystal optics table)
    wgsl/              shared chunks: hash, noise, sdf, oklab, fold, plus wind, pile,
                       phase-field, glint, spectral and halo
    effects/<id>/      meta.ts (eager), index.ts + *.wgsl (lazy chunk), notes.md, poster.webp
    shell/             app frame, gallery, effect page, contexts, controls, notes, scorecard, HUD
    lib/               the library entry: mount an effect on a caller's canvas
  tests/               vitest on Dawn's Node bindings: real WebGPU, no browser
                       (flash.ts, pattern.ts and motion.ts run over every effect and preset)
  experiments/         scratch sweeps and probes; not part of the test run
  docs/                research output: support matrix delta, cost studies, findings
```

The effect contract is The Hero's Journey's, unchanged, `dose` included, so effects and shell code move between the families. Effects that settle snow on the page read element rectangles through the context, as Fire Temple's page effects do.

## Definition of done (per effect story)

1. **Budget.** It runs inside its tier budget on the reference devices, with the numbers recorded. Until the device matrix exists (10.2), the only reference device is the development machine, an M1 Max. It is measured per frame on Dawn and as one frame in Chrome, and gets the lowest tier whose budget neither number exceeds. An A or B label is provisional until 10.2, and the scorecard says so.
2. **Parameters.** They are exposed through the schema with `dose` honoured, and there are at least two presets.
3. **Lifecycle.** It handles resize, DPR changes, device loss, offscreen pause and `prefers-reduced-motion`. The held frame shows a calm moment, never a field of glints at their peak (`tests/still.test.ts`). Settled snow survives a resize and a scroll without tearing.
4. **Flash, red flash, pattern and motion.** It stays under all four at its defaults and at the strong dose. Every preset that goes over is declared and starts behind the gate. Twinkle and sparkle are tested at many frame phases.
5. **State.** Where it keeps state (a pile, a footprint field, frost), the state decays or melts to exactly nothing when it should, and nothing is left after resize, pause or a parameter change.
6. **Contexts.** It is shown in at least one realistic web context, over a dark and a light page and at phone size, and its screenshots have been looked at. Over the light page, the snow must still read.
7. **Notes.** `notes.md` is written: how it works and what the mechanism is, cost, pitfalls, safety, when to use it, and references. Where a CSS or DOM version exists, the notes say how close it gets.
8. **Release.** The scorecard is filled in and the fallback poster captured.

## Milestones

| Milestone                  | Scope                                    | Proves                                                                       |
| -------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| **M0** Vertical slice      | Epic 1, stories 2.1, 2.4, 2.5            | Tooling → snowfall with depth and wind → the vection question → CSS baseline |
| **M1** Snow on the page    | Rest of Epic 2, Epic 3                   | Settling, drifting, footprints and melt on real page shapes                  |
| **M2** Frost and flakes    | Epic 4                                   | Growth from its mechanism, scroll-scrubbable                                 |
| **M3** Ice                 | Epic 5                                   | Slabs, cracks, icicles and freezing as page parts                            |
| **M4** Crystal and sky     | Epics 6 and 7                            | Gems and halos, at Tier C and Tier A                                         |
| **M5** On the page         | Epic 8, stories 9.1–9.5, 10.2            | Web-native usefulness, on more than one device                               |
| **M6** Release             | Rest of Epics 9 and 10                   | Published findings, shared pieces moved into the core                        |

M2 depends only on Epic 1, so it can run alongside M1. M4's halos (Epic 7) depend on nothing else in the family.

Story format: `ID Title [tier] (size)`. Sizes: S ≈ a day or less, M ≈ a few days, L ≈ a week or more.

---

## Epic 1 — Foundation and tooling

- [x] **1.1 Scaffold** (S) — The Hero's Journey's committed tree copied (`git archive HEAD`). Its effects and psychedelic-only code are removed: the fold library stays (snowflakes need D6), and the palettes and colour stage stay. The `hj-` prefix is renamed `sn-`; watch template literals such as `` `--hj-${string}` ``. Glacier-blue accent, with the tier colours checked against it. Dev port 5470, launch config `snowtemple`. The `dose` control is relabelled "intensity" in the controls, its key unchanged. The light theme is checked as carefully as the dark.

  _Done from The Hero's Journey's commit d64c836. Removed: its three effects, the CSS-filter comparison, its studies and psychedelic experiments. `hj-` is now `sn-`, port 5470, launch config `snowtemple`. Glacier-blue accent with cool neutrals in both themes; Tier B moved from teal to violet to stay clear of the accent, and `tests/contrast.test.ts` passes. `dose` is labelled "intensity". The inherited modules' story numbers are marked as The Hero's Journey's, and its safety write-up is linked rather than copied (docs/safety.md)._

- [x] **1.2 `hello`** [A] (S) — the smallest effect: a few hundred flakes falling through one instanced pass into the HDR tail, with `dose` wired from the start.

  _`hello`: 600 instanced quads, a pure function of index and time, premultiplied over the page. 0.2 to 0.4 ms on Dawn, 0.50 ms in Chrome: Tier A. Flash `low`, pattern `none`. Its flakes all fall at one depth, so the motion check read their fall as one whole-field drift (0.059 widths a second, over the cap) until they were slowed._

- [ ] **1.3 Repository and CI** (S) — its own git repository and public GitHub remote, and the CI workflow on software Vulkan (lint, format, typecheck, tests, build), green once.

  _Repository `s4njee/snowtemple`, private for now: creating it public was blocked by the session's permission check. CI cannot start on a private repository on this account (Actions billing), so it goes green once the repository is made public._
- [x] **1.4 Deploy** (S) — Cloudflare Pages project `snowtemple` (classic, created with `--force`), and an `npm run deploy` that builds, checks the bundle and uploads `dist`.

  _Live at <https://snowtemple.pages.dev>, deployed from 3d05b3b._
- [ ] **1.5 Posters, catalogue and the holofx site** (S) — posters from held frames, `catalogue.json`, and Snow Temple in the holofx site's dropdown, lab and effect pages.

  _Posters (9 and 12 kB) and `catalogue.json` done. Still to do: the holofx site, as for The Hero's Journey._

- [x] **1.6 Support matrix delta** (S) — what this family leans on beyond Fire Temple's [support matrix](../firetemple/docs/support-matrix.md):
  - `r32float` storage textures read and written in one pass (`read_write` access), for height fields;
  - storage atomics, for deposits from many flakes into one cell;
  - `float32-filterable`, for sampling height fields smoothly;
  - the instance count where instanced flakes stop being cheaper than a compute-driven point list.

  _[docs/support-matrix.md](docs/support-matrix.md), Chrome 152 on this Mac: `read_write` `r32float` storage textures compile and run (the `readonly_and_readwrite_storage_textures` language feature is present), integer storage atomics count exactly, and `float32-filterable` is offered. Instanced flakes are not a limit: `snowfall`'s cost is flat from 1400 to 7200 flakes shown. Safari and Firefox are 10.2's._

## Epic 2 — Snowfall

Flakes at depth, moving the way snow moves. Snow falls at about 1 m/s, far slower than rain, so its motion is set by the air, not by gravity: it drifts, tumbles and swirls.

- [x] **2.1 `snowfall`** [A] (M) — the family's base effect. Flakes in a view-space volume:
  - sizes drawn from Gunn and Marshall's exponential distribution;
  - terminal speed rising slowly with size;
  - a wind field of curl noise with gusts, so neighbours move together;
  - tumbling that turns a flake's sprite between face-on and edge-on;
  - far flakes as Moon Temple's energy-conserving points, near ones as soft sprites, the nearest motion-blurred over a shutter time.

  Depth-sorted only where it shows. Compared with a CSS version and with Snowstorm.js in 2.5.

  _`snowfall`: 9000 instanced quads with no compute and no state:
  - sizes from an exponential distribution and Locatelli and Hobbs' fall speed;
  - gusts that sweep across, and a curl-noise swirl sampled where each flake is;
  - tumbling, energy-conserving points far off, streaks over a 4 ms shutter;
  - a faint near-black edge ring for light pages.

  Two findings changed it. Flakes wrapped in a box as wide as the far view left almost all of them as specks, so each wraps in the view at its own depth. And near flakes drawn sharp made the flash check fail at the default (`high`), so the view now has a focus distance and an aperture, and near flakes are large, faint, out-of-focus discs, as in photographs. 0.26 to 0.44 ms on Dawn at any density, 0.90 ms in Chrome: Tier A. Flash `low`, pattern `none`, motion inside the caps up to the strong dose. Not yet handed to Moon Temple's depth of field; it has its own thin-lens blur._

- [ ] **2.2 `blizzard`** [B] (M) — dense, wind-driven snow in a whiteout: Fire Temple's volume ray-march kernel for blowing snow and fog, extinction that hides the far page, and gusts that clear and close the view. The motion caps matter most here (2.4).
- [ ] **2.3 `snow-globe`** [B] (M) — a glass sphere over a small scene: shaken by the pointer or device motion, its flakes swirl in a simple fluid, then settle on the scene inside. Refraction from the shared glass chunks. A product hero for a gift or seasonal page.
- [x] **2.4 Vection study** [—] (S) — snow coming towards the viewer is the classic way to make a still person feel they are moving. Measured with the motion check on rendered frames: what speed, density and direction stay inside the caps, and whether a radial outflow reads as a zoom, as The Hero's Journey's rings did. The answer sets 2.1's and 2.2's limits.

  _[docs/studies/vection.md](docs/studies/vection.md). Falling snow, with and without wind, stays inside the caps up to the strong dose: at most a 3.5° a second turn and a 0.02 widths a second drift. Driven snow cannot be measured by the motion check at all: a sparse field of faint flakes leaves 0 to 22 trackable blocks. So the estimator now needs 20 blocks as evidence (it had reported spurious zooms from a dozen), and driving is held to the zoom cap by the effect's own transform, v / (z ln 2) doublings a second at the focus distance. That cap is reached at 0.21 m/s; walking pace is 0.67 doublings a second, so `into the snow` is declared and gated, and `tests/snowfall.test.ts` checks it._

- [x] **2.5 CSS and DOM against WebGPU** [—] (S) — snowfall four ways on the same page:
  - CSS keyframes on a few dozen elements;
  - a `box-shadow` field of a few hundred flakes on one element;
  - Snowstorm.js-style DOM elements moved from script;
  - `snowfall`.

  Measured as main-thread time, GPU time and frame drops by flake count, to find where each stops being the right choice.

  _[docs/studies/snow-compare.md](docs/studies/snow-compare.md), headless Chrome at 1280 × 720. CSS keyframes and Snowstorm.js-style DOM snow cost main-thread time per flake: about 35 ms a second at 25 flakes, most of a core at 1600, and dropped frames past that. `snowfall` costs about 30 ms a second at any count. The crossover is a few dozen flakes. Box-shadow snow is flat (20 ms a second at 6400) because it is one element, and every flake moves together. Keyframes reading custom properties were not the cause of CSS's cost: plain-value keyframes measured the same._

## Epic 3 — Snow on the page

Snow that falls onto the page and stays there: on the tops of headings, cards, buttons and the nav bar. Fearing's fallen-snow model (SIGGRAPH 2000) is the reference for how snow piles: by the angle of repose, with drifts and cornices from the wind.

- [ ] **3.1 Height fields on page shapes** [—] (M) — `src/gpu/pile/`. Each tracked element's top edge gets a row of columns in an `r32float` storage texture, one per CSS pixel. Flakes that land deposit into their column. A relaxation pass moves snow downhill wherever the slope between neighbours exceeds the angle of repose, and pushes it off the ends of the edge. Wind moves snow to the lee side and lets it overhang a little as a cornice. When an element moves (scroll, resize, layout), its pile moves with it. When it changes width, the pile is resampled. When it leaves the page, the pile is dropped. Tested: mass is conserved except where snow falls off, a pile never steepens past the angle, and a resize keeps the total.
- [ ] **3.2 `settling-snow`** [B] (M) — `snowfall` plus 3.1: snow that settles on the page's own elements, drawn as a soft white ridge along each top edge with the pile's own shading. The pointer brushes it off, and the brushed snow falls as flakes. A button press shakes its pile loose.
- [ ] **3.3 Snow shading** [—] (M) — what makes settled snow read, over a dark page and especially over a light one:
  - sunlit faces near white;
  - blue shadows from the sky;
  - a soft edge from light scattering under the surface;
  - ambient occlusion where the pile meets the element;
  - glints (6.4).

  Compared over the five page contexts, with the light page as the pass mark.
- [ ] **3.4 `footprints`** [B] (M) — a snow surface (a page section's background, or a ground strip along the bottom of a hero) as a height field the cursor presses into. Each footprint pushes snow aside into a raised rim, and the hollows fill again with falling snow over time. After the Arkham Origins deformable snow talk.
- [ ] **3.5 `melt`** [B] (S) — settled snow that melts with time or as the page scrolls: piles slump, thin and pull back from the edges, and drip off the ends. The pile reaches exactly zero (Definition of done 5), and nothing is left after a pause.
- [ ] **3.6 CSS fallback for settled snow** [—] (S) — a `::before` ridge on each element, sized from a custom property. It is honest for a static seasonal look, with no settling.

## Epic 4 — Frost and growth

Frost and snowflakes are crystal growth, which is modelled well and cheaply. Everything here writes an arrival-time texture, so growth can be scrubbed by scroll or time.

- [ ] **4.1 Phase-field grower** [—] (M) — `src/gpu/growth/`: Kobayashi's phase-field model of dendritic solidification in compute. A phase field and a temperature field, with anisotropy giving six-fold or four-fold dendrites, recording the step at which each cell froze. Stochastic rounding where it stores in half floats, and a warm start from a seed shape. Tested: anisotropy of order 6 grows six arms; the arrival time only increases from the seed; a grown result is the same for the same seed on every run.
- [ ] **4.2 `frost-creep`** [B] (M) — frost growing in from the edges of the view or across a panel, as on a window in a cold snap, revealed by scroll or time from 4.1's arrival times. Lit as thin, slightly frosted ice with the glint model. A scroll-driven reveal for a winter landing page.
- [ ] **4.3 `frost-text`** [B] (M) — frost growing out from a heading's glyph outlines (a text distance field) and slowly over its letters. Shares the text field with Storm Temple's unbuilt `electric-text` (its 3.4).
- [ ] **4.4 `snowflake`** [A] (M) — a unique snowflake per seed, grown by Reiter's cellular automaton on a hexagonal grid (or the Gravner–Griffeath model), whose few parameters span plates, sectored plates, stars and fern-like dendrites. It is drawn through the D6 fold, lit as clear ice with internal edges. Grown once and cached, so drawing costs a texture read. A loader, a badge, an avatar from a user id.

  A large, high-contrast snowflake is a six-fold rosette, which the pattern rule fails (The Hero's Journey M1). The default is small or soft, and a hero-size crisp flake is a gated preset.
- [ ] **4.5 Growth compared** [—] (S) — the same frosted pane by 4.1's phase field, Water Temple's `frost-melt`, and Storm Temple's shortest-path tree (its `lichtenberg`), compared on look, cost and memory.

## Epic 5 — Ice

- [ ] **5.1 `ice-panel`** [A] (M) — a slab of ice over content the effect draws, or an image the page hands over:
  - refraction through an uneven surface, from the shared refraction chunks;
  - trapped bubbles in streams;
  - internal fracture planes that catch the light;
  - a frosted face that clears where the pointer warms it.

  Compared with Light Temple's `glass-panels` and a CSS `backdrop-filter` frost.
- [ ] **5.2 `crack`** [B] (M) — ice cracking from a click: cracks grow by Storm Temple's branching growth, with radial and ring cracks as in a struck pane. They are drawn with the stroke renderer, with a white stress fringe either side, and revealed by arrival time. For feedback on a hard action, a hero on a winter sports page, or a "break the ice" call to action.
- [ ] **5.3 `icicles`** [B] (M) — icicles growing down from an element's bottom edge, after Short, Baygents and Goldstein's model of icicle growth. A thin film of water runs down, freezes and lengthens the icicle, ripples form, and drops fall from the tips. Grows with time or scroll, melts with 3.5's warming.
- [ ] **5.4 `freeze`** [A] (S) — a state transition: an element freezes over (frost in from its edges, a glaze, its colour cooled and dimmed) and thaws back. Built for disabled and paused states, and for "cold" status in a dashboard. Compared with a CSS filter-and-overlay version.
- [ ] **5.5 `frozen-lake`** [B] (M) — a section of the page as black lake ice: depth and trapped bubbles seen through it, cracks with depth, and a skate trail the pointer cuts that frosts over slowly.

## Epic 6 — Crystal and gems

- [ ] **6.1 Spectral dispersion trace** [—] (M) — `src/gpu/gem/`: rays traced through a convex faceted solid in the fragment shader, with refraction and total internal reflection to a few bounces, and dispersion by tracing several wavelengths (Moon Temple's `spectral.wgsl`). Energy is conserved through the bounces. A test checks that a ray entering a slab leaves at the angle it entered, at every wavelength.
- [ ] **6.2 `gem`** [C] (M) — a brilliant-cut stone turned by the pointer or device tilt: its fire (dispersion), its brilliance (light returned by internal reflection) and its scintillation (the flash of facets as it turns). After Guy and Soler's real-time gemstones. A luxury product hero. Scintillation is flicker, so the flash check matters here.
- [ ] **6.3 `crystal-growth`** [B] (M) — crystals growing out of a surface, like a geode or quartz cluster: faceted prisms that nucleate, lengthen and crowd each other, revealed over time. Shaded with 6.1's trace at low bounce count.
- [ ] **6.4 Glints** [—] (M) — `src/gpu/glint/`: sparkle from discrete microfacets, after Zirr and Kaplanyan's real-time procedural glints: a stable, sub-pixel-correct sparkle that does not shimmer as the view moves. Used by settled snow (3.3), frost (4.2) and diamond dust (6.5). Band-limited by Fire Temple's flicker construction, so no glint field can pass three flashes a second.
- [ ] **6.5 `diamond-dust`** [A] (S) — ice crystals hanging in cold sunlit air, glittering as they turn: sparse points from Moon Temple's point-source renderer with 6.4's glint statistics. The gentlest effect in the family, and the one most likely to be over the flash limit if done naively.

## Epic 7 — Atmospheric optics

Ice crystals in the air draw rings and spots around the sun. Their positions follow from refraction through hexagonal prisms and plates at a few orientations. The 22° halo is the minimum deviation of a 60° prism. Sun dogs come from plates falling face-down. The circumzenithal arc comes from light entering a plate's top face. All of them can be computed.

- [ ] **7.1 Halo table** [—] (M) — `src/gpu/halo/`: rays traced on the CPU (or once in compute) through hexagonal columns and plates, in random orientations, horizontal plates, and horizontal columns. Binned by direction into a table of halo brightness per wavelength, for a given sun elevation, after the approach of Tape's _Atmospheric Halos_ and Cowley and Schroeder's HaloSim. Tested: the 22° halo peaks at 21.8° with red on its inside edge; sun dogs move outwards as the sun rises.
- [ ] **7.2 `sun-halo`** [A] (S) — a cold sky with a low sun, its 22° halo, sun dogs, upper tangent arc and circumzenithal arc read from 7.1's table, faint and coloured as they are in life. A hero for a weather or outdoor page.
- [ ] **7.3 `winter-sky`** [B] (M) — a low winter sun and blue hour: a sky gradient by sun elevation (a cheap analytic sky), alpenglow on distant snow, long blue shadows on a snowfield, with diamond dust and halos as options.

## Epic 8 — On the page

- [ ] **8.1 Seasonal hero** [B] (M) — a landing-page hero built from the family: falling snow, snow settling on the headline and the call-to-action button, a footprint strip along the bottom, with `dose` low enough to sit behind text. The page most sites would actually ship.
- [ ] **8.2 Cursor trail** [A] (S) — snow kicked up by the pointer, or a frost trail that fades, as a drop-in.
- [ ] **8.3 Weather widget** [A] (S) — a small card whose weather is live: snow rate, wind and temperature drive snowfall, frost and icicles.
- [ ] **8.4 Snowflake loader and avatar** [A] (S) — 4.4 as a loading indicator (growing, then turning slowly) and as an identicon from a user id.
- [ ] **8.5 MPM snowball** [C] (L, stretch) — the non-goal measured once: the smallest material point method scene (a snowball hitting a ledge and breaking) that runs in a browser, and what it costs. Answers whether MPM belongs on a page at all.

## Epic 9 — Production readiness

- [ ] **9.1 Library entry** (S) — mount any effect on a caller's canvas, with element tracking for the page effects, as the other families do.
- [ ] **9.2 Light pages** (M) — the family's hard case, decided per effect:
  - snow as shaded volume with blue shadows (3.3);
  - a dark band behind falling snow;
  - snow on a light page drawn as its shadow only;
  - or no snow there.

  Each is shown and screenshotted over the light context.
- [ ] **9.3 Accessibility** (M) — `docs/accessibility.md`: flash, pattern and motion over every preset, the vection limits from 2.4, held frames, the start gate, and settled snow that never hides text or controls.
- [ ] **9.4 CSS and DOM fallbacks** (S) — for each Tier A effect, the best CSS or DOM version beside it, with its cost and what it cannot do.
- [ ] **9.5 Adaptive quality** (S) — flake count, pile resolution and growth resolution scale with the measured frame time, from the shared rungs.
- [ ] **9.6 Into the temple core** (M) — move the height-field accumulation (3.1), the phase-field grower (4.1), the glint model (6.4), the spectral trace (6.1) and the halo table (7.1) into `@mk7s/hologpu-temple-core`.

## Epic 10 — Measurement and findings

- [ ] **10.1 Cost studies** (S) — every epic's effects on Dawn and in Chrome, with texture memory and state size, filed in `docs/studies/`.
- [ ] **10.2 Device matrix** (M) — an integrated GPU, a phone and Safari and Firefox, to settle the provisional tiers.
- [ ] **10.3 Snowfall crossover** (S) — 2.5's answer on more devices: at what flake count CSS, DOM and WebGPU each stop being the right choice.
- [ ] **10.4 Decision guide** (S) — "which effect for which job", "how much snow behind text", and the cases where the answer is "don't".

## Risks and open questions

- **Settled snow and layout.** Element rectangles change on scroll, resize, font load and layout shift. Does a pile follow without tearing or dropping its snow, and at what cost per tracked element? How many elements can carry snow at once?
- **White on white.** Can snow read on a light page at all without a dark backing? 3.3 and 9.2 are the experiment, and "no" is an acceptable finding.
- **Vection.** Where is the line between snow that feels like weather and snow that makes someone feel they are moving? The motion check measures optical flow, not vection itself, so 2.4's limits are a proxy, and say so.
- **Glitter and the flash rule.** A field of independent glints is many tiny flashes, each under the area threshold. Does the analyser's cell grid see their sum correctly? 6.4 needs tests at many frame phases.
- **Phase-field cost.** Kobayashi's model needs small time steps. Does 4.2 grow fast enough at a useful resolution on an integrated GPU, or does it have to be grown once and revealed?
- **Snowflakes and the pattern rule.** How small or soft must a crisp six-fold flake be to pass at hero size, and does a slowly turning one count as moving?
- **Gems on integrated GPUs.** A traced gem at several wavelengths and bounces is expensive. Is Tier C its honest place, and is a baked environment of facet directions a cheaper honest version?
- **Accent.** Glacier blue sits close to Storm Temple's cyan. Check it in the holofx site's dropdown beside the other families before committing to it.

## Starting references

From memory, as the other families' plans began; each is to be confirmed against the source when its story is built.

- Clifford A. Reiter, "A local cellular model for snow crystal growth", _Chaos, Solitons & Fractals_ (2005).
- Janko Gravner and David Griffeath, "Modeling snow crystal growth II: a mesoscopic lattice map with plausible dynamics", _Physica D_ (2008).
- Kenneth G. Libbrecht, "The physics of snow crystals", _Reports on Progress in Physics_ (2005), and his snowcrystals.com.
- Ryo Kobayashi, "Modeling and numerical simulations of dendritic crystal growth", _Physica D_ (1993).
- Paul Fearing, "Computer modelling of fallen snow", SIGGRAPH 2000.
- Colin Barré-Brisebois, "Deformable Snow Rendering in Batman: Arkham Origins", GDC 2014.
- Alexey Stomakhin et al., "A material point method for snow simulation", SIGGRAPH 2013.
- K. L. S. Gunn and J. S. Marshall, "The distribution with size of aggregate snowflakes", _Journal of Meteorology_ (1958).
- Tobias Zirr and Anton S. Kaplanyan, "Real-time rendering of procedural multiscale materials", I3D 2016; Wenzel Jakob et al., "Discrete stochastic microfacet models", SIGGRAPH 2014.
- Stéphane Guy and Cyril Soler, "Graphics gems revisited: fast and physically-based rendering of gemstones", SIGGRAPH 2004.
- Walter Tape, _Atmospheric Halos_ (AGU, 1994); Walter Tape and Jarmo Moilanen, _Atmospheric Halos and the Search for Angle x_ (AGU, 2006); Les Cowley's Atmospheric Optics site and HaloSim.
- Martin B. Short, James C. Baygents and Raymond E. Goldstein, "A free-boundary theory for the shape of the ideal dripping icicle", _Physics of Fluids_ (2006); Antony Szu-Han Chen and Stephen W. Morris, "On the origin and evolution of icicle ripples", _New Journal of Physics_ (2013).
- Scott Schiller, Snowstorm.js (2003 onwards), the DOM-snow baseline.
