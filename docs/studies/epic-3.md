# Cost study: Epic 3

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
| (floor) | one constant-colour pass | 1 | 0.07 | 0.07 | 0.04 to 0.07 |
| (tail) | constant scene + bloom + output | 11 | 0.52 | 0.37 | 0.35 to 0.70 |
| footprints | default | 3 | 0.52 | 0.46 | 0.37 to 0.61 |
| footprints | preset fresh snow | 3 | 0.79 | 0.79 | 0.61 to 1.38 |
| footprints | preset deep snow | 3 | 0.66 | 0.61 | 0.44 to 1.14 |
| footprints | preset filling fast | 3 | 0.79 | 0.79 | 0.70 to 1.14 |
| footprints | preset no snow falling | 3 | 0.72 | 0.70 | 0.52 to 1.14 |
| melt | default | 2 | 0.52 | 0.57 | 0.44 to 0.68 |
| melt | preset melt and snow again | 2 | 0.72 | 0.70 | 0.68 to 0.74 |
| melt | preset fast thaw | 2 | 0.72 | 0.68 | 0.59 to 0.76 |
| melt | preset melt as you scroll | 2 | 0.72 | 0.72 | 0.70 to 0.79 |
| settling-snow | default | 2 | 0.79 | 0.74 | 0.59 to 0.83 |
| settling-snow | preset settling | 2 | 0.39 | 0.39 | 0.31 to 0.85 |
| settling-snow | preset deep and calm | 2 | 0.46 | 0.46 | 0.42 to 0.52 |
| settling-snow | preset windblown | 2 | 0.66 | 0.70 | 0.55 to 0.83 |
| settling-snow | preset light dusting | 2 | 0.72 | 0.70 | 0.61 to 0.79 |

## 960 × 540

| Effect | Configuration | Passes | Span (ms) | Per frame (ms) | Range (ms) |
| --- | --- | ---: | ---: | ---: | --- |
| (floor) | one constant-colour pass | 1 | 0.07 | 0.04 | 0.02 to 0.07 |
| (tail) | constant scene + bloom + output | 9 | 0.52 | 0.33 | 0.31 to 0.37 |
| footprints | default | 3 | 0.46 | 0.37 | 0.35 to 0.42 |
| footprints | preset fresh snow | 3 | 0.46 | 0.39 | 0.35 to 0.42 |
| footprints | preset deep snow | 3 | 0.46 | 0.39 | 0.37 to 0.39 |
| footprints | preset filling fast | 3 | 0.46 | 0.37 | 0.35 to 0.39 |
| footprints | preset no snow falling | 3 | 0.39 | 0.33 | 0.31 to 0.35 |
| melt | default | 2 | 0.33 | 0.42 | 0.35 to 0.42 |
| melt | preset melt and snow again | 2 | 0.33 | 0.39 | 0.39 to 0.44 |
| melt | preset fast thaw | 2 | 0.33 | 0.42 | 0.37 to 0.44 |
| melt | preset melt as you scroll | 2 | 0.33 | 0.44 | 0.42 to 0.44 |
| settling-snow | default | 2 | 0.39 | 0.44 | 0.42 to 0.46 |
| settling-snow | preset settling | 2 | 0.39 | 0.44 | 0.42 to 0.48 |
| settling-snow | preset deep and calm | 2 | 0.39 | 0.48 | 0.46 to 0.48 |
| settling-snow | preset windblown | 2 | 0.39 | 0.46 | 0.42 to 0.48 |
| settling-snow | preset light dusting | 2 | 0.33 | 0.42 | 0.39 to 0.44 |

## Download size

What the page fetches to show the effect, beyond the first-load bundle (16.4 kB gzipped, no shaders).

| Effect | Chunks | Own chunk (kB gzip) | Total (kB gzip) |
| --- | ---: | ---: | ---: |
| footprints | 14 | 2.3 | 36.2 |
| melt | 15 | 1.8 | 43.3 |
| settling-snow | 15 | 1.0 | 42.6 |
