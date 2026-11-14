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
- Two lighting modes. Presentation: the sun is art-directed relative to the
  camera (behind the viewer, ~40 deg to one side, high) so one visible face
  is sunlit and the other lightly shaded; used for stills and sheets.
  Sun study: the sun is physically placed from latitude, date and time.
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
- Accounts and credits (task 019): Better Auth on D1 (email one-time code
  sent with Resend, and Google; no passwords: hashing does not fit 10 ms
  CPU). One credit per user message, counted atomically in D1 (one
  statement per model call). Numbers are deployment variables; everything
  turns off without the secrets or with AUTH_ENABLED / QUOTA_ENABLED=false.

## Process
- Milestones: golden sample -> interaction -> AI -> sharing -> styles/rain.
- Golden sample: reproduce the reference 12 m x 15 m modern pitched-roof
  house; accepted by side-by-side screenshots. Internal benchmark only; the
  public demo uses our own design.
- Each task: spec with acceptance criteria -> implementer -> independent
  verifier -> lead reviews screenshots.

## Regions
- One product, region profiles; no fork. The core (model, kernel, render,
  sun, walk, commands, AI path) stays region-neutral. Region-specific
  things live in a profile: language, units, design rules in the prompt,
  room vocabulary, templates, style preset, entourage, sheet format.
- Order (owner's decision): finish the China version first (deploy,
  real-model evaluation, sharing). Then an international metric / English
  profile (Europe, UK, Australia). The US profile (imperial units,
  timber-frame conventions) comes last.
- Do now only what prevents rework: worldwide location and time zones
  (with DST and the southern hemisphere), a display-only units layer, and
  locale-aware labels on plans and sheets.
- The name "openSU" refers to SketchUp, a Trimble trademark; confirm the
  name (or choose another) before marketing outside China.
