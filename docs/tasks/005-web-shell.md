# Task 005 - Web app shell (`apps/web`)

## Goal
A TanStack Start app, deployable to Cloudflare Workers (free tier), whose
studio page shows the golden sample house in 3D and as floor plans with a
UI that is as considered as the drawings. No AI, no persistence yet.

Look up the current official docs for TanStack Start and for deploying it
to Cloudflare Workers before choosing versions and config; do not rely on
memory. Pin exact versions.

## Platform rules (from docs/DECISIONS.md)
- The Worker does almost nothing (10 ms CPU limit). No React SSR for the
  studio: it is a client-only route served as prebuilt static assets.
- Routes:
  - `/` minimal landing page, statically prerendered.
  - `/studio` client-only editor (no SSR).
  - `/s/$id` share page stub: server output is only HTML head metadata
    (title, description, og:image placeholder); body renders on the client.
  - `/api/health` trivial JSON endpoint to prove the Worker runs.
- three.js and the viewer are lazy-loaded; they must not be in the initial
  chunk. Budgets (gzip): initial JS for `/studio` < 200 KB, viewer chunk
  < 300 KB. Print a size report in the build script.
- Local verification with the Cloudflare local runtime (wrangler / the
  Cloudflare vite plugin). Do not deploy; there are no credentials.

## Studio UI
Design language: quiet, precise, lots of white; the drawing is the hero and
chrome floats over it. Never a default-looking dashboard.
- Tokens (CSS variables, one file): text `#2A2A2A`, secondary `#7A7A7A`,
  hairline `#E6E6E6`, surface `#FFFFFF` at 92% with backdrop blur, accent
  ginkgo `#F2D40F` used sparingly (active states, slider thumb), radius
  10 px, soft shadow `0 6px 24px rgba(0,0,0,0.08)`. Font stack: Inter, then
  system CJK (PingFang SC, Noto Sans SC, Microsoft YaHei). Tailwind CSS v4.
  No UI kit; small hand-built components (Radix primitives allowed for
  accessibility).
- Layout (desktop): full-bleed canvas. Top-left: project name and house
  facts (plot, area, storeys). Top-centre: segmented control `3D | 平面 |
  图册` (the last is disabled, "coming soon"). Right: vertical view-preset
  rail (four axonometric corners, eye level, four elevations) with small
  drawn icons. Bottom-centre: time-of-day slider, visible but disabled
  until the sun-study task. Left: a collapsed chat rail reserved for the AI.
- Plan mode: level tabs (一层 / 二层 / 阁楼), the SVG from `@opensu/plan`
  fitted to the viewport with pan and zoom.
- 3D mode: the existing viewer from `@opensu/render` with orbit, preset
  transitions animated (~400 ms ease), render on demand preserved.
- Mobile (390 px wide): canvas on top, controls in a bottom sheet; all
  targets >= 44 px; no horizontal scroll.
- UI text is Chinese by default through a tiny i18n dictionary with zh and
  en; code and comments in English.
- State in a small store; the house model is the single source of truth and
  flows model -> resolve -> kernel -> render / plan.

## Deliverables
- `apps/web` wired into the workspace (`pnpm dev`, `pnpm build` at the root
  build everything; `pnpm --filter @opensu/web preview` runs the built app
  in the local Cloudflare runtime).
- Playwright smoke test and screenshot script
  (`pnpm --filter @opensu/web shots`): studio 3D and plan modes at
  1440x900 and 390x844, landing page; writes `artifacts/web/*.png`.
  Asserts the canvas is not blank and the plan SVG is present.
- README: how to run, how deployment to Cloudflare will work.

## Acceptance criteria
- Clean checkout: `pnpm install && pnpm build && pnpm typecheck && pnpm test`
  pass; the preview serves all four routes from the local Workers runtime.
- `/studio` HTML is static (no per-request React render); viewer chunk is
  lazy; size budgets met and printed.
- Screenshots look designed: aligned, consistent spacing, no default
  browser controls, no overlap or clipped text at either viewport.
- The 3D view in the app matches `pnpm shots` output for the same preset
  (same style, no regression).
- No change to `packages/render/src/style/tokens.ts` values.

## Process
Iterate on screenshots at both viewports, many rounds. Commit locally in
your worktree (do not push). Report: versions chosen and the doc pages they
came from, size report, what is rough in the UI, anything in the packages
you needed to change.
