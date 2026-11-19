# openSU

AI-assisted design tool for self-built houses: describe a house, get a
parametric model, see it in a clean architectural-illustration style, walk
through it, study sunlight, share it. "Open" = shareable and self-hostable.

Read `docs/DECISIONS.md` before changing architecture and
`docs/VISUAL_SPEC.md` before touching anything that affects pixels.

## Rules for every agent working here

- All code, comments, commit messages, docs and issues are in English.
- Never commit anything under `.reference/` or `artifacts/` (third-party
  reference images and generated screenshots). Never embed those images in
  the repo in any form.
- Do not open GitHub issues, PRs or comments. Only the lead does, sparingly.
- Do not push. Commit locally on the current branch; the lead pushes.
- Visual tokens live in one place (`packages/render/src/style/tokens.ts`).
  Do not hard-code colors, line widths or light values anywhere else, and do
  not change tokens unless the task says so.
- Server code must stay trivial: the deploy target is Cloudflare Workers free
  tier (10 ms CPU per request). Geometry, validation, rendering and image
  export run in the browser.
- Units are millimetres in the model, metres in the 3D scene. X = east,
  Y = north, Z = up in the model; convert once at the render boundary.
- Verify your own work by running it and looking at screenshots
  (Playwright + Chromium are preinstalled; do not run `playwright install`).
  Headless WebGL needs `--use-angle=swiftshader --enable-unsafe-swiftshader`
  (or `--use-gl=swiftshader`).
- Tests: do not run the whole suite locally (`pnpm -r test`, 12 to 15
  minutes). Run `pnpm test:fast` (about a minute: typecheck, unit tests,
  static checks, no browser) plus the one browser suite your change
  touches (`pnpm --filter @opensu/web test:shots|test:glass|test:chat|
  test:account|test:audit`, after `pnpm --filter @opensu/web build`). The
  full matrix runs on GitHub Actions for each pull request (`ci.yml`; the
  check to pass is `ci-ok`). Agents still do not push or open pull
  requests; the lead does. Script list: `apps/web/README.md`, "Tests".
- Report honestly: list what does not work or was skipped.
