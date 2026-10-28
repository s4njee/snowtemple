# Vection: snow coming towards the viewer (story 2.4)

Measured 2026-10-28 on Dawn (Apple M1 Max) by `experiments/vection.test.ts`: `snowfall` at 480 × 270, standing for 1920 × 1080, through the motion check (`src/gpu/safety/motion.ts`), six readings over three seconds per row, the median reported.

Vection is the illusion of moving oneself, and the classic way to make it is a field of particles streaming out from a point ahead: a starfield, or driving through snow at night. The motion check measures the optical flow that drives it, not the illusion itself, so everything here is a proxy.

## What the motion check saw

| dose | wind | into the snow (m/s) | turn (°/s) | zoom (doublings/s) | drift (widths/s) | blocks tracked per reading |
| ---- | ---- | ------------------- | ---------- | ------------------ | ---------------- | -------------------------- |
| 0.35 | 0    | 0                   | 0          | 0                  | 0                | 3 to 17                    |
| 0.35 | 0    | 0.5 to 6            | 0          | 0                  | 0                | 0 to 9                     |
| 0.35 | 1    | 0 to 6              | 0          | 0                  | 0                | 0 to 14                    |
| 0.7  | 0    | 0                   | 3.54       | -0.015             | 0.022            | 39 to 78                   |
| 0.7  | 0    | 0.5 to 6            | 0 to -0.13 | 0 to 0.025         | 0 to 0.005       | 9 to 22                    |
| 0.7  | 1    | 0                   | 0.80       | 0.025              | 0.017            | 40 to 71                   |
| 0.7  | 1    | 0.5 to 6            | 0          | 0                  | 0                | 5 to 20                    |

A reading counts only with at least 20 tracked blocks (`MIN_BLOCKS`), about a twentieth of the frame. Below that, a rigid fit to a dozen flakes moving their own ways reported spurious zooms of up to 0.16 doublings a second, which is why the rule exists.

## Findings

- **The motion check cannot measure driven snow.** Snow driven towards the viewer is a sparse field of faint far flakes and large, faint, out-of-focus near ones. Almost none of its 16-pixel blocks has enough texture to track: 0 to 22 per reading, at any speed and dose. The check therefore reports no motion, which says nothing about vection. Optical flow by block matching suits textured surfaces, not sparse points; a starfield of bright, sharp points would be tracked, and this snow is not that.
- **So driven snow is held to the cap by its own transform.** A flake at depth z, approached at v m/s, grows away from the centre of the view at v / z per second: v / (z ln 2) zoom doublings a second (`driveZoom`). Taken at the focus distance (3 m), where flakes are drawn sharpest and so read most clearly, the 0.1 zoom cap is reached at **0.21 m/s**, a slow shuffle. Walking pace (1.4 m/s, the `into the snow` preset) is 0.67 doublings a second, nearly seven times the cap. Driving into the snow is therefore never a default: every preset that does is declared in `scorecard.motionPresets` and starts behind the gate, and `tests/snowfall.test.ts` checks it from the formula.
- **Falling snow without driving is inside the caps.** At the default and at the strong dose, with and without wind, the largest whole-field reading is a turn of 3.5° a second (under the 5° cap) and a drift of 0.02 widths a second. Parallax helps: near and far flakes move at different speeds on screen, so there is no single rigid motion for the eye, or the check, to lock on to.
- **What this does not settle.** Whether snow streaming at 0.2 m/s in a dark room induces vection in a real viewer is a perceptual question this proxy cannot answer. The cap is the family's starting value, inherited from The Hero's Journey, and the formula is conservative in using the sharpest depth rather than the average.
