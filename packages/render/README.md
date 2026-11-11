# @opensu/render

Framework-free three.js (WebGL2) renderer for the openSU illustration style:
white SketchUp-like architecture, crisp dark feature edges, three flat tone
bands, crisp neutral shadows and saturated stylised plants.

## Run

From the repository root:

```sh
pnpm install
pnpm build      # library (tsc) + demo bundle (vite)
pnpm dev        # demo page with orbit controls and a view switcher
pnpm shots      # renders artifacts/shots/*.png (see below)
pnpm typecheck
pnpm test       # solar position unit tests
```

`pnpm shots` renders the presentation views `axo-se, axo-ne, eye-sw,
elev-south, axo-sw`, the sun study `sun-winter-09, sun-winter-12,
sun-winter-15, sun-summer-12` (SE axonometric, physical sun at the golden
site), the cutaways `cut-L1, cut-L2`, `cut-L1-sun-winter-15`,
`cut-L1-sun-winter-10` and `cut-L2-sun-winter-10`, and
prints the sun position and the cost of a shadow update. Demo URL
parameters: `view=`, `sun=winter|spring|summer|autumn|today|YYYY-MM-DD`,
`time=HH:MM`, `year=`, `cut=L1|none`, `hide=`.

The demo shows the golden sample through model -> kernel -> render
(`@opensu/model` and `@opensu/kernel` are aliased to their sources, so no
prior build is needed). `pnpm shots` starts a Vite server on the demo, opens it in headless Chromium
(SwiftShader WebGL) at 1600x1200, DPR 1, and prints triangle and draw-call
counts per view. `node scripts/shots.mjs eye-sw hide=floor-lines -debug`
renders a single view with debug switches.

## How the style layer is organised

- `src/style/tokens.ts` - every colour, line width, light, shadow and camera
  value. The single source of truth; nothing else hard-codes them.
- `src/style/materials.ts` - the illustration material (MeshLambertMaterial
  with its light composition replaced: sunlit / turned away / cast shadow
  tone bands), glass, flat colours, the fat-line material with outer-profile
  widening, and the palette shared by the whole scene.
- `src/style/textures.ts` - procedural low-contrast patterns (roof tiles,
  timber) at true scale (UVs are metres).
- `src/style/edges.ts` - feature edges generated from geometry (boundary
  edges + dihedral angle threshold per primitive), de-duplication, and edge
  adjacency across primitives so the line shader can detect profiles.
- `src/style/batch.ts` - bakes a scene description into one merged mesh per
  (bake group, material), one feature-edge object and one floor-line object
  per group. Transparent materials stay merged across groups so their
  blending order is unchanged.
- `src/style/lighting.ts` - lighting modes. `presentation` (default): the
  sun is placed relative to the camera (behind the viewer, 40 deg to the side
  of the main facade, 60 deg high for axonometrics, 45 deg otherwise) so one
  visible face is sunlit and the other turned away. `physical`: the real sun
  of the site, `viewer.setLighting({ mode: 'physical', date: 'YYYY-MM-DD',
  minutes })` (local clock minutes, clamped to sunrise..sunset), or an
  explicit `{ mode: 'physical', sun }`; back with `{ mode: 'presentation' }`.
- `src/sun/solar.ts` - `solarPosition` and `sunriseSunset` (NOAA / Meeus,
  no dependency, unit-tested against published values).
  `src/sun/study.ts` - the site's sun in model bearings (`site.northDeg`
  rotates the model against true north), daylight clamping, date presets.
- `src/style/sun.ts` - one directional sun; the shadow frustum is fitted to
  the scene bounds (in the sun study also to the ground the long shadows
  fall on, up to `physical.shadowReach`).
- Sun study rules: window/door glass and glass balustrades never cast; in
  physical lighting the flat glass backing stops casting too, so sun
  patches fall into the rooms; frames, walls, slabs, roofs and canopies
  cast. Interior floors have their own lighter shadow tone
  (`shading.floorShadowTone`) so a lit-up interior is never a dark cave.
  Shadow maps are re-rendered only when the sun, the content, the cutaway
  or a billboard's facing change (`viewer.measureShadowUpdate()` reports
  the cost).
- Cutaway: `viewer.setCutaway(levelId | null)`. House geometry (bake group
  `house`) uses twin materials with a clipping plane at the level's cut
  height (kernel `cutZ`); the kernel's section caps (`cut:<level>`) show in
  the cut tone with outlines; stairs and entourage of a level
  (`level:<id>`) stay whole and are hidden above the cut; site and garden
  are never clipped. In physical lighting the clipped parts keep casting
  shadows (the light inside stays true); in presentation they do not.
  Window and door frames cut by the plane get frame-coloured caps
  (kernel `cut-frame` parts), so no hollow profiles show.
- Grow transition: `viewer.playGrow({ fromLevel?, duration? })` after
  `setContent` (an edit). The cutaway's clip plane sweeps up from the floor
  of `fromLevel` past the roof (~1.5 s), each level in its own eased slot
  (`src/grow.ts`, pure timing); stairs / entourage of a level appear once
  the sweep reaches it. It takes the lower of grow and cutaway heights,
  renders every frame only while it runs (shadow map included) and is
  skipped under reduced motion. No hollow-wall caps are drawn while it
  runs (the section caps exist only at the fixed cut height).
- Physical sun + cutaway (`cutawayLight` tokens): interior floors in shade
  lift to `floorShade`, sunlit floor patches are warm (`floorSunBase` x
  `floorSunTint`), walls in a cast shadow use the turned-away tone and
  outdoor paving / gravel / decks the ground-shadow tone. Tone bands are
  shared uniforms (`setToneFactors`), so switching costs no recompile.
- `src/style/ground.ts` - invisible ground that only shows received shadows.
- `src/style/cameras.ts` - presets: parallel axonometric, eye-level two-point
  perspective (horizontal view axis + lens shift), straight elevation.
- `src/entourage/` - ginkgo, Japanese maple (red/green), bamboo, grass tufts,
  silhouette people (billboards), low-detail car. Deterministic (seeded).
- `src/viewer.ts` - renderer setup (sRGB, no tone mapping, MSAA, PCF
  shadows), render-on-demand loop, resize and DPR cap, scene statistics.
- `src/house.ts` - `createHouseObject(geometry, palette)`: kernel parts to
  meshes (the one material-slot -> palette table, shadow flags), kernel
  feature edges and floor lines, entourage placements to the generators.
  Returns the object and the architecture's vertices for camera framing.
- `src/offscreen.ts` - `OffscreenView`: renders views of a house into
  detached canvases at a given size (optionally a window of a view framed
  at another aspect) with its own hidden WebGL context; `dispose()`
  releases it. Used by `@opensu/sheet`; leaves on-screen viewers alone.
- `demo/` - the golden sample in the viewer, view switcher and orbit
  controls; `demo/views.ts` holds the five fixed views.

- `demo/` - the golden sample in the viewer, view switcher, cutaway level
  buttons, date presets and a time slider, orbit controls; `demo/views.ts`
  holds the fixed views (including one cutaway axonometric per level).
