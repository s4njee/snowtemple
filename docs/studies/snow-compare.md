# Page snow four ways (story 2.5)

Measured 2026-10-28 by `node experiments/snow-compare.mjs`, in headless Chrome at 1280 × 720 on this machine (an Apple M1 Max), 5 s per row after 2.5 s to settle. Main thread and style come from Chrome's Performance metrics; compositor and GPU process are the busy time of those threads in a trace. All in milliseconds of work per second of wall time: 1000 would be a thread that is never idle.

| Method | Flakes | fps | Main thread (ms/s) | of which style | Compositor (ms/s) | GPU process (ms/s) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| nothing (the page alone) | 0 | 61 | 10.6 | 0.0 | 6.1 | 5.9 |
| CSS keyframes reading custom properties | 25 | 60 | 39.0 | 17.1 | 20.1 | 26.5 |
| CSS keyframes of plain values | 25 | 60 | 42.5 | 14.3 | 24.6 | 44.0 |
| DOM from script | 25 | 60 | 35.1 | 6.0 | 27.2 | 39.8 |
| CSS keyframes reading custom properties | 100 | 60 | 89.4 | 47.3 | 39.2 | 70.5 |
| CSS keyframes of plain values | 100 | 60 | 117.4 | 44.4 | 55.6 | 73.5 |
| DOM from script | 100 | 60 | 68.6 | 15.8 | 50.3 | 78.3 |
| CSS keyframes reading custom properties | 400 | 60 | 204.8 | 117.0 | 73.9 | 152.3 |
| CSS keyframes of plain values | 400 | 60 | 335.0 | 135.0 | 121.3 | 174.1 |
| DOM from script | 400 | 60 | 109.3 | 23.5 | 124.5 | 186.5 |
| CSS keyframes reading custom properties | 1600 | 60 | 730.9 | 409.3 | 298.0 | 524.1 |
| CSS keyframes of plain values | 1600 | 44 | 908.7 | 362.2 | 447.8 | 538.1 |
| DOM from script | 1600 | 60 | 361.4 | 74.7 | 441.2 | 598.6 |
| CSS keyframes reading custom properties | 6400 | 13 | 816.5 | 461.9 | 860.6 | 1201.3 |
| CSS keyframes of plain values | 6400 | 30 | 566.7 | 0.0 | 966.2 | 296.8 |
| DOM from script | 6400 | 3 | 1034.9 | 19.0 | 991.4 | 889.6 |
| box-shadow | 100 | 60 | 19.6 | 4.2 | 15.0 | 37.0 |
| box-shadow | 400 | 60 | 22.6 | 5.1 | 17.4 | 40.3 |
| box-shadow | 1600 | 60 | 18.5 | 3.8 | 14.2 | 28.9 |
| box-shadow | 6400 | 60 | 20.2 | 4.3 | 15.2 | 29.7 |
| WebGPU `snowfall` | 1414 | 60 | 31.6 | 0.0 | 20.4 | 54.8 |
| WebGPU `snowfall` | 3150 | 60 | 30.5 | 0.0 | 20.0 | 56.5 |
| WebGPU `snowfall` | 5331 | 60 | 27.6 | 0.0 | 17.6 | 53.6 |
| WebGPU `snowfall` | 7200 | 60 | 30.2 | 0.0 | 22.7 | 53.9 |

WebGPU's flake count is how many `snowfall` shows at that dose; it draws all 9000 instances every frame and skips the rest in the vertex shader, so its cost does not follow the count.

The bare page's one error is Chrome's request for a missing favicon, which `scripts/chrome.mjs` counts as a console error.

## Findings

- **CSS and DOM snow cost per flake; WebGPU does not.** CSS keyframes and Snowstorm.js-style DOM elements cost main-thread time in proportion to the number of flakes, from about 35 ms a second at 25 flakes to most of a core at 1600, and they drop frames past that (6400 flakes: 13 to 30 fps for CSS, 3 fps for DOM). `snowfall` costs about 30 ms a second of main thread and 55 of the GPU process at any count it shows, 1400 to 7200 flakes.
- **The crossover is at a few dozen flakes.** At 25 flakes CSS, DOM and WebGPU cost about the same on the main thread. At 100, CSS and DOM cost two to four times WebGPU's main thread and more GPU process time. A dozen flakes is a CSS job, as Moon Temple found for its orbs; a snowfall is WebGPU's.
- **Keyframes reading custom properties were not the cause.** The first CSS version read `var(--x)` in its keyframes, which was expected to keep it on the main thread. A version with plain-value keyframes and a nested sway animation measured the same or more style time (135 ms a second at 400 flakes against 117). In this Chrome, keyframe snow costs main-thread style work per element either way.
- **Box-shadow snow is flat, because it is one element.** Hundreds of flakes as the box-shadows of two small elements slid down the page cost 20 ms a second at any count up to 6400. The price is that every flake moves together: no depth, no sway, no wind. That is exactly what the motion check reads as a whole-field drift (here 100 vh in 14 s, 0.04 widths a second at 16:9, just under the 0.05 cap).
- **One machine, headless.** An Apple M1 Max is far faster than the integrated GPUs and phones the tiers are set for; story 10.3 repeats this on them.
