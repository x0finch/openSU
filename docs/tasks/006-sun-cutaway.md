# Task 006 - Sun study and level cutaway (`packages/render`)

## Goal
Two interactions that make the model worth exploring: (1) real sunlight for
any date and time, including sun patches falling through windows onto
interior floors and walls; (2) a dollhouse cutaway that removes the levels
above a chosen level. Both keep the accepted illustration style.

## Sun study
- `solarPosition({ latitude, longitude, utcOffsetHours, date, minutes })`
  -> `{ azimuthDeg, elevationDeg }`: a small self-contained implementation
  (NOAA-style), no dependency, in a pure module with unit tests against
  published values for at least four date/location pairs (error < 0.5 deg),
  plus `sunriseSunset(...)`.
- `site.northDeg` rotates the model relative to true north; apply it.
  Add `site.utcOffsetHours?` to the model (default 8) if needed; this is the
  only model change allowed.
- Viewer API: `viewer.setLighting({ mode: 'physical', date, minutes })` and
  back to `{ mode: 'presentation' }`. Shadows update on demand while a
  slider drags (target: a full day sweep stays interactive; measure and
  report ms per shadow update on software GL and note it is a lower bound).
- Glass must not block sunlight: sun passes through window and door glass
  and glass balustrades, so sun patches appear inside rooms. Frames,
  mullions, walls, slabs, roofs and canopies do block it.
- Interiors must stay readable in physical mode: surfaces not reached by
  the sun use the shadow tone, but an interior must not become a dark cave.
  You may ADD tokens (e.g. an interior ambient lift) but not change
  existing token values. Sun patches on floors must be clearly visible:
  sunlit floor vs shaded floor contrast like sunlit vs shadowed wall.
- Below the horizon: clamp the slider to sunrise..sunset for the date.
- Date presets: winter solstice, spring equinox, summer solstice, autumn
  equinox, today.

## Cutaway
- `viewer.setCutaway(levelId | null)`: hides roofs, levels above, and the
  ceiling/slab above the chosen level, so its rooms are visible from above.
- Cut wall tops are drawn in a mid-grey "cut" tone (new token) with their
  outline, so the view reads like a 3D floor plan. Stairs, floor finishes,
  interior walls, door openings and window frames remain. Entourage above
  the cut is hidden; site and garden stay.
- Floor finishes: interior floors get the warm light floor tone from the
  plan spec (new token), outdoor surfaces as today.
- Add an axonometric "cutaway" preset per level to the demo and shots.

## Demo and shots
- Demo page: time slider, date presets, cutaway level buttons.
- `pnpm shots` adds: `sun-winter-09.png`, `sun-winter-12.png`,
  `sun-winter-15.png`, `sun-summer-12.png` (SE axonometric, physical sun,
  golden site latitude), `cut-L1.png`, `cut-L2.png` (cutaway axonometrics),
  and `cut-L1-sun-winter-15.png` (cutaway with physical sun showing sun
  patches in the living room).

## Acceptance criteria
- Build, typecheck, tests, shots pass from a clean checkout.
- Solar unit tests pass; shadows in the screenshots point the right way
  (winter noon shadows long toward north, summer noon short, morning to the
  west, afternoon to the east) given `northDeg`.
- Sun patches through south windows are visible on the living room floor in
  `cut-L1-sun-winter-15.png`; glass casts no shadow; frames do.
- Cutaway views read as clean 3D plans: grey cut tops, no z-fighting on cut
  faces, no leftover floating parts from hidden levels, no see-through
  holes into nothing.
- Presentation-mode screenshots are pixel-identical (or within noise) to
  before this task: the existing look must not regress.
- Still < 150k triangles and < 150 draw calls; render on demand preserved.

## Out of scope
Walk mode, furniture in 3D, rain, the web app UI (a separate task wires
these APIs into the app).
