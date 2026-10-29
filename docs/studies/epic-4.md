# Cost study: Epic 4

Measured 2026-10-29 on **Apple M1 Max** (apple-silicon), Dawn (node webgpu bindings).

Method: GPU timestamps: frame span (first pass start to last pass end) and marginal cost per extra frame. 12 warm-up frames, then the median of 11 rounds; each round encodes the frame once and 4 times in one command buffer.

- **span** is one frame alone, first pass start to last pass end. It includes the timing floor of this adapter (the `(floor)` row).
- **per frame** is the cost of one more frame of the same work (the slope). It is the number to compare effects by, and the one the Scorecard shows.
- `(tail)` is the HDR tail alone at its default settings. Every effect below includes it.

Only this adapter was measured. spanMs includes the timing floor (see the "(floor)" rows); slopeMs is the cost of one more frame of the same work and is the number to compare by. A slope at or below zero means the work is below what this method can resolve.

## Findings

- **The frame cost is the draw; growth is extra, and small.** The benchmark's frames below are steady ones, and the frost has grown as far as they show. Growing costs, on the same M1 Max on Dawn, by wall time over 1,000 steps (`experiments/growth-cost.test.ts`):

  | Grid                                     | Phase field, a step | Publishing arrival |   State |
  | ---------------------------------------- | ------------------: | -----------------: | ------: |
  | 480 × 270 (960 × 540 at 2 CSS px a cell) |            0.032 ms |            0.16 ms |  6.2 MB |
  | 960 × 540 (1080p)                        |            0.059 ms |            0.17 ms | 24.9 MB |
  | 1920 × 1080 (1080p at 1 CSS px a cell)   |            0.236 ms |            0.56 ms | 99.6 MB |

  Reiter's automaton at radius 160 (103,000 cells, two passes a step) costs 0.028 ms a step.

  A pane needs about 5,000 steps, spread over a 40-second freeze, so four or five a frame, about 0.3 ms with the arrival republished every fourth frame. Scrolling grows at most 24 steps a frame (about 1.4 ms at 1080p), which the `frost as you scroll` rows show. A new grid grows up to 2,000 steps in its first frame, its starting frost, once.

- **The cell is two CSS pixels at the smallest.** At one, a 1080p pane's state is 100 MB and a step costs four times as much, for frost whose arms are still six cells wide.

## The measurements

Two limits on reading these numbers. Repeated runs of a light effect differ by up to about half a millisecond (see the Range column), and a GPU's clock follows its load, so a light effect can read slower per unit of work than a heavy one: differences under about half a millisecond mean nothing. And the Tier A and B budgets are set for an integrated GPU; a time measured on a faster one can show an effect is over budget but cannot show that it fits.

## 1920 × 1080

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | 0.04 to 0.07 |
| (tail) | constant scene + bloom + output | 11 | 0.52 | 0.37 | 0.31 to 0.68 |
| frost-creep | default | 3 | 0.59 | 0.57 | 0.46 to 0.61 |
| frost-creep | preset cold snap | 3 | 0.59 | 0.57 | 0.50 to 0.59 |
| frost-creep | preset from the sill | 3 | 0.66 | 0.61 | 0.57 to 1.81 |
| frost-creep | preset in the corners | 3 | 0.66 | 0.61 | 0.57 to 1.84 |
| frost-creep | preset frost as you scroll | 3 | 1.84 | 1.81 | 1.81 to 1.86 |
| frost-creep | preset over the page | 3 | 0.59 | 0.57 | 0.50 to 0.59 |
| frost-creep | preset coarse frost | 3 | 0.39 | 0.35 | 0.31 to 0.37 |
| frost-text | default | 3 | 0.66 | 0.61 | 0.57 to 1.84 |
| frost-text | preset hard frost | 3 | 0.66 | 0.61 | 0.59 to 1.86 |
| frost-text | preset rimed letters | 3 | 0.52 | 0.50 | 0.46 to 0.55 |
| frost-text | preset frost reaching out | 3 | 0.66 | 0.61 | 0.59 to 1.84 |
| frost-text | preset frost as you scroll | 3 | 1.84 | 1.81 | 1.79 to 1.86 |
| frost-text | preset over the page | 3 | 0.66 | 0.63 | 0.57 to 1.84 |
| snowflake | default | 3 | 0.33 | 0.17 | 0.15 to 0.17 |
| snowflake | preset a new one each time | 3 | 0.26 | 0.17 | 0.17 to 0.22 |
| snowflake | preset stellar dendrite | 3 | 0.26 | 0.17 | 0.15 to 0.22 |
| snowflake | preset fern dendrite | 3 | 0.26 | 0.17 | 0.17 to 0.22 |
| snowflake | preset sectored plate | 3 | 0.26 | 0.15 | 0.11 to 0.17 |
| snowflake | preset stellar plate | 2 | 0.20 | 0.15 | 0.11 to 0.17 |
| snowflake | preset badge | 3 | 0.26 | 0.15 | 0.15 to 0.20 |
| snowflake | preset bright ice | 2 | 0.26 | 0.15 | 0.11 to 0.17 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.00 | 0.04 | 0.02 to 0.09 |
| (tail) | constant scene + bloom + output | 9 | 0.39 | 0.31 | 0.28 to 0.35 |
| frost-creep | default | 3 | 0.20 | 0.13 | 0.09 to 0.15 |
| frost-creep | preset cold snap | 3 | 0.20 | 0.13 | 0.11 to 0.15 |
| frost-creep | preset from the sill | 3 | 0.26 | 0.22 | 0.13 to 0.63 |
| frost-creep | preset in the corners | 3 | 0.20 | 0.15 | 0.13 to 0.20 |
| frost-creep | preset frost as you scroll | 3 | 1.25 | 1.42 | 0.59 to 1.46 |
| frost-creep | preset over the page | 3 | 0.20 | 0.13 | 0.11 to 0.17 |
| frost-creep | preset coarse frost | 3 | 0.20 | 0.13 | 0.09 to 0.15 |
| frost-text | default | 3 | 0.20 | 0.13 | 0.13 to 0.17 |
| frost-text | preset hard frost | 3 | 0.20 | 0.15 | 0.13 to 0.17 |
| frost-text | preset rimed letters | 3 | 0.20 | 0.13 | 0.11 to 0.15 |
| frost-text | preset frost reaching out | 3 | 0.26 | 0.17 | 0.15 to 0.63 |
| frost-text | preset frost as you scroll | 3 | 0.59 | 0.61 | 0.59 to 0.66 |
| frost-text | preset over the page | 3 | 0.20 | 0.15 | 0.11 to 0.17 |
| snowflake | default | 3 | 0.20 | 0.13 | 0.09 to 0.15 |
| snowflake | preset a new one each time | 3 | 0.20 | 0.11 | 0.11 to 0.13 |
| snowflake | preset stellar dendrite | 3 | 0.20 | 0.11 | 0.07 to 0.13 |
| snowflake | preset fern dendrite | 3 | 0.20 | 0.11 | 0.09 to 0.15 |
| snowflake | preset sectored plate | 3 | 0.13 | 0.11 | 0.07 to 0.13 |
| snowflake | preset stellar plate | 2 | 0.13 | 0.09 | 0.07 to 0.11 |
| snowflake | preset badge | 3 | 0.20 | 0.13 | 0.09 to 0.15 |
| snowflake | preset bright ice | 2 | 0.13 | 0.09 | 0.07 to 0.11 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (17.5 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| frost-creep | 18 | 2.2 | 38.8 |
| frost-text | 17 | 18.6 | 53.0 |
| snowflake | 13 | 4.3 | 30.7 |
