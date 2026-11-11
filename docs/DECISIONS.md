# Decisions

One line each. Change only with the lead's sign-off.

## Product
- Scope: self-built houses first. Interior decoration later.
- License: AGPL-3.0. External contributions require a CLA.
- Aha moments: (1) a sentence becomes a house, (2) drag the time slider and
  watch sunlight sweep the rooms, (3) one click exports a shareable sheet
  (axonometric on top, coloured floor plan below).

## Model
- A house is a parametric, semantic model: site, axis grid, levels, rooms on
  grid cells, openings hosted on room boundaries, stairs, roofs, balconies,
  site elements. Millimetres.
- Geometry is a pure deterministic function of the model. The AI never emits
  meshes or coordinates of triangles.
- The AI edits through commands. Every edit is validated; failures go back to
  the AI; unrecoverable edits roll back to the last valid state.
- The AI decides *what* (rooms, openings, roof type, style preset). The engine
  decides *how it looks* (colours, lines, light, entourage, cameras, sheets).
- User freedom comes from curated material/style sets, not colour pickers.
  The AI complies, explains consequences with facts (e.g. sunlight), offers a
  recommended variant; it has no veto except hard constraints.

## Stack
- TypeScript, pnpm workspace.
- `packages/model`   schema, commands, validation (no DOM, no three.js)
- `packages/kernel`  model -> geometry (no DOM, no three.js types leaking)
- `packages/render`  three.js renderer + style; framework-free
- `packages/plan`    SVG floor plans
- `apps/web`         TanStack Start app
- 3D: three.js on WebGL2 (not WebGPU): share links open on phones / WeChat.
- Edges are generated from geometry, not post-process edge detection.
- Render on demand; no continuous loop when nothing changes.
- Budget: whole house < 150k triangles, < 150 draw calls.

## Platform
- Cloudflare free tier. Worker does forwarding only (10 ms CPU limit).
- Editor is a prebuilt client-only page. Share page server output is only
  preview metadata. Sheets/images are produced in the browser.
- Storage: D1 (metadata), R2 (model files, images).
- Self-hosting = deploy to your own Cloudflare account. No Docker for now.

## AI
- TanStack AI. Default provider OpenRouter; OpenAI as alternative adapter.
- Tools execute in the browser; the Worker adds the key and relays the stream.
- Public site: owner's key with per-user credit limit; users may bring their
  own key.

## Process
- Milestones: golden sample -> interaction -> AI -> sharing -> styles/rain.
- Golden sample: reproduce the reference 12 m x 15 m modern pitched-roof
  house; accepted by side-by-side screenshots. Internal benchmark only; the
  public demo uses our own design.
- Each task: spec with acceptance criteria -> implementer -> independent
  verifier -> lead reviews screenshots.
