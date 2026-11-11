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
pnpm shots      # renders artifacts/shots/{axo-se,axo-ne,eye-sw,elev-south}.png
pnpm typecheck
```

`pnpm shots` starts a Vite server on the demo, opens it in headless Chromium
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
  material, one feature-edge object and one floor-line object.
- `src/style/lighting.ts` - lighting modes. `presentation` (default): the
  sun is placed relative to the camera (behind the viewer, 40 deg to the side
  of the main facade, 60 deg high for axonometrics, 45 deg otherwise) so one
  visible face is sunlit and the other turned away. `physical`: an explicit
  sun position (for a later sun study); `viewer.setLighting(...)`.
- `src/style/sun.ts` - one directional sun; the shadow frustum is fitted to
  the scene bounds.
- `src/style/ground.ts` - invisible ground that only shows received shadows.
- `src/style/cameras.ts` - presets: parallel axonometric, eye-level two-point
  perspective (horizontal view axis + lens shift), straight elevation.
- `src/entourage/` - ginkgo, Japanese maple (red/green), bamboo, grass tufts,
  silhouette people (billboards), low-detail car. Deterministic (seeded).
- `src/viewer.ts` - renderer setup (sRGB, no tone mapping, MSAA, PCF
  shadows), render-on-demand loop, resize and DPR cap, scene statistics.
- `demo/` - throwaway: a hard-coded approximation of the reference house built
  from small helpers (wall faces with openings, mono-pitch roof, balustrades,
  fence walls, gates).

Model units are millimetres (X east, Y north, Z up); the demo converts once to
scene metres (Y up) in `demo/helpers.ts#P`.
