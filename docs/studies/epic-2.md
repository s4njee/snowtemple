# Cost study: Epic 2

Measured 2026-10-28 on **Metal driver on macOS Version 26.6.2 (Build 25G83)** (unclassified), Dawn (node webgpu bindings).

Method: GPU timestamps: frame span (first pass start to last pass end) and marginal cost per extra frame. 12 warm-up frames, then the median of 11 rounds; each round encodes the frame once and 4 times in one command buffer.

- **span** is one frame alone, first pass start to last pass end. It includes the timing floor of this adapter (the `(floor)` row).
- **per frame** is the cost of one more frame of the same work (the slope). It is the number to compare effects by, and the one the Scorecard shows.
- `(tail)` is the HDR tail alone at its default settings. Every effect below includes it.

Only this adapter was measured. spanMs includes the timing floor (see the "(floor)" rows); slopeMs is the cost of one more frame of the same work and is the number to compare by. A slope at or below zero means the work is below what this method can resolve.

Two limits on reading these numbers. Repeated runs of a light effect differ by up to about half a millisecond (see the Range column), and a GPU's clock follows its load, so a light effect can read slower per unit of work than a heavy one: differences under about half a millisecond mean nothing. And the Tier A and B budgets are set for an integrated GPU; a time measured on a faster one can show an effect is over budget but cannot show that it fits.

## 1920 × 1080

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | -0.09 to 0.15 |
| (tail) | constant scene + bloom + output | 11 | 0.66 | 0.42 | 0.31 to 0.76 |
| blizzard | default | 3 | 2.29 | 2.32 | 2.23 to 2.60 |
| blizzard | preset blizzard | 3 | 2.42 | 2.27 | 2.14 to 2.56 |
| blizzard | preset blowing snow | 3 | 2.36 | 2.32 | 2.05 to 2.38 |
| blizzard | preset whiteout | 3 | 2.29 | 2.34 | 2.27 to 2.38 |
| blizzard | preset steady, no gusts | 3 | 2.29 | 2.34 | 2.25 to 2.47 |
| snow-globe | default | 3 | 0.20 | 0.17 | 0.15 to 0.28 |
| snow-globe | preset snow globe | 3 | 0.20 | 0.17 | 0.15 to 0.26 |
| snow-globe | preset thick with snow | 3 | 0.26 | 0.17 | 0.15 to 0.26 |
| snow-globe | preset still until shaken | 3 | 0.33 | 0.22 | 0.15 to 0.33 |
| snow-globe | preset small | 3 | 0.26 | 0.22 | 0.11 to 0.26 |
| snowfall | default | 2 | 0.46 | 0.37 | 0.22 to 0.68 |
| snowfall | preset steady | 2 | 0.59 | 0.52 | 0.33 to 0.55 |
| snowfall | preset flurry | 2 | 0.59 | 0.37 | 0.17 to 0.59 |
| snowfall | preset heavy | 2 | 0.39 | 0.35 | 0.28 to 0.42 |
| snowfall | preset still | 2 | 0.59 | 0.50 | 0.26 to 0.68 |
| snowfall | preset big, slow flakes | 2 | 0.66 | 0.50 | 0.46 to 0.66 |
| snowfall | preset into the snow | 2 | 0.59 | 0.44 | 0.28 to 0.61 |
| snowfall | dose=0.1 | 2 | 0.59 | 0.57 | 0.28 to 0.70 |
| snowfall | dose=0.35 | 2 | 0.59 | 0.52 | 0.42 to 0.79 |
| snowfall | dose=0.7 | 2 | 0.79 | 0.55 | 0.46 to 0.81 |
| snowfall | dose=1 | 2 | 0.66 | 0.55 | 0.37 to 0.92 |
| snowfall | shutter=0 | 2 | 0.52 | 0.42 | 0.28 to 0.59 |
| snowfall | shutter=0.004 | 2 | 0.59 | 0.52 | 0.37 to 0.68 |
| snowfall | shutter=0.016 | 2 | 0.66 | 0.57 | 0.48 to 0.72 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.04 | 0.02 to 0.17 |
| (tail) | constant scene + bloom + output | 9 | 0.46 | 0.33 | 0.26 to 0.37 |
| blizzard | default | 3 | 1.44 | 1.27 | 1.14 to 1.53 |
| blizzard | preset blizzard | 3 | 1.18 | 1.09 | 0.85 to 1.22 |
| blizzard | preset blowing snow | 3 | 1.18 | 1.11 | 0.87 to 1.31 |
| blizzard | preset whiteout | 3 | 1.18 | 1.11 | 0.98 to 1.22 |
| blizzard | preset steady, no gusts | 3 | 1.18 | 1.14 | 0.94 to 1.33 |
| snow-globe | default | 3 | 0.13 | 0.11 | 0.07 to 0.17 |
| snow-globe | preset snow globe | 3 | 0.13 | 0.09 | 0.09 to 0.26 |
| snow-globe | preset thick with snow | 3 | 0.20 | 0.13 | 0.04 to 0.17 |
| snow-globe | preset still until shaken | 3 | 0.26 | 0.20 | 0.11 to 0.37 |
| snow-globe | preset small | 3 | 0.20 | 0.15 | -0.02 to 0.50 |
| snowfall | default | 2 | 0.39 | 0.24 | 0.11 to 0.39 |
| snowfall | preset steady | 2 | 0.39 | 0.24 | 0.17 to 0.44 |
| snowfall | preset flurry | 2 | 0.33 | 0.24 | 0.17 to 0.28 |
| snowfall | preset heavy | 2 | 0.39 | 0.26 | 0.11 to 0.33 |
| snowfall | preset still | 2 | 0.33 | 0.26 | 0.22 to 0.42 |
| snowfall | preset big, slow flakes | 2 | 0.33 | 0.26 | 0.15 to 0.39 |
| snowfall | preset into the snow | 2 | 0.33 | 0.26 | 0.15 to 0.50 |
| snowfall | dose=0.1 | 2 | 0.33 | 0.26 | 0.24 to 0.44 |
| snowfall | dose=0.35 | 2 | 0.39 | 0.26 | 0.13 to 0.39 |
| snowfall | dose=0.7 | 2 | 0.39 | 0.26 | 0.13 to 0.52 |
| snowfall | dose=1 | 2 | 0.46 | 0.33 | 0.15 to 0.50 |
| snowfall | shutter=0 | 2 | 0.33 | 0.24 | 0.22 to 0.31 |
| snowfall | shutter=0.004 | 2 | 0.39 | 0.24 | 0.15 to 0.35 |
| snowfall | shutter=0.016 | 2 | 0.39 | 0.24 | 0.17 to 0.26 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (16.4 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| blizzard | 17 | 1.6 | 40.4 |
| snow-globe | 13 | 2.1 | 30.4 |
| snowfall | 13 | 1.0 | 33.0 |
