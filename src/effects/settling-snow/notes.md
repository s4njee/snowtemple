## How it works

Snow falls through depth as in `snowfall`, and settles on the page's own elements: every element marked `data-sn-obstacle` (the shell's page contexts mark their nav bars, hero copy and cards) holds a pile along its top edge, and the ground along the canvas's bottom holds one too. The piles are the shared engine in `src/gpu/pile/` (story 3.1):

- **Height fields.** Each edge is a row of an `r32float` texture, one column per CSS pixel; heights are CSS pixels. Half floats would truncate the small deposits that build a pile (Fire Temple 5.6).
- **Supply.** Snow arrives where nothing higher up the page covers the column, so an element under another gets none. It arrives a little unevenly along the edge, and it tapers off as the pile nears its depth.
- **Wind** moves a share of the surface snow downwind each frame, and holds some back past the lee end as a cornice.
- **The angle of repose.** Wherever a column stands more than tan(angle) above a neighbour, a quarter of the excess moves to it. Both sides of each exchange come from the same old heights, so snow is neither made nor lost except where it slides off an end. Run four times a frame, ping-ponging between two textures. This is Fearing's fallen-snow model (SIGGRAPH 2000) on a row of columns.
- **Moving elements.** A pile is keyed by its element, so it moves when the element scrolls or animates. An element that changes width has its pile resampled, keeping the total; one that leaves the page loses it. A new edge starts with a blanket.
- **Loose snow.** The pointer, read from the window so it works above page content, brushes snow off where it passes over a pile. A press on an element shakes most of its snow loose. Loose snow becomes particles carrying its mass, which fall and land on whatever pile they meet, through integer atomics.

`tests/pile.test.ts` checks the model in `pile.ts`:

- mass is conserved except off the ends;
- a settled pile never stands steeper than its angle;
- a resize keeps the total;
- wind strips the windward end and builds the lee end;
- a pile builds to its depth and no further, and melts to exactly zero;
- a shaded column gets nothing;
- the shader runs the same model, column for column.

The shading (story 3.3) is in `draw.wgsl`. Each pile is drawn as a ridge seen from the front: just under its top surface it faces the sky, and lower down the viewer. Faces turned to the sun are near white and the rest take the sky's blue. The top skin glows a little, as light scatters under it, and the pile darkens where it meets the element. A faint blue-grey rim carries it over a white page, which is the hard case: white snow on a white card is otherwise invisible. The drawn surface rounds the pile's shoulders over a few columns.

## Cost

On an Apple M1 Max on Dawn ([docs/studies/epic-3.md](../../../docs/studies/epic-3.md)): 0.4 to 0.7 ms per frame at 1080p: a supply pass, four relaxations and the loose particles over 32 rows of 2048 columns, the piles' draw and the flakes. In Chrome, one 1920 × 1080 frame reads 0.80 ms in the canvas context ([browser-check.md](../../../docs/studies/browser-check.md)). Tier A by budget, provisional; it needs compute. 1.0 kB gzipped of its own, 42.6 kB in all. Per element, the page pays one `getBoundingClientRect` a frame (dom-rects.ts).

Flash `low`, pattern `none`, motion inside the caps, at the default and at 0.7.

## Pitfalls

- An element is its box: snow lies along a rounded card's straight top and ignores its corners, and lies on a heading's line box, not its letters.
- An element whose top edge is above the canvas holds snow nobody sees.
- Thirty-one edges at most (row 0 is the ground); more are ignored.
- The flakes are drawn as `snowfall`'s and do not land where the pile grows: the supply is the snowfall's rate, not its flakes.
- Glints on settled snow are story 6.4, not yet here.

## When to use it

A seasonal landing page over a real layout, Tier A by budget (it needs compute). For a static look, the CSS ridge in `src/css/snow-ridge.css` (story 3.6) is free: a `::before` drift on each element marked `data-sn-snow`, sized by `--sn-snow-depth`, with no settling, wind or melt.

## References

- Paul Fearing, "Computer Modelling of Fallen Snow", SIGGRAPH 2000.
- [plan.md](../../../plan.md), stories 3.1, 3.2, 3.3 and 3.6.
