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
| (floor) | one constant-colour pass | 1 | 0.33 | 0.04 | -0.26 to 0.55 |
| (tail) | constant scene + bloom + output | 11 | 0.72 | 0.59 | 0.33 to 2.05 |
| snowfall | default | 2 | 0.39 | 0.26 | -0.04 to 0.72 |
| snowfall | preset steady | 2 | 0.52 | 0.33 | 0.04 to 0.50 |
| snowfall | preset flurry | 2 | 0.46 | 0.28 | 0.02 to 0.70 |
| snowfall | preset heavy | 2 | 0.46 | 0.37 | 0.20 to 0.68 |
| snowfall | preset still | 2 | 0.39 | 0.26 | -0.07 to 0.59 |
| snowfall | preset big, slow flakes | 2 | 0.39 | 0.35 | 0.09 to 0.66 |
| snowfall | preset into the snow | 2 | 0.33 | 0.22 | -0.09 to 0.44 |
| snowfall | dose=0.1 | 2 | 0.33 | 0.35 | 0.17 to 0.57 |
| snowfall | dose=0.35 | 2 | 0.46 | 0.28 | -0.15 to 0.76 |
| snowfall | dose=0.7 | 2 | 0.39 | 0.42 | 0.11 to 0.63 |
| snowfall | dose=1 | 2 | 0.46 | 0.44 | 0.02 to 0.72 |
| snowfall | shutter=0 | 2 | 0.33 | 0.26 | 0.15 to 0.59 |
| snowfall | shutter=0.004 | 2 | 0.33 | 0.31 | -0.09 to 0.46 |
| snowfall | shutter=0.016 | 2 | 0.39 | 0.26 | 0.11 to 0.68 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | 0.02 to 0.31 |
| (tail) | constant scene + bloom + output | 9 | 0.39 | 0.37 | 0.20 to 0.74 |
| snowfall | default | 2 | 0.26 | 0.35 | 0.00 to 0.48 |
| snowfall | preset steady | 2 | 0.39 | 0.68 | -0.46 to 1.11 |
| snowfall | preset flurry | 2 | 0.26 | 0.20 | -0.11 to 0.44 |
| snowfall | preset heavy | 2 | 0.26 | 0.17 | -0.17 to 0.52 |
| snowfall | preset still | 2 | 0.33 | 0.15 | -0.11 to 0.24 |
| snowfall | preset big, slow flakes | 2 | 0.26 | 0.22 | -0.11 to 0.55 |
| snowfall | preset into the snow | 2 | 0.26 | 0.24 | 0.00 to 0.66 |
| snowfall | dose=0.1 | 2 | 0.26 | 0.28 | -0.17 to 0.68 |
| snowfall | dose=0.35 | 2 | 0.26 | 0.26 | -0.42 to 0.55 |
| snowfall | dose=0.7 | 2 | 0.33 | 0.20 | -0.07 to 0.35 |
| snowfall | dose=1 | 2 | 0.33 | 0.33 | -0.04 to 0.61 |
| snowfall | shutter=0 | 2 | 0.26 | 0.17 | -0.15 to 0.48 |
| snowfall | shutter=0.004 | 2 | 0.26 | 0.24 | -0.02 to 0.74 |
| snowfall | shutter=0.016 | 2 | 0.26 | 0.13 | -0.33 to 0.55 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (14.7 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| snowfall | 12 | 5.3 | 32.8 |
