# Support matrix: what this family adds

Story 1.6. This is a delta on Fire Temple's [support matrix](../../firetemple/docs/support-matrix.md), which covers WebGPU itself, the browsers that ship it, `rgba16float` targets, timestamp queries and the HDR canvas, and on The Hero's Journey's [delta](../../herosjourney/docs/support-matrix.md) (wide gamut, texture arrays, `shader-f16`). This page covers only what Snow Temple leans on beyond those.

**Checked so far:** Chrome 152 on an Apple M1 Max (Metal 3), probed on 2026-10-28 from the dev server, plus Dawn under Node for the tests. Safari, Firefox, Windows, Android and an integrated GPU are not checked yet; they belong to the device matrix (story 10.2). Spec facts below are from the WebGPU and WGSL specifications, not measured.

| What                                                       | Needed by                                     | Spec                                                                                   | Chrome 152, M1 Max                                                   |
| ---------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `r32float` storage texture with `read_write` access         | 3.1 height fields, 3.4 footprints, 4.1 growth | Core format; `read_write` needs the `readonly_and_readwrite_storage_textures` language feature | Feature present; a shader that loads and stores one compiles and runs |
| Storage atomics (`atomic<u32>`)                             | 3.1 deposits from many flakes into one cell   | Core; no float atomics, so deposits count in integers                                  | Core; 256 invocations counted exactly (64 into each of four cells)    |
| `float32-filterable`                                        | Sampling height fields smoothly in 3.2, 3.3   | Optional feature                                                                       | Offered; a linear sampler binds to an `r32float` texture              |
| `maxStorageTexturesPerShaderStage`                          | A pile pass with height, wind and melt fields | 4 by default                                                                           | 4 at the default limits; more on request                              |
| Instanced quads past a few thousand                         | 2.1 snowfall                                  | Core                                                                                   | 9000 instances every frame; cost does not follow the count shown (2.5) |

## What it means for the plan

- **Nothing in M0 to M2 needs an optional feature.** Height fields can be read without filtering (`textureLoad`) where `float32-filterable` is missing, and deposits use integer atomics, which are core.
- **Read-write storage textures are a language feature, not a given.** Chrome has it; Safari's and Firefox's support is to be checked in 10.2 before 3.1 relies on it. The fallback is two textures ping-ponged.
- **Instanced flakes are not the limit.** `snowfall` draws its full 9000 instances every frame and shows some of them; its cost stayed flat from 1400 to 7200 flakes shown (docs/studies/snow-compare.md). A compute-driven point list is not needed for snowfall at these counts.
