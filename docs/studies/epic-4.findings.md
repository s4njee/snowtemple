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
